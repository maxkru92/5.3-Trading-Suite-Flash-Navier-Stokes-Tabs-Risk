// ============================================================================
// KRUPP CAPITAL — QUANT ANALYSIS DATA AGGREGATOR
// Consolidates ALL dashboard datasets (FRED liquidity, CBOE vol, risk
// metrics, execution ledger, options, vol history, journal, market state)
// into a single unified row schema suitable for CSV/Excel/HTML export.
// Pure functions — no I/O, no React — callable from client (Zustand) or
// server (Prisma) depending on data source.
// ============================================================================

import type {
  Fill, OptTicket, CboeSnapshot, RiskMetrics, VolSnap,
  DeskPolicy, LogLine,
} from '@/lib/london/types';
import type { LiquidityState, MarketState } from '@/lib/krupp/types';

// ---------- Row schemas -----------------------------------------------------

export interface ExportRow {
  /** UTC ISO-8601 */
  timestamp: string;
  /** human-readable section: liquidity | volatility | risk | ledger | ... */
  section: string;
  /** instrument / row key (e.g. 'FED_BS', 'VIX', 'fill-id') */
  key: string;
  /** named measure / metric */
  metric: string;
  /** numeric or string value — stringified for CSV */
  value: string | number | null;
  /** unit ('$B', 'ticks', '%', 'lots', 'score', ...) */
  unit: string;
  /** regime at capture time (CALM | HIGH | CRISIS | '') */
  regime: string;
  /** source tag (CBOE-LIVE | KRUPP-PARITY | STORE | API) */
  source: string;
}

export interface ExportPayload {
  meta: {
    generatedAt: string;
    generatedAtUtcMs: number;
    version: string;
    rowCount: number;
    sections: string[];
  };
  rows: ExportRow[];
}

// ---------- Helpers ---------------------------------------------------------

function ts(ms: number | string | Date | null | undefined): string {
  if (ms == null) return '';
  const d = ms instanceof Date ? ms : new Date(typeof ms === 'string' ? ms : ms);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

function v(n: number | null | undefined, decimals = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (decimals === 0) return Math.round(n);
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}

function r(regime: string | null | undefined): string {
  return String(regime ?? '').toUpperCase();
}

// ---------- 4. Execution Ledger ---------------------------------------------

export function aggregateFills(fills: Fill[], regime: string): ExportRow[] {
  return fills.map((f) => ({
    timestamp: ts(f.ts),
    section: 'ledger',
    key: f.id,
    metric: `${f.kind}_${f.status}`,
    value: f.pnl != null ? v(f.pnl, 2) : null,
    unit: '$',
    regime: r(regime),
    source: 'LEDGER',
  }));
}

// ---------- 5. Options Desk -----------------------------------------------

export function aggregateOptions(tickets: OptTicket[], regime: string): ExportRow[] {
  return tickets.map((t) => ({
    timestamp: ts(t.ts),
    section: 'options',
    key: t.id,
    metric: `${t.optKind}_${t.status}`,
    value: t.pnl != null ? v(t.pnl, 2) : null,
    unit: '$',
    regime: r(regime),
    source: 'OPTIONS_DESK',
  }));
}

// ---------- 6. Volatility History (Persisted) -----------------------------

export function aggregateVolHistory(snaps: VolSnap[]): ExportRow[] {
  return snaps.map((s) => [
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'VIX',        value: v(s.vix, 2),        unit: 'pts',  regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'CONTANGO',    value: v(s.contango, 2),   unit: '%',   regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'MULTIPLIER', value: v(s.multiplier, 3), unit: 'x',   regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'PC_RATIO',   value: v(s.pcRatio, 3),   unit: 'x',   regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'ATM_IV',     value: v(s.atmIV, 2),     unit: '%',   regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'FLIP_STRIKE',value: v(s.flipStrike, 2),unit: 'pts',  regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'TOTAL_GEX',  value: v(s.totalGex, 0),  unit: '$',   regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'SPOT',       value: v(s.spot, 2),       unit: 'pts',  regime: r(s.regime), source: s.source },
    { timestamp: ts(s.ts), section: 'vol_history', key: 'SNAP', metric: 'SCORE',      value: v(s.score, 1),      unit: 'score',regime: r(s.regime), source: s.source },
  ]).flat();
}

// ---------- 7. Market State -----------------------------------------------

export function aggregateMarketState(ms: MarketState, regime: string): ExportRow[] {
  const now = ts(Date.now());
  return [
    { timestamp: now, section: 'market', key: 'CRISIS',    metric: 'active',   value: ms.crisis.active ? 1 : 0, unit: 'bool',  regime: r(regime), source: 'ENGINE' },
    { timestamp: now, section: 'market', key: 'CRISIS',    metric: 'phase',    value: ms.crisis.phase,              unit: '',     regime: r(regime), source: 'ENGINE' },
    { timestamp: now, section: 'market', key: 'CRISIS',    metric: 'intensity',value: v(ms.crisis.intensity, 2),  unit: '',     regime: r(regime), source: 'ENGINE' },
    { timestamp: now, section: 'market', key: 'CRISIS',    metric: 'count',    value: ms.crisis.count,              unit: '',     regime: r(regime), source: 'ENGINE' },
    { timestamp: now, section: 'market', key: 'INTERCEPT', metric: 'blockMR',  value: ms.interceptors.blockMR    ? 1 : 0, unit: 'bool', regime: r(regime), source: 'INTERCEPTOR' },
    { timestamp: now, section: 'market', key: 'INTERCEPT', metric: 'reduceSz', value: ms.interceptors.reduceSize ? 1 : 0, unit: 'bool', regime: r(regime), source: 'INTERCEPTOR' },
    { timestamp: now, section: 'market', key: 'INTERCEPT', metric: 'flatten',  value: ms.interceptors.flatten     ? 1 : 0, unit: 'bool', regime: r(regime), source: 'INTERCEPTOR' },
    { timestamp: now, section: 'market', key: 'VOL_COMPLEX',metric: 'regime',  value: ms.volComplex.regime,        unit: '',     regime: r(regime), source: 'ENGINE' },
    { timestamp: now, section: 'market', key: 'GARCH',     metric: 'vol',      value: v(ms.garchS, 4),            unit: 'pts',  regime: r(regime), source: 'ENGINE' },
    { timestamp: now, section: 'market', key: 'ENGINE',    metric: 'tickCount', value: ms.tickCount,               unit: 'ticks',regime: r(regime), source: 'ENGINE' },
  ];
}

// ---------- Master aggregator ---------------------------------------------

export function buildExportPayload(
  sources: {
    liq: LiquidityState;
    regime: string;
    cboe: CboeSnapshot | null;
    metrics: RiskMetrics;
    fills: Fill[];
    optTickets: OptTicket[];
    volHistory: VolSnap[];
    marketState: MarketState;
  },
  opts?: { onlyTables?: string[] },
): ExportPayload {
  const now = Date.now();
  const rows: ExportRow[] = [];
  const sections: string[] = [];

  const map: Record<string, () => ExportRow[]> = {
    liquidity:     () => aggregateLiquidity(sources.liq, sources.regime),
    volatility:    () => aggregateVolatility(sources.cboe),
    risk_metrics:  () => aggregateRiskMetrics(sources.metrics),
    ledger:        () => aggregateFills(sources.fills, sources.regime),
    options_desk:  () => aggregateOptions(sources.optTickets, sources.regime),
    vol_history:   () => aggregateVolHistory(sources.volHistory),
    market_state:  () => aggregateMarketState(sources.marketState, sources.regime),
  };

  const tables = opts?.onlyTables ?? Object.keys(map);
  for (const name of tables) {
    const fn = map[name];
    if (!fn) continue;
    const result = fn();
    if (result.length > 0) sections.push(name);
    rows.push(...result);
  }

  return {
    meta: {
      generatedAt: new Date(now).toISOString(),
      generatedAtUtcMs: now,
      version: '1.0.0',
      rowCount: rows.length,
      sections,
    },
    rows,
  };
}
