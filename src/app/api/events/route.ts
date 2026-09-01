import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// KRUPP CAPITAL // persisted risk events (regime shifts, auth lifecycle, crash injections)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const type = String(body?.type ?? 'EVENT').slice(0, 64)
    const severity = ['info', 'warn', 'crit'].includes(body?.severity) ? body.severity : 'info'
    const source = String(body?.source ?? 'system').slice(0, 32)
    const message = String(body?.message ?? '').slice(0, 500)
    if (!message) return NextResponse.json({ ok: false, error: 'message required' }, { status: 400 })

    // Optional dedupe floor (multi-client desks): several browser tabs stream
    // the same feed; alert sentinels trip in every tab simultaneously. A POST
    // carrying dedupeKey is swallowed when the same key already persisted
    // within dedupeWindowMs (default 45s, clamped 1s–10min).
    const dedupeKey = body?.dedupeKey ? String(body.dedupeKey).slice(0, 96) : null
    if (dedupeKey) {
      const windowMs = Math.min(600_000, Math.max(1_000, Number(body?.dedupeWindowMs) || 45_000))
      const since = new Date(Date.now() - windowMs)
      const dup = await db.riskEvent.findFirst({
        where: { dedupeKey, createdAt: { gt: since } },
        select: { id: true },
      })
      if (dup) return NextResponse.json({ ok: true, id: dup.id, deduped: true })
    }

    const ev = await db.riskEvent.create({
      data: {
        type, severity, source, message,
        payload: body?.payload ? String(body.payload).slice(0, 2000) : null,
        dedupeKey,
      },
    })
    return NextResponse.json({ ok: true, id: ev.id })
  } catch {
    return NextResponse.json({ ok: false, error: 'persist failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 30)))
    const [events, byType, critCount] = await Promise.all([
      db.riskEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      db.riskEvent.groupBy({ by: ['type'], _count: { _all: true } }),
      db.riskEvent.count({ where: { severity: 'crit' } }),
    ])
    return NextResponse.json({
      ok: true,
      events,
      stats: {
        total: byType.reduce((a, t) => a + t._count._all, 0),
        crit: critCount,
        byType: Object.fromEntries(byType.map((t) => [t.type, t._count._all])),
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  }
}
