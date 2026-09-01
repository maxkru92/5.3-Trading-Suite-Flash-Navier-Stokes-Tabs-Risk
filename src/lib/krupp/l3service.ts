/**
 * KRUPP CAPITAL — True L3 Market-By-Order Engine (Crypto)
 * Simulates individual order sequences at ~16 Hz: unique order IDs,
 * queue positions, cancellation rates, iceberg detection, CVD/OFI.
 * Module-singleton worker — survives tab switches.
 */
import { Ring } from './ring';
import { clamp } from './math';
import { ms } from './engine';
import type { IcebergEvent, L3State, TapeAction, TapeEvent } from './types';

const SYMS = ['BTC-USD', 'ETH-USD', 'SOL-USD'] as const;
const TICKS: Record<string, number> = { 'BTC-USD': 0.5, 'ETH-USD': 0.1, 'SOL-USD': 0.01 };
const DEPTH = 12;
const TAPE_CAP = 48;

interface Order {
  id: string;
  px: number;
  qty: number;
  vis: number;
  side: 'B' | 'S';
  ice: boolean;
  born: number;
}

interface Internal extends L3State {
  orders: Map<string, Order>;
  seq: number;
}

const g = globalThis as unknown as { __kruppL3?: Map<string, Internal> };

function mkState(sym: string): Internal {
  const mid = ms.inst[sym]?.last ?? 1;
  const t = TICKS[sym] ?? 0.01;
  const bidPx = new Float32Array(DEPTH);
  const askPx = new Float32Array(DEPTH);
  const bidSz = new Float32Array(DEPTH);
  const askSz = new Float32Array(DEPTH);
  for (let i = 0; i < DEPTH; i++) {
    bidPx[i] = mid - t * (i + 1);
    askPx[i] = mid + t * (i + 1);
    bidSz[i] = 4 + Math.random() * 30;
    askSz[i] = 4 + Math.random() * 30;
  }
  return {
    sym, mid, cvd: new Ring(600), ofi: 0, cancelRate: 0.22, tps: 0,
    tape: [], bidPx, bidSz, askPx, askSz, icebergs: [], openOrders: 0,
    orders: new Map(), seq: 1,
  };
}

function pushTape(s: Internal, ev: TapeEvent): void {
  s.tape.unshift(ev);
  if (s.tape.length > TAPE_CAP) s.tape.length = TAPE_CAP;
}

function step(s: Internal): void {
  const st = ms.inst[s.sym];
  if (st) s.mid = st.last;
  const t = TICKS[s.sym] ?? 0.01;
  const crisis = ms.crisis.active;
  const I = ms.crisis.intensity;
  const unit = s.sym === 'BTC-USD' ? 1 : s.sym === 'ETH-USD' ? 10 : 100;

  const nEv = Math.round((5 + Math.random() * 9) * (1 + 5 * I));
  let buys = 0, sells = 0, cxl = 0, news = 0;

  for (let e = 0; e < nEv; e++) {
    const r = Math.random();
    const bias = crisis ? 0.32 : 0.5; // P(aggressor = buy); crisis → sell storms
    if (r < 0.42) {
      /* ---- NEW order ---- */
      const side: 'B' | 'S' = Math.random() < bias ? 'B' : 'S';
      const lvl = 1 + Math.floor(Math.pow(Math.random(), 1.6) * DEPTH);
      const px = side === 'B' ? s.mid - t * lvl : s.mid + t * lvl;
      const ice = Math.random() < 0.06 + 0.05 * I;
      const qty = (ice ? 40 + Math.random() * 260 : 0.5 + Math.random() * 18) / unit * unit;
      const id = `K${(s.seq++).toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;
      const qp = 1 + Math.floor(Math.random() * 24);
      s.orders.set(id, { id, px, qty, vis: ice ? qty * (0.05 + Math.random() * 0.1) : qty, side, ice, born: Date.now() });
      s.openOrders++;
      news++;
      pushTape(s, { id, ts: Date.now(), side, px, qty: ice ? Math.max(1, qty * 0.08) : qty, act: 'NEW', qp, ice });
      if (ice && Math.random() < 0.3) {
        const ev: IcebergEvent = { ts: Date.now(), sym: s.sym, px, estQty: qty, oid: id };
        s.icebergs.unshift(ev);
        if (s.icebergs.length > 14) s.icebergs.length = 14;
      }
    } else if (r < 0.68) {
      /* ---- CANCEL ---- */
      const keys = s.orders.keys();
      // pick a pseudo-random key without allocating an array
      const n = s.orders.size;
      if (n > 0) {
        let target = Math.floor(Math.random() * n);
        let picked: string | null = null;
        for (const k of keys) {
          if (target-- === 0) { picked = k; break; }
        }
        if (picked) {
          const o = s.orders.get(picked)!;
          s.orders.delete(picked);
          s.openOrders = Math.max(0, s.openOrders - 1);
          cxl++;
          pushTape(s, { id: o.id, ts: Date.now(), side: o.side, px: o.px, qty: o.vis, act: 'CXL', qp: 0, ice: o.ice });
        }
      }
    } else {
      /* ---- FILL / trade ---- */
      const buyAggr = Math.random() < bias;
      const qty = (0.4 + Math.random() * 14) * (crisis ? 3.2 : 1);
      if (buyAggr) buys += qty; else sells += qty;
      const id = `T${(s.seq++).toString(36).toUpperCase()}`;
      pushTape(s, {
        id, ts: Date.now(), side: buyAggr ? 'B' : 'S',
        px: buyAggr ? s.mid + t * 0.5 : s.mid - t * 0.5,
        qty, act: 'FILL', qp: 1 + Math.floor(Math.random() * 40), ice: false,
      });
      // micro impact on engine price
      if (st) {
        const imp = (buyAggr ? 1 : -1) * qty * 0.0000016 * unit;
        st.last = Math.max(t, st.last * (1 + imp));
      }
    }
  }

  /* ---- crisis liquidation cascade ---- */
  if (crisis && Math.random() < 0.05 * I) {
    let removed = 0;
    for (const [k, o] of s.orders) {
      if (o.side === 'B') { s.orders.delete(k); removed++; }
      if (removed > 60) break;
    }
    s.openOrders = Math.max(0, s.openOrders - removed);
    pushTape(s, { id: 'LIQ-BURST', ts: Date.now(), side: 'S', px: s.mid - t * 6, qty: removed, act: 'CXL', qp: 0, ice: false });
  }

  /* ---- metrics ---- */
  s.cvd.push(s.cvd.last() + buys - sells);
  const flow = buys + sells > 0 ? (buys - sells) / (buys + sells) : 0;
  s.ofi = clamp(s.ofi * 0.9 + flow * 0.12, -1, 1);
  const cxlRate = news + cxl > 0 ? cxl / (news + cxl) : 0;
  s.cancelRate = s.cancelRate * 0.92 + cxlRate * 0.08;
  s.tps = s.tps * 0.9 + nEv * (1 / 0.0625) * 0.1;

  /* ---- rebuild top-of-book ---- */
  const t2 = TICKS[s.sym] ?? 0.01;
  for (let i = 0; i < DEPTH; i++) {
    s.bidPx[i] = s.mid - t2 * (i + 1);
    s.askPx[i] = s.mid + t2 * (i + 1);
    s.bidSz[i] = clamp(s.bidSz[i] * (1 + (Math.random() - 0.5) * 0.08) - (crisis ? 0.4 : 0), 0.5, 400);
    s.askSz[i] = clamp(s.askSz[i] * (1 + (Math.random() - 0.5) * 0.08), 0.5, 400);
  }
}

export function ensureL3(): void {
  if (g.__kruppL3 || typeof window === 'undefined') return;
  g.__kruppL3 = new Map<string, Internal>();
  const states = new Map<string, Internal>();
  for (const s of SYMS) {
    const st = mkState(s);
    states.set(s, st);
    g.__kruppL3.set(s, st);
  }
  let seedCvd = 0;
  for (const [, s] of states) {
    for (let i = 0; i < 300; i++) { seedCvd = (Math.random() - 0.48) * 40; s.cvd.push(seedCvd); }
  }
  setInterval(() => {
    if (!g.__kruppL3) return;
    for (const [, s] of g.__kruppL3) step(s);
  }, 64);
}

export function getL3(sym: string): L3State | undefined {
  return g.__kruppL3?.get(sym);
}

export function l3Symbols(): string[] {
  return [...SYMS];
}
