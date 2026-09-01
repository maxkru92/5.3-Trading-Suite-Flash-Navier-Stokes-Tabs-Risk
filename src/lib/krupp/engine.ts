/**
 * KRUPP CAPITAL — Master Market Engine
 *
 * Architecture: module-singleton engine mutating a plain MarketState object
 * OUTSIDE React. React only sees a `revision` counter (5 Hz). All series live
 * in Float32Array ring buffers → zero V8 GC pressure on the hot path.
 * Crisis regime (SIMULATE MARKET LIQUIDITY CRASH) propagates shocks into
 * every instrument, factor and downstream service simultaneously.
 */
import { Ring } from './ring';
import {
  clamp,
  contangoRegime,
  gauss,
  halfLifeTicks,
  piecewise,
  ringStdDiff,
  VIX_BASIS_ANCHORS,
  zOf,
} from './math';
import { INSTRUMENTS } from './universe';
import type { Book, InstDef, InstState, MarketState, StatPair } from './types';
import { useKrupp } from './store';
import { ensureLiquidity } from './liquidityService';
import { ensureL3 } from './l3service';
import { ensureInfra } from './infraservice';
import { ensureDerivs } from './derivs';

const HIST_CAP = 600;

/** crisis sensitivity per vol index (target = px0 * (1 + k * intensity)) */
const VOL_CRISIS_K: Record<string, number> = {
  VIX9D: 5.6, VIX: 5.0, VIX3M: 3.4, VIX6M: 2.7, VXN: 5.2, RVX: 5.4,
  VDAX: 4.2, OVX: 2.8, GVZ: 2.0, EVZ: 1.7,
};

function seedRing(base: number, n: number, vol: number): Ring {
  const r = new Ring(HIST_CAP);
  let v = base * (1 - vol * 40 * (Math.random() - 0.5));
  for (let i = 0; i < n; i++) {
    v *= 1 + gauss() * vol;
    r.push(v);
  }
  return r;
}

function initMarketState(): MarketState {
  const inst: Record<string, InstState> = {};
  for (const def of INSTRUMENTS) {
    const sz = Math.max(1, def.bvol * 1.5);
    const book: Book = {
      bidPx: new Float32Array(8),
      bidSz: new Float32Array(8),
      askPx: new Float32Array(8),
      askSz: new Float32Array(8),
      seq: 0,
    };
    for (let i = 0; i < 8; i++) {
      book.bidSz[i] = sz * (0.4 + Math.random() * 1.4);
      book.askSz[i] = sz * (0.4 + Math.random() * 1.4);
    }
    inst[def.symbol] = {
      def,
      last: def.px0,
      bid: def.px0,
      ask: def.px0,
      open: def.px0,
      high: def.px0,
      low: def.px0,
      prevClose: def.px0 * (1 + gauss() * 0.004),
      volume: def.bvol * 40 * (2 + Math.random() * 3),
      oi: def.bvol * 260 + Math.random() * def.bvol * 400,
      spreadBps: 1,
      ofi: 0,
      cvd: 0,
      liq: 78 + Math.random() * 12,
      iv: def.px0,
      rv: def.vol * 46000 * 1.6,
      changePct: 0,
      jump: 0,
      hist: seedRing(def.px0, 90, def.vol || 0.0002),
      ivHist: seedRing(def.px0, 90, def.group === 'VOL_IDX' ? 0.004 : 0.001),
      ofiHist: new Ring(300),
      book,
    };
  }

  const statarb: StatPair[] = [
    {
      id: 'AU_REAL', label: 'GOLD vs 10Y US REAL YIELD',
      desc: 'ln(GC1!) − 4.0 × US10YR — real-rate hedge pair',
      aSym: 'GC1!', bSym: 'US10YR', mode: 'mul',
      spread: new Ring(HIST_CAP), z: new Ring(HIST_CAP), signal: 'FLAT', severity: 'NONE', hl: NaN,
    },
    {
      id: 'CU_AU', label: 'COPPER/GOLD ×1000',
      desc: 'Global growth proxy — industrial vs monetary metal',
      aSym: 'HG1!', bSym: 'GC1!', mode: 'ratio',
      spread: new Ring(HIST_CAP), z: new Ring(HIST_CAP), signal: 'FLAT', severity: 'NONE', hl: NaN,
    },
    {
      id: 'SPY_HYG', label: 'SPY vs HYG CREDIT SPREAD',
      desc: 'Equity risk vs high-yield corporate credit vector',
      aSym: 'SPY', bSym: 'HYG', mode: 'logratio',
      spread: new Ring(HIST_CAP), z: new Ring(HIST_CAP), signal: 'FLAT', severity: 'NONE', hl: NaN,
    },
    {
      id: 'BTC_NQ', label: 'BTC vs NASDAQ RISK-ON',
      desc: 'Digital risk appetite vs tech beta spread',
      aSym: 'BTC-USD', bSym: 'NQ1!', mode: 'logratio',
      spread: new Ring(HIST_CAP), z: new Ring(HIST_CAP), signal: 'FLAT', severity: 'NONE', hl: NaN,
    },
  ];

  return {
    t: Date.now(),
    tickCount: 0,
    inst,
    crisis: {
      active: false, phase: 'NORMAL', startedAt: 0, endsAt: 0,
      recoveredAt: 0, intensity: 0, count: 0,
    },
    interceptors: { blockMR: true, reduceSize: true, flatten: true },
    volComplex: {
      contangoReal: new Ring(HIST_CAP),
      contangoMarket: new Ring(HIST_CAP),
      regime: 'MILD_CONTANGO',
    },
    garch: new Ring(HIST_CAP),
    garchS: 0.00035,
    statarb,
    liquidity: {
      fed: 7192, ecb: 6314, boj: 7428, tga: 742, rrp: 612,
      fedH: new Ring(720), ecbH: new Ring(720), bojH: new Ring(720),
      tgaH: new Ring(720), rrpH: new Ring(720), netH: new Ring(720),
    },
  };
}

const SECTORS = ['EQ', 'RATES', 'METAL', 'ENERGY', 'FX', 'CRYPTO', 'CREDIT'] as const;
type SectorKey = (typeof SECTORS)[number];

class Engine {
  ms: MarketState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private F: Record<SectorKey | 'MKT', number> = {
    MKT: 0, EQ: 0, RATES: 0, METAL: 0, ENERGY: 0, FX: 0, CRYPTO: 0, CREDIT: 0,
  };
  private jumpPool: InstState[] = [];

  constructor() {
    this.ms = initMarketState();
    this.jumpPool = INSTRUMENTS.filter((d) => d.sector === 'EQ' || d.sector === 'CRYPTO')
      .map((d) => this.ms.inst[d.symbol])
      .filter(Boolean);
  }

  start(): void {
    if (this.timer || typeof window === 'undefined') return;
    this.timer = setInterval(() => this.tick(), 200);
  }

  /* ------------------------------------------------------------------ */
  tick(): void {
    const ms = this.ms;
    const now = Date.now();
    ms.t = now;

    /* ---- crisis state machine ---- */
    const c = ms.crisis;
    if (c.active) {
      c.intensity = Math.min(1, c.intensity + 0.03);
      if (now >= c.endsAt) {
        this.endCrisis();
      } else if (now >= c.endsAt - 14000) {
        c.phase = 'RECOVERY';
        c.intensity = Math.max(0.3, c.intensity - 0.012);
      } else {
        c.phase = c.intensity < 0.3 ? 'SHOCK' : 'LOCKDOWN';
      }
    } else if (c.intensity > 0.002) {
      c.intensity *= 0.93;
      c.phase = 'NORMAL';
    } else {
      c.intensity = 0;
      c.phase = 'NORMAL';
    }
    const I = c.intensity;
    const volMult = 1 + 6.5 * I;

    /* ---- factor evolution (F.MKT stays mean-zero: it is a per-tick SHOCK,
            never an accumulating level. Crisis drift is applied separately
            as a bounded per-tick term in the instrument loop.) ---- */
    const F = this.F;
    const mVol = 0.00025 * (1 + 1.4 * I);
    F.MKT = F.MKT * 0.9 + gauss() * mVol - F.MKT * 0.05;
    F.MKT = clamp(F.MKT, -0.005, 0.005);
    for (const s of SECTORS) {
      F[s] = F[s] * 0.9 + gauss() * 0.00022 * (1 + 2.6 * I) - F[s] * 0.05;
    }

    ms.tickCount++;

    /* ---- crisis flash jumps (bounded: drawdown-guarded, rare) ---- */
    if (c.active && Math.random() < 0.01 * I && this.jumpPool.length > 0) {
      const st = this.jumpPool[(Math.random() * this.jumpPool.length) | 0];
      const floor = st.def.sector === 'CRYPTO' ? 0.55 : 0.82;
      if (st.last > st.def.px0 * floor) st.jump -= 0.015 + Math.random() * 0.025;
    }

    /* ---- instrument ticks ---- */
    /* bounded crisis market drift: ~-8% total drawdown at full intensity over
       a 90s crisis; mild recovery drift while cooling after lockdown */
    const mktDrift = c.active ? -0.0002 * I : I > 0.002 ? 0.0006 * I : 0;
    for (let i = 0; i < INSTRUMENTS.length; i++) {
      const def = INSTRUMENTS[i];
      const st = ms.inst[def.symbol];
      if (!st || def.group === 'MACRO') continue;

      let ret: number;
      if (def.sector === 'VOL') {
        ret = this.volIdxRet(def, st, I, volMult);
      } else {
        ret = def.beta * (F.MKT + mktDrift) + F[def.sector] * 0.85 + gauss() * def.vol * volMult;
      }
      /* rubber-band floor: no instrument can death-spiral below its crisis band */
      const floorPx = def.px0 * (def.sector === 'CRYPTO' ? 0.5 : 0.65);
      if (st.last < floorPx) ret += Math.log(floorPx / st.last) * 0.05;
      if (st.jump !== 0) {
        ret += st.jump;
        st.jump = 0;
      }

      st.last = Math.max(def.tick, st.last * (1 + ret));
      if (st.last > st.high) st.high = st.last;
      if (st.last < st.low) st.low = st.low === def.px0 && st.hist.length === 0 ? st.last : Math.min(st.low, st.last);
      st.changePct = (st.last / st.prevClose - 1) * 100;

      const widen = 1 + 2.5 * I;
      const half = def.tick * 1.5 * widen;
      st.bid = st.last - half;
      st.ask = st.last + half;
      st.spreadBps = ((st.ask - st.bid) / st.last) * 10000;

      st.volume += def.bvol * (0.4 + Math.random() * 1.2) * (1 + 60 * Math.abs(ret)) * (1 + 9 * I);
      st.oi *= 1 + gauss() * 0.0008 + (c.active ? (def.sector === 'EQ' ? -0.0004 * I : 0.0002 * I) : 0);

      st.ofi = clamp(st.ofi * 0.72 + (ret / (def.vol + 1e-9)) * 0.09, -1, 1);
      st.cvd += st.ofi * def.bvol * 0.35;
      st.liq = clamp(88 - st.spreadBps * 8 - Math.abs(ret) * 40000 + gauss() * 4, 3, 99);

      if (def.sector === 'VOL') {
        st.iv = st.last;
        st.ivHist.push(st.iv);
      }

      st.hist.push(st.last);
      st.ofiHist.push(st.ofi);

      if (def.bvol > 0) this.updateBook(st, def, I);
    }

    /* ---- implied vol pass for non-vol assets ---- */
    this.ivPass(I);

    /* ---- Vol Complex: real contango via CBOECollector anchors ---- */
    const vix = ms.inst.VIX.last;
    ms.volComplex.contangoReal.push(piecewise(vix, VIX_BASIS_ANCHORS));
    ms.volComplex.contangoMarket.push(ms.inst.VIX3M.last / vix);
    ms.volComplex.regime = contangoRegime(ms.volComplex.contangoReal.last());

    /* ---- MS-GARCH(1,1) realized vol for SPX (per-tick, scaled to vol pts) ---- */
    const es = ms.inst['ES1!'];
    let r = 0;
    if (es.hist.length >= 2) r = Math.log(es.hist.last() / es.hist.at(es.hist.length - 2));
    ms.garchS = Math.sqrt(1e-9 + 0.06 * r * r + 0.92 * ms.garchS * ms.garchS);
    ms.garch.push(ms.garchS * 46000);

    /* ---- realized vol snapshot per instrument ---- */
    for (const key in ms.inst) {
      const st = ms.inst[key];
      st.rv = ringStdDiff(st.hist, 120) * 46000;
    }

    /* ---- stat-arb spreads ---- */
    for (const p of ms.statarb) this.updatePair(p);

    /* ---- notify React at 5 Hz (charts poll state directly via rAF) ---- */
    useKrupp.getState().bump();
  }

  /* ------------------------------------------------------------------ */
  private volIdxRet(def: InstDef, st: InstState, I: number, volMult: number): number {
    let target: number;
    if (def.symbol === 'VVIX') target = 86.4 * (1 + 1.15 * I);
    else if (def.symbol === 'SKEW') target = 141.2 * (1 + 0.22 * I);
    else {
      const k = VOL_CRISIS_K[def.symbol] ?? 3;
      target = def.px0 * (1 + k * I);
    }
    const pull = Math.log(target / Math.max(0.01, st.last)) * 0.055;
    return pull + gauss() * def.vol * (1 + 2.2 * I) * 1.5;
  }

  private ivPass(I: number): void {
    const ms = this.ms;
    const vix = ms.inst.VIX.last;
    const vxn = ms.inst.VXN.last;
    const rvx = ms.inst.RVX.last;
    const vdax = ms.inst.VDAX.last;
    const ovx = ms.inst.OVX.last;
    const gvz = ms.inst.GVZ.last;
    const evz = ms.inst.EVZ.last;
    const set = (sym: string, v: number): void => {
      const st = ms.inst[sym];
      if (!st) return;
      st.iv = v;
      st.ivHist.push(v);
    };
    set('ES1!', vix); set('SPY', vix); set('YM1!', vix * 0.95);
    set('NQ1!', vxn); set('QQQ', vxn);
    set('RTY1!', rvx);
    set('FDAX!', vdax); set('FESX!', vdax * 1.02); set('NK1!', vix * 1.15);
    set('GC1!', gvz); set('GLD', gvz * 0.97); set('SI1!', gvz * 1.55); set('SLV', gvz * 1.5);
    set('HG1!', gvz * 1.25); set('XLB', gvz * 1.1);
    set('CL1!', ovx); set('USO', ovx * 0.98); set('NG1!', ovx * 1.5);
    set('RB1!', ovx * 1.05); set('HO1!', ovx * 1.05); set('XLE', ovx * 0.95);
    set('6E1!', evz); set('6J1!', evz * 1.15); set('6B1!', evz * 0.95);
    set('6A1!', evz * 1.1); set('6C1!', evz * 0.9); set('6F1!', evz * 0.95);
    const btcIv = Math.max(32, vix * 2.3 + 8 * I);
    set('BTC-USD', btcIv); set('IBIT', btcIv * 0.98); set('ARKB', btcIv * 0.98);
    for (const s of ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA']) {
      const st = ms.inst[s];
      if (st) set(s, vix * (1.05 + (st.def.beta - 1) * 0.5));
    }
    for (const s of ['SHEL', 'HSBA', 'SAP', 'SIE', 'ALV']) set(s, vdax * 1.05);
    for (const s of ['XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'XLP', 'XLI', 'XLB', 'XLRE', 'XLU']) {
      const st = ms.inst[s];
      if (st) set(s, vix * (0.92 + st.def.beta * 0.22));
    }
    set('ARKK', vix * 1.6);
    set('HYG', Math.max(7, vix * 0.55 + 2 * I));
  }

  private updateBook(st: InstState, def: InstDef, I: number): void {
    const b = st.book;
    b.seq++;
    const step = def.tick * (1.5 + 1.5 * I);
    const lo = def.bvol * 0.03;
    const hi = def.bvol * 8;
    for (let i = 0; i < 8; i++) {
      b.bidPx[i] = st.last - step * (i + 1);
      b.askPx[i] = st.last + step * (i + 1);
      const dS = gauss() * def.bvol * 0.05 + (Math.random() < 0.02 ? gauss() * def.bvol * 0.6 : 0);
      b.bidSz[i] = clamp(b.bidSz[i] + dS, lo, hi);
      b.askSz[i] = clamp(b.askSz[i] - dS * 0.6 + gauss() * def.bvol * 0.05, lo, hi);
    }
  }

  private updatePair(p: StatPair): void {
    const ms = this.ms;
    const a = ms.inst[p.aSym]?.last ?? 1;
    const b = ms.inst[p.bSym]?.last ?? 1;
    let s: number;
    if (p.mode === 'mul') s = Math.log(Math.max(0.01, a)) - 4.0 * b;
    else if (p.mode === 'ratio') s = (a / Math.max(1e-9, b)) * 1000;
    else s = Math.log(a / Math.max(1e-9, b)) * 100;
    p.spread.push(s);
    const z = zOf(p.spread, 240);
    p.z.push(z);
    const az = Math.abs(z);
    p.severity = az > 3.5 ? 'SEVERE' : az > 2.5 ? 'WARN' : 'NONE';
    p.signal = p.severity === 'NONE' ? 'FLAT' : z > 0 ? 'SHORT_SPREAD' : 'LONG_SPREAD';
    if (ms.tickCount % 10 === 0) p.hl = halfLifeTicks(p.spread, 240);
  }

  /* ------------------------------------------------------------------ */
  startCrisis(): void {
    const c = this.ms.crisis;
    if (c.active) return;
    c.active = true;
    c.startedAt = Date.now();
    c.endsAt = c.startedAt + 90000;
    c.intensity = 0.02;
    c.phase = 'SHOCK';
    c.count++;
  }

  endCrisis(): void {
    const c = this.ms.crisis;
    if (!c.active) return;
    c.active = false;
    c.phase = 'NORMAL';
    c.recoveredAt = Date.now();
  }
}

const g = globalThis as unknown as { __kruppEngine?: Engine };

export function ensureEngine(): Engine {
  if (!g.__kruppEngine) {
    g.__kruppEngine = new Engine();
    g.__kruppEngine.start();
  }
  return g.__kruppEngine;
}

/** Singleton mutable market state — read directly in rAF draw loops. */
export const ms: MarketState = ensureEngine().ms;

export function getInst(sym: string): InstState | undefined {
  return ms.inst[sym];
}

export function getBook(sym: string): Book | undefined {
  return ms.inst[sym]?.book;
}

export function startCrisis(): void {
  ensureEngine().startCrisis();
}

export function endCrisis(): void {
  ensureEngine().endCrisis();
}

/** Boot all streaming services (idempotent, client-side only). */
export function bootstrapKrupp(): void {
  ensureEngine();
  ensureLiquidity();
  ensureL3();
  ensureInfra();
  ensureDerivs();
}
