// ============================================================================
// KRUPP CAPITAL // SHARED CONTRACT TYPES (mirror of krupp-stream service)
// ============================================================================

export type Regime = 'CALM' | 'HIGH' | 'CRISIS'
export type FeedMode = 'LIVE' | 'SIM_BRIDGE' | 'FALLBACK'
export type AuthLevel = 'L1' | 'L2' | 'L3'

export interface Tick {
  sym: string
  t: number
  price: number
  open: number
  volume: number
  high: number
  low: number
}

export interface BookLevel { price: number; size: number }

export interface Book {
  sym: string
  ts: number
  mid: number
  bids: BookLevel[]
  asks: BookLevel[]
  spread: number
  spreadTicks: number
  imbalance: number
  /** desk-side stash: last tape payload for this book (set by the feed orchestrator) */
  tape?: TapeItem[]
}

export interface TapeItem { t: number; price: number; size: number; side: 'B' | 'S' }

export interface LseStatus {
  authenticated: boolean
  level: AuthLevel
  mode: FeedMode
  message: string
  since: number
  tokenMask: string | null
  tokenKind: string | null
  endpoint: string
  baseUrl: string
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
  gex: number
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

// KRUPP CAPITAL // PERSISTED VOLATILITY SNAPSHOT — server-side VolSnapshot row
// (SQLite). Captured client-side every 60s; survives reloads/boots. Powers the
// CBOE panel's cross-boot vol strip and post-mortem reviews.
export interface VolSnap {
  ts: number
  vix: number
  contango: number
  multiplier: number
  pcRatio: number
  atmIV: number
  flipStrike: number
  totalGex: number
  spot: number
  score: number
  regime: Regime
  source: string
}

export interface LogLine {
  id: string
  ts: number
  source: string
  level: 'info' | 'warn' | 'crit'
  message: string
}

export interface EngineState {
  regime: Regime
  crash: { active: boolean; severity: number; startedAt: number; endsAt: number; vacuumUntil: number; recoverUntil: number }
  tickCount: number
  uptimeMs: number
  instruments: Array<{ sym: string; name: string; kind: string; last: number }>
}

export interface Pos { sym: string; qty: number; avgPx: number }

// KRUPP CAPITAL // DESK SESSIONS — gap-based boot-session aggregates
// (server-side replay of the persisted FUT stream; a >30min fill gap
// starts a new session; each session starts flat).
export interface DeskSession {
  startTs: number
  endTs: number
  fills: number
  blocked: number
  volume: number
  realized: number
  /** end-of-session replayed position (null = flat) */
  pos?: { sym: string; qty: number; avgPx: number } | null
}

// KRUPP CAPITAL // OPTIONS DESK — context ticket from the IV surface (paper)
// qty > 0 = long premium, qty < 0 = short premium; multiplier $100/pt (SPX-style).
export interface OptTicket {
  id: string
  ts: number
  sym: string
  optKind: 'CALL' | 'PUT'
  strike: number
  expiry: '0DTE' | '1DTE'
  qty: number
  entryPx: number
  entryIV: number
  status: 'OPEN' | 'CLOSED'
  closePx?: number
  pnl?: number
}

export interface Fill {
  id: string
  ts: number
  sym: string
  side: 'BUY' | 'SELL'
  qty: number
  px: number
  slipTicks: number
  status: 'FILLED' | 'BLOCKED' | 'FLATTEN'
  reason?: string
  pnl?: number
}

export interface RiskMetrics {
  ts: number
  hawkes: number          // λ_t
  toxZ: number
  viscosity: number
  viscRatio: number       // viscosity / baseline
  jerk: number
  jerkZ: number
  entropy: number
  hist: number[]          // 10-bin normalized histogram of |log returns|
  score: number
  regime: Regime
  shock: boolean          // jerkZ > 3
  interceptors: { lock: boolean; scale: boolean; kill: boolean }
  policy: { lockChaos: number; scaleVisc: number; killScore: number }
  reasons: { lock: string; scale: string; kill: string }
}

export const INSTRUMENT_META = [
  { sym: 'ES', name: 'E-MINI S&P 500', kind: 'CME_FUTURE' },
  { sym: 'NQ', name: 'E-MINI NASDAQ 100', kind: 'CME_FUTURE' },
  { sym: 'SPY', name: 'SPDR S&P 500 ETF', kind: 'EQUITY' },
] as const
