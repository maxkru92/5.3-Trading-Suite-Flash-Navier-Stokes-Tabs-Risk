/**
 * KRUPP CAPITAL — Central Bank Liquidity Service (1 Hz)
 * Tracks Fed / ECB / BOJ balance sheets, TGA and overnight RRP.
 * Computes the Net Liquidity Proxy: Fed BS − (TGA + RRP).
 */
import { gauss } from './math';
import { ms } from './engine';
import type { LiquidityState } from './types';

const g = globalThis as unknown as { __kruppLiq?: boolean };

function tickLiquidity(L: LiquidityState): void {
  const crisis = ms.crisis.active;
  const I = ms.crisis.intensity;

  // Slow structural drift ($B per second)
  L.fed += gauss() * 0.7 - 0.15; // QT roll-off
  L.ecb += gauss() * 0.55 + 0.05;
  L.boj += gauss() * 0.4 + 0.55; // BOJ still easing

  if (crisis) {
    // Liquidity crash: TGA rebuild drains reserves, RRP spikes as MM funds flee
    L.tga += 4 + Math.random() * 6 + 3 * I;
    L.rrp += 2 + Math.random() * 4 + 2 * I;
  } else {
    L.tga += gauss() * 1.4 - 0.35; // structural drawdown
    L.rrp += gauss() * 1.8 - 0.75; // RRP bleed adds liquidity
  }
  L.fed = Math.max(5800, L.fed);
  L.ecb = Math.max(5200, L.ecb);
  L.boj = Math.max(6800, L.boj);
  L.tga = Math.max(300, L.tga);
  L.rrp = Math.max(0, L.rrp);

  L.fedH.push(L.fed);
  L.ecbH.push(L.ecb);
  L.bojH.push(L.boj);
  L.tgaH.push(L.tga);
  L.rrpH.push(L.rrp);
  L.netH.push(L.fed - (L.tga + L.rrp));

  // Mirror into instrument table so all desks can stat them uniformly
  const map: Array<[string, number, number]> = [
    ['FED_BS', L.fed, (L.fed / (L.fedH.length > 1 ? L.fedH.at(L.fedH.length - 2) : L.fed) - 1) * 100],
    ['ECB_BS', L.ecb, (L.ecb / (L.ecbH.length > 1 ? L.ecbH.at(L.ecbH.length - 2) : L.ecb) - 1) * 100],
    ['BOJ_BS', L.boj, (L.boj / (L.bojH.length > 1 ? L.bojH.at(L.bojH.length - 2) : L.boj) - 1) * 100],
    ['TGA', L.tga, (L.tga / (L.tgaH.length > 1 ? L.tgaH.at(L.tgaH.length - 2) : L.tga) - 1) * 100],
    ['RRP', L.rrp, (L.rrp / (L.rrpH.length > 1 ? L.rrpH.at(L.rrpH.length - 2) : L.rrp) - 1) * 100],
  ];
  for (const [sym, v, chg] of map) {
    const st = ms.inst[sym];
    if (!st) continue;
    st.last = v;
    st.bid = v;
    st.ask = v;
    st.changePct = chg;
    st.hist.push(v);
  }
}

export function ensureLiquidity(): void {
  if (g.__kruppLiq || typeof window === 'undefined') return;
  g.__kruppLiq = true;
  // seed histories so charts render immediately
  const L = ms.liquidity;
  let fed = L.fed - 40, ecb = L.ecb - 20, boj = L.boj - 60, tga = L.tga + 55, rrp = L.rrp + 130;
  for (let i = 0; i < 240; i++) {
    fed += gauss() * 0.7 - 0.15;
    ecb += gauss() * 0.55;
    boj += gauss() * 0.4 + 0.25;
    tga += gauss() * 1.4 - 0.23;
    rrp += gauss() * 1.8 - 0.55;
    L.fedH.push(fed); L.ecbH.push(ecb); L.bojH.push(boj);
    L.tgaH.push(tga); L.rrpH.push(rrp);
    L.netH.push(fed - (tga + rrp));
  }
  L.fed = fed; L.ecb = ecb; L.boj = boj; L.tga = tga; L.rrp = rrp;
  setInterval(() => tickLiquidity(ms.liquidity), 1000);
}
