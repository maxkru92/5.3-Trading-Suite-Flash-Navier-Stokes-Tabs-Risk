/**
 * KRUPP CAPITAL — Quant Math Kernel
 * Deterministic RNG, piecewise interpolation (CBOECollector anchors),
 * Black-Scholes greeks, ring statistics. Zero-allocation hot paths.
 */
import { Ring } from './ring';

/* ---------------- RNG ---------------- */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let spare: number | null = null;
export function gauss(): number {
  if (spare !== null) {
    const s = spare;
    spare = null;
    return s;
  }
  let u = 0, v = 0, s = 0;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s === 0 || s >= 1);
  const m = Math.sqrt((-2 * Math.log(s)) / s);
  spare = v * m;
  return u * m;
}

/* ---------------- basic ---------------- */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ---------------- CBOECollector piecewise anchors ---------------- */
export type Anchor = readonly [number, number];
/** Exact CBOECollector anchors — smooth piecewise linear, no step artifacts */
export const VIX_BASIS_ANCHORS: readonly Anchor[] = [
  [10, 1.08],
  [20, 1.01],
  [35, 0.9],
  [80, 0.75],
];

export function piecewise(x: number, anchors: readonly Anchor[]): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (x <= anchors[i][0]) {
      const [x0, y0] = anchors[i - 1];
      const [x1, y1] = anchors[i];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return anchors[anchors.length - 1][1];
}

export type ContangoRegime =
  | 'STRONG_CONTANGO'
  | 'MILD_CONTANGO'
  | 'FLAT'
  | 'BACKWARDATION'
  | 'CRISIS_BACKWARDATION';

export function contangoRegime(ratio: number): ContangoRegime {
  if (ratio >= 1.05) return 'STRONG_CONTANGO';
  if (ratio >= 1.0) return 'MILD_CONTANGO';
  if (ratio >= 0.98) return 'FLAT';
  if (ratio >= 0.9) return 'BACKWARDATION';
  return 'CRISIS_BACKWARDATION';
}

/* ---------------- normal dist / Black-Scholes ---------------- */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
export function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/** Black-Scholes greeks. T in years, vol in decimal (0.18), r decimal. */
export function bsGreeks(S: number, K: number, T: number, vol: number, r: number, isCall: boolean): Greeks {
  T = Math.max(T, 1 / 365 / 8);
  vol = Math.max(vol, 0.005);
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * vol * vol) * T) / (vol * sqT);
  const d2 = d1 - vol * sqT;
  const pdf = normPdf(d1);
  const gamma = pdf / (S * vol * sqT);
  const vega = S * pdf * sqT / 100;
  if (isCall) {
    const price = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
    const delta = normCdf(d1);
    const theta = (-S * pdf * vol / (2 * sqT) - r * K * Math.exp(-r * T) * normCdf(d2)) / 365;
    const rho = K * T * Math.exp(-r * T) * normCdf(d2) / 100;
    return { price, delta, gamma, theta, vega, rho };
  }
  const price = K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
  const delta = normCdf(d1) - 1;
  const theta = (-S * pdf * vol / (2 * sqT) + r * K * Math.exp(-r * T) * normCdf(-d2)) / 365;
  const rho = -K * T * Math.exp(-r * T) * normCdf(-d2) / 100;
  return { price, delta, gamma, theta, vega, rho };
}

/* ---------------- ring statistics ---------------- */
export function ringMean(r: Ring, n: number): number {
  const m = Math.min(n, r.length);
  if (m <= 0) return 0;
  let s = 0;
  for (let i = r.length - m; i < r.length; i++) s += r.at(i);
  return s / m;
}

export function ringStd(r: Ring, n: number): number {
  const m = Math.min(n, r.length);
  if (m <= 1) return 0;
  let s = 0, s2 = 0;
  for (let i = r.length - m; i < r.length; i++) {
    const v = r.at(i);
    s += v;
    s2 += v * v;
  }
  const mu = s / m;
  return Math.sqrt(Math.max(0, s2 / m - mu * mu));
}

/** Std of 1-step log diffs (per-tick realized vol input) */
export function ringStdDiff(r: Ring, n: number): number {
  const m = Math.min(n, r.length - 1);
  if (m <= 2) return 0;
  let s = 0, s2 = 0;
  for (let i = r.length - m; i < r.length; i++) {
    const prev = r.at(i - 1);
    if (!(prev > 0)) continue;
    const d = Math.log(r.at(i) / prev);
    s += d;
    s2 += d * d;
  }
  const mu = s / m;
  return Math.sqrt(Math.max(0, s2 / m - mu * mu));
}

/** Z-score of latest value vs trailing window */
export function zOf(r: Ring, lookback: number): number {
  const m = Math.min(lookback, r.length);
  if (m < 10) return 0;
  let s = 0, s2 = 0;
  for (let i = r.length - m; i < r.length; i++) {
    const x = r.at(i);
    s += x;
    s2 += x * x;
  }
  const mu = s / m;
  const sd = Math.sqrt(Math.max(1e-12, s2 / m - mu * mu));
  return (r.last() - mu) / sd;
}

/** Pearson correlation of two rings aligned at newest end */
export function corrRing(a: Ring, b: Ring, n: number): number {
  const m = Math.min(n, a.length, b.length);
  if (m < 20) return 0;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < m; i++) {
    const x = a.at(a.length - m + i);
    const y = b.at(b.length - m + i);
    sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  const cov = sab / m - (sa / m) * (sb / m);
  const va = saa / m - (sa / m) * (sa / m);
  const vb = sbb / m - (sb / m) * (sb / m);
  if (va < 1e-18 || vb < 1e-18) return 0;
  return clamp(cov / Math.sqrt(va * vb), -1, 1);
}

/** OU half-life estimate (in ticks) from spread ring */
export function halfLifeTicks(r: Ring, lookback = 240): number {
  const m = Math.min(lookback, r.length - 1);
  if (m < 40) return NaN;
  let sm = 0, xm = 0;
  for (let i = r.length - m; i < r.length; i++) { sm += r.at(i); xm += r.at(i - 1); }
  sm /= m; xm /= m;
  let sxy = 0, sxx = 0;
  for (let i = r.length - m; i < r.length; i++) {
    const x = r.at(i - 1) - xm;
    const y = r.at(i) - sm;
    sxy += x * y;
    sxx += x * x;
  }
  if (sxx < 1e-18) return NaN;
  const b = sxy / sxx;
  const th = clamp(-b, 1e-6, 1);
  return Math.log(2) / th;
}

/* ---------------- splines ---------------- */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Interpolate row of values (equally spaced) at fractional x in [0, n-1] — cubic Catmull-Rom */
export function splineAt(vals: ArrayLike<number>, x: number): number {
  const n = vals.length;
  if (n === 0) return 0;
  if (n === 1) return vals[0];
  const i = clamp(Math.floor(x), 0, n - 2);
  const t = x - i;
  const p0 = vals[Math.max(0, i - 1)];
  const p1 = vals[i];
  const p2 = vals[i + 1];
  const p3 = vals[Math.min(n - 1, i + 2)];
  return catmullRom(p0, p1, p2, p3, t);
}
