'use client'

// ============================================================================
// KRUPP CAPITAL // PRINT REPORT (round 7 — PDF pipeline)
// A paper-render of the desk state for browser "Save as PDF". Mounted ONCE
// next to the screen root; display:none on screen, display:block in @media
// print (the screen root + Radix portals are hidden by the same media block
// in globals.css). Data = live zustand store + one audit fetch on mount.
// Zero new dependencies — the browser print engine IS the PDF renderer.
// ============================================================================

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { correlationMatrix, meanPairwiseRho } from '@/lib/london/correlation'
import { POLICY_DEFAULTS, policyDrift } from '@/lib/london/policy'
import { ALERT_META, getAlerts } from '@/lib/london/alerts'
import type { OptTicket } from '@/lib/london/types'

interface AuditEvent { type: string; severity: string; message: string; createdAt: string }

function money(v: number): string {
  return `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function hhmmss(ts: number | string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false })
}

/** trigger the browser print dialog (the print-doc renders as an A4 report) */
export function printRiskReport(): void {
  useKrupp.getState().pushLog({
    id: `prn-${Date.now()}`, ts: Date.now(), source: 'SYSTEM', level: 'info',
    message: 'Print pipeline engaged — A4 risk report composed for browser PDF export.',
  })
  // let the log line land before the dialog blocks the event loop
  setTimeout(() => window.print(), 80)
}

export function PrintReportButton({ className, label = 'PDF' }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => printRiskReport()}
      aria-label="Print / save risk report as PDF"
      title="Compose the desk state into an A4 print document (browser Save-as-PDF)"
    >
      <Printer size={11} aria-hidden />
      {label}
    </button>
  )
}

export function PrintReport() {
  const st = useKrupp()
  const [audit, setAudit] = useState<AuditEvent[]>([])
  // Timestamp is captured POST-MOUNT: computing it at render made the always-mounted
  // (display:none) print doc render a server-vs-client divergent value on hydration.
  const [generatedAt, setGeneratedAt] = useState('')

  useEffect(() => {
    // deferred (not synchronous) — react-hooks/set-state-in-effect
    const t0 = setTimeout(() => setGeneratedAt(new Date().toISOString()), 0)
    let dead = false
    fetch('/api/events?limit=40', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!dead && j?.ok) setAudit(j.events ?? []) })
      .catch(() => { /* print renders without the audit section */ })
    return () => { clearTimeout(t0); dead = true }
  }, [])

  const m = st.metrics
  const pol = st.policy ?? POLICY_DEFAULTS
  const drift = policyDrift(pol)
  const corr = correlationMatrix().m
  const avgRho = corr.length === 3 ? meanPairwiseRho(corr) : NaN
  const net = st.realized - st.fees + st.unrealized
  const executed = st.fills.filter((f) => f.status !== 'BLOCKED')
  const closed = executed.filter((f) => f.pnl != null)
  const wins = closed.filter((f) => (f.pnl ?? 0) > 0).length
  const optNet = st.optRealized - st.optFees + st.optUnrealized
  const vh = st.volHistory
  const alerts = getAlerts()

  return (
    <div className="print-doc" style={{ background: '#ffffff', color: '#111111', colorScheme: 'light' } as React.CSSProperties} aria-hidden>
      {/* classification banner */}
      <div className="pr-classbar">CLASSIFICATION: INTERNAL — RISK DESK USE ONLY · PAPER SIMULATION</div>

      <header className="pr-head">
        <div>
          <h1>KRUPP CAPITAL // RISK DESK REPORT</h1>
          <p className="pr-sub">LONDON STRATEGIC EDGE — L3 RISK DESK · NAVIER-STOKES KERNEL v2.4.1</p>
        </div>
        <table className="pr-meta">
          <tbody>
            <tr><th>Generated</th><td>{generatedAt || '—'}</td></tr>
            <tr><th>Feed mode</th><td>{st.auth?.mode ?? '—'} · auth {st.auth?.level ?? '—'}{st.auth?.tokenMask ? ` · ${st.auth.tokenMask}` : ''}</td></tr>
            <tr><th>Connection</th><td>{st.connection} · RTT {st.latencyMs}ms · ledger {st.persistOn ? `ON (${st.ledgerTotal} rows)` : 'DEGRADED'}</td></tr>
          </tbody>
        </table>
      </header>

      {/* 1 — kernel */}
      <section className="pr-sec">
        <h2>1 · SYSTEMIC RISK KERNEL (NAVIER-STOKES COMPOSITE)</h2>
        <div className="pr-score-row">
          <div className="pr-score">
            <span className="pr-score-num">{m.score.toFixed(1)}</span>
            <span className="pr-score-cap">/ 100 · {m.regime}</span>
          </div>
          <table className="pr-t pr-t-kv">
            <tbody>
              <tr><th>Hawkes λₜ</th><td>{m.hawkes.toFixed(3)} (tox z {m.toxZ >= 0 ? '+' : ''}{m.toxZ.toFixed(2)})</td></tr>
              <tr><th>ABE viscosity η</th><td>{m.viscosity.toFixed(2)} vol/rng ({(m.viscRatio * 100).toFixed(0)}% of baseline){m.shock ? ' · SHOCK' : ''}</td></tr>
              <tr><th>Regularized jerk</th><td>{m.jerk.toFixed(1)} px/s³ (z {m.jerkZ >= 0 ? '+' : ''}{m.jerkZ.toFixed(2)})</td></tr>
              <tr><th>Shannon entropy H</th><td>{m.entropy.toFixed(3)} (desk seal {pol.lockChaos.toFixed(3)})</td></tr>
              <tr><th>Interceptors</th><td>LOCK {m.interceptors.lock ? 'ARMED' : 'standby'} · SCALE {m.interceptors.scale ? 'ARMED' : 'standby'} · KILL {m.interceptors.kill ? 'ARMED' : 'standby'}</td></tr>
              <tr><th>Desk policy</th><td>LOCK&gt; {pol.lockChaos.toFixed(3)} · SCALE&lt; {(pol.scaleVisc * 100).toFixed(0)}% · KILL&gt; {pol.killScore.toFixed(1)}{st.activeProfile ? ` · profile "${st.activeProfile}"` : drift < 1e-9 ? ' · spec' : ` · drift ${(drift * 100).toFixed(0)}bp`}</td></tr>
              {corr.length === 3 && (
                <tr><th>Cross-asset ρ (300t)</th><td>ES/NQ {corr[0][1].toFixed(2)} · ES/SPY {corr[0][2].toFixed(2)} · NQ/SPY {corr[1][2].toFixed(2)} — mean {Number.isFinite(avgRho) ? avgRho.toFixed(3) : '—'}</td></tr>
              )}
              <tr><th>Engine</th><td>{st.engine ? `${st.engine.tickCount.toLocaleString('en-US')} ticks · uptime ${(st.engine.uptimeMs / 60000).toFixed(1)}min · regime ${st.engine.regime}` : '—'}</td></tr>
              {alerts.length > 0 && (
                <tr><th>Alert sentinels</th><td>{alerts.filter((a) => a.armed).length} armed / {alerts.length} · lifetime trips {alerts.reduce((a, r) => a + r.tripCount, 0)} · {alerts.filter((a) => a.tripCount > 0).map((a) => `${ALERT_META[a.kind].label}×${a.tripCount}`).join(', ') || 'no trips'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {(m.interceptors.lock || m.interceptors.scale || m.interceptors.kill) && (
          <p className="pr-note">
            Active rationale — {m.interceptors.lock ? `[LOCK] ${m.reasons.lock} ` : ''}{m.interceptors.scale ? `[SCALE] ${m.reasons.scale} ` : ''}{m.interceptors.kill ? `[KILL] ${m.reasons.kill}` : ''}
          </p>
        )}
      </section>

      {/* 2 — CBOE */}
      <section className="pr-sec">
        <h2>2 · VOLATILITY COMPLEX (CBOE)</h2>
        {st.cboe ? (
          <>
            <table className="pr-t pr-t-2col">
              <tbody>
                <tr><th>VIX</th><td>{st.cboe.vix.toFixed(2)}</td><th>VIX9D</th><td>{st.cboe.vix9d.toFixed(2)}{st.cboe.vix9d > st.cboe.vix ? ' (1×2 BACK)' : ''}</td></tr>
                <tr><th>VIX3M</th><td>{st.cboe.vix3m.toFixed(2)}</td><th>Contango</th><td>{st.cboe.contangoPct >= 0 ? '+' : ''}{st.cboe.contangoPct.toFixed(2)}% · ×{st.cboe.multiplier.toFixed(3)} ({st.cboe.termLabel})</td></tr>
                <tr><th>SKEW</th><td>{st.cboe.skew.toFixed(1)}</td><th>VVIX</th><td>{st.cboe.vvix.toFixed(1)}</td></tr>
                <tr><th>P/C ratio</th><td>{st.cboe.pcRatio.toFixed(2)} ({st.cboe.pcClass})</td><th>Source</th><td>{st.cboe.source}</td></tr>
              </tbody>
            </table>
            {vh.length > 1 && (
              <>
                <h3>Persisted volatility record ({vh.length} snapshots)</h3>
                <table className="pr-t pr-t-data">
                  <thead>
                    <tr><th>Time</th><th>VIX</th><th>Contango</th><th>×Mult</th><th>P/C</th><th>ATM IV</th><th>Score</th><th>Regime</th><th>Src</th></tr>
                  </thead>
                  <tbody>
                    {vh.slice(-8).map((s) => (
                      <tr key={s.ts}>
                        <td>{hhmmss(s.ts)}</td><td>{s.vix.toFixed(2)}</td>
                        <td>{s.contango >= 0 ? '+' : ''}{s.contango.toFixed(2)}%</td>
                        <td>{s.multiplier.toFixed(3)}</td><td>{s.pcRatio.toFixed(2)}</td>
                        <td>{s.atmIV.toFixed(1)}%</td><td>{s.score.toFixed(0)}</td><td>{s.regime}</td>
                        <td>{s.source.startsWith('RELAY') ? 'relay' : 'desk'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        ) : <p className="pr-note">CBOE snapshot unavailable at report time.</p>}
      </section>

      {/* 3 — IV surface */}
      <section className="pr-sec">
        <h2>3 · 0DTE/1DTE IV SURFACE &amp; GAMMA EXPOSURE</h2>
        {st.iv ? (
          <>
            <p className="pr-note">
              ES spot {st.iv.spot.toFixed(2)} · ATM IV {st.iv.atmIV.toFixed(1)}% · GEX flip {st.iv.flipStrike.toFixed(0)} · Γ max {st.iv.maxGammaStrike.toFixed(0)} · net GEX {st.iv.totalGex >= 0 ? '+' : ''}{st.iv.totalGex.toFixed(2)} $mn/1%
            </p>
            <table className="pr-t pr-t-data">
              <thead>
                <tr><th>Strike</th><th>C·Vol</th><th>C·IV</th><th>Δ</th><th>GEX</th><th>Δ</th><th>P·IV</th><th>P·Vol</th><th>Γ</th></tr>
              </thead>
              <tbody>
                {st.iv.rows.map((r) => (
                  <tr key={r.strike} className={r.strike === st.iv?.flipStrike ? 'pr-flip' : ''}>
                    <td>{r.strike.toFixed(0)}{r.strike === st.iv?.flipStrike ? ' ◂FLIP' : ''}</td>
                    <td>{r.callVol >= 1000 ? `${(r.callVol / 1000).toFixed(1)}K` : r.callVol}</td>
                    <td>{r.callIV.toFixed(1)}</td><td>{r.callDelta.toFixed(2)}</td>
                    <td>{r.gex >= 0 ? '+' : ''}{r.gex.toFixed(1)}</td>
                    <td>{r.putDelta.toFixed(2)}</td><td>{r.putIV.toFixed(1)}</td>
                    <td>{r.putVol >= 1000 ? `${(r.putVol / 1000).toFixed(1)}K` : r.putVol}</td>
                    <td>{r.gamma.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p className="pr-note">IV surface unavailable at report time.</p>}
      </section>

      {/* 4 — options book */}
      <section className="pr-sec">
        <h2>4 · OPTIONS DESK (PAPER)</h2>
        <p className="pr-note">
          Net {money(optNet)} — realized {money(st.optRealized - st.optFees)} · open {money(st.optUnrealized)} · fees ${st.optFees.toFixed(2)} · {st.optTickets.filter((t) => t.status === 'OPEN').length} open / {st.optTickets.length} tickets
        </p>
        {st.optTickets.length > 0 && (
          <table className="pr-t pr-t-data">
            <thead><tr><th>Status</th><th>Ticket</th><th>Entry</th><th>Entry IV</th><th>Close</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {[...st.optTickets].reverse().map((t: OptTicket) => (
                <tr key={t.id}>
                  <td>{t.status}</td>
                  <td>{t.qty > 0 ? 'LONG' : 'SHORT'} {Math.abs(t.qty)}× {t.expiry} ES {t.optKind[0]}{t.strike.toFixed(0)}</td>
                  <td>{t.entryPx.toFixed(2)}</td><td>{t.entryIV.toFixed(1)}%</td>
                  <td>{t.status === 'CLOSED' ? t.closePx?.toFixed(2) ?? '—' : '—'}</td>
                  <td>{t.status === 'CLOSED' ? money(t.pnl ?? 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 5 — execution ledger */}
      <section className="pr-sec">
        <h2>5 · AUTONOMOUS EXECUTION LEDGER</h2>
        <p className="pr-note">
          Desk {st.engaged ? 'ENGAGED (agent reason/act live)' : 'HALTED'} · session net {money(net)} (realized {money(st.realized)} · fees ${st.fees.toFixed(2)} · open {money(st.unrealized)}) · fills {executed.length} · blocked {st.blocks} · volume {st.volume.toLocaleString('en-US')} lots · hit rate {closed.length ? ((wins / closed.length) * 100).toFixed(0) : '—'}%
        </p>
        <p className="pr-note">
          Position {st.pos ? `${st.pos.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(st.pos.qty)}× ${st.pos.sym} @ ${st.pos.avgPx.toFixed(2)}` : 'FLAT'} · desk sessions {st.deskSessions.length} · last agent note: {st.lastAgentNote ? `"${st.lastAgentNote.text}"` : '—'}
        </p>
        {executed.length > 0 && (
          <table className="pr-t pr-t-data">
            <thead><tr><th>Time</th><th>Sym</th><th>Side</th><th>Qty</th><th>Price</th><th>Slip</th><th>Status</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {[...executed].reverse().slice(0, 16).map((f) => (
                <tr key={f.id}>
                  <td>{hhmmss(f.ts)}</td><td>{f.sym}</td><td>{f.side}</td><td>{f.qty}×</td>
                  <td>{f.px ? f.px.toFixed(2) : '—'}</td><td>{f.slipTicks}t</td>
                  <td>{f.status}{f.reason ? ` (${f.reason})` : ''}</td>
                  <td>{f.pnl != null ? money(f.pnl) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 6 — audit trail */}
      <section className="pr-sec">
        <h2>6 · PERSISTED AUDIT TRAIL (SQLITE)</h2>
        {audit.length > 0 ? (
          <table className="pr-t pr-t-data">
            <thead><tr><th>Time</th><th>Type</th><th>Sev</th><th>Message</th></tr></thead>
            <tbody>
              {audit.slice(0, 16).map((e, i) => (
                <tr key={i}>
                  <td>{hhmmss(e.createdAt)}</td><td>{e.type}</td><td>{e.severity.toUpperCase()}</td>
                  <td className="pr-msg">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="pr-note">Audit ledger unreachable at report time.</p>}
      </section>

      <footer className="pr-foot">
        END OF REPORT — KRUPP CAPITAL RISK DESK · NOT INVESTMENT ADVICE · ALL FIGURES SYNTHETIC UNLESS LABELED LIVE
      </footer>
    </div>
  )
}
