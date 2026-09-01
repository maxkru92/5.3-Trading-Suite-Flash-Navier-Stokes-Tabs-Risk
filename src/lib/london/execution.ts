// ============================================================================
// KRUPP CAPITAL // AUTONOMOUS EXECUTION LEDGER
// Agent-core order flow: reason/act loop proposes orders from live micro-
// structure (imbalance + cumulative delta + drift), the pre-trade interceptor
// chain (LOCK / SCALE / KILL) gates every ticket, fills cross the real book
// with depth-based slippage. Pure client-side paper desk — no orders leave
// the browser. Float32 equity ring → zero-GC sparkline.
// ============================================================================

import { RingBuffer, buffers } from './buffers'
import { feed } from './feed'
import { useKrupp } from './store'
import { persistFill } from './ledgerSync'
import { optDesk } from './optionsDesk'
import { requestTradeNote } from './agentNotes'
import type { Fill } from './types'

export { requestTradeNote } from './agentNotes'

export const CONTRACT: Record<string, { tick: number; mult: number; fee: number }> = {
  ES: { tick: 0.25, mult: 50, fee: 0.62 },
  NQ: { tick: 0.25, mult: 20, fee: 0.52 },
  SPY: { tick: 0.01, mult: 1, fee: 0.005 },
}

const LEDGER_INTERVAL_MS = 600
const MAX_SLIP_TICKS = 5

function rid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` }

class ExecutionLedger {
  /** mark-to-market equity curve (realized − fees + unrealized) */
  readonly equity = new RingBuffer(420)
  private timer: ReturnType<typeof setInterval> | null = null
  private nextProposeAt = 0

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), LEDGER_INTERVAL_MS)
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  reset() {
    this.equity.clear()
    this.nextProposeAt = 0
    useKrupp.setState({
      pos: null, fills: [], realized: 0, fees: 0, blocks: 0, volume: 0,
      realizedRev: 0, fillsRev: 0,
    })
  }

  /** mark-to-market + agent loop heartbeats */
  private tick() {
    const st = useKrupp.getState()
    const m = st.metrics
    if (!m.ts) return // no tick stream — desk idle

    const pos = st.pos
    const c = pos ? CONTRACT[pos.sym] : undefined
    const book = pos ? feed.books.get(pos.sym) : undefined
    const mid = book?.mid

    // unrealized on open position
    let unrealized = 0
    if (pos && c && mid != null && isFinite(mid)) {
      unrealized = (mid - pos.avgPx) * pos.qty * c.mult
    }
    const net = st.realized - st.fees + unrealized
    this.equity.push(net)
    useKrupp.getState().setUnrealized(unrealized)

    // KILL chain → immediate emergency liquidation (futures + option book)
    if (m.interceptors.kill) {
      optDesk.closeAll()
      if (pos) { this.flatten('KILL'); return }
    }

    // agent reason/act cadence
    const now = Date.now()
    if (!st.engaged || now < this.nextProposeAt) return
    this.nextProposeAt = now + 3600 + Math.random() * 4600
    this.propose()
  }

  /** agent core: build a ticket from live microstructure, gate, execute */
  private propose() {
    const st = useKrupp.getState()
    const m = st.metrics
    const sym = st.pos?.sym ?? st.selectedSym
    const book = feed.books.get(sym)
    if (!book || book.asks.length === 0 || book.bids.length === 0) return

    const imb = book.imbalance
    const cd = feed.cdelta.get(sym) ?? 0
    const drift = Math.sign(imb) * 0.6 + Math.sign(cd) * 0.25 + (Math.random() * 2 - 1) * 0.15
    const side: 'BUY' | 'SELL' = drift >= 0 ? 'BUY' : 'SELL'
    let qty = 2 + Math.floor(Math.random() * 6)

    // momentum sign over the last ~15 ticks (mean-reversion reference)
    const n = buffers.price.filled
    let mom = 0
    if (n > 16) mom = buffers.price.last() - buffers.price.at(n - 16)

    // --- [LOCK] chaos > 0.85 → block fading of an active move --------------
    if (m.interceptors.lock && Math.abs(mom) > 0.5 &&
        ((mom > 0 && side === 'SELL') || (mom < 0 && side === 'BUY'))) {
      const block: Fill = {
        id: rid(), ts: Date.now(), sym, side, qty, px: 0, slipTicks: 0,
        status: 'BLOCKED', reason: `[LOCK] CHAOS ${m.entropy.toFixed(2)} — MEAN REVERSION SUPPRESSED`,
      }
      st.pushFill(block)
      persistFill({ clientId: block.id, kind: 'FUT', sym, side, qty, px: 0, status: 'BLOCKED', reason: block.reason })
      st.bumpBlocks()
      st.pushLog({
        id: rid(), ts: Date.now(), source: 'RISK', level: 'warn',
        message: `Ticket ${side} ${qty}x ${sym} BLOCKED by [LOCK] — Shannon chaos ${m.entropy.toFixed(3)} > 0.85, counter-trend flow rejected.`,
      })
      requestTradeNote(
        `BLOCKED ticket: ${side} ${qty}x ${sym} rejected by LOCK interceptor (Shannon chaos ${m.entropy.toFixed(2)} > 0.85). Momentum ${(mom).toFixed(2)}. Composite ${m.score.toFixed(0)}.`,
        `Chaos ${m.entropy.toFixed(2)} — fading an active tape is negative-edge; ticket suppressed by [LOCK].`,
      )
      return
    }

    // --- [SCALE] viscosity low → cut clip size ------------------------------
    if (m.interceptors.scale) qty = Math.max(1, Math.round(qty * 0.4))

    this.execute(sym, side, qty)
  }

  /** cross the spread with depth-derived slippage; manage position */
  execute(sym: string, side: 'BUY' | 'SELL', qty: number, flatten = false): void {
    const st = useKrupp.getState()
    const book = feed.books.get(sym)
    const c = CONTRACT[sym]
    if (!book || !c || book.asks.length === 0 || book.bids.length === 0) return

    const top = side === 'BUY' ? book.asks[0] : book.bids[0]
    const slip = flatten
      ? 1 + Math.ceil(qty / Math.max(1, top.size * 0.35)) // urgency premium
      : Math.min(MAX_SLIP_TICKS, Math.ceil(qty / Math.max(1, top.size * 0.8)))
    const px = side === 'BUY'
      ? book.asks[0].price + slip * c.tick
      : book.bids[0].price - slip * c.tick

    const sgn = side === 'BUY' ? 1 : -1
    const pos = st.pos
    let realizedDelta = 0
    let newPos = pos

    if (!pos || pos.qty === 0) {
      newPos = { sym, qty: sgn * qty, avgPx: px }
    } else if (Math.sign(pos.qty) === sgn) {
      // pyramiding (capped)
      const total = pos.qty + sgn * qty
      if (Math.abs(total) > 24) {
        const block: Fill = {
          id: rid(), ts: Date.now(), sym, side, qty, px: 0, slipTicks: 0,
          status: 'BLOCKED', reason: 'MAX EXPOSURE 24 LOTS',
        }
        st.pushFill(block)
        persistFill({ clientId: block.id, kind: 'FUT', sym, side, qty, px: 0, status: 'BLOCKED', reason: block.reason })
        st.bumpBlocks()
        return
      }
      newPos = { sym, qty: total, avgPx: (pos.avgPx * pos.qty + px * sgn * qty) / total }
    } else {
      // reducing / flipping
      const closeQty = Math.min(Math.abs(pos.qty), qty)
      const dir = pos.qty > 0 ? 1 : -1
      realizedDelta = dir === 1 ? (px - pos.avgPx) * closeQty * c.mult : (pos.avgPx - px) * closeQty * c.mult
      const remain = pos.qty + sgn * qty
      newPos = Math.sign(remain) === Math.sign(pos.qty) || remain === 0
        ? (remain === 0 ? null : { sym, qty: remain, avgPx: pos.avgPx })
        : { sym, qty: remain, avgPx: px }
    }

    const feeDelta = qty * c.fee
    const fill: Fill = {
      id: rid(), ts: Date.now(), sym, side, qty,
      px: Math.round(px * 100) / 100, slipTicks: slip,
      status: flatten ? 'FLATTEN' : 'FILLED',
      pnl: realizedDelta !== 0 || flatten ? Math.round((realizedDelta - feeDelta) * 100) / 100 : undefined,
    }
    st.pushFill(fill)
    persistFill({
      clientId: fill.id, kind: 'FUT', sym, side, qty, px: fill.px, slipTicks: slip,
      status: fill.status, pnl: fill.pnl,
      meta: { pos: newPos ? { ...newPos } : null },
    })
    st.applyExecution({ realizedDelta, feeDelta, pos: newPos, volume: qty })

    st.pushLog({
      id: rid(), ts: Date.now(), source: 'ROUTING', level: flatten ? 'crit' : 'info',
      message: flatten
        ? `[ROUTING] ${fill.status} — ${side} ${qty}x ${sym} @ ${fill.px.toFixed(2)} (slip ${slip}t) — EMERGENCY LIQUIDATION, position flattened.`
        : `[ROUTING] Fill — ${side} ${qty}x ${sym} @ ${fill.px.toFixed(2)} (slip ${slip}t) via Hamiltonian Geodesic Engine (Slippage: Minimized).`,
    })
  }

  /** market-out of the whole position */
  flatten(cause: 'KILL' | 'MANUAL') {
    const st = useKrupp.getState()
    const pos = st.pos
    if (!pos || pos.qty === 0) return
    st.pushLog({
      id: rid(), ts: Date.now(), source: cause === 'KILL' ? 'KILL' : 'ROUTING',
      level: cause === 'KILL' ? 'crit' : 'info',
      message: cause === 'KILL'
        ? '[KILL] Emergency liquidation — composite > 75, flattening all queues at market.'
        : '[ROUTING] Desk flatten order — position closed by operator.',
    })
    this.execute(pos.sym, pos.qty > 0 ? 'SELL' : 'BUY', Math.abs(pos.qty), true)

    // agent-core post-mortem on the liquidation
    const m = st.metrics
    requestTradeNote(
      `EMERGENCY FLATTEN (${cause}): closed entire position, composite risk ${m.score.toFixed(1)} (${m.regime}), chaos ${m.entropy.toFixed(2)}, Hawkes λ ${m.hawkes.toFixed(1)}.`,
      cause === 'KILL'
        ? 'Composite > 75 — book flattened, capital preservation overrides alpha capture.'
        : 'Operator flatten acknowledged — desk flat, re-entry gated by interceptor chain.',
    )
  }
}

export const ledger = new ExecutionLedger()
