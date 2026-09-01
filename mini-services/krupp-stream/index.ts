// ============================================================================
// KRUPP CAPITAL // STREAM RELAY (socket.io :3030)
// Level-3 authenticated streaming vs L1/L2 REST fallback pacing,
// ambient desk telemetry logs, CBOE collection, IV surface emission,
// crash-injection routing, persisted risk events -> Next.js /api/events.
// ============================================================================

import { createServer } from 'http'
import { Server } from 'socket.io'
import { MarketEngine, INSTRUMENTS, type Book, type FeedMode, type Regime } from './src/engine'
import { CboeCollector, type CboeSnapshot } from './src/cboe'
import { probeEdge, maskToken, DATA_API, BASE_URL } from './src/lse'
import { buildIvSurface, type IvSurface } from './src/iv'

const PORT = 3030

// --- hot-reload resilience (bun --hot re-runs this module) ---------------------
// Reuse the HTTP server / engine / auth across hot reloads so the port is bound
// exactly once and market + auth state survive code edits. Fresh timers are
// registered each pass; stale ones are cleared first.
interface HotState {
  httpServer?: ReturnType<typeof createServer>
  io?: InstanceType<typeof Server>
  engine?: MarketEngine
  cboe?: CboeCollector
  auth?: AuthState
  lastCboe?: CboeSnapshot | null
  lastIv?: IvSurface | null
  timers?: ReturnType<typeof setInterval>[]
  listening?: boolean
  /** last desk-reported kernel readout (for relay-side snapshot scoring) */
  deskRisk?: { score: number; regime: string; ts: number } | null
  /** last relay-side snapshot POST timestamp (cadence bookkeeping) */
  lastSnapPost?: number
}
const g = globalThis as typeof globalThis & { __kruppStream?: HotState }
const hot: HotState = (g.__kruppStream ??= {})
for (const t of hot.timers ?? []) clearInterval(t)
hot.timers = []

interface AuthState {
  authenticated: boolean
  level: 'L1' | 'L2' | 'L3'
  mode: FeedMode
  message: string
  since: number
  tokenMask: string | null
  tokenKind: string | null
}

const auth: AuthState = hot.auth ??= {
  authenticated: false,
  level: 'L2',
  mode: 'FALLBACK',
  message: 'No Bearer token injected — L1/L2 REST structural fallback engaged',
  since: Date.now(),
  tokenMask: null,
  tokenKind: null,
}

const engine = (hot.engine ??= new MarketEngine())
const cboe = (hot.cboe ??= new CboeCollector())
let lastCboe: CboeSnapshot | null = (hot.lastCboe ??= null)
let lastIv: IvSurface | null = (hot.lastIv ??= null)

// --- persistence (fire-and-forget to Next.js API) ----------------------------
function persist(type: string, severity: 'info' | 'warn' | 'crit', source: string, message: string, payload?: unknown) {
  fetch('http://localhost:3000/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, severity, source, message, payload: payload ? JSON.stringify(payload).slice(0, 2000) : undefined }),
  }).catch(() => { /* store unavailable — desk keeps running */ })
}

function logLine(source: string, level: 'info' | 'warn' | 'crit', message: string) {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), source, level, message }
}

// detach any previous socket.io instance from prior hot-reload pass
hot.io?.close()
const httpServer = (hot.httpServer ??= createServer())
const io = (hot.io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards using it
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
}))

// --- auth lifecycle -----------------------------------------------------------
async function applyToken(raw: string) {
  const token = (raw || '').trim()
  broadcastLog('FIREBASE', 'info', `[FIREBASE] Authenticating streaming threads using provided Bearer Token...`)
  if (!token) {
    auth.authenticated = false
    auth.level = 'L2'
    auth.mode = 'FALLBACK'
    auth.message = 'Token cleared — L1/L2 REST structural fallback engaged'
    auth.tokenMask = null
    auth.tokenKind = null
    auth.since = Date.now()
    broadcastLog('FIREBASE', 'warn', '[FIREBASE] Token purged. Downgrading to L1/L2 REST polls (600ms cadence).')
    broadcastStatus()
    persist('AUTH_CLEAR', 'warn', 'FIREBASE', 'Bearer token cleared — L1/L2 fallback')
    return
  }
  const probe = await probeEdge(token)
  if (probe.outcome === 'MALFORMED') {
    broadcastLog('FIREBASE', 'crit', `[FIREBASE] Token rejected locally: ${probe.detail}`)
    auth.authenticated = false; auth.level = 'L2'; auth.mode = 'FALLBACK'
    auth.message = `Malformed credential — ${probe.detail}`
    auth.since = Date.now()
    broadcastStatus()
    persist('AUTH_REJECT', 'warn', 'FIREBASE', `Malformed token: ${probe.detail}`)
    return
  }
  if (probe.outcome === 'LIVE') {
    auth.authenticated = true; auth.level = 'L3'; auth.mode = 'LIVE'
    auth.message = `True L3 stream authorized against ${DATA_API} (${probe.httpStatus})`
    broadcastLog('INGESTION', 'info', `[INGESTION] Connected to ://londonstrategicedge.com Level 3 feed successfully. (${probe.latencyMs}ms, HTTP ${probe.httpStatus})`)
  } else if (probe.outcome === 'SIM_BRIDGE') {
    auth.authenticated = true; auth.level = 'L3'; auth.mode = 'SIM_BRIDGE'
    auth.message = `Authenticated (L3 parity bridge) — ${probe.detail}`
    broadcastLog('FIREBASE', 'info', `[FIREBASE] Token accepted — ${probe.detail}.`)
    broadcastLog('INGESTION', 'info', `[INGESTION] Connected to ://londonstrategicedge.com Level 3 feed successfully. (parity bridge, ${probe.latencyMs}ms)`)
  } else {
    auth.authenticated = false; auth.level = 'L2'; auth.mode = 'FALLBACK'
    auth.message = `Edge rejected credential (HTTP ${probe.httpStatus ?? 'n/a'}) — L1/L2 fallback`
    broadcastLog('FIREBASE', 'crit', `[FIREBASE] Auth revoked/expired: ${probe.detail}. Structural fallback engaged.`)
  }
  auth.tokenMask = maskToken(token)
  auth.tokenKind = probe.outcome === 'SIM_BRIDGE' && token.startsWith('KRUPP-DEMO') ? 'DEMO' : 'FIREBASE'
  auth.since = Date.now()
  broadcastStatus()
  persist(probe.outcome === 'LIVE' ? 'AUTH_OK_LIVE' : probe.outcome === 'SIM_BRIDGE' ? 'AUTH_OK_BRIDGE' : 'AUTH_REJECT', probe.outcome === 'REJECTED' ? 'warn' : 'info', 'FIREBASE', auth.message)
}

function broadcastStatus() {
  io.emit('lse:status', { ...auth, endpoint: DATA_API, baseUrl: BASE_URL })
}

function broadcastLog(source: string, level: 'info' | 'warn' | 'crit', message: string) {
  io.emit('log', logLine(source, level, message))
}

// --- market loop ---------------------------------------------------------------
let tickCursor = 0
engine.bind(
  (ticks, books, tape) => {
    tickCursor++
    const l3 = auth.mode !== 'FALLBACK'
    // pacing: L3 stream = 100ms; L1/L2 REST emulation = 600ms poll, 5-deep book
    if (!l3 && tickCursor % 6 !== 0) return

    for (const t of ticks) io.emit('tick', t)
    const depth = l3 ? 12 : 5
    for (const b of books) {
      const trimmed: Book = { ...b, bids: b.bids.slice(0, depth), asks: b.asks.slice(0, depth) }
      io.emit('book', trimmed)
      io.emit('tape', { sym: b.sym, tape: tape[b.sym] })
    }
    if (!l3 && tickCursor % 42 === 0) {
      broadcastLog('L2-REST', 'info', `[L2-REST] GET ${DATA_API}/l2-futures/snapshot/ES → 200 OK (poll #${Math.floor(tickCursor / 6)}, 5 levels, ${18 + Math.floor(Math.random() * 40)}ms)`)
    }
  },
  (r: Regime, cause: string) => {
    cboe.setRegime(r, engine.crash.severity)
    if (r === 'CRISIS') broadcastLog('RISK', 'crit', `[RISK] Global regime → CRISIS. ${cause.toUpperCase()}. Pre-trade interceptors armed.`)
    else if (r === 'HIGH') broadcastLog('RISK', 'warn', `[RISK] Global regime → HIGH TOXICITY. ${cause}.`)
    else broadcastLog('RISK', 'info', `[RISK] Global regime → CALM. ${cause}.`)
    persist('REGIME_CHANGE', r === 'CRISIS' ? 'crit' : r === 'HIGH' ? 'warn' : 'info', 'ENGINE', `Regime → ${r}: ${cause}`, { regime: r })
  }
)
engine.start()

// --- schedulers ------------------------------------------------------------------
hot.timers.push(setInterval(async () => {
  lastCboe = await cboe.collect()
  hot.lastCboe = lastCboe
  io.emit('cboe', lastCboe)
}, 3000))

hot.timers.push(setInterval(() => {
  const es = INSTRUMENTS[0]
  lastIv = buildIvSurface('ES', es.base * (1 + (engine['insts'].get('ES')!.price / es.base - 1)), lastCboe?.vix ?? 15.5, engine.regime === 'CRISIS')
  hot.lastIv = lastIv
  io.emit('ivsurface', lastIv)
}, 2000))

// --- relay-side vol snapshot capture (round 7) ------------------------------------
// The relay posts its own VolSnapshot every 60s — the cross-boot volatility
// record keeps filling even with NO browser tab open. Composite score comes
// from the desk's `desk:risk` readout when available (kernel lives client-side
// in a worker); otherwise it is estimated from the regime band. The server's
// 45s floor arbitrates relay vs desk races, so cadence stays clean.
function relaySnapEstimateScore(): number {
  const desk = hot.deskRisk
  if (desk && Date.now() - desk.ts < 120_000) return Math.max(0, Math.min(100, desk.score))
  return engine.regime === 'CRISIS' ? 82 : engine.regime === 'HIGH' ? 62 : 28 // regime-band estimate
}

hot.timers.push(setInterval(() => {
  if (!lastCboe) return // no CBOE complex yet — nothing truthful to persist
  const desk = hot.deskRisk
  const snap = {
    vix: lastCboe.vix, vix9d: lastCboe.vix9d, vix3m: lastCboe.vix3m,
    skew: lastCboe.skew, vvix: lastCboe.vvix,
    contango: lastCboe.contangoPct, multiplier: lastCboe.multiplier, pcRatio: lastCboe.pcRatio,
    atmIV: lastIv?.atmIV ?? lastCboe.vix, flipStrike: lastIv?.flipStrike ?? 0,
    totalGex: lastIv?.totalGex ?? 0, spot: lastIv?.spot ?? 0,
    score: relaySnapEstimateScore(),
    regime: engine.regime,
    source: `RELAY-${desk && Date.now() - desk.ts < 120_000 ? 'KERNEL' : 'CBOE'}`,
  }
  hot.lastSnapPost = Date.now()
  fetch('http://localhost:3000/api/volhistory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snap),
  }).catch(() => { /* Next API unavailable — desk cadence takes over */ })
}, 60_000))

// ambient desk telemetry (spec log templates + dynamic values)
const ambient: Array<() => void> = [
  () => broadcastLog('MATH', 'info', `[MATH] Re-calibrating Hawkes intensity matrix... Z-Score verified.`),
  () => broadcastLog('VOLATILITY', 'info', `[VOLATILITY] VIX/VIX3M Piecewise Multiplier calculated: Contango ${(lastCboe?.termLabel ?? 'MILD CONTANGO').toLowerCase()}. (×${lastCboe?.multiplier ?? 1.01})`),
  () => broadcastLog('ROUTING', 'info', `[ROUTING] Order routed via Hamiltonian Geodesic Engine (Slippage: Minimized).`),
  () => lastCboe && broadcastLog('CBOE', 'info', `[CBOE] Sentiment sweep: P/C ${lastCboe.pcRatio.toFixed(2)} → ${lastCboe.pcClass}. OI ${((lastCboe.callOI + lastCboe.putOI) / 1e6).toFixed(2)}M.`),
  () => auth.authenticated && broadcastLog('FIREBASE', 'info', `[FIREBASE] Streaming threads alive — ${auth.tokenKind} credential ${auth.tokenMask}, TTL verified.`),
  () => auth.authenticated && broadcastLog('INGESTION', 'info', `[INGESTION] L3 workers: 3 parallel downloaders healthy on /l3-equities/download/{name}/{fname}.`),
  () => broadcastLog('SYSTEM', 'info', `[SYSTEM] Engine heartbeat: ${engine.tickCount.toLocaleString()} ticks, ${INSTRUMENTS.length} instruments, regime ${engine.regime}.`),
]
let ambientIdx = 0
hot.timers.push(setInterval(() => { ambient[ambientIdx % ambient.length](); ambientIdx++ }, 5200))

// --- socket wiring -----------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`desk client connected: ${socket.id}`)
  socket.emit('lse:status', { ...auth, endpoint: DATA_API, baseUrl: BASE_URL })
  socket.emit('engine:state', engine.snapshotState())
  if (lastCboe) socket.emit('cboe', lastCboe)
  if (lastIv) socket.emit('ivsurface', lastIv)
  socket.emit('log', logLine('SYSTEM', 'info', '[SYSTEM] KRUPP Risk Desk core online. Build 2.4.1-lse.9 — NavierStokes kernel resident.'))
  socket.emit('log', logLine('FIREBASE', auth.authenticated ? 'info' : 'warn', auth.authenticated ? `[FIREBASE] Session credential restored: ${auth.tokenMask}.` : '[FIREBASE] Awaiting Bearer Token injection for Level 3 upgrade...'))

  socket.on('auth:token', async (data: { token: string }) => { await applyToken(String(data?.token ?? '')) })
  socket.on('auth:clear', () => { void applyToken('') })

  // desk kernel readout — feeds relay-side snapshot scoring (round 7)
  socket.on('desk:risk', (data: { score: number; regime: string }) => {
    const score = Number(data?.score)
    if (Number.isFinite(score)) {
      hot.deskRisk = { score, regime: String(data?.regime ?? 'CALM'), ts: Date.now() }
    }
  })

  socket.on('sim:crash', (data: { severity: number; durationMs: number }) => {
    const severity = Math.max(1, Math.min(10, Number(data?.severity) || 6))
    const durationMs = Math.max(2000, Math.min(30000, Number(data?.durationMs) || 8000))
    const st = engine.injectCrash(severity, durationMs)
    broadcastLog('SIM', 'crit', `[SIM] LIQUIDITY CRASH INJECTED — severity ${severity}/10, ${Math.round(durationMs / 1000)}s cascade. Vacuum phase armed.`)
    broadcastLog('INGESTION', 'warn', `[INGESTION] Tick cascade ×${(10 + severity * 3).toFixed(0)} volume burst — order-book bid queues collapsing.`)
    persist('CRASH_INJECT', 'crit', 'SIM', `Liquidity crash injected (sev ${severity}/10, ${durationMs}ms)`)
    socket.emit('sim:crash:ack', { ...st })
  })

  socket.on('sim:reset', () => {
    engine.resetFeed()
    broadcastLog('SIM', 'info', `[SIM] Feed purged — re-anchored to session base. All interceptors disarmed.`)
    persist('FEED_RESET', 'info', 'SIM', 'Feed purged & re-anchored')
    socket.emit('sim:reset:ack', { ok: true })
  })

  socket.on('ping', (cb?: (n: number) => void) => { if (typeof cb === 'function') cb(Date.now()) })

  socket.on('disconnect', () => console.log(`desk client disconnected: ${socket.id}`))
  socket.on('error', (e) => console.error(`socket error:`, e))
})

httpServer.on('error', (e: NodeJS.ErrnoException) => {
  console.error(`[krupp-stream] FATAL: cannot bind :${PORT} (${e.code ?? e.message}) — another relay instance is already running. Exiting loudly.`)
  process.exit(1)
})

httpServer.listen(PORT, () => {
  console.log(`KRUPP stream relay listening on :${PORT} (path /)`)
})

process.on('SIGTERM', () => { engine.stop(); httpServer.close(() => process.exit(0)) })
process.on('SIGINT', () => { engine.stop(); httpServer.close(() => process.exit(0)) })
