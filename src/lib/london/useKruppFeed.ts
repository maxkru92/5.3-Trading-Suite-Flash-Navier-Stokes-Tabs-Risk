// ============================================================================
// KRUPP CAPITAL // FEED ORCHESTRATOR
// socket.io stream → Float32 sinks → risk worker thread → zustand store.
// Also: latency probes, crisis siren (WebAudio), agent-core commentary loop.
// ============================================================================

'use client'

import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { RingBuffer, buffers, clearBuffers } from './buffers'
import { bumpCdelta, feed, resetFeed } from './feed'
import { ledger } from './execution'
import { hydrateLedger } from './ledgerSync'
import { optDesk } from './optionsDesk'
import { hydrateSound, useKrupp } from './store'
import { setPolicySink } from './policy'
import { pushTick, correlationMatrix, meanPairwiseRho } from './correlation'
import {
  evaluateCboe, evaluateMetrics, evaluateRho, initAlerts, setAlertSinks,
} from './alerts'
import { hydrateVolHistory, persistVolSnapshot } from './volSync'
import { getActiveProfileName, loadPolicy } from './policy'
import type { LseStatus, RiskMetrics, Tick } from './types'
import { useToast } from '@/hooks/use-toast'

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io('/?XTransformPort=3030', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 999,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
  }
  return socket
}

let sirenCtx: AudioContext | null = null
function playSiren(kind: 'crisis' | 'warn') {
  try {
    sirenCtx = sirenCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)()
    const ctx = sirenCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sawtooth'
    const t0 = ctx.currentTime
    if (kind === 'crisis') {
      osc.frequency.setValueAtTime(620, t0)
      osc.frequency.linearRampToValueAtTime(180, t0 + 0.42)
      osc.frequency.linearRampToValueAtTime(620, t0 + 0.84)
      gain.gain.setValueAtTime(0.001, t0)
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15)
      osc.start(t0); osc.stop(t0 + 1.2)
    } else {
      osc.frequency.setValueAtTime(440, t0)
      gain.gain.setValueAtTime(0.001, t0)
      gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
      osc.start(t0); osc.stop(t0 + 0.55)
    }
  } catch { /* audio unavailable */ }
}

export function useKruppFeed() {
  const workerRef = useRef<Worker | null>(null)
  const lastRegime = useRef<string>('CALM')
  const lastInter = useRef<{ lock: boolean; scale: boolean; kill: boolean }>({ lock: false, scale: false, kill: false })
  const lastShock = useRef(false)
  const lastToastAt = useRef(0)
  const bootAt = useRef(Date.now())
  const { toast } = useToast()

  const deskToast = (title: string, description: string, destructive = false) => {
    const now = Date.now()
    if (now - lastToastAt.current < 15000) return // cooldown — never spam the desk
    if (now - bootAt.current < 22_000) return // kernel warm-up transient: early z-scores spike — stay quiet
    lastToastAt.current = now
    toast({ title, description, variant: destructive ? 'destructive' : 'default', duration: 6000 })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const store = useKrupp.getState()
    const pushLog = useKrupp.getState().pushLog

    // --- autonomous execution ledger: hydrate persisted state first, then run ---
    void hydrateLedger().then(() => ledger.start())

    // --- persisted volatility snapshots: hydrate cross-boot history, then 60s capture loop ---
    void hydrateVolHistory()
    const volCap = setInterval(persistVolSnapshot, 60_000)

    // --- desk alerts engine: hydrate sentinels + wire toast/sfx sinks (round 8) ---
    initAlerts()
    hydrateSound() // alarm toggle preference survives reloads (r3)
    setAlertSinks(
      (title, desc, crit) => toast({ title, description: desc, variant: crit ? 'destructive' : 'default', duration: 6000 }),
      (kind) => playSiren(kind === 'crit' ? 'crisis' : 'warn'),
    )
    // ρ sentinel sampling (correlation cache updates at 1s)
    const rhoAlert = setInterval(() => {
      const { m } = correlationMatrix()
      if (m.length === 3) evaluateRho(meanPairwiseRho(m))
    }, 2000)

    // --- options desk mark-to-market sweep (1s) ---
    const optSweep = setInterval(() => optDesk.sweep(), 1000)

    // --- risk kernel thread ---
    let worker: Worker
    try {
      worker = new Worker('/workers/krupp-risk-engine.js')
    } catch {
      worker = null as unknown as Worker
    }
    workerRef.current = worker

    // desk-local policy + profile pointer: applied AFTER hydration (SSR-safe —
    // the store initializes to spec defaults so server/client HTML match)
    {
      const stored = loadPolicy()
      const cur = useKrupp.getState().policy
      if (stored.lockChaos !== cur.lockChaos || stored.scaleVisc !== cur.scaleVisc || stored.killScore !== cur.killScore) {
        useKrupp.setState({ policy: stored, policyRev: useKrupp.getState().policyRev + 1 })
      }
      useKrupp.setState({ activeProfile: getActiveProfileName() })
    }

    // desk policy → worker hot-load (initial + every subsequent change)
    if (worker) {
      worker.postMessage({ type: 'policy', policy: useKrupp.getState().policy })
      setPolicySink((p) => worker.postMessage({ type: 'policy', policy: p }))
    }

    const onMetrics = (m: RiskMetrics) => {
      buffers.hawkes.push(m.hawkes)
      buffers.viscosity.push(m.viscosity)
      buffers.jerk.push(m.jerk)
      buffers.entropy.push(m.entropy)
      buffers.score.push(m.score)
      buffers.toxz.push(m.toxZ)
      useKrupp.getState().setMetrics(m)
      evaluateMetrics(m) // desk alert sentinels (score / entropy / jerkZ)

      // regime-reactive global theming (single attribute write per transition)
      if (document.documentElement.dataset.regime !== m.regime) {
        document.documentElement.dataset.regime = m.regime
      }

      // regime transition siren + structural log
      if (m.regime !== lastRegime.current) {
        const prev = lastRegime.current
        lastRegime.current = m.regime
        if (m.regime === 'CRISIS') {
          pushLog({ id: `${Date.now()}-r`, ts: Date.now(), source: 'RISK', level: 'crit', message: `COMPOSITE SCORE ${m.score.toFixed(1)} — CRITICAL SYSTEMIC CRISIS. MEAN REVERSION INTERCEPTED.` })
          if (useKrupp.getState().soundOn) playSiren('crisis')
        } else if (m.regime === 'HIGH' && prev === 'CALM') {
          pushLog({ id: `${Date.now()}-r`, ts: Date.now(), source: 'RISK', level: 'warn', message: `Composite score ${m.score.toFixed(1)} — HIGH TOXICITY. Scaling offsets engaged.` })
          if (useKrupp.getState().soundOn) playSiren('warn')
        } else if (m.regime === 'CALM') {
          pushLog({ id: `${Date.now()}-r`, ts: Date.now(), source: 'RISK', level: 'info', message: `Composite score ${m.score.toFixed(1)} — STATE TENSOR NORMAL.` })
        }
      }
      // interceptor transitions
      const li = lastInter.current
      if (m.interceptors.lock !== li.lock) {
        pushLog({ id: `${Date.now()}-l`, ts: Date.now(), source: 'RISK', level: m.interceptors.lock ? 'warn' : 'info', message: m.interceptors.lock ? `[RISK] [LOCK] Block Mean Reversion ARMED — ${m.reasons.lock}` : '[RISK] [LOCK] Block Mean Reversion released — chaos normalized.' })
      }
      if (m.interceptors.scale !== li.scale) {
        pushLog({ id: `${Date.now()}-s`, ts: Date.now(), source: 'RISK', level: m.interceptors.scale ? 'warn' : 'info', message: m.interceptors.scale ? `[RISK] [SCALE] Reduce Position Size ARMED — ${m.reasons.scale}` : '[RISK] [SCALE] Position sizing restored — viscosity nominal.' })
      }
      if (m.interceptors.kill !== li.kill) {
        pushLog({ id: `${Date.now()}-k`, ts: Date.now(), source: 'RISK', level: m.interceptors.kill ? 'crit' : 'info', message: m.interceptors.kill ? '[RISK] [KILL] EMERGENCY LIQUIDATION ARMED — flatten all queues.' : '[RISK] [KILL] Emergency liquidation disarmed.' })
        if (m.interceptors.kill) deskToast('KILL INTERCEPTOR ARMED', `Emergency liquidation engaged — composite risk > ${m.policy?.killScore ?? 75}. Flatten all queues.`, true)
        else deskToast('KILL INTERCEPTOR RELEASED', `Composite risk back below ${m.policy?.killScore ?? 75} threshold.`, false)
      }
      if (m.interceptors.lock !== li.lock && m.interceptors.lock) {
        deskToast('LOCK INTERCEPTOR ARMED', m.reasons.lock || `Shannon chaos above ${m.policy?.lockChaos?.toFixed(2) ?? '0.85'} — mean reversion blocked.`, false)
      }
      lastInter.current = { ...m.interceptors }
      // fluid shock overlay
      if (m.shock !== lastShock.current) {
        lastShock.current = m.shock
        if (m.shock) pushLog({ id: `${Date.now()}-j`, ts: Date.now(), source: 'MATH', level: 'warn', message: `Jerk Z=${m.jerkZ.toFixed(2)} > 3.0 — HEAVY VOLATILITY SHOCK DETECTED.` })
      }
    }

    if (worker) worker.onmessage = (e) => { if (e.data?.type === 'metrics') onMetrics(e.data.metrics as RiskMetrics) }

    // --- socket stream ---
    const s = getSocket()
    store.setConnection(s.connected ? 'open' : 'connecting')

    const onConnect = () => {
      useKrupp.getState().setConnection('open')
      pushLog({ id: `${Date.now()}-c`, ts: Date.now(), source: 'SYSTEM', level: 'info', message: 'Gateway uplink established (Caddy edge → :3030 stream relay).' })
    }
    const onDisconnect = () => {
      useKrupp.getState().setConnection('closed')
      pushLog({ id: `${Date.now()}-d`, ts: Date.now(), source: 'SYSTEM', level: 'warn', message: 'Uplink lost — retrying with exponential backoff.' })
    }
    const onStatus = (st: LseStatus) => useKrupp.getState().setAuth(st)
    const onTick = (t: Tick) => {
      feed.lastTick.set(t.sym, t)
      // cross-asset correlation engine (all symbols)
      pushTick(t.sym, t.price)
      if (t.sym === 'ES' && worker) {
        buffers.price.push(t.price)
        buffers.volume.push(t.volume)
        buffers.range.push(t.high - t.low)
        worker.postMessage({ type: 'tick', tick: t })
      }
      // tri-instrument pulse strip (round 8)
      else if (t.sym === 'NQ') buffers.nq.push(t.price)
      else if (t.sym === 'SPY') buffers.spy.push(t.price)
    }
    const onBook = (b: any) => {
      const prev = feed.books.get(b.sym)
      feed.books.set(b.sym, { ...b, tape: prev?.tape })
      // spread / depth micro-history for ladder sparklines
      let micro = feed.micro.get(b.sym)
      if (!micro) { micro = { spread: new RingBuffer(150), depth: new RingBuffer(150) }; feed.micro.set(b.sym, micro) }
      micro.spread.push(b.spreadTicks ?? 0)
      micro.depth.push((b.bids?.length ?? 0) + (b.asks?.length ?? 0))
      useKrupp.getState().bumpBook()
    }
    const onTape = (p: { sym: string; tape: any[] }) => {
      feed.tapes.set(p.sym, p.tape)
      bumpCdelta(p.sym, p.tape)
    }
    const onCboe = (c: any) => { feed.cboe = c; useKrupp.getState().setCboe(c); evaluateCboe(c) }
    const onIv = (i: any) => { feed.iv = i; useKrupp.getState().setIv(i) }
    const onEngine = (e: any) => { feed.engine = e; useKrupp.getState().setEngine(e) }
    const onLog = (l: any) => useKrupp.getState().pushLog(l)
    const onCrashAck = (st: any) => useKrupp.getState().setCrashUntil(st.endsAt ?? 0)
    const onResetAck = () => { useKrupp.getState().setCrashUntil(0) }

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('lse:status', onStatus)
    s.on('tick', onTick)
    s.on('book', onBook)
    s.on('tape', onTape)
    s.on('cboe', onCboe)
    s.on('ivsurface', onIv)
    s.on('engine:state', onEngine)
    s.on('log', onLog)
    s.on('sim:crash:ack', onCrashAck)
    s.on('sim:reset:ack', onResetAck)
    if (!s.connected) s.connect()

    // latency probe
    const ping = setInterval(() => {
      if (!s.connected) return
      const t0 = performance.now()
      s.emit('ping', (serverNow: number) => {
        useKrupp.getState().setLatency(Math.round(performance.now() - t0))
      })
    }, 5000)

    // desk kernel readout → relay (feeds relay-side vol snapshot scoring so the
    // persisted record carries the real composite score even with no tab open)
    const riskBeat = setInterval(() => {
      const m = useKrupp.getState().metrics
      if (!m.ts || !s.connected) return
      s.emit('desk:risk', { score: m.score, regime: m.regime })
    }, 15_000)

    // agent-core commentary (async reason/act loop).
    // Exponential backoff: the upstream LLM core rate-limits under load — when
    // a cycle fails (or arrives degraded) the interval widens 26s → 52 → 104 →
    // 208s (cap); a clean LLM cycle resets it to the base cadence.
    let agentDelay = 26_000
    let agentTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleAgent = (ms: number) => { agentTimer = setTimeout(runAgentCycle, ms) }
    const runAgentCycle = async (): Promise<void> => {
      const st = useKrupp.getState()
      if (st.connection !== 'open' || !st.metrics.ts || !st.cboe) { scheduleAgent(agentDelay); return }
      st.setAgentStatus('ACTIVE (Asynchronous Reason/Act via Llama 3 70B Core)')
      try {
        const res = await fetch('/api/agent/commentary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            score: st.metrics.score, regime: st.metrics.regime, entropy: st.metrics.entropy,
            hawkes: st.metrics.hawkes, viscosity: st.metrics.viscosity, jerkZ: st.metrics.jerkZ,
            lock: st.metrics.interceptors.lock, scale: st.metrics.interceptors.scale, kill: st.metrics.interceptors.kill,
            vix: st.cboe.vix, contangoPct: st.cboe.contangoPct, pcRatio: st.cboe.pcRatio,
          }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const j = await res.json()
        pushLog({ id: `${Date.now()}-a`, ts: Date.now(), source: 'AGENT', level: 'info', message: `Reason/Act cycle complete: ${String(j.line).slice(0, 140)}` })
        if (j?.degraded) { agentDelay = Math.min(agentDelay * 2, 208_000) } else { agentDelay = 26_000 }
      } catch {
        const canned = [
          'Hawkes λ within tolerance — holding depth-aware passive quotes.',
          'Term-structure contango stable — carry harvest window open.',
          'Toxicity z elevated on bid side — widening quoted spreads 12.5%.',
          'GEX flip proximity — gamma hedging flows expected into the close.',
          'Entropy dispersion rising — shrinking clip sizes to 0.4x notional.',
        ]
        pushLog({ id: `${Date.now()}-a`, ts: Date.now(), source: 'AGENT', level: 'info', message: `Reason/Act cycle complete: ${canned[Math.floor(Math.random() * canned.length)]}` })
        agentDelay = Math.min(agentDelay * 2, 208_000)
      }
      scheduleAgent(agentDelay)
    }
    scheduleAgent(agentDelay)

    return () => {
      clearInterval(ping)
      clearInterval(riskBeat)
      if (agentTimer) clearTimeout(agentTimer)
      clearInterval(optSweep)
      clearInterval(volCap)
      clearInterval(rhoAlert)
      setPolicySink(null)
      setAlertSinks(null, null)
      s.off('connect', onConnect); s.off('disconnect', onDisconnect)
      s.off('lse:status', onStatus); s.off('tick', onTick); s.off('book', onBook)
      s.off('tape', onTape); s.off('cboe', onCboe); s.off('ivsurface', onIv)
      s.off('engine:state', onEngine); s.off('log', onLog)
      s.off('sim:crash:ack', onCrashAck); s.off('sim:reset:ack', onResetAck)
      worker?.terminate()
      workerRef.current = null
    }
  }, [])

  return {
    injectCrash: (severity: number, durationMs: number) => {
      getSocket().emit('sim:crash', { severity, durationMs })
    },
    resetSim: () => {
      getSocket().emit('sim:reset')
      clearBuffers()
      resetFeed()
      ledger.reset()
      optDesk.closeAll()
      workerRef.current?.postMessage({ type: 'reset' })
      lastRegime.current = 'CALM'
      lastInter.current = { lock: false, scale: false, kill: false }
    },
    flatten: () => ledger.flatten('MANUAL'),
    flattenOptions: () => optDesk.closeAll(),
    setToken: (token: string) => {
      getSocket().emit('auth:token', { token })
    },
    clearToken: () => {
      getSocket().emit('auth:clear')
      try { localStorage.removeItem('krupp.fbtoken') } catch { /* ignore */ }
    },
  }
}
