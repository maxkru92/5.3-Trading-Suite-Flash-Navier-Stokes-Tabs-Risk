/**
 * KRUPP CAPITAL — Global Type Contracts
 * Shared across the market engine, streaming services and all 13 desks.
 */
import type { Ring } from './ring';
import type { ContangoRegime } from './math';

export type InstrumentGroup =
  | 'IDX_FUT'
  | 'BOND_FUT'
  | 'YIELD'
  | 'METAL'
  | 'ENERGY'
  | 'FX_FUT'
  | 'STOCK'
  | 'ETF'
  | 'SECTOR_ETF'
  | 'CRYPTO'
  | 'VOL_IDX'
  | 'MACRO';

export type Sector = 'EQ' | 'RATES' | 'METAL' | 'ENERGY' | 'FX' | 'CRYPTO' | 'VOL' | 'CREDIT' | 'MACRO';

export interface InstDef {
  symbol: string;
  name: string;
  group: InstrumentGroup;
  sector: Sector;
  px0: number;
  /** per-tick stdev fraction (calm regime) */
  vol: number;
  dec: number;
  tick: number;
  /** base volume per tick */
  bvol: number;
  beta: number;
}

export interface Book {
  bidPx: Float32Array;
  bidSz: Float32Array;
  askPx: Float32Array;
  askSz: Float32Array;
  /** sequence for flash detection */
  seq: number;
}

export interface InstState {
  def: InstDef;
  last: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  oi: number;
  spreadBps: number;
  ofi: number;
  cvd: number;
  liq: number;
  /** implied vol in points (e.g. 14.2) for vol-sensitive assets */
  iv: number;
  /** realized vol in points (rolling, per-tick annualized proxy) */
  rv: number;
  changePct: number;
  /** pending flash-jump injection (crisis) */
  jump: number;
  hist: Ring;
  ivHist: Ring;
  ofiHist: Ring;
  book: Book;
}

export interface CrisisState {
  active: boolean;
  phase: 'NORMAL' | 'SHOCK' | 'LOCKDOWN' | 'RECOVERY';
  startedAt: number;
  endsAt: number;
  recoveredAt: number;
  intensity: number;
  count: number;
}

export interface InterceptorState {
  blockMR: boolean;
  reduceSize: boolean;
  flatten: boolean;
}

export interface VolComplexState {
  /** model ratio from CBOECollector anchors */
  contangoReal: Ring;
  /** raw market ratio VIX3M/VIX */
  contangoMarket: Ring;
  regime: ContangoRegime;
}

export interface StatPair {
  id: string;
  label: string;
  desc: string;
  aSym: string;
  bSym: string;
  mode: 'mul' | 'ratio' | 'logratio';
  spread: Ring;
  z: Ring;
  signal: 'FLAT' | 'LONG_SPREAD' | 'SHORT_SPREAD';
  severity: 'NONE' | 'WARN' | 'SEVERE';
  hl: number;
}

export interface LiquidityState {
  fed: number;
  ecb: number;
  boj: number;
  tga: number;
  rrp: number;
  fedH: Ring;
  ecbH: Ring;
  bojH: Ring;
  tgaH: Ring;
  rrpH: Ring;
  netH: Ring;
}

export interface MarketState {
  t: number;
  tickCount: number;
  inst: Record<string, InstState>;
  crisis: CrisisState;
  interceptors: InterceptorState;
  volComplex: VolComplexState;
  /** MS-GARCH(1,1) realized-vol proxy for SPX, in vol points */
  garch: Ring;
  garchS: number;
  statarb: StatPair[];
  liquidity: LiquidityState;
}

/* ------------- Crypto L3 MBO ------------- */
export type TapeAction = 'NEW' | 'CXL' | 'FILL';

export interface TapeEvent {
  id: string;
  ts: number;
  side: 'B' | 'S';
  px: number;
  qty: number;
  act: TapeAction;
  qp: number;
  ice: boolean;
}

export interface IcebergEvent {
  ts: number;
  sym: string;
  px: number;
  estQty: number;
  oid: string;
}

export interface L3State {
  sym: string;
  mid: number;
  cvd: Ring;
  ofi: number;
  cancelRate: number;
  tps: number;
  /** newest first, capped */
  tape: TapeEvent[];
  bidPx: Float32Array;
  bidSz: Float32Array;
  askPx: Float32Array;
  askSz: Float32Array;
  icebergs: IcebergEvent[];
  openOrders: number;
}

/* ------------- Infra / Scrapling / Firebase ------------- */
export type WsStatus = 'CONNECTED' | 'RECONNECTING' | 'STANDBY';

export interface WsFeed {
  name: string;
  status: WsStatus;
  latency: number;
}

export interface AuthToken {
  label: string;
  issuedAt: number;
  expAt: number;
  ttl0: number;
}

export interface InfraLog {
  t: number;
  level: 'INFO' | 'OK' | 'WARN' | 'CRIT';
  msg: string;
}

export interface ProxyStat {
  name: string;
  ring: Ring;
  ok: number;
  fail: number;
}

export interface InfraState {
  cfStatus: 'CLEAR' | 'CHALLENGE' | 'ROTATING' | 'BLOCKED';
  uaList: string[];
  uaIndex: number;
  proxies: ProxyStat[];
  tps: Ring;
  queue: Ring;
  success: Ring;
  ws: WsFeed[];
  tokens: AuthToken[];
  logs: InfraLog[];
  expired: number;
  reqOk: number;
  reqFail: number;
  scrapePerMin: number;
}

/* ------------- Derivatives (vol surface / GEX / max pain) ------------- */
export interface LadderRow {
  strike: number;
  ivC: number;
  ivP: number;
  bidC: number;
  askC: number;
  bidP: number;
  askP: number;
  deltaC: number;
  deltaP: number;
  gamma: number;
  thetaC: number;
  thetaP: number;
  vega: number;
  rhoC: number;
  rhoP: number;
  oic: number;
  oip: number;
  volC: number;
  volP: number;
}

export interface ExpMoveRow {
  dte: number;
  up: number;
  dn: number;
  iv: number;
}

export interface DerivsState {
  spot: number;
  atmVol: number;
  /** strikes = spot * mult[i], mult from 0.90..1.10 */
  mult: Float32Array;
  expiries: number[];
  /** [expiryIdx][strikeIdx] in vol points */
  iv: number[][];
  oiCall: Float32Array;
  oiPut: Float32Array;
  /** dealer GEX $ per strike (calls − puts convention) */
  gex: Float32Array;
  gexFlip: number;
  maxPain: number;
  pain: Float32Array;
  ladder: LadderRow[];
  expMove: ExpMoveRow[];
  updatedAt: number;
}
