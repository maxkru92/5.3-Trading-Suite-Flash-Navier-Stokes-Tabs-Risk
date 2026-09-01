'use client'

// ============================================================================
// COLUMN 3 // CARD 1 — 0DTE/1DTE OPTIONS IV SURFACE (LSE/CBOE OPTIONS FEED)
// Strike matrix: Calls/Puts volume, Delta, Gamma profile, IV micro-heatmap,
// short-dated Gamma exposure (GEX) with flip-strike detection.
// CLICK ANY STRIKE → live Black-Scholes context ticket (CALL/PUT, qty, BUY/
// SELL) marked against the live surface; option book + P&L below the matrix.
// ============================================================================

import { useMemo, useState } from 'react'
import { Grid3x3, Minus, Plus, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useKrupp } from '@/lib/london/store'
import { markOpt, optDesk, OPT_MULT, quoteOpt } from '@/lib/london/optionsDesk'
import { K, Panel, fmt } from './shared'
import type { IvRow, OptTicket } from '@/lib/london/types'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function heat(v: number, lo: number, hi: number, invert = false): { bg: string; fg: string } {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)))
  const u = invert ? 1 - t : t
  // green → amber → crimson
  const stops: Array<[number, number[]]> = [[0, [0, 255, 102]], [0.5, [255, 136, 0]], [1, [255, 17, 51]]]
  let c: number[] = stops[stops.length - 1][1]
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i][0]) {
      const [p0, c0] = stops[i - 1]
      const [p1, c1] = stops[i]
      const k = (u - p0) / (p1 - p0 || 1)
      c = c0.map((x, j) => Math.round(x + (c1[j] - x) * k))
      break
    }
  }
  const bg = `rgba(${c[0]},${c[1]},${c[2]},${(0.10 + u * 0.5).toFixed(2)})`
  const fg = u > 0.62 ? KT('downSoft') : u > 0.3 ? KT('warnSoft') : KT('accentSoft')
  return { bg, fg }
}

const QTYS = [1, 2, 5, 10]

function OptChip({ t, onClose }: { t: OptTicket; onClose: (id: string) => void }) {
  const mark = markOpt(t)
  const upl = mark != null ? (mark - t.entryPx) * t.qty * OPT_MULT : null
  const closed = t.status === 'CLOSED'
  const pnl = closed ? (t.pnl ?? 0) : upl
  const color = pnl == null ? K.dim : pnl >= 0 ? K.green : K.red
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-sm text-[8.5px] tabular-nums tracking-wide"
      style={{
        borderColor: closed ? KT('grid') : t.qty > 0 ? hexA(KT('up'), 0.4) : hexA(KT('down'), 0.4),
        background: closed ? KT('header') : t.qty > 0 ? hexA(KT('up'), 0.06) : hexA(KT('down'), 0.06),
      }}
      title={`${t.expiry} ES ${t.optKind} ${t.strike} · entry ${t.entryPx.toFixed(2)} @ IV ${t.entryIV.toFixed(1)}%${closed ? ` · closed ${t.closePx?.toFixed(2)}` : ''}`}
    >
      <span className="font-bold" style={{ color: t.qty > 0 ? K.green : K.red }}>
        {closed ? '✕' : t.qty > 0 ? 'L' : 'S'}{Math.abs(t.qty)}
      </span>
      <span style={{ color: K.cyan }}>{t.expiry}</span>
      <span style={{ color: K.text }}>{t.optKind[0]}{fmt.price(t.strike)}</span>
      <span className="font-bold" style={{ color }}>
        {pnl == null ? '—' : `${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(0)}`}
      </span>
      {!closed && (
        <button
          onClick={() => onClose(t.id)}
          className="ml-0.5 text-muted-foreground hover:text-red-300 transition-colors"
          aria-label={`Close ${t.expiry} ${t.optKind} ${t.strike} ticket`}
          type="button"
        >
          <X size={9} aria-hidden />
        </button>
      )}
    </span>
  )
}

export function IVSurface() {
  const iv = useKrupp((s) => s.iv)
  const optTickets = useKrupp((s) => s.optTickets)
  const optRealized = useKrupp((s) => s.optRealized)
  const optFees = useKrupp((s) => s.optFees)
  const optUnrealized = useKrupp((s) => s.optUnrealized)
  const optRev = useKrupp((s) => s.optRev)
  const rows = iv?.rows ?? []

  const [selStrike, setSelStrike] = useState<number | null>(null)
  const [optKind, setOptKind] = useState<'CALL' | 'PUT'>('PUT')
  const [expiry, setExpiry] = useState<'0DTE' | '1DTE'>('0DTE')
  const [qty, setQty] = useState(2)

  const { loIV, hiIV, loGex, hiGex, maxAbsGex } = useMemo(() => {
    const ivs = rows.flatMap((r) => [r.callIV, r.putIV])
    const gexs = rows.map((r) => r.gex)
    return {
      loIV: Math.min(...ivs, 99), hiIV: Math.max(...ivs, 0),
      loGex: Math.min(...gexs, 0), hiGex: Math.max(...gexs, 0),
      maxAbsGex: Math.max(0.01, ...gexs.map((g) => Math.abs(g))),
    }
  }, [rows])

  // live quote for the context ticket (recomputed on every surface revision)
  const selRow = rows.find((r) => r.strike === selStrike) ?? null
  const quote = useMemo(
    () => (selRow && iv ? quoteOpt(selRow, iv.spot, expiry) : null),
    [selRow, iv, expiry],
  )
  const premium = quote ? (optKind === 'CALL' ? quote.call : quote.put) : null
  const delta = quote ? (optKind === 'CALL' ? quote.deltaC : quote.deltaP) : null
  const optNet = optRealized - optFees + optUnrealized
  const openCount = optTickets.filter((t) => t.status === 'OPEN').length

  return (
    <Panel
      title="0DTE/1DTE IV SURFACE"
      sub={iv ? `ES · SPOT ${fmt.price(iv.spot)} · ATM ${iv.atmIV.toFixed(1)}%` : 'SYNCING CHAIN…'}
      accent="cyan"
      right={<Grid3x3 size={12} style={{ color: K.cyan }} className="shrink-0" aria-hidden />}
      bodyClass="p-2 flex flex-col gap-1.5 min-h-0"
    >
      {/* GEX strip */}
      <div className="flex items-center gap-2 text-[9px] tabular-nums">
        <span className="text-muted-foreground tracking-[0.14em]">GEX FLIP</span>
        <span className="px-1.5 py-0.5 border border-red-500/60 text-red-300 font-bold rounded-sm anim-blink" style={{ background: hexA(KT('down'), 0.08) }}>
          {iv ? fmt.price(iv.flipStrike) : '—'}
        </span>
        <span className="text-muted-foreground tracking-[0.14em] ml-1">Γ MAX</span>
        <span style={{ color: K.cyan }}>{iv ? fmt.price(iv.maxGammaStrike) : '—'}</span>
        <span className="ml-auto" style={{ color: (iv?.totalGex ?? 0) >= 0 ? K.green : K.red }}>
          NET {iv ? (iv.totalGex >= 0 ? '+' : '') + iv.totalGex.toFixed(2) : '—'} $mn/1%
        </span>
      </div>

      <div className="overflow-y-auto krupp-scroll max-h-[210px] xl:max-h-[230px] border border-gridline rounded-sm" aria-label="Options strike matrix">
        <table className="w-full text-[9px] tabular-nums border-collapse select-none">
          <thead className="sticky top-0 z-10">
            <tr className="bg-kpanel2 text-muted-foreground tracking-[0.1em]">
              <th className="py-1 px-1 text-left font-medium">STRIKE</th>
              <th className="py-1 px-1 text-right font-medium" title="Call volume">C·VOL</th>
              <th className="py-1 px-1 text-right font-medium" title="Call implied vol">C·IV</th>
              <th className="py-1 px-1 text-right font-medium" title="Call delta">Δc</th>
              <th className="py-1 px-1 text-right font-medium" title="Gamma exposure $mn/1%">GEX</th>
              <th className="py-1 px-1 text-right font-medium" title="Put delta">Δp</th>
              <th className="py-1 px-1 text-right font-medium" title="Put implied vol">P·IV</th>
              <th className="py-1 px-1 text-right font-medium" title="Put volume">P·VOL</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center py-6 text-muted-foreground text-[10px] tracking-[0.2em]">AWAITING CHAIN SNAPSHOT…</td></tr>
            )}
            {rows.map((r: IvRow) => {
              const isFlip = iv != null && r.strike === iv.flipStrike
              const isSel = r.strike === selStrike
              const cHeat = heat(r.callIV, loIV, hiIV)
              const pHeat = heat(r.putIV, loIV, hiIV)
              const gHeat = heat(Math.abs(r.gex), 0, maxAbsGex, true)
              return (
                <tr
                  key={r.strike}
                  onClick={() => setSelStrike(isSel ? null : r.strike)}
                  className={`border-t border-kpanel2 cursor-pointer transition-colors hover:bg-cyan-500/5 ${isFlip ? 'outline outline-1 -outline-offset-1 outline-red-500/70' : ''} ${isSel ? 'bg-cyan-500/10 outline outline-1 -outline-offset-1 outline-cyan-400/60' : ''}`}
                  title={isFlip ? 'GEX FLIP STRIKE — dealer gamma sign inversion · click to ticket' : 'Click strike → context ticket'}
                >
                  <td className="py-[3px] px-1 text-left font-bold" style={{ color: isFlip ? K.red : isSel ? K.cyan : K.text }}>
                    {fmt.price(r.strike)}{isFlip && <span className="ml-1 text-[7px] tracking-widest">▼FLIP</span>}{isSel && <span className="ml-1 text-[7px] tracking-widest" style={{ color: K.cyan }}>▶TGT</span>}
                  </td>
                  <td className="py-[3px] px-1 text-right" style={{ background: cHeat.bg, color: cHeat.fg }}>{fmt.compact(r.callVol)}</td>
                  <td className="py-[3px] px-1 text-right" style={{ background: cHeat.bg, color: cHeat.fg }}>{r.callIV.toFixed(1)}</td>
                  <td className="py-[3px] px-1 text-right text-cyan-200/80">{r.callDelta.toFixed(2)}</td>
                  <td className="py-[3px] px-1 text-right" style={{ background: gHeat.bg, color: r.gex >= 0 ? K.green : K.red }}>
                    {r.gex >= 0 ? '+' : ''}{r.gex.toFixed(1)}
                  </td>
                  <td className="py-[3px] px-1 text-right text-orange-200/70">{r.putDelta.toFixed(2)}</td>
                  <td className="py-[3px] px-1 text-right" style={{ background: pHeat.bg, color: pHeat.fg }}>{r.putIV.toFixed(1)}</td>
                  <td className="py-[3px] px-1 text-right" style={{ background: pHeat.bg, color: pHeat.fg }}>{fmt.compact(r.putVol)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ---- CONTEXT TICKET (strike-selected) ---- */}
      {selStrike != null && (
        <div
          className="border rounded-sm p-1.5 flex flex-col gap-1.5"
          style={{ borderColor: hexA(KT('cyan'), 0.35), background: hexA(KT('cyan'), 0.04) }}
          role="group"
          aria-label={`Context ticket for strike ${selStrike}`}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <Zap size={10} style={{ color: K.cyan }} aria-hidden />
            <span className="text-[8.5px] tracking-[0.22em] font-bold" style={{ color: K.cyan }}>
              CONTEXT TICKET · ES {fmt.price(selStrike)}
            </span>
            {/* C/P + expiry segmented toggles */}
            <div className="flex ml-1 border border-gridline rounded-sm overflow-hidden">
              {(['CALL', 'PUT'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOptKind(k)}
                  className="px-1.5 py-px text-[8px] font-bold tracking-[0.14em] transition-colors"
                  style={{
                    background: optKind === k ? (k === 'CALL' ? hexA(KT('up'), 0.16) : hexA(KT('down'), 0.16)) : 'transparent',
                    color: optKind === k ? (k === 'CALL' ? K.green : K.red) : KT('textMuted'),
                  }}
                  aria-pressed={optKind === k}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="flex border border-gridline rounded-sm overflow-hidden">
              {(['0DTE', '1DTE'] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setExpiry(e)}
                  className="px-1.5 py-px text-[8px] font-bold tracking-[0.14em] transition-colors"
                  style={{
                    background: expiry === e ? hexA(KT('cyan'), 0.14) : 'transparent',
                    color: expiry === e ? K.cyan : KT('textMuted'),
                  }}
                  aria-pressed={expiry === e}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex items-center border border-gridline rounded-sm ml-auto">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-1 py-px text-muted-foreground hover:text-cyan-300" aria-label="Decrease quantity"><Minus size={9} aria-hidden /></button>
              <span className="px-1.5 text-[9px] font-bold tabular-nums" style={{ color: K.text }}>{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} className="px-1 py-px text-muted-foreground hover:text-cyan-300" aria-label="Increase quantity"><Plus size={9} aria-hidden /></button>
            </div>
            <button
              type="button"
              onClick={() => setSelStrike(null)}
              className="text-muted-foreground hover:text-red-300 transition-colors"
              aria-label="Dismiss context ticket"
            >
              <X size={11} aria-hidden />
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-[9px] tabular-nums">
            <span className="text-muted-foreground tracking-[0.14em]">PREM</span>
            <span className="font-bold" style={{ color: K.text }}>{premium != null ? `$${premium.toFixed(2)}` : '—'}</span>
            <span className="text-muted-foreground tracking-[0.14em] ml-1">Δ</span>
            <span style={{ color: K.cyan }}>{delta != null ? delta.toFixed(2) : '—'}</span>
            <span className="text-muted-foreground tracking-[0.14em] ml-1">Γ</span>
            <span style={{ color: K.orange }}>{quote ? quote.gamma.toFixed(4) : '—'}</span>
            <span className="text-muted-foreground tracking-[0.14em] ml-1">NOTIONAL</span>
            <span className="text-muted-foreground">{premium != null ? `$${(premium * qty * OPT_MULT).toFixed(0)}` : '—'}</span>
            <div className="ml-auto flex gap-1.5">
              <Button
                size="sm" type="button"
                className="h-5 px-2 text-[8.5px] font-bold tracking-[0.18em] rounded-sm border border-green-500/50 bg-green-500/10 text-green-300 hover:bg-green-500/25"
                disabled={premium == null}
                onClick={() => optDesk.open(optKind, selStrike, expiry, qty, false)}
              >
                BUY {qty}
              </Button>
              <Button
                size="sm" type="button"
                className="h-5 px-2 text-[8.5px] font-bold tracking-[0.18em] rounded-sm border border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/25"
                disabled={premium == null}
                onClick={() => optDesk.open(optKind, selStrike, expiry, qty, true)}
              >
                SELL {qty}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---- OPTION BOOK + P&L ---- */}
      <div className="flex items-center gap-1.5 flex-wrap min-h-[20px]">
        <span className="text-[7.5px] tracking-[0.22em] text-muted-foreground shrink-0">OPTION BOOK</span>
        {optTickets.length === 0 ? (
          <span className="text-[8px] tracking-[0.14em] text-muted-foreground/70">EMPTY — CLICK A STRIKE TO TICKET</span>
        ) : (
          optTickets.slice(-8).map((t) => <OptChip key={t.id} t={t} onClose={(id) => optDesk.close(id)} />)
        )}
        {openCount > 0 && (
          <Button
            size="sm" type="button" variant="outline"
            className="ml-auto h-4.5 px-1.5 text-[7.5px] tracking-[0.16em] font-bold rounded-sm border-red-500/40 text-red-300 hover:bg-red-950/40"
            onClick={() => optDesk.closeAll()}
          >
            FLATTEN
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 text-[9px] tabular-nums" key={optRev}>
        <span className="text-muted-foreground tracking-[0.14em]">OPT P&amp;L</span>
        <span className="font-bold text-glow-green" style={{ color: optNet >= 0 ? K.green : K.red }}>
          {optNet >= 0 ? '+' : '−'}${Math.abs(optNet).toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <span className="text-[8px] text-muted-foreground">
          REAL {optRealized - optFees >= 0 ? '+' : '−'}${Math.abs(optRealized - optFees).toFixed(0)} · OPEN {optUnrealized >= 0 ? '+' : '−'}${Math.abs(optUnrealized).toFixed(0)} · FEES ${optFees.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[8px] tracking-[0.14em] text-muted-foreground">
        <span>IV HEAT: <span style={{ color: K.green }}>LOW</span> → <span style={{ color: K.orange }}>MID</span> → <span style={{ color: K.red }}>HIGH</span></span>
        <span>GEX: <span style={{ color: K.green }}>DEALER LONG</span> / <span style={{ color: K.red }}>DEALER SHORT</span></span>
      </div>
    </Panel>
  )
}
