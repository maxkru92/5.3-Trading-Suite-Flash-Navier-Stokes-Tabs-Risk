'use client'

// ============================================================================
// BOTTOM ROW // AUTONOMOUS EXECUTION LEDGER
// Agent-core paper desk: reason/act ticket flow, pre-trade interceptor gates,
// Hamiltonian fills with depth slippage, live P&L + equity curve.
// ============================================================================

import { useMemo, useState } from 'react'
import { Ban, Bot, Crosshair, Database, DollarSign, Download, History, Landmark, Play, Square, XCircle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { ledger } from '@/lib/london/execution'
import { fetchSessionFills } from '@/lib/london/ledgerSync'
import { useKrupp } from '@/lib/london/store'
import { K, Panel, Spark, fmt } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function StatChip({ label, value, color, title }: { label: string; value: string; color?: string; title?: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-2 py-1 border border-gridline bg-kbg-deep rounded-sm min-w-[64px]"
      title={title}
    >
      <span className="text-[7.5px] tracking-[0.22em] text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-[11px] font-bold tabular-nums leading-none truncate" style={{ color: color ?? K.text }}>
        {value}
      </span>
    </div>
  )
}

export function ExecutionLedger() {
  const engaged = useKrupp((s) => s.engaged)
  const setEngaged = useKrupp((s) => s.setEngaged)
  const pos = useKrupp((s) => s.pos)
  const realized = useKrupp((s) => s.realized)
  const fees = useKrupp((s) => s.fees)
  const unrealized = useKrupp((s) => s.unrealized)
  const fills = useKrupp((s) => s.fills)
  const fillsRev = useKrupp((s) => s.fillsRev)
  const realizedRev = useKrupp((s) => s.realizedRev)
  const blocks = useKrupp((s) => s.blocks)
  const volume = useKrupp((s) => s.volume)
  const persistOn = useKrupp((s) => s.persistOn)
  const ledgerTotal = useKrupp((s) => s.ledgerTotal)
  const lastAgentNote = useKrupp((s) => s.lastAgentNote)
  const deskSessions = useKrupp((s) => s.deskSessions)
  const drillSession = useKrupp((s) => s.drillSession)
  const drillFills = useKrupp((s) => s.drillFills)
  const drillLoading = useKrupp((s) => s.drillLoading)

  const net = realized - fees + unrealized
  const netColor = net > 0.5 ? K.green : net < -0.5 ? K.red : K.dim
  // flash direction derived purely from the newest fill's round-trip P&L
  // (realizedRev remounts the P&L node → one-shot animation per execution)
  const newestFill = fills.length > 0 ? fills[fills.length - 1] : null
  const netDir = newestFill?.pnl != null ? (newestFill.pnl >= 0 ? 'up' : 'dn') : null

  const inDrill = drillSession != null
  const drillMeta = inDrill ? deskSessions[drillSession] : undefined

  // --- ledger CSV export — streams the full SQLite blotter as a download ---
  const [exporting, setExporting] = useState(false)
  const exportCsv = () => {
    setExporting(true)
    try {
      const a = document.createElement('a')
      a.href = '/api/ledger?format=csv'
      a.download = ''
      document.body.appendChild(a)
      a.click()
      a.remove()
      useKrupp.getState().pushLog({
        id: `csv-${Date.now()}`, ts: Date.now(), source: 'LEDGER', level: 'info',
        message: 'Full blotter exported to CSV (auditor stream).',
      })
    } finally {
      setTimeout(() => setExporting(false), 1200)
    }
  }

  const openDrill = (i: number) => {
    const st = useKrupp.getState()
    if (st.drillSession === i) { st.setDrill(null); return }
    st.setDrillLoading(true)
    fetchSessionFills(i)
      .then((f) => st.setDrill(i, f))
      .catch(() => {
        st.setDrill(null)
        st.pushLog({ id: `drill-${Date.now()}`, ts: Date.now(), source: 'SYSTEM', level: 'warn', message: 'Session drill-down unavailable — ledger query failed.' })
      })
  }

  const stats = useMemo(() => {
    const executed = fills.filter((f) => f.status !== 'BLOCKED')
    const closed = executed.filter((f) => f.pnl != null)
    const wins = closed.filter((f) => (f.pnl ?? 0) > 0).length
    const hitRate = closed.length ? (wins / closed.length) * 100 : NaN
    const avgSlip = executed.length ? executed.reduce((a, f) => a + f.slipTicks, 0) / executed.length : NaN
    return { executed: executed.length, closed: closed.length, hitRate, avgSlip }
  }, [fills, fillsRev])

  return (
    <Panel
      title="AUTONOMOUS EXECUTION LEDGER"
      sub="AGENT CORE · HAMILTONIAN ROUTING"
      accent={engaged ? 'cyan' : 'dim'}
      right={
        <span
          className="flex items-center gap-1 text-[7px] tracking-[0.18em] px-1 py-0.5 border rounded-sm shrink-0"
          title={persistOn ? 'Execution ledger syncing to SQLite — blotter survives reloads' : 'Ledger persistence degraded — retrying'}
          style={{
            borderColor: persistOn ? hexA(KT('up'), 0.35) : hexA(KT('warn'), 0.5),
            color: persistOn ? K.green : K.orange,
          }}
        >
          <Database size={9} aria-hidden />
          {persistOn ? `PERSIST · ${ledgerTotal}` : 'PERSIST OFF'}
        </span>
      }
      bodyClass="p-2.5 flex flex-col gap-2"
    >
      {/* master switch + net P&L */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="flex items-center gap-2 px-2 py-1.5 border rounded-sm shrink-0"
          style={{
            borderColor: engaged ? hexA(KT('cyan'), 0.45) : KT('grid'),
            background: engaged ? hexA(KT('cyan'), 0.05) : KT('bgDeep'),
          }}
        >
          {engaged ? <Play size={12} style={{ color: K.cyan }} aria-hidden /> : <Square size={12} className="text-muted-foreground" aria-hidden />}
          <div className="leading-tight">
            <div className="text-[9px] font-black tracking-[0.2em]" style={{ color: engaged ? K.cyan : KT('textMuted') }}>
              {engaged ? 'DESK ENGAGED' : 'DESK HALTED'}
            </div>
            <div className="text-[7.5px] tracking-[0.14em] text-muted-foreground">AGENT ORDER FLOW · HOTKEY T</div>
          </div>
          <Switch
            checked={engaged}
            onCheckedChange={(v) => {
              setEngaged(v)
              useKrupp.getState().pushLog({
                id: `leg-${Date.now()}`, ts: Date.now(), source: 'ROUTING', level: 'info',
                message: v
                  ? '[ROUTING] Execution desk ENGAGED — agent order flow armed, interceptor chain live.'
                  : '[ROUTING] Execution desk HALTED — no new tickets will be routed.',
              })
            }}
            aria-label="Engage autonomous execution desk"
            className="data-[state=checked]:bg-cyan-500/80 data-[state=unchecked]:bg-kinset"
          />
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-[9px] tracking-[0.18em] font-bold rounded-sm border-red-500/40 text-red-300 hover:bg-red-950/40 shrink-0"
          onClick={() => ledger.flatten('MANUAL')}
          disabled={!pos}
          type="button"
          title="Market-out of the open position"
        >
          <Crosshair size={12} className="mr-1" aria-hidden /> FLATTEN
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-[9px] tracking-[0.18em] font-bold rounded-sm border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40 shrink-0"
          onClick={exportCsv}
          disabled={exporting}
          type="button"
          title="Download the full persisted blotter (futures + options) as CSV"
        >
          <Download size={12} className="mr-1" aria-hidden /> {exporting ? 'EXPORTING…' : 'CSV'}
        </Button>

        <div className="ml-auto flex items-center gap-3">
          {pos && pos.qty !== 0 ? (
            <div className="text-right leading-tight shrink-0">
              <div className="text-[7.5px] tracking-[0.22em] text-muted-foreground">POSITION</div>
              <div className="text-[12px] font-black tabular-nums tracking-wide" style={{ color: pos.qty > 0 ? K.green : K.red }}>
                {pos.qty > 0 ? 'LONG' : 'SHORT'} {Math.abs(pos.qty)}× {pos.sym} @ {fmt.price(pos.avgPx)}
              </div>
            </div>
          ) : (
            <div className="text-right leading-tight shrink-0">
              <div className="text-[7.5px] tracking-[0.22em] text-muted-foreground">POSITION</div>
              <div className="text-[12px] font-black tabular-nums tracking-wide" style={{ color: KT('textMuted') }}>FLAT</div>
            </div>
          )}
          <div className="text-right leading-tight shrink-0 min-w-[110px]">
            <div className="text-[7.5px] tracking-[0.22em] text-muted-foreground flex items-center justify-end gap-1">
              <DollarSign size={9} aria-hidden /> SESSION P&amp;L (NET)
            </div>
            <div
              key={realizedRev}
              className={`text-xl font-black tabular-nums leading-none ${net >= 0 ? 'text-glow-green' : 'text-glow-red'} ${netDir === 'up' ? 'flash-green' : netDir === 'dn' ? 'flash-red' : ''}`}
              style={{ color: netColor }}
            >
              {net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      {/* equity curve */}
      <div className="border border-gridline bg-kbg-deep rounded-sm px-1 pt-1">
        <div className="flex items-center justify-between px-1 pb-0.5">
          <span className="text-[7.5px] tracking-[0.24em] text-muted-foreground">EQUITY CURVE · MARK-TO-MARKET</span>
          <span className="text-[7.5px] tabular-nums text-muted-foreground">
            REAL <span style={{ color: realized - fees >= 0 ? K.green : K.red }}>{realized - fees >= 0 ? '+' : '−'}${Math.abs(realized - fees).toFixed(0)}</span>
            {' '}· OPEN <span style={{ color: unrealized >= 0 ? K.green : K.red }}>{unrealized >= 0 ? '+' : '−'}${Math.abs(unrealized).toFixed(0)}</span>
            {' '}· FEES <span className="text-orange-300/80">${fees.toFixed(2)}</span>
          </span>
        </div>
        <Spark buffer={ledger.equity} color={net >= 0 ? K.green : K.red} height={44} threshold={0} thresholdColor="rgba(255,255,255,0.18)" areaGradient />
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        <StatChip label="FILLS" value={String(stats.executed)} color={K.cyan} title="Executed tickets this session" />
        <StatChip label="BLOCKED" value={String(blocks)} color={blocks > 0 ? K.orange : K.dim} title="Tickets rejected by pre-trade interceptors" />
        <StatChip label="HIT RATE" value={isFinite(stats.hitRate) ? `${stats.hitRate.toFixed(0)}%` : '—'} color={K.green} title="Win rate on closed round-trips" />
        <StatChip label="VOLUME" value={`${fmt.int(volume)}L`} color={K.text} title="Contracts traded" />
        <StatChip label="AVG SLIP" value={isFinite(stats.avgSlip) ? `${stats.avgSlip.toFixed(1)}t` : '—'} color={K.orange} title="Average slippage per fill (ticks)" />
      </div>

      {/* agent-core trade note (LLM post-mortem on flatten / blocks) */}
      {lastAgentNote && (
        <div
          className="flex items-start gap-1.5 px-2 py-1 border rounded-sm"
          style={{ borderColor: hexA(KT('violet'), 0.35), background: hexA(KT('violet'), 0.05) }}
          role="status"
        >
          <Bot size={11} className="shrink-0 mt-px" style={{ color: K.violet }} aria-hidden />
          <div className="min-w-0">
            <div className="text-[7px] tracking-[0.24em]" style={{ color: K.violet }}>AGENT TRADE NOTE · REASON/ACT</div>
            <div className="text-[9px] leading-snug" style={{ color: K.text }}>{lastAgentNote.text}</div>
          </div>
          <span className="ml-auto text-[7.5px] tabular-nums text-muted-foreground shrink-0">{fmt.time(lastAgentNote.ts)}</span>
        </div>
      )}

      {/* desk sessions — gap-based boot-session aggregates from SQLite.
          Click a chip → blotter time-travels into that session. */}
      {deskSessions.length > 0 && (
        <div className="flex items-center gap-1.5 min-w-0" role="group" aria-label="Desk session history">
          <span className="flex items-center gap-1 text-[7.5px] tracking-[0.22em] text-muted-foreground shrink-0">
            <History size={9} aria-hidden /> SESSIONS
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto krupp-scroll min-w-0 py-0.5">
            {deskSessions.map((s, i) => {
              const isLive = i === 0
              const col = s.realized >= 0 ? K.green : K.red
              const active = drillSession === i
              return (
                <button
                  key={s.startTs}
                  type="button"
                  onClick={() => openDrill(i)}
                  aria-pressed={active}
                  aria-label={`Inspect desk session from ${fmt.time(s.startTs)} — ${s.fills} fills, session P&L ${s.realized >= 0 ? '+' : '−'}$${Math.abs(s.realized).toFixed(0)}`}
                  className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 border rounded-sm text-[8px] tabular-nums shrink-0 whitespace-nowrap transition-all cursor-pointer sess-chip ${isLive ? 'sess-chip-live' : ''} ${active ? 'sess-chip-active' : ''} hover:border-cyan-400/50`}
                  style={{
                    borderColor: active ? hexA(KT('cyan'), 0.9) : isLive ? hexA(KT('cyan'), 0.45) : KT('grid'),
                    background: active ? hexA(KT('cyan'), 0.12) : isLive ? hexA(KT('cyan'), 0.05) : KT('bgDeep'),
                  }}
                  title={`Desk session ${new Date(s.startTs).toLocaleString('en-GB', { hour12: false })} → ${new Date(s.endTs).toLocaleTimeString('en-GB', { hour12: false })}\nFills ${s.fills} · blocked ${s.blocked} · volume ${s.volume} lots · session P&L ${s.realized >= 0 ? '+' : '−'}$${Math.abs(s.realized).toFixed(0)}\nClick to inspect the blotter`}
                >
                  {isLive && <span className="led led-cyan" aria-hidden />}
                  <span style={{ color: active ? K.cyan : isLive ? K.cyan : KT('zinc') }}>
                    {fmt.time(s.startTs)}
                  </span>
                  <span className="text-muted-foreground">{s.fills}f</span>
                  {s.blocked > 0 && <span style={{ color: K.orange }}>{s.blocked}blk</span>}
                  <span className="font-bold" style={{ color: col }}>
                    {s.realized >= 0 ? '+' : '−'}${Math.abs(s.realized).toFixed(0)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* blotter — live ring, or the drilled session's persisted stream */}
      <div className="border border-gridline rounded-sm overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-2 py-1 border-b border-gridline bg-kbg-deep shrink-0">
          <Landmark size={10} className="text-muted-foreground" aria-hidden />
          {inDrill ? (
            <>
              <span className="text-[7.5px] tracking-[0.24em]" style={{ color: K.cyan }}>
                SESSION DRILL #{drillSession} · {drillMeta ? `${fmt.time(drillMeta.startTs)} → ${fmt.time(drillMeta.endTs)}` : '…'}
              </span>
              <span className="text-[7.5px] tabular-nums text-muted-foreground truncate">
                {drillFills.length} ROWS{drillMeta ? ` · ${drillMeta.fills} FILLS · ${drillMeta.blocked} BLK · P&L ${drillMeta.realized >= 0 ? '+' : '−'}$${Math.abs(drillMeta.realized).toFixed(0)}` : ''}
              </span>
              <button
                type="button"
                onClick={() => useKrupp.getState().setDrill(null)}
                className="ml-auto flex items-center gap-1 text-[7.5px] tracking-[0.18em] px-1 py-0.5 border border-cyan-500/40 text-cyan-300 rounded-sm hover:bg-cyan-950/40 transition-colors shrink-0"
                aria-label="Exit session drill-down, return to live blotter"
              >
                <XCircle size={9} aria-hidden /> EXIT DRILL
              </button>
            </>
          ) : (
            <>
              <span className="text-[7.5px] tracking-[0.24em] text-muted-foreground">ORDER BLOTTER · RING 60</span>
              <span className="ml-auto text-[7.5px] tracking-[0.14em] text-muted-foreground">
                {engaged ? <span style={{ color: K.cyan }}>AGENT: REASON/ACT LOOP LIVE</span> : 'AGENT: HALTED'}
              </span>
            </>
          )}
        </div>
        <div className="krupp-scroll overflow-y-auto max-h-[148px] flex-1" aria-label="Order blotter" aria-live={inDrill ? 'off' : 'polite'}>
          {inDrill && drillLoading ? (
            <div className="py-5 text-center text-[9px] tracking-[0.24em] text-cyan-300/80 animate-pulse">
              REPLAYING SESSION #{drillSession} FROM SQLITE…
            </div>
          ) : (inDrill ? drillFills : fills).length === 0 ? (
            <div className="py-5 text-center text-[9px] tracking-[0.2em] text-muted-foreground">
              {inDrill ? 'SESSION HAS NO PERSISTED FILLS IN RETENTION WINDOW' : 'AWAITING FIRST AGENT TICKET — REASON/ACT CYCLE ARMED…'}
            </div>
          ) : (
            <div className="divide-y divide-[#0e0e14]">
              {[...(inDrill ? drillFills : fills)].reverse().map((f, idx) => (
                <div
                  key={f.id}
                  className={`blotter-row flex items-center gap-2 px-2 py-[3px] text-[9.5px] tabular-nums ${idx % 2 === 1 ? 'bg-white/[0.015]' : ''} ${!inDrill && idx === 0 && f.status !== 'BLOCKED' ? 'row-in-cyan' : !inDrill && idx === 0 ? 'row-in-orange' : ''}`}
                >
                  <span className="text-muted-foreground/70 w-[54px] shrink-0">{fmt.time(f.ts)}</span>
                  <span className="w-[26px] shrink-0 font-bold" style={{ color: K.cyan }}>{f.sym}</span>
                  <span className="w-[30px] shrink-0 font-bold" style={{ color: f.side === 'BUY' ? K.green : K.red }}>{f.side}</span>
                  {f.status === 'BLOCKED' ? (
                    <>
                      <span className="flex-1 min-w-0 flex items-center gap-1.5 truncate">
                        <Ban size={9} style={{ color: K.orange }} className="shrink-0" aria-hidden />
                        <span className="text-orange-300/90 truncate text-[8.5px] tracking-wide">{f.reason}</span>
                      </span>
                      <span className="text-[7.5px] px-1 py-px border border-orange-500/40 text-orange-300 tracking-[0.18em] shrink-0">BLOCKED</span>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 truncate">
                        <span style={{ color: K.text }}>{f.qty}× @ {fmt.price(f.px)}</span>
                        <span className="text-muted-foreground text-[8.5px] ml-1.5">slip {f.slipTicks}t</span>
                        {f.status === 'FLATTEN' && <span className="text-[7.5px] px-1 py-px border border-red-500/50 text-red-300 tracking-[0.18em] ml-1.5">FLATTEN</span>}
                      </span>
                      {f.pnl != null && (
                        <span className="font-bold shrink-0" style={{ color: (f.pnl ?? 0) >= 0 ? K.green : K.red }}>
                          {(f.pnl ?? 0) >= 0 ? '+' : '−'}${Math.abs(f.pnl ?? 0).toFixed(0)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
