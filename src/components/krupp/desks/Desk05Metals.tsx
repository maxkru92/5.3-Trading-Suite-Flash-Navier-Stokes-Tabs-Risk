'use client';
/**
 * KRUPP CAPITAL — DESK 05 // COMMODITY FUTURES — PRECIOUS METALS
 *
 * Hero quote cards (GC/SI/HG), live IV-vs-RV curves fed by a dedicated
 * 200 ms module RV engine (ringStdDiff × 46000, backfilled on boot),
 * market-maker inventory skew analytics (OFI composite + tilt table)
 * and the futures-vs-ETF basis watch board.
 *
 * Architecture: module-singleton interval mutates module Rings OUTSIDE
 * React; 5 Hz store revision drives cards/tables; chart draw closures
 * read rings directly — zero per-frame allocation.
 */
import { Coins, Scale } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { ringStdDiff } from '@/lib/krupp/math';
import { Ring } from '@/lib/krupp/ring';
import { G } from '@/lib/krupp/universe';
import type { InstState } from '@/lib/krupp/types';
import { fCompact, fN, fPct, fPx, fSign, fVolPts, toneNum } from '@/lib/krupp/format';
import { useRevision } from '@/lib/krupp/store';
import { Badge, Panel, SectionLabel, Stat, Tbl, Td, Tr, clsNum } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { BarChart } from '@/components/krupp/charts/BarChart';
import type { BarSpec } from '@/components/krupp/charts/BarChart';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { KT } from '@/lib/theme';

/* ================= module-persistent state ================= */
const MET: readonly string[] = G.METALS;

/** per-metal realized-vol rings (vol pts), pushed every 200 ms */
const MET_RV: Record<string, Ring> = {};
for (const s of MET) MET_RV[s] = new Ring(600);

/** reusable zero-alloc bar specs for the MM skew BarChart */
const OFI_BARS: BarSpec[] = MET.map((s) => ({ v: 0, color: KT('upDeep'), label: s.slice(0, 2) }));

let started5 = false;

/** MM inventory composite: GC + 0.6·SI + 0.4·HG OFI — module-level proxy,
 *  recomputed on the 200 ms module interval (never assigned during render) */
let mmSkew = 0;

function recomputeSkew(): void {
  const g = ms.inst['GC1!'];
  const si = ms.inst['SI1!'];
  const hg = ms.inst['HG1!'];
  mmSkew = (g ? g.ofi : 0) + 0.6 * (si ? si.ofi : 0) + 0.4 * (hg ? hg.ofi : 0);
}

/** one-time backfill of the RV ring from the engine price history */
function backfillRv(st: InstState, ring: Ring): void {
  const h = st.hist;
  const n = h.length;
  const start = Math.max(1, n - 600);
  for (let i = start; i < n; i++) {
    let s = 0;
    let s2 = 0;
    let m = 0;
    const j0 = Math.max(1, i - 120);
    for (let j = j0; j <= i; j++) {
      const p = h.at(j - 1);
      if (!(p > 0)) continue;
      const d = Math.log(h.at(j) / p);
      s += d;
      s2 += d * d;
      m++;
    }
    if (m > 2) {
      const mu = s / m;
      ring.push(Math.sqrt(Math.max(0, s2 / m - mu * mu)) * 46000);
    }
  }
}

function ensureDesk5(): void {
  if (started5 || typeof window === 'undefined') return;
  started5 = true;
  for (const s of MET) {
    const st = ms.inst[s];
    if (st) backfillRv(st, MET_RV[s]);
  }
  recomputeSkew();
  setInterval(() => {
    for (const s of MET) {
      const st = ms.inst[s];
      if (!st) continue;
      MET_RV[s].push(ringStdDiff(st.hist, 120) * 46000);
    }
    recomputeSkew();
  }, 200);
}

/** futures vs ETF basis: (ETF/ETF₀) − (FUT/FUT₀) in % */
function futEtfBasis(futSym: string, etfSym: string): number {
  const f = ms.inst[futSym];
  const e = ms.inst[etfSym];
  if (!f || !e) return NaN;
  return (e.last / e.def.px0 - f.last / f.def.px0) * 100;
}

function tiltOf(v: number): 'BUY' | 'SELL' | 'NEUTRAL' {
  return v > 0.12 ? 'BUY' : v < -0.12 ? 'SELL' : 'NEUTRAL';
}

function convOf(v: number): 'HIGH' | 'MED' | 'LOW' {
  const a = Math.abs(v);
  return a > 0.35 ? 'HIGH' : a > 0.15 ? 'MED' : 'LOW';
}

/** mutate the reusable BarSpec array — no allocation in the draw path */
function ofiBars(): BarSpec[] {
  for (let i = 0; i < MET.length; i++) {
    const st = ms.inst[MET[i]];
    const v = st ? st.ofi : 0;
    const b = OFI_BARS[i];
    b.v = v;
    b.color = v >= 0 ? KT('upDeep') : KT('downDeep');
  }
  return OFI_BARS;
}

const WATCH: Array<{ sym: string; basis: readonly [string, string] | null }> = [
  { sym: 'GC1!', basis: ['GC1!', 'GLD'] },
  { sym: 'SI1!', basis: ['SI1!', 'SLV'] },
  { sym: 'HG1!', basis: null },
  { sym: 'GLD', basis: ['GC1!', 'GLD'] },
  { sym: 'SLV', basis: ['SI1!', 'SLV'] },
];

/* ================= pure display helpers ================= */
function Row({ k, v, tone = 'text-zinc-300' }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1 border-b border-kinset pb-0.5">
      <span className="text-[9px] uppercase tracking-wider text-zinc-500">{k}</span>
      <span className={`font-semibold ${tone}`}>{v}</span>
    </div>
  );
}

function MetalHero({ sym }: { sym: string }) {
  const st = ms.inst[sym];
  if (!st) return null;
  const carry = st.iv - st.rv;
  const up = st.changePct >= 0;
  return (
    <div className="rounded border border-kborder bg-kpanel px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[12px] font-bold tracking-wider text-amber-200">{sym}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{st.def.name}</div>
        </div>
        <span className={`font-mono text-[11px] font-semibold ${toneNum(st.changePct)}`}>{fPct(st.changePct)}</span>
      </div>
      <div className="mt-1 font-mono text-2xl font-bold leading-tight text-zinc-100">{fPx(st.last, st.def.dec)}</div>
      <Sparkline data={() => st.hist} color={up ? KT('warn') : KT('down')} className="mt-1 h-8 w-full" />
      <div className="mt-2 grid grid-cols-2 gap-x-3 font-mono text-[10px]">
        <Row k="HIGH" v={fPx(st.high, st.def.dec)} />
        <Row k="LOW" v={fPx(st.low, st.def.dec)} />
        <Row k="IV" v={fVolPts(st.iv)} />
        <Row k="RV" v={fVolPts(st.rv)} />
        <Row k="IV−RV" v={`${fSign(carry, 1)}pt`} tone={carry >= 0 ? 'text-amber-300' : 'text-emerald-300'} />
        <Row k="SPRD" v={fSign(st.spreadBps, 1)} />
        <Row k="OFI" v={fSign(st.ofi, 2)} tone={clsNum(st.ofi)} />
        <Row k="CVD" v={fCompact(st.cvd)} />
      </div>
    </div>
  );
}

/* ================= desk ================= */
export default function Desk05Metals() {
  ensureDesk5();
  useRevision();

  const g = ms.inst['GC1!'];
  const si = ms.inst['SI1!'];
  const hg = ms.inst['HG1!'];

  return (
    <DeskFrame
      deskId={4}
      title="COMMODITY DESK — PRECIOUS METALS"
      code="CMDTY-METALS/MM-INV"
      accent="amber"
      right={
        <>
          <Badge tone="amber" pulse>
            MM FLOW LIVE
          </Badge>
          <Badge tone="zinc">3 FUT · 2 ETF</Badge>
        </>
      }
    >
      {/* ---------- hero cards ---------- */}
      <div className="grid gap-2 md:grid-cols-3">
        {MET.map((s) => (
          <MetalHero key={s} sym={s} />
        ))}
      </div>

      {/* ---------- IV vs RV curves ---------- */}
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Scale size={11} className="text-amber-400" />
            IMPLIED vs REALIZED VOL — LIVE RV ENGINE
          </span>
        }
        right={<Badge tone="amber">RV = σ(Δln)·46000 @ 200MS</Badge>}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {MET.map((s) => {
            const st = ms.inst[s];
            const carry = st ? st.iv - st.rv : NaN;
            return (
              <div key={s} className="rounded border border-kborder bg-kbg-deep p-2">
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] font-bold text-zinc-200">{s}</span>
                  <Badge tone={carry >= 0 ? 'amber' : 'emerald'}>{fSign(carry, 1)} PTS</Badge>
                </div>
                <LineChart
                  series={[
                    { label: 'IV', color: KT('warn'), data: () => ms.inst[s]?.ivHist ?? null },
                    { label: 'RV', color: KT('up'), data: () => MET_RV[s] },
                  ]}
                  shade={{ a: () => ms.inst[s]?.ivHist ?? null, b: () => MET_RV[s], color: KT('warn') }}
                  height="h-40"
                  fmtV={(v) => v.toFixed(1)}
                />
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ---------- MM inventory skew analytics ---------- */}
      <SectionLabel>MM INVENTORY ANALYTICS</SectionLabel>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="MARKET-MAKER INVENTORY SKEW — OFI COMPOSITE" bodyClass="p-2">
          <BarChart bars={ofiBars} symmetric height="h-44" fmtV={(v) => v.toFixed(2)} />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="NET MM SKEW"
              value={fSign(mmSkew, 2)}
              tone={clsNum(mmSkew)}
              sub="GC + 0.6·SI + 0.4·HG"
            />
            <Stat label="GC1! OFI" value={fSign(g ? g.ofi : NaN, 2)} tone={clsNum(g ? g.ofi : 0)} />
            <Stat label="SI1! OFI" value={fSign(si ? si.ofi : NaN, 2)} tone={clsNum(si ? si.ofi : 0)} />
            <Stat label="HG1! OFI" value={fSign(hg ? hg.ofi : NaN, 2)} tone={clsNum(hg ? hg.ofi : 0)} />
          </div>
        </Panel>

        <Panel title="INVENTORY TILT — DESK POSITIONING PROXY">
          <Tbl head={['SYM', 'OFI', 'CVD', 'TILT', 'CONVICTION', 'LIQ']}>
            {MET.map((s) => {
              const st = ms.inst[s];
              if (!st) return null;
              const tilt = tiltOf(st.ofi);
              return (
                <Tr key={s}>
                  <Td className="font-semibold text-zinc-200">{s}</Td>
                  <Td className={`font-semibold ${clsNum(st.ofi)}`}>{fSign(st.ofi, 2)}</Td>
                  <Td className="text-zinc-300">{fCompact(st.cvd)}</Td>
                  <Td>
                    <Badge tone={tilt === 'BUY' ? 'emerald' : tilt === 'SELL' ? 'rose' : 'zinc'}>{tilt}</Badge>
                  </Td>
                  <Td
                    className={
                      convOf(st.ofi) === 'HIGH'
                        ? 'text-amber-300'
                        : convOf(st.ofi) === 'MED'
                          ? 'text-zinc-200'
                          : 'text-zinc-500'
                    }
                  >
                    {convOf(st.ofi)}
                  </Td>
                  <Td className="text-zinc-400">{fN(st.liq, 1)}</Td>
                </Tr>
              );
            })}
          </Tbl>
        </Panel>
      </div>

      {/* ---------- futures vs ETF basis watch ---------- */}
      <SectionLabel>FUTURES vs ETF BASIS WATCH</SectionLabel>
      <Panel title="METALS COMPLEX — FUTURES + GLD/SLV BASIS BOARD">
        <Tbl
          head={['SYM', 'NAME', 'LAST', 'CHG%', 'BID', 'ASK', 'IV', 'RV', 'IV−RV', 'SPRD-BPS', 'OFI', 'CVD', 'ETF-BASIS%']}
        >
          {WATCH.map((r) => {
            const st = ms.inst[r.sym];
            if (!st) return null;
            const carry = st.iv - st.rv;
            const basis = r.basis ? futEtfBasis(r.basis[0], r.basis[1]) : NaN;
            return (
              <Tr key={r.sym}>
                <Td className="font-semibold text-zinc-200">{r.sym}</Td>
                <Td className="text-zinc-500">{st.def.name}</Td>
                <Td className="text-zinc-100">{fPx(st.last, st.def.dec)}</Td>
                <Td className={`font-semibold ${toneNum(st.changePct)}`}>{fPct(st.changePct)}</Td>
                <Td className="text-emerald-300/90">{fPx(st.bid, st.def.dec)}</Td>
                <Td className="text-rose-300/90">{fPx(st.ask, st.def.dec)}</Td>
                <Td className="text-amber-300/90">{fVolPts(st.iv)}</Td>
                <Td className="text-emerald-300/90">{fVolPts(st.rv)}</Td>
                <Td className={carry >= 0 ? 'text-amber-300' : 'text-emerald-300'}>{fSign(carry, 1)}</Td>
                <Td className="text-zinc-400">{fSign(st.spreadBps, 1)}</Td>
                <Td className={`font-semibold ${clsNum(st.ofi)}`}>{fSign(st.ofi, 2)}</Td>
                <Td className="text-zinc-300">{fCompact(st.cvd)}</Td>
                <Td className={`font-semibold ${toneNum(basis)}`}>{isFinite(basis) ? `${fSign(basis, 3)}%` : '—'}</Td>
              </Tr>
            );
          })}
        </Tbl>
      </Panel>
    </DeskFrame>
  );
}
