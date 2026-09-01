// ============================================================================
// KRUPP CAPITAL // LEDGER SYNC (SQLite persistence bridge)
// Fire-and-forget ticket persistence + boot-time hydration. The blotter,
// session aggregates and open position survive reloads via /api/ledger.
// ============================================================================

import { useKrupp } from './store'
import type { DeskSession, Fill, OptTicket, Pos } from './types'

/** per-contract fee schedule (mirror of execution.CONTRACT — kept local to avoid an import cycle) */
const FEE: Record<string, number> = { ES: 0.62, NQ: 0.52, SPY: 0.005 }

/** session-replay shape sanity guard */
function asPos(p: any): Pos | null {
  if (!p || typeof p !== 'object') return null
  const sym = String(p.sym ?? '')
  const qty = Number(p.qty)
  const avgPx = Number(p.avgPx)
  if (!sym || !Number.isFinite(qty) || !Number.isFinite(avgPx) || qty === 0) return null
  return { sym, qty, avgPx }
}

let postFails = 0

/** fire-and-forget POST — never blocks the execution path, degrades silently */
export function persistFill(f: {
  clientId: string
  kind: 'FUT' | 'OPT'
  sym: string
  side: string
  qty: number
  px: number
  slipTicks?: number
  status: string
  reason?: string
  pnl?: number
  meta?: Record<string, unknown>
}) {
  const body = JSON.stringify({
    clientId: f.clientId, kind: f.kind, sym: f.sym, side: f.side, qty: f.qty,
    px: f.px, slipTicks: f.slipTicks ?? 0, status: f.status,
    reason: f.reason, pnl: f.pnl, meta: f.meta ? JSON.stringify(f.meta) : undefined,
  })
  fetch('/api/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      postFails = 0
      const st = useKrupp.getState()
      st.setPersistOn(true)
      st.bumpLedgerTotal()
    })
    .catch(() => {
      postFails++
      if (postFails >= 3) useKrupp.getState().setPersistOn(false)
    })
}

/**
 * Boot hydration — pull persisted blotter + aggregates, rebuild session state.
 * Fees are recomputed from the fill stream (per-contract schedule), realized /
 * position arrive replayed from the server.
 */
export async function hydrateLedger(): Promise<void> {
  try {
    const res = await fetch('/api/ledger?limit=100')
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (!j?.ok) throw new Error('bad payload')

    const fills: Fill[] = (j.fills ?? [])
      .filter((r: any) => r.kind !== 'OPT')
      .map((r: any) => ({
        id: r.id, ts: r.ts, sym: r.sym,
        side: r.side === 'SELL' ? 'SELL' : 'BUY',
        qty: r.qty, px: r.px, slipTicks: r.slipTicks,
        status: FUT_STATUS(r.status),
        reason: r.reason ?? undefined,
        pnl: Number.isFinite(r.pnl) ? r.pnl : undefined,
      }))

    // fees recomputed from the persisted futures stream
    let fees = 0
    for (const f of fills) {
      if (f.status === 'BLOCKED') continue
      fees += f.qty * (FEE[f.sym] ?? 0.62)
    }

    const optTickets = (Array.isArray(j.session?.optTickets) ? j.session.optTickets : []) as OptTicket[]
    const optRealized = Number(j.session?.optRealized ?? 0)
    const optFees = Number(j.session?.optFees ?? 0)
    const deskSessions = (Array.isArray(j.session?.sessions) ? j.session.sessions : []) as DeskSession[]

    // Boot aggregates adopt the CURRENT desk session's full-history replay
    // (sessions[0] = newest). The windowed blotter replay only sees the last
    // `limit` rows, so its realized/position can diverge badly on long-lived
    // sessions — the sessionized replay is the single source of truth and
    // matches the SESSIONS chips exactly.
    const cur = deskSessions[0]
    const replayedRealized = cur ? cur.realized : Number(j.session?.realized ?? 0)
    const replayedPos = cur ? asPos(cur.pos) : asPos(j.session?.pos)

    const st0 = useKrupp.getState()
    st0.hydrateLedger({
      fills: fills.slice(-60),
      realized: replayedRealized,
      fees,
      volume: Number(j.session?.volume ?? 0),
      blocks: Number(j.session?.blocks ?? 0),
      pos: replayedPos,
      optTickets,
      optRealized,
      ledgerTotal: Number(j.session?.total ?? 0),
      deskSessions,
    })
    // restore option-book fees (computed server-side from the OPT stream)
    useKrupp.setState({ optFees })
    useKrupp.getState().setPersistOn(true)
  } catch {
    useKrupp.getState().setPersistOn(false)
  }
}

/**
 * Session drill-down — pull a persisted boot-session's fill stream for blotter
 * time travel. idx indexes the sessions array (0 = newest / live session).
 */
export async function fetchSessionFills(idx: number): Promise<Fill[]> {
  const res = await fetch(`/api/ledger?session=${idx}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  const j = await res.json()
  if (!j?.ok) throw new Error('bad payload')
  return (j.fills ?? [])
    .filter((r: any) => r.kind !== 'OPT')
    .map((r: any) => ({
      id: r.id, ts: r.ts, sym: r.sym,
      side: r.side === 'SELL' ? 'SELL' : 'BUY',
      qty: r.qty, px: r.px, slipTicks: r.slipTicks,
      status: FUT_STATUS(r.status),
      reason: r.reason ?? undefined,
      pnl: Number.isFinite(r.pnl) ? r.pnl : undefined,
    })) as Fill[]
}

function FUT_STATUS(s: string): Fill['status'] {
  return s === 'BLOCKED' ? 'BLOCKED' : s === 'FLATTEN' ? 'FLATTEN' : 'FILLED'
}

export type { Pos }
