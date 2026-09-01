import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// KRUPP CAPITAL // SESSION JOURNAL PERSISTENCE (round 9)
// The desk-side logbook: trader notes pinned to desk context (active tab,
// regime, composite score at write time). Rows survive reloads, are keyed to
// a stable per-browser clientId ('krupp-client-id') and are CSV-exportable
// alongside the execution ledger.
//   GET    ?limit=N — latest entries (newest first) + totals
//   GET    ?format=csv — full journal export (audit trail)
//   POST   { clientId, desk, deskLabel, regime, score, text }
//   DELETE ?id=… — remove a single note (two-step confirm in the UI)

const MAX_TEXT = 400

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 60)))

    // --- full journal CSV export: ?format=csv ---------------------------------
    if (req.nextUrl.searchParams.get('format') === 'csv') {
      const all = await db.journalEntry.findMany({ orderBy: { createdAt: 'asc' }, take: 5000 })
      const esc = (v: unknown): string => {
        const s = v == null ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const head = 'id,timestamp_utc,desk,desk_label,regime,score,note'
      const body = all.map((r) => [
        r.clientId, r.createdAt.toISOString(), r.desk, r.deskLabel,
        r.regime, r.score, r.text,
      ].map(esc).join(','))
      const csv = [head, ...body].join('\n')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="krupp-journal-${stamp}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const [rows, total] = await Promise.all([
      db.journalEntry.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      db.journalEntry.count(),
    ])
    return NextResponse.json({
      ok: true,
      total,
      entries: rows.map((r) => ({
        id: r.id, ts: r.createdAt.getTime(), desk: r.desk, deskLabel: r.deskLabel,
        regime: r.regime, score: r.score, text: r.text,
      })),
    })
  } catch (e) {
    console.error('[journal] query failed:', e)
    return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const clientId = String(b?.clientId ?? '').slice(0, 80)
    const text = String(b?.text ?? '').trim().slice(0, MAX_TEXT)
    if (!clientId || !text) {
      return NextResponse.json({ ok: false, error: 'clientId and text required' }, { status: 400 })
    }
    const row = await db.journalEntry.create({
      data: {
        clientId,
        desk: Math.max(0, Math.min(13, Math.round(Number(b?.desk ?? 0)) || 0)),
        deskLabel: String(b?.deskLabel ?? '').slice(0, 40),
        regime: String(b?.regime ?? '').slice(0, 12),
        score: Number.isFinite(Number(b?.score)) ? Number(b.score) : 0,
        text,
      },
    })
    return NextResponse.json({ ok: true, id: row.id, ts: row.createdAt.getTime() })
  } catch (e) {
    console.error('[journal] create failed:', e)
    return NextResponse.json({ ok: false, error: 'persist failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = String(req.nextUrl.searchParams.get('id') ?? '')
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    }
    await db.journalEntry.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'delete failed' }, { status: 500 })
  }
}
