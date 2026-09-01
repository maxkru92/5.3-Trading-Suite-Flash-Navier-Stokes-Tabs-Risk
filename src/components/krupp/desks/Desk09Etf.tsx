'use client';
/**
 * KRUPP CAPITAL — Desk 09 · SPDR & MACRO ETF DESK — SECTOR ROTATION
 * Sub-tab 1: 10-fund SPDR sector matrix (heatmap), momentum-rank rotation
 * index and rotation-badged quotes. Sub-tab 2: 8 pillar macro ETF profile
 * cards with 24 h creation/redemption flow random walk + crisis AP stress.
 *
 * Heatmap values(), BarChart bars() and Sparkline data() all return
 * module-level reused arrays — nothing is allocated inside draw closures.
 * Module timers follow the guarded globalThis ensure pattern.
 */
import { LayoutGrid, RotateCw, Boxes } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { G } from '@/lib/krupp/universe';
import { clamp, gauss, zOf } from '@/lib/krupp/math';
import { fCompact, fN, fPct, fPx, fSign } from '@/lib/krupp/format';
import { useRevision, useSubTab } from '@/lib/krupp/store';
import { DeskFrame, SubPane } from '@/components/krupp/DeskFrame';
import { Panel, Badge, Stat, FlashAlert, Tbl, Tr, Td, clsNum } from '@/components/krupp/ui';
import { Heatmap } from '@/components/krupp/charts/Heatmap';
import { BarChart, type BarSpec } from '@/components/krupp/charts/BarChart';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { KT } from '@/lib/theme';

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const SECTORS: string[] = [...G.SECTOR_ETF];
const MACRO: string[] = [...G.MACRO_ETF];
const NS = SECTORS.length; // 10
const NM = MACRO.length; // 8

const HEAT_COLS = ['LAST', 'CHG%', '1D-Z', 'OFI', 'IV', 'LIQ'];

/* ------------------------------------------------------------------ *
 * Pillar ETF static profile records (aum $B / er % / tracking / note)
 * ------------------------------------------------------------------ */
interface FundProfile {
  aum: number;
  er: number;
  tracking: string;
  note: string;
}

const FUND: Record<string, FundProfile> = {
  SPY:  { aum: 542.0, er: 0.0945, tracking: 'S&P 500 TR INDEX',           note: 'CORE BETA — CREATION UNIT 50K NAV' },
  QQQ:  { aum: 288.0, er: 0.20,   tracking: 'NASDAQ-100 INDEX',           note: 'NASDAQ-100 NON-LEVERAGED CORE' },
  GLD:  { aum: 68.4,  er: 0.40,   tracking: 'LBMA GOLD PRICE PM',         note: 'ALLOCATED BULLION TRUST' },
  SLV:  { aum: 14.2,  er: 0.50,   tracking: 'LBMA SILVER PRICE',          note: 'ALLOCATED SILVER TRUST' },
  USO:  { aum: 1.3,   er: 0.78,   tracking: 'BCM WTI CRUDE FUT LADDER',   note: 'FUTURES-BASED OIL EXPOSURE — K-1' },
  IBIT: { aum: 21.4,  er: 0.25,   tracking: 'COINBASE BTC/USD SPOT REF',  note: 'SPOT BTC — 1:1 BITCOIN NAV TRACKER' },
  ARKK: { aum: 7.1,   er: 0.75,   tracking: 'ACTIVE — NO INDEX BENCHMARK', note: 'ACTIVE DISRUPTION BOOK — HIGH TURNOVER' },
  ARKB: { aum: 12.8,  er: 0.21,   tracking: 'CME CF BITCOIN REF — NY',    note: 'SPOT BTC ALT VEHICLE' },
};

/* ------------------------------------------------------------------ *
 * Module-level persistent state (zero-GC, survives tab switches)
 * ------------------------------------------------------------------ */
const g9 = globalThis as unknown as { __kruppDesk09?: boolean };

/** [10][6] sector matrix — allocated once, mutated on the 1 s pass */
const heatVals: number[][] = SECTORS.map(() => [0, 0, 0, 0, 0, 0]);
let heatReady = false;

/** 1-session momentum % per sector + rotation rank order */
const mom = new Float64Array(NS);
const order = new Int32Array(NS);
const rankOf = new Int32Array(NS);
const rotBars: BarSpec[] = SECTORS.map((s) => ({ v: 0, color: hexA(KT('upDeep'), 0.85), label: s }));
let rotReady = false;

/** 24 h primary flow per pillar fund ($M) — random-walked on the 1 s pass */
const FLOW0 = [620, 340, -120, -45, 28, 510, -190, 85];
const flow = new Float64Array(FLOW0);
const flowBars: BarSpec[] = MACRO.map((s) => ({ v: 0, color: hexA(KT('upDeep'), 0.85), label: s }));
let flowReady = false;

function ensureDesk09(): void {
  if (g9.__kruppDesk09 || typeof window === 'undefined') return;
  g9.__kruppDesk09 = true;

  /* --- 1 s guarded matrix / rotation / flow pass --- */
  setInterval(() => {
    /* sector matrix values */
    for (let i = 0; i < NS; i++) {
      const st = ms.inst[SECTORS[i]];
      if (!st) continue;
      const row = heatVals[i];
      row[0] = st.last;
      row[1] = clamp(st.changePct / 2, -1, 1);
      row[2] = zOf(st.hist, 240);
      row[3] = st.ofi;
      row[4] = st.iv;
      row[5] = st.liq / 100;
    }
    heatReady = true;

    /* 1-session momentum: hist.at(0) → hist.last() */
    for (let i = 0; i < NS; i++) {
      const st = ms.inst[SECTORS[i]];
      if (!st || st.hist.length < 16) {
        mom[i] = 0;
        continue;
      }
      const m = (st.hist.last() / st.hist.at(0) - 1) * 100;
      mom[i] = isFinite(m) ? m : 0;
    }

    /* momentum ranking (insertion sort, reusable arrays) */
    for (let i = 0; i < NS; i++) order[i] = i;
    for (let a = 1; a < NS; a++) {
      const oi = order[a];
      let b = a - 1;
      while (b >= 0 && mom[order[b]] < mom[oi]) {
        order[b + 1] = order[b];
        b--;
      }
      order[b + 1] = oi;
    }
    for (let r = 0; r < NS; r++) {
      const i = order[r];
      rankOf[i] = r;
      const spec = rotBars[r];
      spec.v = mom[i];
      spec.color = mom[i] >= 0 ? hexA(KT('upDeep'), 0.85) : hexA(KT('downDeep'), 0.85);
      spec.label = SECTORS[i];
    }
    rotReady = true;

    /* pillar flow random walk — crisis forces creation/redemption outflows */
    const c = ms.crisis;
    for (let i = 0; i < NM; i++) {
      const highBeta = MACRO[i] === 'QQQ' || MACRO[i] === 'IBIT' || MACRO[i] === 'ARKB' || MACRO[i] === 'ARKK';
      if (c.active) {
        const beta = highBeta ? 1.5 : 1;
        flow[i] += gauss() * (18 + 60 * c.intensity) * beta - (14 + 130 * c.intensity) * beta * (0.5 + Math.random());
      } else {
        flow[i] += (FLOW0[i] - flow[i]) * 0.02 + gauss() * 16;
      }
      flow[i] = clamp(flow[i], -2400, 2400);
      const fb = flowBars[i];
      fb.v = flow[i];
      fb.color = flow[i] >= 0 ? hexA(KT('upDeep'), 0.85) : hexA(KT('downDeep'), 0.85);
      fb.label = MACRO[i];
    }
    flowReady = true;
  }, 1000);
}

/* ------------------------------------------------------------------ *
 * Subcomponents
 * ------------------------------------------------------------------ */
function FlowStat({ i }: { i: number }) {
  const sym = MACRO[i];
  const v = flow[i];
  return (
    <Stat
      label={`${sym} FLOW`}
      value={`${fSign(v, 0)}M`}
      tone={clsNum(v)}
      sub={FUND[sym]?.tracking ?? '—'}
    />
  );
}

function FundCard({ i }: { i: number }) {
  const sym = MACRO[i];
  const st = ms.inst[sym];
  const f = FUND[sym];
  if (!st || !f) return null;
  const up = st.changePct >= 0;
  const fl = flow[i];
  return (
    <div className="flex flex-col gap-1.5 rounded border border-[#161d2c] bg-[#0a0e17] px-2.5 py-2">
      <div className="flex items-baseline justify-between font-mono text-[11px]">
        <span className="font-bold tracking-wider text-violet-300">{sym}</span>
        <span className={clsNum(st.changePct)}>{fPct(st.changePct)}</span>
      </div>
      <div className="flex items-baseline justify-between font-mono">
        <span className="text-[17px] font-semibold leading-none text-zinc-100">
          {fPx(st.last, st.def.dec)}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-zinc-500">
          VOL {fCompact(st.volume)}
        </span>
      </div>
      <Sparkline
        data={() => (ms.inst[sym] ? ms.inst[sym].hist : null)}
        color={up ? KT('upDeep') : KT('downDeep')}
        className="h-9 w-full"
      />
      <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
        <div>
          <div className="text-[8.5px] uppercase tracking-wider text-zinc-500">AUM $B</div>
          <div className="text-zinc-200">{fN(f.aum, 1)}</div>
        </div>
        <div>
          <div className="text-[8.5px] uppercase tracking-wider text-zinc-500">ER %</div>
          <div className="text-zinc-200">{fN(f.er, 2)}</div>
        </div>
        <div>
          <div className="text-[8.5px] uppercase tracking-wider text-zinc-500">FLOW 24H</div>
          <div className={clsNum(fl)}>{fSign(fl, 0)}M</div>
        </div>
      </div>
      <div className="border-t border-[#141b29] pt-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {f.note}
      </div>
      <div className="font-mono text-[8.5px] tracking-wider text-zinc-600">TRACKS: {f.tracking}</div>
    </div>
  );
}

function RotBadge({ i }: { i: number }) {
  const r = rankOf[i];
  if (r < 3) return <Badge tone="emerald">LEAD #{r + 1}</Badge>;
  if (r >= NS - 3) return <Badge tone="rose">LAG #{r + 1}</Badge>;
  return <Badge tone="zinc">MID #{r + 1}</Badge>;
}

/* ------------------------------------------------------------------ *
 * Desk 09 — SPDR & Macro ETFs
 * ------------------------------------------------------------------ */
export default function Desk09Etf() {
  ensureDesk09();
  useRevision(); // 5 Hz table / card refresh
  const sub = useSubTab(8);
  const crisis = ms.crisis;

  let netFlow = 0;
  let creations = 0;
  let redemptions = 0;
  let worst = 0;
  for (let i = 0; i < NM; i++) {
    netFlow += flow[i];
    if (flow[i] >= 0) creations++;
    else redemptions++;
    if (flow[i] < flow[worst]) worst = i;
  }

  return (
    <DeskFrame
      deskId={8}
      title="SPDR & MACRO ETF DESK"
      code="ETF/SECTOR-ROTATION"
      subtabs={['SECTOR MATRIX', 'PILLAR MACRO ETFS']}
      accent="violet"
      right={
        <>
          <Badge tone={crisis.active ? 'rose' : 'violet'} pulse={crisis.active}>
            {crisis.active ? `CRISIS ${crisis.phase}` : 'ROTATION LIVE'}
          </Badge>
          <Badge tone="zinc">10 SPDR · 8 PILLAR</Badge>
        </>
      }
    >
      {/* ==================== SUB-TAB 1 — SECTOR MATRIX ==================== */}
      <SubPane active={sub} index={0}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <LayoutGrid size={11} className="text-violet-400" />
                GRANULAR SPDR SECTOR MATRIX — 10 GICS FUNDS
              </span>
            }
            right={<Badge tone="violet">DIVERGING · 2DP</Badge>}
            className="xl:col-span-2"
          >
            <Heatmap
              rows={() => SECTORS}
              cols={() => HEAT_COLS}
              values={() => (heatReady ? heatVals : null)}
              height="h-80"
              scale="diverging"
              fmt={(v) => v.toFixed(2)}
            />
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <RotateCw size={11} className="text-violet-400" />
                ACTIVE SECTOR ROTATION INDEX (MOMENTUM RANK)
              </span>
            }
            right={<Badge tone="zinc">1-SESSION %</Badge>}
            className="xl:col-span-1"
          >
            <BarChart
              bars={() => (rotReady ? rotBars : null)}
              height="h-72"
              fmtV={(v) => fN(v, 1) + '%'}
            />
          </Panel>

          <Panel
            title="SECTOR QUOTES — ROTATION RANKED"
            right={<Badge tone="zinc">LEAD = TOP-3 MOMENTUM</Badge>}
            className="xl:col-span-3"
          >
            <Tbl head={['SYM', 'NAME', 'LAST', 'CHG%', 'MOM%', 'RANK', 'IV', 'OFI', 'LIQ', 'ROTATION']}>
              {SECTORS.map((sym, i) => {
                const st = ms.inst[sym];
                if (!st) return null;
                return (
                  <Tr key={sym}>
                    <Td className="font-bold tracking-wider text-violet-300">{sym}</Td>
                    <Td className="text-zinc-400">{st.def.name}</Td>
                    <Td className={`font-semibold ${clsNum(st.changePct)}`}>{fPx(st.last, st.def.dec)}</Td>
                    <Td className={clsNum(st.changePct)}>{fPct(st.changePct)}</Td>
                    <Td className={clsNum(mom[i])}>{fPct(mom[i])}</Td>
                    <Td className="text-zinc-400">#{rankOf[i] + 1}</Td>
                    <Td className="text-zinc-300">{fN(st.iv, 2)}</Td>
                    <Td className={clsNum(st.ofi)}>{fSign(st.ofi, 2)}</Td>
                    <Td className="text-zinc-300">{fN(st.liq, 1)}</Td>
                    <Td><RotBadge i={i} /></Td>
                  </Tr>
                );
              })}
            </Tbl>
          </Panel>
        </div>
      </SubPane>

      {/* ==================== SUB-TAB 2 — PILLAR MACRO ETFS ==================== */}
      <SubPane active={sub} index={1}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <Boxes size={11} className="text-violet-400" />
                PILLAR MACRO ETF PROFILES — CREATION/REDEMPTION DESK
              </span>
            }
            right={<Badge tone="violet">8 FUNDS · 5 HZ</Badge>}
            className="xl:col-span-3"
            bodyClass="p-2.5"
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {MACRO.map((sym, i) => (
                <FundCard key={sym} i={i} />
              ))}
            </div>
          </Panel>

          <Panel
            title="24H PRIMARY FLOW — CREATION / REDEMPTION NETT ($M)"
            right={<Badge tone="zinc">RANDOM WALK · 1 S</Badge>}
            className="xl:col-span-2"
          >
            <BarChart
              bars={() => (flowReady ? flowBars : null)}
              height="h-56"
              fmtV={(v) => fN(v, 0)}
            />
          </Panel>

          <div className="flex flex-col gap-3">
            <FlashAlert
              active={crisis.active}
              tone="rose"
              title="ETF CREATION/REDEMPTION STRESS — AP DESKS ON PAUSE"
            >
              Authorized-participant create/redeem queue halted at intensity{' '}
              {(crisis.intensity * 100).toFixed(0)}% — cash-create only · NAV premium/discredit risk on
              crypto &amp; innovation pillars.
            </FlashAlert>

            <Panel title="FLOW AGGREGATE — ALL PILLARS">
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="NET 24H FLOW"
                  value={`${fSign(netFlow, 0)}M`}
                  tone={clsNum(netFlow)}
                  sub={`${NM} funds aggregated`}
                />
                <Stat label="CREATIONS" value={fN(creations, 0)} tone="text-emerald-400" sub="funds inflow" />
                <Stat label="REDEMPTIONS" value={fN(redemptions, 0)} tone="text-rose-400" sub="funds outflow" />
                <Stat
                  label="WORST OUTFLOW"
                  value={`${fSign(flow[worst], 0)}M`}
                  tone="text-rose-400"
                  sub={MACRO[worst]}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <FlowStat i={0} />
                <FlowStat i={5} />
              </div>
            </Panel>
          </div>
        </div>
      </SubPane>
    </DeskFrame>
  );
}
