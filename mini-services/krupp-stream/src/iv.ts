// ============================================================================
// KRUPP CAPITAL // 0DTE/1DTE OPTIONS IV SURFACE + GAMMA EXPOSURE (GEX)
// Strike matrix w/ Calls/Puts volume, Delta, Gamma profile, IV micro-heatmap,
// GEX flip strike detection. Feeds off the VIX state for coherent ATM IV.
// ============================================================================

import { INSTRUMENTS } from './engine'

export interface IvRow {
  strike: number
  callVol: number
  callOI: number
  callIV: number
  callDelta: number
  putVol: number
  putOI: number
  putIV: number
  putDelta: number
  gamma: number
  gex: number      // gamma*OI*100*spot, calls + / puts -
  cumGex: number
}

export interface IvSurface {
  ts: number
  sym: string
  spot: number
  atmIV: number
  flipStrike: number
  maxGammaStrike: number
  totalGex: number
  rows: IvRow[]
}

// --- standard normal helpers -------------------------------------------------
function cdf(x: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  p = x >= 0 ? 1 - p : p
  return Math.min(1, Math.max(0, p))
}
const pdf = (x: number) => 0.3989423 * Math.exp((-x * x) / 2)

const g = () => {
  let u = 0, v = 0, s = 0
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v } while (s === 0 || s >= 1)
  return Math.sqrt((-2 * Math.log(s)) / s) * u
}

interface OiState { vol: Map<number, number>; oi: Map<number, number> }
const oiState = new Map<string, OiState>()

export function buildIvSurface(sym: string, spot: number, vix: number, crisis: boolean): IvSurface {
  const def = INSTRUMENTS.find((d) => d.sym === sym)!
  const T = 1 / 252 // 0DTE session remainder
  const r = 0.045
  const F = spot * Math.exp(r * T)
  const atmIV = (vix / 100) * (crisis ? 1.12 : 0.99)
  const slope = (crisis ? -0.42 : -0.28) // put skew steepens in stress
  const curv = 0.58

  if (!oiState.has(sym)) oiState.set(sym, { vol: new Map(), oi: new Map() })
  const st = oiState.get(sym)!

  const nStrikes = 21
  const step = def.kind === 'CME_FUTURE' ? (sym === 'NQ' ? 50 : 25) : 1
  const atm = Math.round(spot / step) * step

  const raw: IvRow[] = []
  for (let i = -(nStrikes - 1) / 2; i <= (nStrikes - 1) / 2; i++) {
    const K = +(atm + i * step).toFixed(2)
    const m = Math.log(K / F)
    const baseIV = Math.max(0.05, atmIV + slope * m + curv * m * m)
    const callIV = baseIV + g() * 0.0012
    const putIV = baseIV + 0.004 + g() * 0.0012

    const d1 = (Math.log(F / K) + 0.5 * atmIV * atmIV * T) / (atmIV * Math.sqrt(T))
    const callDelta = cdf(d1)
    const putDelta = callDelta - 1
    const gamma = pdf(d1) / (F * atmIV * Math.sqrt(T))

    // volume/OI random walks with round-strike magnetism
    const round = Math.abs(K % (step * 4)) < 0.01 ? 1.85 : 1
    const volBase = (crisis ? 5200 : 1450) * Math.exp(-2.1 * Math.abs(m) * 8)
    const cv = Math.max(4, Math.round((st.vol.get(`c${K}`) ?? volBase) * 0.82 + volBase * round * Math.exp(g() * 0.3) * 0.18))
    const pv = Math.max(4, Math.round((st.vol.get(`p${K}`) ?? volBase * 1.2) * 0.82 + volBase * 1.2 * round * Math.exp(g() * 0.3) * 0.18))
    const co = Math.max(50, Math.round((st.oi.get(`c${K}`) ?? volBase * 3.4 * round) * 0.985 + volBase * 3.4 * round * Math.exp(g() * 0.2) * 0.015))
    const po = Math.max(50, Math.round((st.oi.get(`p${K}`) ?? volBase * 4.6 * round) * 0.985 + volBase * 4.6 * round * Math.exp(g() * 0.2) * 0.015))
    st.vol.set(`c${K}`, cv); st.vol.set(`p${K}`, pv); st.oi.set(`c${K}`, co); st.oi.set(`p${K}`, po)

    const gex = gamma * (co - po) * 100 * F
    raw.push({
      strike: K,
      callVol: cv, callOI: co, callIV: +(callIV * 100).toFixed(2), callDelta: +callDelta.toFixed(3),
      putVol: pv, putOI: po, putIV: +(putIV * 100).toFixed(2), putDelta: +putDelta.toFixed(3),
      gamma: +gamma.toExponential(2),
      gex: Math.round(gex / 1e6 * 100) / 100, // $mn per 1%
      cumGex: 0,
    })
  }

  // cumulative GEX from lowest strike upward -> flip where sign crosses
  let cum = 0
  const rows = raw
    .sort((a, b) => a.strike - b.strike)
    .map((r) => { cum += r.gex; return { ...r, cumGex: Math.round(cum * 100) / 100 } })
  let flip = rows[0].strike
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].cumGex < 0 && rows[i].cumGex >= 0) { flip = rows[i].strike; break }
  }
  const maxGamma = rows.reduce((a, b) => (b.gamma > a.gamma ? b : a))

  return {
    ts: Date.now(),
    sym,
    spot: +spot.toFixed(2),
    atmIV: +(atmIV * 100).toFixed(2),
    flipStrike: flip,
    maxGammaStrike: maxGamma.strike,
    totalGex: Math.round(cum * 100) / 100,
    rows,
  }
}
