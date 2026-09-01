/**
 * KRUPP CAPITAL — Derivatives Engine (1 Hz)
 * Relative-strike vol surface (cubic-smoothed), dealer GEX profile,
 * max-pain curve, DTE expected-move boundaries, option ladder greeks.
 * All state persists at module scope across tab switches.
 */
import { Ring } from './ring';
import { bsGreeks, clamp, gauss } from './math';
import { ms } from './engine';
import type { DerivsState, LadderRow } from './types';

const N_STRIKES = 41; // 0.90 → 1.10 of spot
const EXP_DTES = [0, 1, 2, 3, 7, 14, 30, 60, 90];

const g = globalThis as unknown as { __kruppDerivs?: boolean };

const D: DerivsState = {
  spot: 5300,
  atmVol: 14,
  mult: new Float32Array(N_STRIKES),
  expiries: [...EXP_DTES],
  iv: [],
  oiCall: new Float32Array(N_STRIKES),
  oiPut: new Float32Array(N_STRIKES),
  gex: new Float32Array(N_STRIKES),
  gexFlip: 5300,
  maxPain: 5300,
  pain: new Float32Array(N_STRIKES),
  ladder: [],
  expMove: [],
  updatedAt: 0,
};

function recompute(): void {
  const es = ms.inst['ES1!'];
  const vix = ms.inst.VIX.last;
  const v9 = ms.inst.VIX9D.last;
  const v3 = ms.inst.VIX3M.last;
  const v6 = ms.inst.VIX6M.last;
  const S = es.last;
  D.spot = S;
  D.atmVol = vix;
  const I = ms.crisis.intensity;

  // term vol per expiry: piecewise from VIX term structure
  const term = (dte: number): number => {
    if (dte <= 0) return v9;
    if (dte <= 7) return v9 + ((vix - v9) * dte) / 7;
    if (dte <= 30) return vix + ((v3 - vix) * (dte - 7)) / 23;
    if (dte <= 60) return v3 + ((v6 - v3) * (dte - 30)) / 30;
    return v6;
  };

  const skewSlope = -0.32 - 0.25 * I;
  const smile = 2.4 + 1.6 * I;

  for (let i = 0; i < N_STRIKES; i++) D.mult[i] = 0.9 + (0.2 * i) / (N_STRIKES - 1);

  if (D.iv.length !== EXP_DTES.length) {
    D.iv = EXP_DTES.map(() => new Array<number>(N_STRIKES).fill(vix));
  }

  for (let j = 0; j < EXP_DTES.length; j++) {
    const tv = term(EXP_DTES[j]) / 100;
    for (let i = 0; i < N_STRIKES; i++) {
      const m = Math.log(D.mult[i]); // ln(K/S)
      const iv = tv * (1 + skewSlope * m + smile * m * m) * 100;
      D.iv[j][i] = clamp(iv, 3, 320);
    }
  }

  /* OI shapes + crisis put accumulation */
  for (let i = 0; i < N_STRIKES; i++) {
    const m = D.mult[i] - 1;
    const callShape = Math.exp(-Math.pow((m - 0.045) / 0.028, 2)) * 1250;
    const putShape = Math.exp(-Math.pow((m + 0.05) / 0.03, 2)) * 1650;
    D.oiCall[i] += (callShape * (1 + 0.4 * I) - D.oiCall[i]) * 0.05 + gauss() * 6;
    D.oiPut[i] += (putShape * (1 + 2.2 * I) - D.oiPut[i]) * 0.05 + gauss() * 8;
  }

  /* dealer GEX: long calls / short puts convention */
  const T7 = 7 / 365;
  let cum = 0;
  let flip = S;
  let cumPrev = 0;
  for (let i = 0; i < N_STRIKES; i++) {
    const K = S * D.mult[i];
    const ivC = D.iv[6][i] / 100;
    const gc = bsGreeks(S, K, T7, ivC, 0.045, true).gamma;
    const gp = bsGreeks(S, K, T7, ivC, 0.045, false).gamma;
    const gex = (gc * D.oiCall[i] - gp * D.oiPut[i]) * 100 * S * S * 0.01;
    D.gex[i] = gex;
    cumPrev = cum;
    cum += gex;
    if (cumPrev < 0 && cum >= 0) flip = K;
  }
  // if never crossed, fallback: where |cum| minimal
  if (cum < 0) {
    let best = Infinity;
    let bestK = S;
    let run = 0;
    for (let i = 0; i < N_STRIKES; i++) {
      run += D.gex[i];
      if (Math.abs(run) < best) { best = Math.abs(run); bestK = S * D.mult[i]; }
    }
    flip = bestK;
  }
  D.gexFlip = flip;

  /* max pain curve */
  let minPain = Infinity;
  let minK = S;
  for (let i = 0; i < N_STRIKES; i++) {
    const Si = S * D.mult[i];
    let pain = 0;
    for (let j = 0; j < N_STRIKES; j++) {
      const Kj = S * D.mult[j];
      pain += D.oiCall[j] * Math.max(Si - Kj, 0) + D.oiPut[j] * Math.max(Kj - Si, 0);
    }
    D.pain[i] = pain / 1e6; // $M
    if (pain < minPain) { minPain = pain; minK = Si; }
  }
  D.maxPain = minK;

  /* option ladder around ATM (T = 1 DTE) */
  const rows: LadderRow[] = [];
  const center = Math.round(N_STRIKES / 2);
  for (let i = center - 11; i <= center + 11; i++) {
    if (i < 0 || i >= N_STRIKES) continue;
    const K = S * D.mult[i];
    const ivC = D.iv[1][i] / 100;
    const c = bsGreeks(S, K, 1 / 365, ivC, 0.045, true);
    const p = bsGreeks(S, K, 1 / 365, ivC, 0.045, false);
    rows.push({
      strike: K,
      ivC: D.iv[1][i], ivP: D.iv[1][i] * (1 + 0.006 * gauss()),
      bidC: Math.max(0.05, c.price * 0.985), askC: c.price * 1.015,
      bidP: Math.max(0.05, p.price * 0.985), askP: p.price * 1.015,
      deltaC: c.delta, deltaP: p.delta, gamma: c.gamma,
      thetaC: c.theta, thetaP: p.theta, vega: c.vega,
      rhoC: c.rho, rhoP: p.rho,
      oic: D.oiCall[i], oip: D.oiPut[i],
      volC: D.oiCall[i] * (0.2 + Math.abs(gauss() * 0.1)),
      volP: D.oiPut[i] * (0.2 + Math.abs(gauss() * 0.1)),
    });
  }
  D.ladder = rows;

  /* expected move boundaries */
  D.expMove = [0, 1, 7, 30].map((dte) => {
    const iv = (term(dte) / 100);
    const span = S * iv * Math.sqrt(Math.max(dte, 0.1) / 365);
    return { dte, up: S + span, dn: S - span, iv: iv * 100 };
  });

  D.updatedAt = Date.now();
}

export function ensureDerivs(): void {
  if (g.__kruppDerivs || typeof window === 'undefined') return;
  g.__kruppDerivs = true;
  // seed OI
  for (let i = 0; i < N_STRIKES; i++) {
    const m = 0.9 + (0.2 * i) / (N_STRIKES - 1) - 1;
    D.oiCall[i] = Math.exp(-Math.pow((m - 0.045) / 0.028, 2)) * 1250;
    D.oiPut[i] = Math.exp(-Math.pow((m + 0.05) / 0.03, 2)) * 1650;
  }
  recompute();
  setInterval(recompute, 1000);
}

export function getDerivs(): DerivsState {
  return D;
}
