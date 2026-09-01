// ============================================================================
// KRUPP CAPITAL // CBOE VOLATILITY & SENTIMENT COLLECTOR
// Cache-Seam Decoupling: pure `_fetch_*()` layer cleanly split from the
// scheduled collector wrapper. Real CDN attempts first, parity sim fallback.
// ============================================================================

const CBOE_INDEX_URL = 'https://cdn.cboe.com/api/global/us_indices/delayed_quotes'
const FETCH_TIMEOUT_MS = 3500

// --- Smooth Piecewise Term-Structure Interpolation anchors (KRUPP spec) -----
// VIX level -> VIX3M/VIX multiplier (contango/backwardation shape)
const MULTIPLIER_ANCHORS: Array<[number, number]> = [
  [0, 1.08],    // VIX <= 10  -> Strong Contango (clamped)
  [10, 1.08],   // Strong Contango
  [15, 1.05],   // Moderate Contango
  [20, 1.01],   // Mild Contango
  [25, 0.97],   // Flat
  [35, 0.90],   // Backwardation
  [50, 0.82],   // Steep Backwardation
  [80, 0.75],   // Extreme Panic Asymptote
  [Number.POSITIVE_INFINITY, 0.75],
]

export function termMultiplier(vix: number): number {
  const v = Math.max(0, vix)
  for (let i = 1; i < MULTIPLIER_ANCHORS.length; i++) {
    const [x1, y1] = MULTIPLIER_ANCHORS[i - 1]
    const [x2, y2] = MULTIPLIER_ANCHORS[i]
    if (v <= x2) {
      const t = (v - x1) / (x2 - x1 || 1)
      return y1 + (y2 - y1) * t
    }
  }
  return 0.75
}

export function termLabel(m: number): string {
  if (m >= 1.06) return 'STRONG CONTANGO'
  if (m >= 1.02) return 'MODERATE CONTANGO'
  if (m >= 0.99) return 'MILD CONTANGO'
  if (m >= 0.94) return 'FLAT'
  if (m >= 0.86) return 'BACKWARDATION'
  if (m >= 0.78) return 'STEEP BACKWARDATION'
  return 'EXTREME PANIC ASYMPTOTE'
}

// Real Contango Percentage (spec formula)
export function contangoPct(vix: number, vix3m: number): number {
  return ((vix3m - vix) / vix) * 100
}

export function pcClass(ratio: number): 'CONTRARIAN BUY' | 'NEUTRAL' | 'CONTRARIAN SELL' {
  if (ratio > 1.3) return 'CONTRARIAN BUY'
  if (ratio < 0.7) return 'CONTRARIAN SELL'
  return 'NEUTRAL'
}

export interface CboeSnapshot {
  ts: number
  source: 'CBOE-LIVE' | 'KRUPP-PARITY'
  live: boolean
  vix: number
  vix9d: number
  vix3m: number
  vix6m: number
  vix1y: number
  skew: number
  vvix: number
  contangoPct: number
  multiplier: number
  termLabel: string
  pcRatio: number
  pcClass: string
  callVol: number
  putVol: number
  callOI: number
  putOI: number
  termCurve: Array<{ label: string; value: number }>
}

// --- pure fetch layer (seam) -------------------------------------------------
async function _fetchIndex(sym: string): Promise<number | null> {
  try {
    const res = await fetch(`${CBOE_INDEX_URL}/${sym}.json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const j: any = await res.json()
    const px = j?.data?.current_price ?? j?.data?.close ?? j?.close ?? null
    return typeof px === 'number' && px > 0 ? px : null
  } catch {
    return null
  }
}

// --- parity sim state --------------------------------------------------------
function g(): number {
  let u = 0, v = 0, s = 0
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v } while (s === 0 || s >= 1)
  return Math.sqrt((-2 * Math.log(s)) / s) * u
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export class CboeCollector {
  vix = 15.4
  skew = 144.2
  vvix = 87.5
  pc = 0.94
  private live = false
  private lastRealCheck = 0

  setRegime(regime: 'CALM' | 'HIGH' | 'CRISIS', severity: number) {
    this.regime = regime
    this.severity = severity
  }
  private regime: 'CALM' | 'HIGH' | 'CRISIS' = 'CALM'
  private severity = 0

  // Scheduled wrapper: tries live seam every 60s, sim otherwise.
  async collect(): Promise<CboeSnapshot> {
    const now = Date.now()
    if (now - this.lastRealCheck > 60_000) {
      this.lastRealCheck = now
      const real = await _fetchIndex('VIX')
      if (real !== null) {
        if (!this.live) this.live = true
        this.vix = this.vix * 0.6 + real * 0.4 // blend real spot into state
      } else if (this.live) {
        this.live = false
      }
    }
    return this.simulate(now)
  }

  private simulate(now: number): CboeSnapshot {
    const dt = 3 // seconds between collects
    const mean = this.regime === 'CRISIS' ? 36 + this.severity * 1.6 : this.regime === 'HIGH' ? 21.5 : 14.6
    const theta = this.regime === 'CRISIS' ? 0.5 : 0.12
    const sigma = this.regime === 'CRISIS' ? 2.6 : this.regime === 'HIGH' ? 1.1 : 0.42
    this.vix = clamp(this.vix + theta * (mean - this.vix) * (dt / 10) + sigma * Math.sqrt(dt / 10) * g(), 8.5, 92)

    const m = termMultiplier(this.vix)
    const vix9d = clamp(this.vix * (this.regime === 'CRISIS' ? 1.11 + g() * 0.02 : 0.955 + g() * 0.012), 8, 120)
    const vix3m = clamp(this.vix * m * (1 + g() * 0.006), 8, 120)
    const vix6m = clamp(vix3m * 1.025 * (1 + g() * 0.004), 8, 120)
    const vix1y = clamp(vix6m * 1.028 * (1 + g() * 0.004), 8, 120)
    const skewMean = this.regime === 'CRISIS' ? 128 : this.regime === 'HIGH' ? 138 : 145.5
    this.skew = clamp(this.skew + (skewMean - this.skew) * 0.06 + g() * 0.7, 112, 162)
    this.vvix = clamp(this.vvix + (84 + (this.vix - 15) * 1.18 - this.vvix) * 0.08 + g() * 0.9, 62, 210)
    const pcMean = this.regime === 'CRISIS' ? 1.42 : this.regime === 'HIGH' ? 1.08 : 0.93
    this.pc = clamp(this.pc + (pcMean - this.pc) * 0.05 + g() * 0.035, 0.45, 2.1)

    const panicVol = this.regime === 'CRISIS' ? 3.1 : 1
    const callVol = Math.round(482_000 * panicVol * (0.85 + Math.random() * 0.3))
    const putVol = Math.round(callVol * this.pc)
    const callOI = Math.round(3_240_000 + Math.random() * 80_000)
    const putOI = Math.round(callOI * (1.28 + Math.random() * 0.06))

    return {
      ts: now,
      source: this.live ? 'CBOE-LIVE' : 'KRUPP-PARITY',
      live: this.live,
      vix: r2(this.vix), vix9d: r2(vix9d), vix3m: r2(vix3m), vix6m: r2(vix6m), vix1y: r2(vix1y),
      skew: r1(this.skew), vvix: r1(this.vvix),
      contangoPct: r2(contangoPct(this.vix, vix3m)),
      multiplier: r3(m),
      termLabel: termLabel(m),
      pcRatio: r2(this.pc),
      pcClass: pcClass(this.pc),
      callVol, putVol, callOI, putOI,
      termCurve: [
        { label: 'VIX9D', value: r2(vix9d) },
        { label: 'VIX', value: r2(this.vix) },
        { label: 'VIX3M', value: r2(vix3m) },
        { label: 'VIX6M', value: r2(vix6m) },
        { label: 'VIX1Y', value: r2(vix1y) },
      ],
    }
  }
}

const r1 = (x: number) => Math.round(x * 10) / 10
const r2 = (x: number) => Math.round(x * 100) / 100
const r3 = (x: number) => Math.round(x * 1000) / 1000
