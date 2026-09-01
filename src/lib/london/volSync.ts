// ============================================================================
// KRUPP CAPITAL // VOL SNAPSHOT SYNC (SQLite persistence bridge)
// Boot hydration + 60s capture loop. Snapshots persist the CBOE complex, IV
// headline and composite risk state to /api/volhistory so the desk keeps a
// cross-boot volatility record (the strip in the CBOE panel renders it).
// Capture is DUAL-SOURCE since round 7: the :3030 relay posts its own
// RELAY-CBOE snapshot every 60s (works with no browser tab open). The desk
// defers to a fresh relay capture (refetch-only) and takes over with its own
// POST when the relay record goes stale — the vol record never gaps.
// ============================================================================

import { useKrupp } from './store'
import type { VolSnap } from './types'

const RELAY_STALE_MS = 75_000 // relay cadence 60s → >75s since its last snap = relay absent

let postFails = 0
let lastCapture = 0

/** last snapshot is a fresh relay capture → the relay owns the cadence right now */
function relayOwnsCadence(): boolean {
  const vh = useKrupp.getState().volHistory
  const last = vh[vh.length - 1]
  return !!last && last.source.startsWith('RELAY') && Date.now() - last.ts < RELAY_STALE_MS
}

async function refetchSeries(): Promise<void> {
  try {
    const res = await fetch('/api/volhistory?limit=360', { cache: 'no-store' })
    if (!res.ok) return
    const j = await res.json()
    if (!j?.ok) return
    const series: VolSnap[] = (j.series ?? [])
      .map((r: any) => ({
        ts: Number(r.ts), vix: Number(r.vix), contango: Number(r.contango),
        multiplier: Number(r.multiplier), pcRatio: Number(r.pcRatio), atmIV: Number(r.atmIV),
        flipStrike: Number(r.flipStrike), totalGex: Number(r.totalGex), spot: Number(r.spot),
        score: Number(r.score),
        regime: r.regime === 'HIGH' ? 'HIGH' : r.regime === 'CRISIS' ? 'CRISIS' : 'CALM',
        source: String(r.source ?? 'KRUPP-PARITY'),
      }))
      .filter((s: VolSnap) => Number.isFinite(s.ts) && Number.isFinite(s.vix))
    if (series.length) {
      useKrupp.getState().setVolHistory(series)
      useKrupp.getState().setVolSyncOn(true)
      lastCapture = series[series.length - 1].ts
    }
  } catch { /* transient — next tick retries */ }
}

function snapFromStore(): VolSnap | null {
  const st = useKrupp.getState()
  const c = st.cboe
  const m = st.metrics
  const iv = st.iv
  if (!c || !m.ts) return null // no CBOE complex / no risk kernel tick yet
  return {
    ts: Date.now(),
    vix: c.vix,
    contango: c.contangoPct,
    multiplier: c.multiplier,
    pcRatio: c.pcRatio,
    atmIV: iv?.atmIV ?? c.vix, // IV surface may lag the CBOE poll — vix is a sane stand-in
    flipStrike: iv?.flipStrike ?? 0,
    totalGex: iv?.totalGex ?? 0,
    spot: iv?.spot ?? 0,
    score: m.score,
    regime: m.regime,
    source: c.source,
  }
}

/** fire-and-forget capture POST — server enforces a 45s floor (multi-tab safe) */
export function persistVolSnapshot(): void {
  // relay-side capture is fresh → refetch its snapshot into the strip instead
  // of double-posting (relay + desk would fight over the 45s server floor)
  if (relayOwnsCadence()) { void refetchSeries(); return }

  const snap = snapFromStore()
  if (!snap) return
  if (Date.now() - lastCapture < 50_000) return // client-side cadence floor too
  lastCapture = Date.now()
  fetch('/api/volhistory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snap),
    keepalive: true,
  })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      postFails = 0
      useKrupp.getState().setVolSyncOn(true)
      useKrupp.getState().pushVolSnap(snap)
      return r.json()
    })
    .then((j) => {
      // server floor throttled us (another tab / the relay won the race) —
      // pull the winning row into the strip so the desk view stays truthy
      if (j?.throttled) void refetchSeries()
    })
    .catch(() => {
      postFails++
      if (postFails >= 3) useKrupp.getState().setVolSyncOn(false)
    })
}

/** boot hydration — pull the persisted series (ascending, capped 360 rows ≈ 6h) */
export async function hydrateVolHistory(): Promise<void> {
  try {
    const res = await fetch('/api/volhistory?limit=360', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (!j?.ok) throw new Error('bad payload')
    const series: VolSnap[] = (j.series ?? [])
      .map((r: any) => ({
        ts: Number(r.ts), vix: Number(r.vix), contango: Number(r.contango),
        multiplier: Number(r.multiplier), pcRatio: Number(r.pcRatio), atmIV: Number(r.atmIV),
        flipStrike: Number(r.flipStrike), totalGex: Number(r.totalGex), spot: Number(r.spot),
        score: Number(r.score),
        regime: r.regime === 'HIGH' ? 'HIGH' : r.regime === 'CRISIS' ? 'CRISIS' : 'CALM',
        source: String(r.source ?? 'KRUPP-PARITY'),
      }))
      .filter((s: VolSnap) => Number.isFinite(s.ts) && Number.isFinite(s.vix))
    useKrupp.getState().setVolHistory(series)
    useKrupp.getState().setVolSyncOn(true)
    if (series.length) lastCapture = series[series.length - 1].ts
  } catch {
    useKrupp.getState().setVolSyncOn(false)
  }
}
