// ============================================================================
// KRUPP CAPITAL // OPTIONS DESK (paper)
// Context tickets launched from the IV-surface strike matrix. Premium is
// Black-Scholes off the live row IV; marks recompute every second against the
// current surface (spot + row IV). Multiplier $100/pt (SPX-style on ES proxy).
// ============================================================================

import { useKrupp } from './store'
import { feed } from './feed'
import { persistFill } from './ledgerSync'
import { requestTradeNote } from './agentNotes'
import type { IvRow, OptTicket } from './types'

export const OPT_MULT = 100
export const OPT_FEE = 0.65 // per contract

const EXPIRY_DAYS: Record<OptTicket['expiry'], number> = { '0DTE': 0.6 / 365, '1DTE': 1.6 / 365 }

// --- Abramowitz–Stegun normal CDF (mirror of the IV worker) ----------------
function ncdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2)
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? 1 - p : p
}

export interface OptQuote {
  call: number
  put: number
  deltaC: number
  deltaP: number
  gamma: number
  vega: number
}

/** Black-Scholes quote for one strike off the row IV (avg of call/put IV) */
export function quoteOpt(row: Pick<IvRow, 'strike' | 'callIV' | 'putIV'>, spot: number, expiry: OptTicket['expiry']): OptQuote {
  const T = Math.max(EXPIRY_DAYS[expiry], 1 / (365 * 24 * 6)) // floor = 10 minutes
  const vol = Math.max((row.callIV + row.putIV) / 2 / 100, 0.015)
  const K = row.strike
  const sig = vol * Math.sqrt(T)
  const d1 = (Math.log(spot / K) + 0.5 * sig * sig) / sig
  const d2 = d1 - sig
  const disc = Math.exp(-0.045 * T)
  const nd1 = ncdf(d1)
  const nd2 = ncdf(d2)
  const pdf = Math.exp(-(d1 * d1) / 2) / 2.5066282746310002
  return {
    call: spot * nd1 - K * disc * nd2,
    put: K * disc * (1 - nd2) - spot * (1 - nd1),
    deltaC: nd1,
    deltaP: nd1 - 1,
    gamma: pdf / (spot * sig),
    vega: (spot * pdf * Math.sqrt(T)) / 100,
  }
}

function rid() { return `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` }

function rowFor(strike: number): IvRow | null {
  const iv = feed.iv
  if (!iv) return null
  return iv.rows.find((r) => r.strike === strike) ?? null
}

/** live mark for an open ticket (same quote pipeline as entry) */
export function markOpt(t: OptTicket): number | null {
  const row = rowFor(t.strike)
  const spot = feed.iv?.spot
  if (!row || !spot) return null
  const q = quoteOpt(row, spot, t.expiry)
  const px = t.optKind === 'CALL' ? q.call : q.put
  return isFinite(px) ? px : null
}

function ticketLog(t: OptTicket, verb: string, px: number, extra = '') {
  useKrupp.getState().pushLog({
    id: rid(), ts: Date.now(), source: 'ROUTING', level: 'info',
    message: `OPTIONS — ${verb} ${Math.abs(t.qty)}x ${t.expiry} ES ${t.optKind[0]}${t.strike.toFixed(0)} @ ${px.toFixed(2)} (IV ${(t.entryIV).toFixed(1)}%)${extra}`,
  })
}

export const optDesk = {
  /** open a context ticket — side LONG (qty>0) or SHORT (qty<0) */
  open(optKind: 'CALL' | 'PUT', strike: number, expiry: OptTicket['expiry'], qty: number, short: boolean) {
    const iv = feed.iv
    const row = rowFor(strike)
    if (!iv || !row || qty <= 0) return
    const spot = iv.spot
    const q = quoteOpt(row, spot, expiry)
    const px = Math.max(optKind === 'CALL' ? q.call : q.put, 0.05)
    const entryIV = (row.callIV + row.putIV) / 2
    const signed = short ? -qty : qty
    const t: OptTicket = {
      id: rid(), ts: Date.now(), sym: 'ES', optKind, strike, expiry,
      qty: signed, entryPx: Math.round(px * 100) / 100, entryIV, status: 'OPEN',
    }
    const fee = qty * OPT_FEE
    useKrupp.getState().pushOptTicket(t, fee)
    persistFill({
      clientId: t.id, kind: 'OPT', sym: 'ES', side: short ? 'SELL' : 'BUY', qty,
      px: t.entryPx, status: short ? 'OPT_SELL' : 'OPT_BUY',
      meta: { id: t.id, sym: 'ES', optKind, strike, expiry, qty: signed, entryPx: t.entryPx, entryIV },
    })
    ticketLog(t, short ? 'SOLD' : 'BOUGHT', t.entryPx)

    // agent-core rationale for the context ticket (throttled)
    const m = useKrupp.getState().metrics
    requestTradeNote(
      `OPTIONS ${short ? 'SOLD' : 'BOUGHT'} ${qty}x ${t.expiry} ES ${optKind[0]}${strike.toFixed(0)} @ ${t.entryPx.toFixed(2)} (IV ${entryIV.toFixed(1)}%, Δ ${(optKind === 'CALL' ? q.deltaC : q.deltaP).toFixed(2)}). Composite ${m.score.toFixed(0)} ${m.regime}, VIX ${feed.cboe?.vix.toFixed(1) ?? '—'}.`,
      `${short ? 'Shorting' : 'Lifting'} ${qty}x ${t.expiry} ${optKind[0]}${strike.toFixed(0)} — ${m.regime === 'CRISIS' ? 'crisisgamma hedge / premium capture' : 'gamma exposure aligned with surface flow'}.`,
    )
  },

  /** close one ticket at live mark */
  close(id: string) {
    const st = useKrupp.getState()
    const t = st.optTickets.find((x) => x.id === id && x.status === 'OPEN')
    if (!t) return
    const mark = markOpt(t)
    if (mark == null) return
    const pnl = (mark - t.entryPx) * t.qty * OPT_MULT
    const fee = Math.abs(t.qty) * OPT_FEE
    st.closeOptTicket(id, Math.round(mark * 100) / 100, Math.round(pnl * 100) / 100, fee)
    persistFill({
      clientId: `${t.id}-close`, kind: 'OPT', sym: 'ES', side: t.qty > 0 ? 'SELL' : 'BUY',
      qty: Math.abs(t.qty), px: mark, status: 'OPT_CLOSE', pnl: Math.round(pnl * 100) / 100,
      meta: { id: t.id, sym: 'ES', optKind: t.optKind, strike: t.strike, expiry: t.expiry, qty: t.qty, entryPx: t.entryPx, entryIV: t.entryIV },
    })
    useKrupp.getState().pushLog({
      id: rid(), ts: Date.now(), source: 'ROUTING', level: 'info',
      message: `OPTIONS — CLOSED ${t.expiry} ES ${t.optKind[0]}${t.strike.toFixed(0)} @ ${mark.toFixed(2)} — P&L ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(0)}`,
    })

    // agent post-mortem on notable round-trips (throttled — only |pnl| >= $150)
    if (Math.abs(pnl) >= 150) {
      const m2 = useKrupp.getState().metrics
      const liveRow = rowFor(t.strike)
      const liveIV = liveRow ? (liveRow.callIV + liveRow.putIV) / 2 : t.entryIV
      requestTradeNote(
        `OPTIONS CLOSED ${t.expiry} ES ${t.optKind[0]}${t.strike.toFixed(0)}: P&L ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(0)} (entry ${t.entryPx.toFixed(2)} → mark ${mark.toFixed(2)}, IV ${t.entryIV.toFixed(1)}% → ${liveIV.toFixed(1)}%). Composite ${m2.score.toFixed(0)}.`,
        pnl >= 0
          ? `${t.expiry} ${t.optKind[0]}${t.strike.toFixed(0)} round-trip booked positive — surface drifted our way.`
          : `${t.expiry} ${t.optKind[0]}${t.strike.toFixed(0)} stopped — premium decayed against entry; sizing held the damage.`,
      )
    }
  },

  /** flatten every open option ticket */
  closeAll() {
    const st = useKrupp.getState()
    const open = st.optTickets.filter((t) => t.status === 'OPEN')
    for (const t of open) this.close(t.id)
    if (open.length > 0) {
      useKrupp.getState().pushLog({
        id: rid(), ts: Date.now(), source: 'ROUTING', level: 'warn',
        message: `OPTIONS — BOOK FLATTENED (${open.length} context tickets closed at market).`,
      })
    }
  },

  /** 1s mark-to-market sweep across open tickets */
  sweep() {
    const st = useKrupp.getState()
    const open = st.optTickets.filter((t) => t.status === 'OPEN')
    if (open.length === 0) {
      if (st.optUnrealized !== 0) st.setOptUnrealized(0)
      return
    }
    let unreal = 0
    for (const t of open) {
      const mark = markOpt(t)
      if (mark != null) unreal += (mark - t.entryPx) * t.qty * OPT_MULT
    }
    st.setOptUnrealized(Math.round(unreal * 100) / 100)
  },
}
