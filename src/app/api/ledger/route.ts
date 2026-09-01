import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// KRUPP CAPITAL // EXECUTION LEDGER PERSISTENCE
// POST — fire-and-forget paper fill / block / option ticket persistence (dedupe on clientId).
// GET  — latest blotter entries + session aggregates (realized, fees, volume, blocks, open position
//        replayed chronologically) so the desk survives reloads.

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const clientId = String(b?.clientId ?? '').slice(0, 80)
    const sym = String(b?.sym ?? '').slice(0, 8)
    if (!clientId || !sym) {
      return NextResponse.json({ ok: false, error: 'clientId and sym required' }, { status: 400 })
    }
    const data = {
      clientId,
      kind: ['FUT', 'OPT'].includes(b?.kind) ? b.kind : 'FUT',
      sym,
      side: String(b?.side ?? 'BUY').slice(0, 8),
      qty: Math.max(0, Math.min(100000, Math.round(Number(b?.qty ?? 0)))),
      px: Number(b?.px ?? 0) || 0,
      slipTicks: Math.max(0, Math.min(999, Math.round(Number(b?.slipTicks ?? 0)))),
      status: String(b?.status ?? 'FILLED').slice(0, 16),
      reason: b?.reason ? String(b.reason).slice(0, 300) : null,
      pnl: Number.isFinite(Number(b?.pnl)) ? Number(b.pnl) : null,
      meta: b?.meta ? String(b.meta).slice(0, 1000) : null,
    }
    const row = await db.ledgerFill.upsert({
      where: { clientId },
      create: data,
      update: {}, // idempotent — never overwrite a persisted ticket
    })
    return NextResponse.json({ ok: true, id: row.id })
  } catch (e) {
    console.error('[ledger] persist failed:', e)
    return NextResponse.json({ ok: false, error: 'persist failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(120, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 80)))

    // --- full ledger CSV export: ?format=csv ---------------------------------
    // Streams the persisted blotter (futures + option tickets) as a
    // spreadsheet-ready CSV — auditors get the exact SQLite history.
    if (req.nextUrl.searchParams.get('format') === 'csv') {
      const all = await db.ledgerFill.findMany({ orderBy: { createdAt: 'asc' }, take: 5000 })
      const esc = (v: unknown): string => {
        const s = v == null ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const head = 'id,timestamp_utc,kind,sym,side,qty,price,slip_ticks,status,reason,pnl,meta'
      const body = all.map((r) => [
        r.clientId, r.createdAt.toISOString(), r.kind, r.sym, r.side,
        r.qty, r.px, r.slipTicks, r.status, r.reason ?? '', r.pnl ?? '', r.meta ?? '',
      ].map(esc).join(','))
      const csv = [head, ...body].join('\n')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="krupp-ledger-${stamp}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // --- session drill-down: ?session=N returns that boot-session's fills ----
    // N indexes the sessions array (0 = newest / live session).
    const drillParam = req.nextUrl.searchParams.get('session')
    if (drillParam != null && drillParam !== '') {
      const idx = Number(drillParam)
      if (!Number.isInteger(idx) || idx < 0 || idx > 7) {
        return NextResponse.json({ ok: false, error: 'session index out of range' }, { status: 400 })
      }
      const hist = await db.ledgerFill.findMany({
        where: { kind: 'FUT' },
        orderBy: { createdAt: 'asc' },
        take: 2000,
      })
      const GAP_MS = 30 * 60 * 1000
      const groups: typeof hist[] = []
      let cur: typeof hist = []
      for (const r of hist) {
        if (cur.length > 0 && r.createdAt.getTime() - cur[cur.length - 1].createdAt.getTime() > GAP_MS) {
          groups.push(cur)
          cur = []
        }
        cur.push(r)
      }
      if (cur.length > 0) groups.push(cur)
      const ordered = groups.slice(-8).reverse()
      const g = ordered[idx]
      if (!g) return NextResponse.json({ ok: false, error: 'no such session' }, { status: 404 })
      return NextResponse.json({
        ok: true,
        fills: g.slice(-120).reverse().map((r) => ({
          id: r.clientId, ts: r.createdAt.getTime(), kind: r.kind, sym: r.sym, side: r.side,
          qty: r.qty, px: r.px, slipTicks: r.slipTicks, status: r.status,
          reason: r.reason, pnl: r.pnl, meta: r.meta ? safeParse(r.meta) : null,
        })),
        total: g.length,
      })
    }

    const [rows, agg] = await Promise.all([
      db.ledgerFill.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      db.ledgerFill.aggregate({
        _sum: { pnl: true, qty: true },
        _count: { _all: true },
      }),
    ])
    const blockedCount = await db.ledgerFill.count({ where: { status: 'BLOCKED' } })

    // --- options desk replay from the FULL OPT history (not windowed) ------
    const optRowsRaw = await db.ledgerFill.findMany({
      where: { kind: 'OPT' },
      orderBy: { createdAt: 'asc' },
      take: 400,
    })
    const ticketMap = new Map<string, Record<string, unknown>>()
    let optRealized = 0
    for (const r of optRowsRaw) {
      let m: Record<string, unknown> = {}
      try { m = r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : {} } catch { m = {} }
      const tid = String(m.id ?? r.clientId ?? '').replace(/-close$/, '')
      if (!tid) continue
      const t = ticketMap.get(tid) ?? {
        id: tid,
        ts: r.createdAt.getTime(),
        sym: String(m.sym ?? 'ES'),
        optKind: m.optKind === 'PUT' ? 'PUT' : 'CALL',
        strike: Number(m.strike ?? 0),
        expiry: m.expiry === '1DTE' ? '1DTE' : '0DTE',
        qty: Number(m.qty ?? 0),
        entryPx: Number(m.entryPx ?? 0),
        entryIV: Number(m.entryIV ?? 0),
        status: 'OPEN',
      }
      if (r.status === 'OPT_CLOSE') {
        t.status = 'CLOSED'
        t.pnl = Number(r.pnl ?? 0)
        t.closePx = Number(r.px ?? 0)
        optRealized += Number(r.pnl ?? 0)
      }
      ticketMap.set(tid, t)
    }
    const optTickets = [...ticketMap.values()].slice(-24)
    const optRows = optRowsRaw
    const optFees = optRowsRaw.reduce((a, r) => a + r.qty * 0.65, 0)

    // --- chronological replay of the FUT stream → open position + realized ---
    // NOTE: BLOCKED rows are rejections (px=0) — they must NOT enter the
    // position replay, otherwise each one 'closes' inventory at price zero.
    const fut = rows.filter((r) => r.status !== 'BLOCKED' && r.kind !== 'OPT').reverse()
    let realized = 0
    let pos: { sym: string; qty: number; avgPx: number } | null = null
    for (const r of fut) {
      const sgn = r.side === 'BUY' ? 1 : -1
      if (!pos || pos.qty === 0) {
        // first fill opens in the fill's direction (SELL opens a short)
        const openQty = sgn * r.qty
        pos = openQty !== 0 ? { sym: r.sym, qty: openQty, avgPx: r.px } : null
        continue
      }
      if (r.sym !== pos.sym) continue
      if (Math.sign(pos.qty) === sgn) {
        const total = pos.qty + sgn * r.qty
        pos = total === 0 ? null : { sym: pos.sym, qty: total, avgPx: (pos.avgPx * Math.abs(pos.qty) + r.px * r.qty) / Math.abs(total) }
      } else {
        const closeQty = Math.min(Math.abs(pos.qty), r.qty)
        realized += pos.qty > 0 ? (r.px - pos.avgPx) * closeQty : (pos.avgPx - r.px) * closeQty
        const remain = pos.qty + sgn * r.qty
        pos =
          remain === 0 ? null
          : Math.sign(remain) === Math.sign(pos.qty) ? { ...pos, qty: remain }
          : { sym: pos.sym, qty: remain, avgPx: r.px }
      }
    }

    // --- desk sessionization: gap-based boot-session grouping ----------------
    // A gap > 30min between consecutive fills starts a new desk session.
    // Per session: fill/block counts, volume, and an isolated P&L replay
    // (each session starts flat — matches the desk's boot-time flat book).
    const hist = await db.ledgerFill.findMany({
      where: { kind: 'FUT' },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    })
    const GAP_MS = 30 * 60 * 1000
    type Group = typeof hist
    const groups: Group[] = []
    let cur: Group = []
    for (const r of hist) {
      if (cur.length > 0 && r.createdAt.getTime() - cur[cur.length - 1].createdAt.getTime() > GAP_MS) {
        groups.push(cur)
        cur = []
      }
      cur.push(r)
    }
    if (cur.length > 0) groups.push(cur)
    const sessions = groups.slice(-8).reverse().map((g) => {
      let sRealized = 0
      let sPos: { sym: string; qty: number; avgPx: number } | null = null
      let filled = 0
      let blocked = 0
      let vol = 0
      for (const r of g) {
        if (r.status === 'BLOCKED') { blocked++; continue }
        filled++
        vol += r.qty
        const sgn = r.side === 'BUY' ? 1 : -1
        if (!sPos || sPos.qty === 0) {
          const oq = sgn * r.qty
          sPos = oq !== 0 ? { sym: r.sym, qty: oq, avgPx: r.px } : null
          continue
        }
        if (r.sym !== sPos.sym) continue
        if (Math.sign(sPos.qty) === sgn) {
          const total = sPos.qty + sgn * r.qty
          sPos = total === 0 ? null : { sym: sPos.sym, qty: total, avgPx: (sPos.avgPx * Math.abs(sPos.qty) + r.px * r.qty) / Math.abs(total) }
        } else {
          const cq = Math.min(Math.abs(sPos.qty), r.qty)
          sRealized += sPos.qty > 0 ? (r.px - sPos.avgPx) * cq : (sPos.avgPx - r.px) * cq
          const remain = sPos.qty + sgn * r.qty
          sPos = remain === 0 ? null : Math.sign(remain) === Math.sign(sPos.qty) ? { ...sPos, qty: remain } : { sym: sPos.sym, qty: remain, avgPx: r.px }
        }
      }
      return {
        startTs: g[0].createdAt.getTime(),
        endTs: g[g.length - 1].createdAt.getTime(),
        fills: filled,
        blocked,
        volume: vol,
        realized: Math.round(sRealized * 100) / 100,
        pos: sPos ? { sym: sPos.sym, qty: sPos.qty, avgPx: Math.round(sPos.avgPx * 100) / 100 } : null,
      }
    })

    return NextResponse.json({
      ok: true,
      fills: rows.map((r) => ({
        id: r.clientId, ts: r.createdAt.getTime(), kind: r.kind, sym: r.sym, side: r.side,
        qty: r.qty, px: r.px, slipTicks: r.slipTicks, status: r.status,
        reason: r.reason, pnl: r.pnl, meta: r.meta ? safeParse(r.meta) : null,
      })),
      session: {
        v: 4,
        realized,
        optRealized,
        optFees,
        optTickets,
        blocks: blockedCount,
        volume: agg._sum.qty ?? 0,
        total: agg._count._all,
        optCount: optRows.length,
        pos,
        sessions,
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

// r4: force recompile — fresh prisma client with LedgerFill delegate
