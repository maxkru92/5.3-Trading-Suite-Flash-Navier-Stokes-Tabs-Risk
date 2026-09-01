// ============================================================================
// KRUPP CAPITAL // RISK REPORT EXPORT
// Compiles a full desk snapshot — risk kernel state, CBOE complex, IV/GEX
// surface, option book, execution ledger aggregates + blotter tail, persisted
// audit events — into a Markdown document and downloads it client-side.
// Pure client: reads the zustand store + two GET fetches, no server round
// trip beyond the event/ledger queries.
// ============================================================================

import { useKrupp } from './store'
import { buffers } from './buffers'
import { feed } from './feed'
import { correlationMatrix, meanPairwiseRho } from './correlation'
import { POLICY_DEFAULTS, policyDrift } from './policy'
import { ALERT_META, getAlerts } from './alerts'
import type { OptTicket } from './types'

interface AuditEvent { type: string; severity: string; message: string; createdAt: string }

const bar = '─'.repeat(58)

function money(v: number): string {
  return `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
}

function optLine(t: OptTicket): string {
  const head = `${t.status === 'CLOSED' ? 'CLOSED' : 'OPEN   '} · ${t.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(t.qty)}× ${t.expiry} ES ${t.optKind[0]}${t.strike.toFixed(0)}`
  const entry = `entry ${t.entryPx.toFixed(2)} @ IV ${t.entryIV.toFixed(1)}%`
  const tail = t.status === 'CLOSED' ? `close ${t.closePx?.toFixed(2) ?? '—'} · P&L ${money(t.pnl ?? 0)}` : 'marked to live surface'
  return `- ${head} — ${entry} — ${tail}`
}

async function fetchAudit(): Promise<AuditEvent[]> {
  try {
    const r = await fetch('/api/events?limit=40', { cache: 'no-store' })
    const j = await r.json()
    return j?.ok ? (j.events as AuditEvent[]) : []
  } catch {
    return []
  }
}

export async function buildReportMarkdown(): Promise<string> {
  const st = useKrupp.getState()
  const m = st.metrics
  const cboe = st.cboe
  const iv = st.iv
  const eng = st.engine
  const now = new Date()
  const audit = await fetchAudit()

  const L: string[] = []
  L.push(`# KRUPP CAPITAL // RISK DESK REPORT`)
  L.push(``)
  L.push(`**LONDON STRATEGIC EDGE — L3 RISK DESK** · generated ${now.toISOString()}`)
  L.push(`Session UTC ${now.toUTCString().slice(17, 25)} · feed mode ${st.auth?.mode ?? '—'} · auth level ${st.auth?.level ?? '—'}`)
  L.push('```')
  L.push(bar)
  L.push(' CLASSIFICATION: INTERNAL — RISK DESK USE ONLY')
  L.push(bar)
  L.push('```')
  L.push(``)

  // ---- 1. SYSTEMIC RISK KERNEL -------------------------------------------
  L.push(`## 1. SYSTEMIC RISK KERNEL (NAVIER-STOKES COMPOSITE)`)
  L.push(``)
  L.push('| Metric | Value |')
  L.push('|---|---|')
  L.push(`| Composite score | **${m.score.toFixed(1)} / 100 — ${m.regime}** |`)
  L.push(`| Hawkes intensity λₜ | ${m.hawkes.toFixed(3)} (tox z ${m.toxZ >= 0 ? '+' : ''}${m.toxZ.toFixed(2)}) |`)
  L.push(`| ABE viscosity η | ${m.viscosity.toFixed(2)} vol/rng (ratio ${(m.viscRatio * 100).toFixed(0)}% of baseline) |`)
  L.push(`| Regularized jerk | ${m.jerk.toFixed(1)} px/s³ (z ${m.jerkZ >= 0 ? '+' : ''}${m.jerkZ.toFixed(2)}${m.shock ? ' — HEAVY VOLATILITY SHOCK' : ''}) |`)
  L.push(`| Shannon entropy H | ${m.entropy.toFixed(3)} (desk seal ${(st.policy?.lockChaos ?? POLICY_DEFAULTS.lockChaos).toFixed(3)}) |`)
  L.push(`| Interceptors | LOCK ${m.interceptors.lock ? 'ARMED' : 'standby'} · SCALE ${m.interceptors.scale ? 'ARMED' : 'standby'} · KILL ${m.interceptors.kill ? 'ARMED' : 'standby'} |`)
  const pol = st.policy ?? POLICY_DEFAULTS
  const drift = policyDrift(pol)
  L.push(`| Desk risk policy | LOCK> ${pol.lockChaos.toFixed(3)} · SCALE< ${(pol.scaleVisc * 100).toFixed(0)}% · KILL> ${pol.killScore.toFixed(1)}${drift < 1e-9 ? ' (spec)' : ` (drift ${(drift * 100).toFixed(0)}bp from spec)`} |`)
  const corr = correlationMatrix().m
  if (corr.length === 3) {
    const avg = meanPairwiseRho(corr)
    L.push(`| Cross-asset ρ (300t) | ES/NQ ${corr[0][1].toFixed(2)} · ES/SPY ${corr[0][2].toFixed(2)} · NQ/SPY ${corr[1][2].toFixed(2)} — mean ${Number.isFinite(avg) ? avg.toFixed(3) : '—'} |`)
  }
  L.push(`| Engine | ${eng ? `${eng.tickCount.toLocaleString('en-US')} ticks · uptime ${(eng.uptimeMs / 60000).toFixed(1)}min · regime ${eng.regime}` : '—'} |`)
  L.push(``)
  if (m.interceptors.lock || m.interceptors.scale || m.interceptors.kill) {
    L.push('**Active interceptor rationale:**')
    if (m.interceptors.lock) L.push(`- [LOCK] ${m.reasons.lock}`)
    if (m.interceptors.scale) L.push(`- [SCALE] ${m.reasons.scale}`)
    if (m.interceptors.kill) L.push(`- [KILL] ${m.reasons.kill}`)
    L.push(``)
  }

  // desk alert sentinels (round 8)
  const alerts = getAlerts()
  if (alerts.length > 0) {
    L.push(`**Desk alert sentinels (${alerts.filter((a) => a.armed).length} armed / ${alerts.length}):**`)
    L.push(``)
    L.push('| Sentinel | Trigger | Armed | Trips | Last trip |')
    L.push('|---|---|---|---|---|')
    for (const a of alerts) {
      const meta = ALERT_META[a.kind]
      L.push(`| ${meta.label} | ${a.op === '>' ? 'above' : 'below'} ${a.threshold}${meta.unit ? ` ${meta.unit}` : ''} | ${a.armed ? 'ARMED' : 'off'} | ${a.tripCount} | ${a.lastTripped > 0 ? new Date(a.lastTripped).toLocaleTimeString('en-GB', { hour12: false }) : '—'} |`)
    }
    L.push(``)
  }

  // ---- 2. VOLATILITY COMPLEX (CBOE) ---------------------------------------
  L.push(`## 2. VOLATILITY COMPLEX (CBOE)`)
  L.push(``)
  if (cboe) {
    L.push(`Source **${cboe.source}** · contango **${cboe.contangoPct >= 0 ? '+' : ''}${cboe.contangoPct.toFixed(2)}%** (piecewise multiplier ×${cboe.multiplier.toFixed(3)}, ${cboe.termLabel})`)
    L.push(``)
    L.push(`| Index | Level | | Sentiment | Value |`)
    L.push(`|---|---|---|---|---|`)
    L.push(`| VIX | ${cboe.vix.toFixed(2)} | | P/C ratio | ${cboe.pcRatio.toFixed(2)} (${cboe.pcClass}) |`)
    L.push(`| VIX9D | ${cboe.vix9d.toFixed(2)} | | Call volume | ${cboe.callVol.toLocaleString('en-US')} |`)
    L.push(`| VIX3M | ${cboe.vix3m.toFixed(2)} | | Put volume | ${cboe.putVol.toLocaleString('en-US')} |`)
    L.push(`| SKEW | ${cboe.skew.toFixed(2)} | | Call OI | ${cboe.callOI.toLocaleString('en-US')} |`)
    L.push(`| VVIX | ${cboe.vvix.toFixed(2)} | | Put OI | ${cboe.putOI.toLocaleString('en-US')} |`)
  } else {
    L.push('> CBOE snapshot unavailable at report time.')
  }
  L.push(``)

  // ---- 2b. PERSISTED VOLATILITY RECORD (SQLite) ---------------------------
  const vh = st.volHistory
  L.push(`### Persisted volatility record (cross-boot, ${vh.length} snapshots)`)
  L.push(``)
  if (vh.length > 1) {
    const vixs = vh.map((s) => s.vix)
    const cs = vh.map((s) => s.contango)
    const first = vh[0], last = vh[vh.length - 1]
    const regimes = { CALM: 0, HIGH: 0, CRISIS: 0 } as Record<string, number>
    for (const s of vh) regimes[s.regime] = (regimes[s.regime] ?? 0) + 1
    const spanMin = Math.max(1, Math.round((last.ts - first.ts) / 60000))
    L.push(`Span **${spanMin}min** (${new Date(first.ts).toLocaleTimeString('en-GB', { hour12: false })} → ${new Date(last.ts).toLocaleTimeString('en-GB', { hour12: false })}) · VIX ${Math.min(...vixs).toFixed(2)}–${Math.max(...vixs).toFixed(2)} (now ${last.vix.toFixed(2)}) · contango ${Math.min(...cs).toFixed(2)}%–${Math.max(...cs).toFixed(2)}%`)
    L.push(``)
    L.push(`Regime mix: ${regimes.CALM} CALM · ${regimes.HIGH} HIGH · ${regimes.CRISIS} CRISIS`)
    L.push(``)
    L.push(`| Time | VIX | Contango | ×Mult | P/C | ATM IV | Score | Regime |`)
    L.push(`|---|---|---|---|---|---|---|---|`)
    for (const s of vh.slice(-10)) {
      L.push(`| ${new Date(s.ts).toLocaleTimeString('en-GB', { hour12: false })} | ${s.vix.toFixed(2)} | ${s.contango >= 0 ? '+' : ''}${s.contango.toFixed(2)}% | ${s.multiplier.toFixed(3)} | ${s.pcRatio.toFixed(2)} | ${s.atmIV.toFixed(1)}% | ${s.score.toFixed(1)} | ${s.regime} |`)
    }
  } else {
    L.push('> Fewer than two persisted snapshots — the 60s capture loop is still filling the record.')
  }
  L.push(``)

  // ---- 3. IV SURFACE / GEX ------------------------------------------------
  L.push(`## 3. 0DTE/1DTE IV SURFACE & GAMMA EXPOSURE`)
  L.push(``)
  if (iv) {
    L.push(`ES spot **${iv.spot.toFixed(2)}** · ATM IV ${iv.atmIV.toFixed(1)}% · GEX flip **${iv.flipStrike.toFixed(0)}** · Γ max ${iv.maxGammaStrike.toFixed(0)} · net GEX **${iv.totalGex >= 0 ? '+' : ''}${iv.totalGex.toFixed(2)} $mn/1%**`)
    L.push(``)
    L.push(`| Strike | C·IV | P·IV | Γ | GEX |`)
    L.push(`|---|---|---|---|---|`)
    for (const r of iv.rows) {
      L.push(`| ${r.strike.toFixed(0)}${r.strike === iv.flipStrike ? ' ◂ FLIP' : ''} | ${r.callIV.toFixed(1)} | ${r.putIV.toFixed(1)} | ${r.gamma.toFixed(4)} | ${r.gex >= 0 ? '+' : ''}${r.gex.toFixed(1)} |`)
    }
  } else {
    L.push('> IV surface unavailable at report time.')
  }
  L.push(``)

  // ---- 4. OPTION BOOK ------------------------------------------------------
  L.push(`## 4. OPTIONS DESK (PAPER)`)
  L.push(``)
  L.push(`Net **${money(st.optRealized - st.optFees + st.optUnrealized)}** — realized ${money(st.optRealized - st.optFees)} · open ${money(st.optUnrealized)} · fees $${st.optFees.toFixed(2)} · ${st.optTickets.filter((t) => t.status === 'OPEN').length} open / ${st.optTickets.length} total tickets`)
  L.push(``)
  if (st.optTickets.length > 0) {
    for (const t of [...st.optTickets].reverse()) L.push(optLine(t))
  } else {
    L.push('> No option tickets this session.')
  }
  L.push(``)

  // ---- 5. EXECUTION LEDGER -------------------------------------------------
  const net = st.realized - st.fees + st.unrealized
  const executed = st.fills.filter((f) => f.status !== 'BLOCKED')
  const closed = executed.filter((f) => f.pnl != null)
  const wins = closed.filter((f) => (f.pnl ?? 0) > 0).length
  L.push(`## 5. AUTONOMOUS EXECUTION LEDGER`)
  L.push(``)
  L.push(`Desk **${st.engaged ? 'ENGAGED (agent reason/act live)' : 'HALTED'}** · session net **${money(net)}** (realized ${money(st.realized)} · fees $${st.fees.toFixed(2)} · open ${money(st.unrealized)})`)
  L.push(``)
  L.push(`- Fills ${executed.length} · blocked ${st.blocks} · volume ${st.volume.toLocaleString('en-US')} lots`)
  L.push(`- Hit rate ${closed.length ? ((wins / closed.length) * 100).toFixed(0) : '—'}% (${wins}/${closed.length} round-trips)`)
  L.push(`- Position ${st.pos ? `${st.pos.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(st.pos.qty)}× ${st.pos.sym} @ ${st.pos.avgPx.toFixed(2)}` : 'FLAT'}`)
  L.push(`- Last agent note: ${st.lastAgentNote ? `"${st.lastAgentNote.text}"` : '—'}`)
  L.push(``)
  if (st.fills.length > 0) {
    L.push(`| Time | Sym | Side | Qty | Price | Slip | Status | P&L |`)
    L.push(`|---|---|---|---|---|---|---|---|`)
    for (const f of [...st.fills].reverse().slice(0, 25)) {
      L.push(`| ${new Date(f.ts).toLocaleTimeString('en-GB', { hour12: false })} | ${f.sym} | ${f.side} | ${f.qty} | ${f.px ? f.px.toFixed(2) : '—'} | ${f.slipTicks}t | ${f.status}${f.reason ? ` (${f.reason})` : ''} | ${f.pnl != null ? money(f.pnl) : '—'} |`)
    }
    L.push(``)
  }

  // ---- 6. PERSISTED AUDIT TRAIL -------------------------------------------
  L.push(`## 6. PERSISTED AUDIT TRAIL (SQLITE)`)
  L.push(``)
  if (audit.length > 0) {
    L.push(`| Time | Type | Sev | Message |`)
    L.push(`|---|---|---|---|`)
    for (const e of audit.slice(0, 30)) {
      L.push(`| ${new Date(e.createdAt).toLocaleTimeString('en-GB', { hour12: false })} | ${e.type} | ${e.severity.toUpperCase()} | ${e.message.replace(/\|/g, '/')} |`)
    }
  } else {
    L.push('> Audit ledger unreachable at report time.')
  }
  L.push(``)

  // ---- 7. TAPE FOOTER ------------------------------------------------------
  L.push(`## 7. DESK TELEMETRY`)
  L.push(``)
  L.push(`- Selected instrument: ${st.selectedSym} · tracked mid ${feed.books.get(st.selectedSym)?.mid.toFixed(2) ?? '—'} · spread ${feed.books.get(st.selectedSym)?.spreadTicks ?? '—'}t`)
  L.push(`- Cumulative delta (session): ${feed.cdelta.get(st.selectedSym)?.toFixed(0) ?? '—'}`)
  L.push(`- Risk kernel samples: ${buffers.score.filled} (ring 900) · socket RTT ${st.latencyMs}ms · connection ${st.connection}`)
  L.push(`- Ledger persistence: ${st.persistOn ? `ON (${st.ledgerTotal} rows)` : 'DEGRADED'}`)
  L.push(`- Vol snapshot sync: ${st.volSyncOn ? `ON (${st.volHistory.length} persisted snapshots)` : 'DEGRADED'}`)
  L.push(``)
  L.push('```')
  L.push(bar)
  L.push(' END OF REPORT — KRUPP CAPITAL RISK DESK // PAPER SIMULATION ONLY')
  L.push(' NOT INVESTMENT ADVICE. ALL FIGURES SYNTHETIC UNLESS LABELED LIVE.')
  L.push(bar)
  L.push('```')
  return L.join('\n')
}

/** build + download the markdown report, log the export to the terminal */
export async function downloadRiskReport(): Promise<void> {
  const md = await buildReportMarkdown()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `KRUPP_RISK_REPORT_${stamp}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  useKrupp.getState().pushLog({
    id: `rpt-${Date.now()}`, ts: Date.now(), source: 'SYSTEM', level: 'info',
    message: `[SYSTEM] Risk report exported — ${(blob.size / 1024).toFixed(1)}KB markdown snapshot downloaded to desk.`,
  })
}
