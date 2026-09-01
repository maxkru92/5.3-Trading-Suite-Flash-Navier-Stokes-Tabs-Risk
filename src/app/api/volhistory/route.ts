import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// KRUPP CAPITAL // VOLATILITY SNAPSHOT PERSISTENCE
// POST — capture the CBOE complex + IV headline + composite risk state
//        (client cadence 60s; server enforces a 45s floor so multi-tab desks
//        cannot flood the table).
// GET  — ?limit=N ascending series for the persisted strip + report export.

const MIN_INTERVAL_MS = 45_000

function num(v: unknown, lo: number, hi: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function regime(v: unknown): string {
  const s = String(v ?? 'CALM').toUpperCase()
  return s === 'HIGH' || s === 'CRISIS' ? s : 'CALM'
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const last = await db.volSnapshot.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    if (last && Date.now() - last.createdAt.getTime() < MIN_INTERVAL_MS) {
      return NextResponse.json({ ok: true, throttled: true })
    }
    const row = await db.volSnapshot.create({
      data: {
        vix: num(b?.vix, 0, 200),
        vix9d: num(b?.vix9d, 0, 200),
        vix3m: num(b?.vix3m, 0, 200),
        skew: num(b?.skew, -100, 400),
        vvix: num(b?.vvix, 0, 400),
        contango: num(b?.contango, -100, 100),
        multiplier: num(b?.multiplier, 0.5, 1.5),
        pcRatio: num(b?.pcRatio, 0, 5),
        atmIV: num(b?.atmIV, 0, 400),
        flipStrike: num(b?.flipStrike, 0, 1e6),
        totalGex: num(b?.totalGex, -1e12, 1e12),
        spot: num(b?.spot, 0, 1e7),
        score: num(b?.score, 0, 100),
        regime: regime(b?.regime),
        source: String(b?.source ?? 'KRUPP-PARITY').slice(0, 24),
      },
    })
    return NextResponse.json({ ok: true, id: row.id })
  } catch (e) {
    console.error('[volhistory] persist failed:', e)
    return NextResponse.json({ ok: false, error: 'persist failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(720, Math.max(2, Number(req.nextUrl.searchParams.get('limit') ?? 180)))
    const rows = await db.volSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        vix: true, contango: true, multiplier: true, pcRatio: true, atmIV: true,
        flipStrike: true, totalGex: true, spot: true, score: true, regime: true,
        source: true, createdAt: true,
      },
    })
    const series = rows
      .map((r) => ({
        ts: r.createdAt.getTime(), vix: r.vix, contango: r.contango, multiplier: r.multiplier,
        pcRatio: r.pcRatio, atmIV: r.atmIV, flipStrike: r.flipStrike, totalGex: r.totalGex,
        spot: r.spot, score: r.score, regime: r.regime, source: r.source,
      }))
      .reverse() // ascending — canvas strips draw left→right in time order
    return NextResponse.json({ ok: true, count: series.length, series })
  } catch (e) {
    console.error('[volhistory] read failed:', e)
    return NextResponse.json({ ok: false, error: 'read failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
