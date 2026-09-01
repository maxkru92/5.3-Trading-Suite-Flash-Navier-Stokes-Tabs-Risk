// ============================================================================
// KRUPP CAPITAL // CROSS-INSTRUMENT CORRELATION ENGINE
// Rolling Pearson ρ over per-symbol Float32 ring buffers (300 ticks ≈ 30s).
// All instruments stream off the same 100ms relay cadence → index-aligned.
// ============================================================================

import { RingBuffer } from './buffers'

const WIN = 300
const SYMS = ['ES', 'NQ', 'SPY'] as const

const series = new Map<string, RingBuffer>(
  SYMS.map((s) => [s, new RingBuffer(WIN)] as const),
)

let cacheTs = 0
let cacheM: number[][] | null = null
let cacheN = 0

/** feed a tick (all symbols, 10Hz) */
export function pushTick(sym: string, price: number): void {
  const rb = series.get(sym)
  if (rb && Number.isFinite(price) && price > 0) rb.push(price)
}

function pearson(a: RingBuffer, b: RingBuffer): number {
  const n = Math.min(a.filled, b.filled)
  if (n < 30) return NaN
  let sa = 0, sb = 0
  for (let i = 0; i < n; i++) { sa += a.at(i); sb += b.at(i) }
  const ma = sa / n, mb = sb / n
  let cov = 0, va = 0, vb = 0
  for (let i = 0; i < n; i++) {
    const da = a.at(i) - ma, db = b.at(i) - mb
    cov += da * db; va += da * da; vb += db * db
  }
  const den = Math.sqrt(va * vb)
  if (den < 1e-9) return NaN
  return Math.max(-1, Math.min(1, cov / den))
}

/**
 * 3×3 Pearson matrix (cached 1s). NaN when a series is still warming up.
 * matrix()[i][j] = ρ(SYMS[i], SYMS[j]); diagonal = 1.
 */
export function correlationMatrix(): { m: number[][]; n: number } {
  const now = Date.now()
  if (cacheM && now - cacheTs < 1000) return { m: cacheM, n: cacheN }
  const n = Math.min(...SYMS.map((s) => series.get(s)!.filled))
  const m = SYMS.map((_, i) =>
    SYMS.map((__, j) => (i === j ? 1 : pearson(series.get(SYMS[i])!, series.get(SYMS[j])!))),
  )
  cacheM = m
  cacheN = n
  cacheTs = now
  return { m, n }
}

export function corrSamples(): number {
  return Math.min(...SYMS.map((s) => series.get(s)!.filled))
}

/** mean of the three pairwise ρ — systemic co-movement gauge */
export function meanPairwiseRho(m: number[][]): number {
  const pairs = [m[0][1], m[0][2], m[1][2]].filter((v) => Number.isFinite(v))
  if (!pairs.length) return NaN
  return pairs.reduce((a, v) => a + v, 0) / pairs.length
}

export const CORR_SYMS = SYMS
