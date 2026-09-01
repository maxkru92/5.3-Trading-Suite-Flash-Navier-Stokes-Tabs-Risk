/**
 * KRUPP CAPITAL — Instrument Universe
 * Full cross-asset universe with per-tick vol parameters, tick sizes
 * and sector factor loadings.
 */
import type { InstDef, InstrumentGroup, Sector } from './types';

function def(
  symbol: string,
  name: string,
  group: InstrumentGroup,
  sector: Sector,
  px0: number,
  vol: number,
  dec: number,
  tick: number,
  bvol: number,
  beta: number,
): InstDef {
  return { symbol, name, group, sector, px0, vol, dec, tick, bvol, beta };
}

export const INSTRUMENTS: InstDef[] = [
  /* ---- Volatility Complex (must stay first — iv pass reads them) ---- */
  def('VIX9D', 'CBOE 9-Day Vol Index', 'VOL_IDX', 'VOL', 14.24, 0.004, 2, 0.01, 0, 0),
  def('VIX', 'CBOE Volatility Index', 'VOL_IDX', 'VOL', 13.86, 0.004, 2, 0.01, 0, 0),
  def('VIX3M', 'CBOE 3-Month Vol Index', 'VOL_IDX', 'VOL', 15.12, 0.003, 2, 0.01, 0, 0),
  def('VIX6M', 'CBOE 6-Month Vol Index', 'VOL_IDX', 'VOL', 15.94, 0.0025, 2, 0.01, 0, 0),
  def('VVIX', 'CBOE VIX of VIX', 'VOL_IDX', 'VOL', 86.4, 0.006, 2, 0.05, 0, 0),
  def('SKEW', 'CBOE SKEW Index', 'VOL_IDX', 'VOL', 141.2, 0.0015, 2, 0.05, 0, 0),
  def('VXN', 'NASDAQ-100 Vol Index', 'VOL_IDX', 'VOL', 17.84, 0.005, 2, 0.01, 0, 0),
  def('RVX', 'RUSSELL-2000 Vol Index', 'VOL_IDX', 'VOL', 16.92, 0.005, 2, 0.01, 0, 0),
  def('VDAX', 'DAX Vol Index', 'VOL_IDX', 'VOL', 14.62, 0.0045, 2, 0.01, 0, 0),
  def('OVX', 'Crude Oil Vol Index', 'VOL_IDX', 'VOL', 31.24, 0.005, 2, 0.01, 0, 0),
  def('GVZ', 'Gold Vol Index', 'VOL_IDX', 'VOL', 15.42, 0.004, 2, 0.01, 0, 0),
  def('EVZ', 'Euro FX Vol Index', 'VOL_IDX', 'VOL', 9.86, 0.004, 2, 0.01, 0, 0),

  /* ---- Index Futures ---- */
  def('ES1!', 'S&P 500 E-mini', 'IDX_FUT', 'EQ', 5300.25, 0.00030, 2, 0.25, 1400, 1.0),
  def('NQ1!', 'NASDAQ-100 E-mini', 'IDX_FUT', 'EQ', 18540.0, 0.00042, 2, 0.25, 850, 1.12),
  def('RTY1!', 'RUSSELL-2000 E-mini', 'IDX_FUT', 'EQ', 2058.4, 0.00048, 2, 0.1, 320, 1.2),
  def('YM1!', 'DOW JONES E-mini', 'IDX_FUT', 'EQ', 39120.0, 0.00026, 1, 1, 260, 0.92),
  def('FDAX!', 'DAX Future', 'IDX_FUT', 'EQ', 18020.0, 0.00034, 1, 0.5, 180, 1.02),
  def('NK1!', 'NIKKEI-225 Future', 'IDX_FUT', 'EQ', 38560.0, 0.00038, 0, 5, 340, 1.05),
  def('FESX!', 'EURO STOXX 50 Future', 'IDX_FUT', 'EQ', 4962.0, 0.00032, 1, 1, 300, 0.98),

  /* ---- Bond Futures & Yields ---- */
  def('ZN1!', '10Y US Treasury Note', 'BOND_FUT', 'RATES', 110.42, 0.00018, 3, 0.015625, 900, -0.5),
  def('ZB1!', '30Y US Treasury Bond', 'BOND_FUT', 'RATES', 117.85, 0.00032, 3, 0.03125, 520, -0.7),
  def('JGB1!', '10Y JGB Future', 'BOND_FUT', 'RATES', 140.25, 0.00014, 3, 0.01, 700, -0.3),
  def('BUND1!', '10Y German Bund Future', 'BOND_FUT', 'RATES', 132.6, 0.00016, 3, 0.01, 650, -0.4),
  def('US2Y', 'US 2Y Yield', 'YIELD', 'RATES', 4.624, 0.0006, 3, 0.001, 0, 0.45),
  def('US10Y', 'US 10Y Yield', 'YIELD', 'RATES', 4.312, 0.0005, 3, 0.001, 0, 0.5),
  def('US10YR', 'US 10Y Real Yield', 'YIELD', 'RATES', 1.942, 0.00055, 3, 0.001, 0, 0.4),
  def('DE10Y', 'Germany 10Y Yield', 'YIELD', 'RATES', 2.452, 0.0005, 3, 0.001, 0, 0.4),
  def('JP10Y', 'Japan 10Y Yield', 'YIELD', 'RATES', 0.982, 0.0006, 3, 0.001, 0, 0.15),
  def('GB10Y', 'UK 10Y Yield', 'YIELD', 'RATES', 4.148, 0.00055, 3, 0.001, 0, 0.45),
  def('FR10Y', 'France 10Y Yield', 'YIELD', 'RATES', 2.958, 0.00055, 3, 0.001, 0, 0.45),

  /* ---- Precious / Industrial Metals ---- */
  def('GC1!', 'GOLD Future', 'METAL', 'METAL', 2384.6, 0.0004, 1, 0.1, 420, -0.12),
  def('SI1!', 'SILVER Future', 'METAL', 'METAL', 28.42, 0.00065, 3, 0.005, 380, 0.2),
  def('HG1!', 'COPPER Future', 'METAL', 'METAL', 4.425, 0.00055, 3, 0.0005, 310, 0.55),

  /* ---- Energies ---- */
  def('CL1!', 'WTI CRUDE Future', 'ENERGY', 'ENERGY', 78.24, 0.0007, 2, 0.01, 620, 0.32),
  def('NG1!', 'NATURAL GAS Future', 'ENERGY', 'ENERGY', 2.842, 0.0011, 3, 0.001, 540, 0.2),
  def('RB1!', 'RBOB GASOLINE Future', 'ENERGY', 'ENERGY', 2.452, 0.0008, 3, 0.0005, 280, 0.28),
  def('HO1!', 'ULSD HEATING OIL Future', 'ENERGY', 'ENERGY', 2.618, 0.0008, 3, 0.0005, 240, 0.28),

  /* ---- FX Futures ---- */
  def('6E1!', 'EURO FX Future', 'FX_FUT', 'FX', 1.0852, 0.00012, 4, 0.00005, 480, 0.15),
  def('6J1!', 'JAPANESE YEN Future', 'FX_FUT', 'FX', 0.006555, 0.00018, 6, 0.0000005, 420, -0.3),
  def('6B1!', 'BRITISH POUND Future', 'FX_FUT', 'FX', 1.2714, 0.00013, 4, 0.0001, 300, 0.18),
  def('6A1!', 'AUSTRALIAN DOLLAR Future', 'FX_FUT', 'FX', 0.6632, 0.00016, 4, 0.00005, 260, 0.35),
  def('6C1!', 'CANADIAN DOLLAR Future', 'FX_FUT', 'FX', 0.7312, 0.00013, 4, 0.00005, 220, 0.22),
  def('6F1!', 'SWISS FRANC Future', 'FX_FUT', 'FX', 0.8972, 0.00012, 4, 0.00005, 180, -0.25),

  /* ---- US / EU Equities ---- */
  def('AAPL', 'Apple Inc.', 'STOCK', 'EQ', 214.4, 0.00052, 2, 0.01, 42000, 1.05),
  def('MSFT', 'Microsoft Corp.', 'STOCK', 'EQ', 424.8, 0.00048, 2, 0.01, 28000, 1.0),
  def('NVDA', 'NVIDIA Corp.', 'STOCK', 'EQ', 128.6, 0.0009, 2, 0.01, 210000, 1.35),
  def('GOOGL', 'Alphabet Inc.', 'STOCK', 'EQ', 178.2, 0.00055, 2, 0.01, 31000, 1.02),
  def('AMZN', 'Amazon.com Inc.', 'STOCK', 'EQ', 186.4, 0.0006, 2, 0.01, 38000, 1.1),
  def('META', 'Meta Platforms', 'STOCK', 'EQ', 505.2, 0.00062, 2, 0.01, 16000, 1.12),
  def('TSLA', 'Tesla Inc.', 'STOCK', 'EQ', 197.6, 0.0011, 2, 0.01, 78000, 1.4),
  def('SHEL', 'Shell plc', 'STOCK', 'EQ', 64.52, 0.00045, 2, 0.01, 5200, 0.75),
  def('HSBA', 'HSBC Holdings', 'STOCK', 'EQ', 7.24, 0.0004, 2, 0.01, 6100, 0.8),
  def('SAP', 'SAP SE', 'STOCK', 'EQ', 178.4, 0.00042, 2, 0.01, 2400, 0.9),
  def('SIE', 'Siemens AG', 'STOCK', 'EQ', 176.2, 0.0004, 2, 0.01, 1700, 0.92),
  def('ALV', 'Allianz SE', 'STOCK', 'EQ', 262.4, 0.00036, 2, 0.01, 1100, 0.85),

  /* ---- Macro & Sector ETFs ---- */
  def('SPY', 'SPDR S&P 500 ETF', 'ETF', 'EQ', 545.2, 0.00029, 2, 0.01, 92000, 1.0),
  def('QQQ', 'Invesco QQQ Trust', 'ETF', 'EQ', 465.4, 0.0004, 2, 0.01, 58000, 1.12),
  def('GLD', 'SPDR Gold Shares', 'ETF', 'METAL', 218.6, 0.00038, 2, 0.01, 21000, 0.25),
  def('SLV', 'iShares Silver Trust', 'ETF', 'METAL', 26.32, 0.0006, 2, 0.01, 19000, 0.35),
  def('USO', 'US Oil Fund', 'ETF', 'ENERGY', 74.24, 0.00066, 2, 0.01, 9000, 0.32),
  def('IBIT', 'iShares Bitcoin Trust', 'ETF', 'CRYPTO', 38.42, 0.0009, 2, 0.01, 26000, 1.6),
  def('ARKK', 'ARK Innovation ETF', 'ETF', 'EQ', 44.62, 0.00085, 2, 0.01, 24000, 1.45),
  def('ARKB', 'ARK 21Shares Bitcoin ETF', 'ETF', 'CRYPTO', 51.28, 0.00095, 2, 0.01, 11000, 1.62),
  def('HYG', 'iShares High Yield Corp', 'ETF', 'CREDIT', 79.12, 0.00022, 2, 0.01, 45000, 0.7),
  def('XLK', 'Technology Select SPDR', 'SECTOR_ETF', 'EQ', 228.4, 0.00042, 2, 0.01, 31000, 1.15),
  def('XLF', 'Financial Select SPDR', 'SECTOR_ETF', 'EQ', 42.12, 0.0004, 2, 0.01, 68000, 1.0),
  def('XLV', 'Health Care SPDR', 'SECTOR_ETF', 'EQ', 148.2, 0.0003, 2, 0.01, 26000, 0.4),
  def('XLE', 'Energy Select SPDR', 'SECTOR_ETF', 'ENERGY', 92.54, 0.0005, 2, 0.01, 22000, 0.55),
  def('XLY', 'Cons Discr. SPDR', 'SECTOR_ETF', 'EQ', 178.6, 0.00042, 2, 0.01, 14000, 1.08),
  def('XLP', 'Cons Staples SPDR', 'SECTOR_ETF', 'EQ', 76.42, 0.00024, 2, 0.01, 19000, 0.35),
  def('XLI', 'Industrial SPDR', 'SECTOR_ETF', 'EQ', 124.8, 0.00036, 2, 0.01, 17000, 0.95),
  def('XLB', 'Materials SPDR', 'SECTOR_ETF', 'METAL', 102.4, 0.00038, 2, 0.01, 9000, 0.85),
  def('XLRE', 'Real Estate SPDR', 'SECTOR_ETF', 'RATES', 38.92, 0.00034, 2, 0.01, 10000, 0.25),
  def('XLU', 'Utilities SPDR', 'SECTOR_ETF', 'RATES', 68.24, 0.0003, 2, 0.01, 16000, 0.2),

  /* ---- Crypto (engine sim; L3 tape in l3service) ---- */
  def('BTC-USD', 'Bitcoin / USD', 'CRYPTO', 'CRYPTO', 64250.0, 0.0006, 1, 0.5, 42, 1.7),
  def('ETH-USD', 'Ethereum / USD', 'CRYPTO', 'CRYPTO', 3124.0, 0.0008, 2, 0.1, 380, 1.85),
  def('SOL-USD', 'Solana / USD', 'CRYPTO', 'CRYPTO', 148.2, 0.0011, 2, 0.01, 920, 2.0),

  /* ---- Central Bank Macro (driven by liquidityService) ---- */
  def('FED_BS', 'Fed Balance Sheet $B', 'MACRO', 'MACRO', 7192, 0, 0, 1, 0, 0),
  def('ECB_BS', 'ECB Balance Sheet $B', 'MACRO', 'MACRO', 6314, 0, 0, 1, 0, 0),
  def('BOJ_BS', 'BOJ Balance Sheet $B', 'MACRO', 'MACRO', 7428, 0, 0, 1, 0, 0),
  def('TGA', 'Treasury General Account $B', 'MACRO', 'MACRO', 742, 0, 0, 1, 0, 0),
  def('RRP', 'Overnight Reverse Repo $B', 'MACRO', 'MACRO', 612, 0, 0, 1, 0, 0),
];

export const G = {
  VOL_COMPLEX: ['VIX9D', 'VIX', 'VIX3M', 'VIX6M'],
  VOL_ASSETS: ['VIX', 'VXN', 'RVX', 'VDAX', 'OVX', 'GVZ', 'EVZ'],
  VOL_HUB: ['VVIX', 'SKEW'],
  INDEX_FUT: ['ES1!', 'NQ1!', 'RTY1!', 'YM1!', 'FDAX!', 'NK1!', 'FESX!'],
  BOND_FUT: ['ZN1!', 'ZB1!', 'JGB1!', 'BUND1!'],
  YIELDS: ['US2Y', 'US10Y', 'US10YR', 'DE10Y', 'JP10Y', 'GB10Y', 'FR10Y'],
  METALS: ['GC1!', 'SI1!', 'HG1!'],
  ENERGIES: ['CL1!', 'NG1!', 'RB1!', 'HO1!'],
  FX_FUT: ['6E1!', '6J1!', '6B1!', '6A1!', '6C1!', '6F1!'],
  STOCKS_US: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'],
  STOCKS_EU: ['SHEL', 'HSBA', 'SAP', 'SIE', 'ALV'],
  SECTOR_ETF: ['XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'XLP', 'XLI', 'XLB', 'XLRE', 'XLU'],
  MACRO_ETF: ['SPY', 'QQQ', 'GLD', 'SLV', 'USO', 'IBIT', 'ARKK', 'ARKB'],
  CRYPTO: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
} as const;

export const SYM_BY_GROUP: Record<string, string[]> = {
  IDX_FUT: [...G.INDEX_FUT],
  BOND_FUT: [...G.BOND_FUT],
  METAL: [...G.METALS],
  ENERGY: [...G.ENERGIES],
  FX_FUT: [...G.FX_FUT],
  STOCK: [...G.STOCKS_US, ...G.STOCKS_EU],
  SECTOR_ETF: [...G.SECTOR_ETF],
  ETF: [...G.MACRO_ETF, 'HYG'],
  CRYPTO: [...G.CRYPTO],
  VOL_IDX: ['VIX9D', 'VIX', 'VIX3M', 'VIX6M', 'VVIX', 'SKEW', 'VXN', 'RVX', 'VDAX', 'OVX', 'GVZ', 'EVZ'],
};
