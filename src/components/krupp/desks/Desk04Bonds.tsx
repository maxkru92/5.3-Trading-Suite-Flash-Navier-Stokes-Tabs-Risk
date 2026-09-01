'use client';
/**
 * KRUPP CAPITAL — DESK 04 · BOND FUTURES & SOVEREIGN DESK (deskId 3)
 *
 * Global yield vector map: hand-crafted stylized SVG world projection
 * (800×380 viewBox) with per-sovereign hotspots heat-filled by 10Y nominal
 * yield (amber → rose). Hover/click selects a country into the store
 * ('desk4') and drives the sovereign intelligence column:
 *   · 2Y/10Y spread in bps (US real US2Y, others synth = 10Y + s2s10 + noise)
 *   · curve-shift telemetry — 1s Ring(360) + delayed snapshot Ring
 *   · sovereign CDS proxy = cdsBase × (1 + 2.5 × crisis intensity) + noise
 *   · bond-option GEX metric ($B dealer gamma, random walk @1s)
 *   · sovereign risk badge: >100 STRESSED / >60 ELEVATED / else CONTAINED
 * Module-level persistent state + guarded 1s ensure loop. All chart draw
 * closures read module Rings — zero allocation per frame.
 */
import { useEffect } from 'react';
import { Globe2, ShieldAlert } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { G } from '@/lib/krupp/universe';
import { Ring } from '@/lib/krupp/ring';
import { clamp, lerp } from '@/lib/krupp/math';
import { fN, fSign, fPct, fBps, fCompact, fPx, toneNum } from '@/lib/krupp/format';
import { useKrupp, useRevision, useSelected } from '@/lib/krupp/store';
import { Panel, Badge, Stat, FlashAlert, SectionLabel, Tbl, Tr, Td, clsNum } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { KT } from '@/lib/theme';

/* ================= country configuration ================= */

interface CountryCfg {
  code: string;
  name: string;
  y10: string;
  /** real 2Y instrument, or null → synth y2 = y10 + s2s10 + noise */
  y2: string | null;
  fut: readonly string[];
  cdsBase: number;
  /** synthetic 2s10 offset: y2 = y10 + s2s10 (US fallback only) */
  s2s10: number;
  gex0: number;
  idx: number;
  cx: number;
  cy: number;
  lanchor: 'start' | 'end';
  lx: number;
  ly: number;
  blob: string;
}

const COUNTRIES: readonly CountryCfg[] = [
  {
    code: 'US', name: 'UNITED STATES', y10: 'US10Y', y2: 'US2Y', fut: ['ZN1!', 'ZB1!'],
    cdsBase: 38, s2s10: -2.31, gex0: 4.6, idx: 0, cx: 176, cy: 148,
    lanchor: 'start', lx: 190, ly: 142,
    blob: 'M 48 150 C 42 108 78 66 132 52 C 186 38 252 42 296 66 C 330 84 344 112 336 140 C 328 166 306 172 296 194 C 284 220 268 252 238 268 C 216 280 200 262 196 238 C 190 214 168 208 142 196 C 108 180 60 176 48 150 Z',
  },
  {
    code: 'GB', name: 'UNITED KINGDOM', y10: 'GB10Y', y2: null, fut: [],
    cdsBase: 58, s2s10: -0.10, gex0: 0.9, idx: 1, cx: 414, cy: 100,
    lanchor: 'end', lx: 401, ly: 88,
    blob: 'M 402 86 C 413 74 429 78 433 92 C 436 104 427 119 415 121 C 403 123 396 98 402 86 Z',
  },
  {
    code: 'FR', name: 'FRANCE', y10: 'FR10Y', y2: null, fut: [],
    cdsBase: 78, s2s10: 0.05, gex0: 0.7, idx: 2, cx: 438, cy: 134,
    lanchor: 'start', lx: 448, ly: 148,
    blob: 'M 422 120 C 434 112 450 116 456 128 C 461 140 452 152 440 154 C 427 156 416 132 422 120 Z',
  },
  {
    code: 'DE', name: 'GERMANY', y10: 'DE10Y', y2: null, fut: ['BUND1!'],
    cdsBase: 22, s2s10: 0.18, gex0: 2.2, idx: 3, cx: 458, cy: 108,
    lanchor: 'start', lx: 470, ly: 94,
    blob: 'M 445 94 C 457 86 471 90 476 102 C 480 113 472 124 460 125 C 448 126 439 106 445 94 Z',
  },
  {
    code: 'JP', name: 'JAPAN', y10: 'JP10Y', y2: null, fut: ['JGB1!'],
    cdsBase: 41, s2s10: -0.25, gex0: 1.6, idx: 4, cx: 716, cy: 138,
    lanchor: 'end', lx: 702, ly: 128,
    blob: 'M 724 104 C 736 96 749 104 747 118 C 744 133 736 148 726 160 C 718 170 708 165 710 153 C 712 138 717 112 724 104 Z',
  },
];

/** decorative landmasses (no hotspots) — stylized blobs */
const DECOR: readonly string[] = [
  'M 268 32 C 292 22 318 28 324 44 C 328 58 312 68 292 66 C 272 64 258 46 268 32 Z', // Greenland
  'M 230 282 C 252 268 280 274 290 296 C 300 318 291 344 275 360 C 261 374 245 368 239 348 C 231 326 219 296 230 282 Z', // South America
  'M 402 136 C 412 130 424 134 427 144 C 429 153 419 160 408 158 C 398 156 396 142 402 136 Z', // Iberia
  'M 466 50 C 480 40 498 46 502 60 C 505 72 493 82 479 78 C 466 74 458 58 466 50 Z', // Scandinavia
  'M 456 146 C 464 142 471 148 469 156 C 467 164 457 168 452 162 C 448 156 450 150 456 146 Z', // Italy
  'M 426 176 C 450 162 488 164 510 184 C 530 202 532 230 518 256 C 505 280 486 300 466 298 C 447 296 442 272 434 250 C 426 228 412 190 426 176 Z', // Africa
  'M 518 64 C 558 38 630 34 682 54 C 722 70 738 98 728 124 C 718 148 692 150 674 168 C 656 186 638 208 612 208 C 590 208 584 186 564 178 C 540 168 514 148 506 122 C 498 98 500 76 518 64 Z', // Asia
  'M 618 280 C 642 266 676 270 690 290 C 702 308 690 328 666 332 C 642 336 608 314 618 280 Z', // Australia
];

/** dashed yield-vector mesh between hotspot anchors */
const LINKS: readonly [string, string][] = [
  ['US', 'GB'], ['GB', 'FR'], ['FR', 'DE'], ['US', 'JP'], ['DE', 'JP'],
];

const FUT_CC: Record<string, string> = { 'ZN1!': 'US', 'ZB1!': 'US', 'JGB1!': 'JP', 'BUND1!': 'DE' };
const YIELD_CC: Record<string, string> = {
  US2Y: 'US', US10Y: 'US', US10YR: 'US', DE10Y: 'DE', JP10Y: 'JP', GB10Y: 'GB', FR10Y: 'FR',
};

/* ================= module-level persistent state ================= */

const curve10: Record<string, Ring> = {};
const slow10: Record<string, Ring> = {};
const cds: Record<string, number> = {};
const cdsNoise: Record<string, number> = {};
const gex: Record<string, number> = {};

for (const c of COUNTRIES) {
  curve10[c.code] = new Ring(360);
  slow10[c.code] = new Ring(360);
  cds[c.code] = c.cdsBase;
  cdsNoise[c.code] = 0;
  gex[c.code] = c.gex0;
}

let tick1s = 0;
let booted = false;

/** seed 300 samples of 1s curve history; snapshot ring = same walk delayed 60 samples */
function seedCurves(): void {
  for (const c of COUNTRIES) {
    const st = ms.inst[c.y10];
    let v = st ? st.last : 2;
    const walk: number[] = [];
    for (let i = 0; i < 300; i++) {
      v += (Math.random() * 2 - 1) * 0.0021;
      walk.push(v);
      curve10[c.code].push(v);
    }
    for (let i = 0; i < 240; i++) slow10[c.code].push(walk[i]);
  }
}

function tickDesk04(): void {
  tick1s++;
  const I = ms.crisis.intensity;
  for (const c of COUNTRIES) {
    const st = ms.inst[c.y10];
    curve10[c.code].push(st ? st.last : 2);
    if (tick1s % 60 === 0) slow10[c.code].push(curve10[c.code].last());
    cdsNoise[c.code] = cdsNoise[c.code] * 0.95 + (Math.random() * 2 - 1) * 1.6;
    cds[c.code] = Math.max(2, c.cdsBase * (1 + 2.5 * I) + cdsNoise[c.code]);
    gex[c.code] = clamp(
      gex[c.code] + (Math.random() * 2 - 1) * 0.11 * (1 + 2.5 * I) + (c.gex0 - gex[c.code]) * 0.02,
      0.15, 14,
    );
  }
}

/** guarded ensure pattern — 1s cadence for curve history, CDS proxy, GEX walk */
export function ensureDesk04(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  seedCurves();
  tickDesk04();
  setInterval(tickDesk04, 1000);
}

/* ================= helpers ================= */

const HEAT_LO = [245, 158, 11]; // amber-500
const HEAT_HI = [244, 63, 94]; // rose-500

function yieldHeat(y: number): string {
  const t = clamp((y - 0.2) / 4.6, 0, 1);
  const r = Math.round(lerp(HEAT_LO[0], HEAT_HI[0], t));
  const g = Math.round(lerp(HEAT_LO[1], HEAT_HI[1], t));
  const b = Math.round(lerp(HEAT_LO[2], HEAT_HI[2], t));
  return `rgb(${r},${g},${b})`;
}

function synth2Y(c: CountryCfg): number {
  const y10v = ms.inst[c.y10]?.last ?? NaN;
  if (c.y2) {
    const st = ms.inst[c.y2];
    if (st) return st.last;
  }
  return y10v + c.s2s10 + Math.sin(ms.t / 5000 + c.idx * 1.7) * 0.012;
}

function riskOf(v: number): { tone: 'emerald' | 'rose'; label: string; pulse: boolean } {
  if (v > 100) return { tone: 'rose', label: 'STRESSED', pulse: true };
  if (v > 60) return { tone: 'rose', label: 'ELEVATED', pulse: false };
  return { tone: 'emerald', label: 'CONTAINED', pulse: false };
}

/* ================= component ================= */

export default function Desk04Bonds() {
  useRevision(); // 5 Hz re-render of stats / tables / SVG labels
  useEffect(() => {
    ensureDesk04();
  }, []);

  const sel = useSelected('desk4', 'US');
  const select = useKrupp((s) => s.select);
  const c = COUNTRIES.find((x) => x.code === sel) ?? COUNTRIES[0];

  const y10st = ms.inst[c.y10];
  const y10v = y10st ? y10st.last : NaN;
  const y2v = synth2Y(c);
  const spreadBps = (y2v - y10v) * 100;
  const cdsV = cds[c.code];
  const gexV = gex[c.code];
  const risk = riskOf(cdsV);
  const curRing = curve10[c.code];
  const snapRing = slow10[c.code];
  const deltaBps = (curRing.last() - snapRing.last()) * 100;

  /* desk-level aggregates */
  const y10s = COUNTRIES.map((x) => ms.inst[x.y10]?.last ?? 0);
  const mean10 = y10s.reduce((a, b) => a + b, 0) / y10s.length;
  const disp10 = Math.sqrt(y10s.reduce((a, b) => a + (b - mean10) * (b - mean10), 0) / y10s.length);
  const cdsVals = COUNTRIES.map((x) => cds[x.code]);
  const cdsMean = cdsVals.reduce((a, b) => a + b, 0) / cdsVals.length;
  const breadth = cdsVals.filter((v) => v > 60).length;

  return (
    <DeskFrame
      deskId={3}
      title="BOND FUTURES & SOVEREIGN DESK"
      code="RATES/GLOBAL-YIELD-VECTOR"
      accent="amber"
      right={
        <Badge tone={ms.crisis.active ? 'rose' : 'emerald'} pulse={ms.crisis.active}>
          {ms.crisis.active ? `CRISIS ${(ms.crisis.intensity * 100).toFixed(0)}%` : 'CALM REGIME'}
        </Badge>
      }
    >
      {/* -------- desk-level aggregates -------- */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="GLOBAL 10Y MEAN" value={`${fN(mean10, 3)}%`} sub="5 SOVEREIGN VECTOR" tone="text-amber-300" />
        <Stat label="YIELD DISPERSION" value={`${fN(disp10, 3)}pts`} sub="σ ACROSS SOVEREIGNS" tone="text-zinc-100" />
        <Stat label="SOVEREIGN CDS MEAN" value={`${fN(cdsMean, 1)} bps`} sub={`β2.5 × CRISIS INTENSITY`} tone={cdsMean > 60 ? 'text-rose-400' : 'text-emerald-400'} />
        <Stat label="RISK BREADTH" value={`${breadth} / 5 ELEVATED`} sub="CDS PROXY > 60 BPS" tone={breadth > 0 ? 'text-rose-400' : 'text-emerald-400'} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* ================= map column (xl left 2/3) ================= */}
        <div className="order-2 flex flex-col gap-3 xl:order-1 xl:col-span-2">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <Globe2 size={12} className="text-amber-300" />
                GLOBAL YIELD VECTOR MAP
              </span>
            }
            right={
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">10Y heat</span>
                <span
                  className="h-2 w-16 rounded-sm"
                  style={{ background: 'linear-gradient(90deg, rgb(245,158,11), rgb(244,63,94))' }}
                />
                <span className="font-mono text-[9px] text-zinc-600">0.2% → 4.8%</span>
              </div>
            }
          >
            <svg
              viewBox="0 0 800 380"
              className="h-auto w-full select-none"
              role="img"
              aria-label="Stylized global 10Y yield heat map"
            >
              <rect x="0" y="0" width="800" height="380" rx="8" fill="#070b12" />
              {[100, 200, 300, 400, 500, 600, 700].map((x) => (
                <line key={`gx${x}`} x1={x} y1={10} x2={x} y2={370} stroke="#101827" strokeWidth="1" />
              ))}
              {[63, 127, 190, 253, 316].map((y) => (
                <line key={`gy${y}`} x1={10} y1={y} x2={790} y2={y} stroke="#101827" strokeWidth="1" />
              ))}

              {DECOR.map((d, i) => (
                <path key={`decor${i}`} d={d} fill="#0c1320" stroke="#1a2331" strokeWidth="1" />
              ))}

              {/* yield vector mesh */}
              {LINKS.map(([a, b], i) => {
                const ca = COUNTRIES.find((x) => x.code === a);
                const cb = COUNTRIES.find((x) => x.code === b);
                if (!ca || !cb) return null;
                return (
                  <line
                    key={`lnk${i}`}
                    x1={ca.cx} y1={ca.cy} x2={cb.cx} y2={cb.cy}
                    stroke={KT('warnDeep')} strokeWidth="1" strokeDasharray="2 4" opacity="0.16"
                  />
                );
              })}

              {COUNTRIES.map((ct) => {
                const y10v = ms.inst[ct.y10]?.last ?? 0;
                const heat = yieldHeat(y10v);
                const active = ct.code === sel;
                return (
                  <g
                    key={ct.code}
                    className="cursor-pointer"
                    onMouseEnter={() => select('desk4', ct.code)}
                    onClick={() => select('desk4', ct.code)}
                  >
                    <title>{`${ct.name} — 10Y ${fN(y10v, 3)}%`}</title>
                    <path
                      d={ct.blob}
                      fill={heat}
                      fillOpacity={active ? 0.32 : 0.14}
                      stroke={active ? KT('warn') : KT('border4')}
                      strokeWidth={active ? 1.4 : 1}
                    />
                    <circle
                      cx={ct.cx} cy={ct.cy} r={10}
                      fill="none" stroke={heat} strokeWidth="1.4" opacity="0.55"
                      className="animate-ping"
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    />
                    {active && (
                      <circle cx={ct.cx} cy={ct.cy} r={13.5} fill="none" stroke={KT('warn')} strokeWidth="1" strokeDasharray="3 2" />
                    )}
                    <circle cx={ct.cx} cy={ct.cy} r={4.6} fill={heat} stroke={KT('bg')} strokeWidth="1" />
                    <text
                      x={ct.lx} y={ct.ly} textAnchor={ct.lanchor}
                      className="font-mono" fontSize="11" fontWeight="700"
                      fill={active ? KT('warnSoft') : KT('textDim')}
                    >
                      {ct.code}
                    </text>
                    <text x={ct.lx} y={ct.ly + 13} textAnchor={ct.lanchor} className="font-mono" fontSize="9.5" fill={KT('zinc')}>
                      {fN(y10v, 3)}%
                    </text>
                    <text x={ct.lx} y={ct.ly + 25} textAnchor={ct.lanchor} className="font-mono" fontSize="7.5" fill={KT('axisFaint')}>
                      {ct.name}
                    </text>
                  </g>
                );
              })}

              <text x="12" y="371" className="font-mono" fontSize="8.5" fill={KT('axisFaint')}>
                STYLIZED PROJECTION — NOT TO SCALE · HOTSPOT HEAT = 10Y NOMINAL YIELD · HOVER/CLICK TO SELECT SOVEREIGN
              </text>
            </svg>
          </Panel>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="BOND FUTURES BOARD">
              <Tbl head={['SYM', 'NAME', 'LAST', 'CHG%', 'BID', 'ASK', 'SPRD', 'OI', 'VOL', 'LIQ']} maxH="max-h-64">
                {G.BOND_FUT.map((sym) => {
                  const st = ms.inst[sym];
                  if (!st) return null;
                  return (
                    <tr
                      key={sym}
                      className={`cursor-pointer border-b border-kinset hover:bg-kpanel2 ${FUT_CC[sym] === sel ? 'bg-amber-950/20' : ''}`}
                      onClick={() => select('desk4', FUT_CC[sym] ?? 'US')}
                    >
                      <Td className="font-semibold text-amber-300">{sym}</Td>
                      <Td className="text-zinc-500">{st.def.name}</Td>
                      <Td className="font-semibold text-zinc-100">{fPx(st.last, st.def.dec)}</Td>
                      <Td className={toneNum(st.changePct)}>{fPct(st.changePct)}</Td>
                      <Td className="text-zinc-400">{fPx(st.bid, st.def.dec)}</Td>
                      <Td className="text-zinc-400">{fPx(st.ask, st.def.dec)}</Td>
                      <Td className="text-zinc-400">{fN(st.spreadBps, 1)}</Td>
                      <Td className="text-zinc-400">{fCompact(st.oi)}</Td>
                      <Td className="text-zinc-400">{fCompact(st.volume)}</Td>
                      <Td className="text-zinc-300">{fN(st.liq, 0)}</Td>
                    </tr>
                  );
                })}
              </Tbl>
            </Panel>

            <Panel title="SOVEREIGN YIELD GRID">
              <Tbl head={['SYM', 'CC', 'LAST %', 'Δ 1D', 'OFI', 'LIQ']} maxH="max-h-64">
                {G.YIELDS.map((sym) => {
                  const st = ms.inst[sym];
                  if (!st) return null;
                  const d1dBps = (st.last - st.prevClose) * 100;
                  return (
                    <tr
                      key={sym}
                      className={`cursor-pointer border-b border-kinset hover:bg-kpanel2 ${YIELD_CC[sym] === sel ? 'bg-amber-950/20' : ''}`}
                      onClick={() => select('desk4', YIELD_CC[sym] ?? 'US')}
                    >
                      <Td className="font-semibold text-amber-300">{sym}</Td>
                      <Td className="text-zinc-500">{YIELD_CC[sym] ?? '—'}</Td>
                      <Td className="font-semibold text-zinc-100">{fN(st.last, 3)}</Td>
                      <Td className={toneNum(d1dBps)}>{fSign(d1dBps, 1)}bp</Td>
                      <Td className={toneNum(st.ofi)}>{fSign(st.ofi, 2)}</Td>
                      <Td className="text-zinc-300">{fN(st.liq, 0)}</Td>
                    </tr>
                  );
                })}
              </Tbl>
            </Panel>
          </div>
        </div>

        {/* ================= intelligence column (xl right 1/3) ================= */}
        <div className="order-1 flex flex-col gap-3 xl:order-2">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <ShieldAlert size={12} className="text-amber-300" />
                SOVEREIGN INTELLIGENCE
              </span>
            }
            right={<Badge tone={risk.tone} pulse={risk.pulse}>{risk.label}</Badge>}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[12px] font-bold tracking-wider text-zinc-200">{c.name}</span>
              <span className="font-mono text-[9.5px] text-zinc-500">
                {c.fut.length > 0 ? c.fut.join(' · ') : 'NO LISTED FUT'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="10Y NOMINAL"
                value={`${fN(y10v, 3)}%`}
                sub={y10st ? `Δ1D ${fSign((y10st.last - y10st.prevClose) * 100, 1)}bp` : '—'}
                tone={y10st ? toneNum(y10st.last - y10st.prevClose) : 'text-zinc-100'}
              />
              <Stat
                label={c.y2 ? '2Y NOMINAL' : '2Y SYNTHETIC'}
                value={`${fN(y2v, 3)}%`}
                sub={c.y2 ? 'REAL INSTRUMENT' : `10Y ${fSign(c.s2s10, 2)} + NOISE`}
                tone="text-zinc-100"
              />
              <Stat
                label="2s10s SPREAD"
                value={fBps(spreadBps, 1)}
                sub="CURVE SLOPE VECTOR"
                tone={clsNum(spreadBps)}
              />
              <Stat
                label="CDS PROXY 5Y"
                value={`${fN(cdsV, 1)} bps`}
                sub={`BASE ${c.cdsBase} · CRISIS β2.5`}
                tone={risk.tone === 'rose' ? 'text-rose-400' : 'text-emerald-400'}
              />
              <Stat
                label="BOND OPT GEX"
                value={`${fN(gexV, 2)} $B`}
                sub="DEALER GAMMA RANDOM WALK"
                tone={clsNum(gexV - c.gex0)}
              />
              <Stat
                label="CURVE Δ vs SNAPSHOT"
                value={fBps(deltaBps, 1)}
                sub="NOW − SNAPSHOT (−60s+)"
                tone={clsNum(deltaBps)}
              />
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <SectionLabel>10Y CURVE SHIFT · {c.code}</SectionLabel>
                <span className="font-mono text-[9px] text-zinc-600">1s SAMPLES · RING 360</span>
              </div>
              <LineChart
                height="h-44"
                fmtV={(v) => v.toFixed(3)}
                series={[
                  { label: '10Y NOW', color: KT('warn'), data: () => curRing ?? null, width: 1.6 },
                  { label: 'SNAPSHOT -60s', color: KT('zinc'), dash: [4, 3], data: () => snapRing ?? null },
                ]}
              />
            </div>

            <FlashAlert
              className="mt-3"
              active={cdsV > 100 || (ms.crisis.active && cdsV > 60)}
              tone="rose"
              title={`SOVEREIGN STRESS SIGNAL — ${c.code}`}
            >
              CDS proxy {fN(cdsV, 1)} bps — hedge sovereign duration exposure, widen curve-trade stops, monitor
              basis ZN/BUND for cross-market contagion.
            </FlashAlert>
          </Panel>

          <Panel title="SOVEREIGN RISK MATRIX">
            <Tbl head={['CC', '10Y %', '2s10s', 'CDS', 'GEX $B', 'RISK']} maxH="max-h-56">
              {COUNTRIES.map((ct) => {
                const ctRisk = riskOf(cds[ct.code]);
                const ctSpread = (synth2Y(ct) - (ms.inst[ct.y10]?.last ?? NaN)) * 100;
                return (
                  <tr
                    key={ct.code}
                    className={`cursor-pointer border-b border-kinset hover:bg-kpanel2 ${ct.code === sel ? 'bg-amber-950/20' : ''}`}
                    onClick={() => select('desk4', ct.code)}
                  >
                    <Td className={`font-bold ${ct.code === sel ? 'text-amber-300' : 'text-zinc-300'}`}>{ct.code}</Td>
                    <Td className="text-zinc-200">{fN(ms.inst[ct.y10]?.last ?? NaN, 3)}</Td>
                    <Td className={clsNum(ctSpread)}>{fSign(ctSpread, 1)}</Td>
                    <Td className={ctRisk.tone === 'rose' ? 'text-rose-400' : 'text-emerald-400'}>{fN(cds[ct.code], 1)}</Td>
                    <Td className="text-zinc-300">{fN(gex[ct.code], 2)}</Td>
                    <Td>
                      <Badge tone={ctRisk.tone} pulse={ctRisk.pulse}>{ctRisk.label}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </Tbl>
          </Panel>
        </div>
      </div>
    </DeskFrame>
  );
}
