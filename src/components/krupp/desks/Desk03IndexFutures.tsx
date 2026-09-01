'use client';
/**
 * KRUPP CAPITAL — DESK 03 // INDEX FUTURES
 *
 * Cross-market correlation matrix (240-tick, 1 Hz module rebuild),
 * liquidity density heatmap (price × time), dynamic L2/L3 vertical
 * depth ladder with selectable contract and the master quote board.
 *
 * Architecture: module-singleton intervals mutate module state OUTSIDE
 * React; the 5 Hz store revision drives card/table re-renders; chart
 * draw closures read rings/matrices directly — zero per-frame allocation.
 */
import { Activity, Layers } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { corrRing } from '@/lib/krupp/math';
import { G } from '@/lib/krupp/universe';
import { fBps, fCompact, fN, fPct, fPx, fSign, toneNum } from '@/lib/krupp/format';
import { useKrupp, useRevision, useSelected } from '@/lib/krupp/store';
import { Badge, Panel, SectionLabel, Stat, Tbl, Td, Tr, clsNum } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { DepthLadder } from '@/components/krupp/charts/DepthLadder';
import { Heatmap } from '@/components/krupp/charts/Heatmap';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { KT } from '@/lib/theme';

/* ================= module-persistent state ================= */
const IDX: readonly string[] = G.INDEX_FUT;
const IDX_N = IDX.length;

/** 7×7 Pearson correlation matrix — rebuilt every 1 s from 240-tick windows */
const CORR: number[][] = Array.from({ length: IDX_N }, () => new Array<number>(IDX_N).fill(0));
const CORR_ROWS: string[] = [...IDX];
const CORR_COLS: string[] = [...IDX];

/** 15 price rows × 24 time cols liquidity density — rebuilt every 1 s */
const DENS: number[][] = Array.from({ length: 15 }, () => new Array<number>(24).fill(0));
const DENS_ROWS: string[] = Array.from({ length: 15 }, (_, r) => `${Math.round(((14 - r) / 14) * 100)}%`);
const DENS_COLS: string[] = Array.from({ length: 24 }, (_, c) =>
  c === 23 ? 'NOW' : c % 4 === 0 ? `-${(23 - c) * 12}` : '',
);

let corrReady = false;
let densReady = false;
let started3 = false;

function rebuildDesk3(): void {
  /* ---- 240-tick Pearson correlation matrix ---- */
  let ok = true;
  for (let i = 0; i < IDX_N && ok; i++) {
    const a = ms.inst[IDX[i]];
    if (!a) {
      ok = false;
      break;
    }
    for (let j = i; j < IDX_N; j++) {
      const b = ms.inst[IDX[j]];
      if (!b) {
        ok = false;
        break;
      }
      const rho = i === j ? 1 : corrRing(a.hist, b.hist, 240);
      CORR[i][j] = rho;
      CORR[j][i] = rho;
    }
  }
  if (ok) corrReady = true;

  /* ---- liquidity density: last 288 ticks of each contract bucketed
     into 24 time columns (12 ticks each) × 15 price rows between the
     per-contract window min/max; normalized tick-count proxy 0..1 ---- */
  for (let r = 0; r < 15; r++) DENS[r].fill(0);
  let maxC = 0;
  for (const sym of IDX) {
    const st = ms.inst[sym];
    if (!st) continue;
    const h = st.hist;
    const n = Math.min(288, h.length);
    if (n < 48) continue;
    const from = h.length - n;
    const [lo, hi] = h.minMax(from);
    const span = hi - lo;
    if (!(span > 1e-9)) continue;
    const per = n / 24;
    for (let k = 0; k < n; k++) {
      const col = Math.min(23, Math.floor(k / per));
      let row = Math.floor(((h.at(from + k) - lo) / span) * 15);
      if (row < 0) row = 0;
      else if (row > 14) row = 14;
      const c = ++DENS[14 - row][col]; /* row 0 = top = highest price */
      if (c > maxC) maxC = c;
    }
  }
  if (maxC > 0) {
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 24; c++) DENS[r][c] /= maxC;
    }
    densReady = true;
  }
}

function ensureDesk3(): void {
  if (started3 || typeof window === 'undefined') return;
  started3 = true;
  rebuildDesk3();
  setInterval(rebuildDesk3, 1000);
}

/* ================= pure display helpers ================= */
function OfiBar({ v }: { v: number }) {
  const pct = Math.min(50, Math.abs(v) * 50);
  return (
    <div className="relative h-1.5 min-w-14 flex-1 rounded bg-kinset">
      <div className="absolute inset-y-0 left-1/2 w-px bg-kborder4" />
      <div
        className={`absolute inset-y-0 rounded ${v >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
        style={v >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
      />
    </div>
  );
}

function QuoteCard({ sym }: { sym: string }) {
  const st = ms.inst[sym];
  if (!st) return null;
  const up = st.changePct >= 0;
  return (
    <div className="rounded border border-kborder bg-kpanel px-2.5 py-2">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10.5px] font-bold tracking-wider text-zinc-200">{sym}</span>
        <span className={`font-mono text-[10px] font-semibold ${toneNum(st.changePct)}`}>{fPct(st.changePct)}</span>
      </div>
      <div className="mt-0.5 font-mono text-lg font-semibold leading-tight text-zinc-100">
        {fPx(st.last, st.def.dec)}
      </div>
      <Sparkline data={() => st.hist} color={up ? KT('up') : KT('down')} className="mt-1 h-7 w-full" />
      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-[9px] whitespace-nowrap text-zinc-500">{fBps(st.spreadBps)}</span>
        <OfiBar v={st.ofi} />
      </div>
    </div>
  );
}

function chipCls(active: boolean): string {
  return active
    ? 'rounded-sm border border-emerald-400/70 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-emerald-300'
    : 'rounded-sm border border-kborder2 px-2 py-0.5 font-mono text-[10px] tracking-wider text-zinc-500 transition-colors hover:border-kborder4 hover:text-zinc-300';
}

/* ================= desk ================= */
export default function Desk03IndexFutures() {
  ensureDesk3();
  useRevision();
  const sel = useSelected('desk3', 'ES1!');
  const select = useKrupp((s) => s.select);
  const selSt = ms.inst[sel] ?? ms.inst['ES1!'];

  let rhoSum = 0;
  let rhoN = 0;
  for (let i = 0; i < IDX_N; i++) {
    for (let j = i + 1; j < IDX_N; j++) {
      rhoSum += CORR[i][j];
      rhoN++;
    }
  }
  const rhoAvg = rhoN > 0 ? rhoSum / rhoN : NaN;

  return (
    <DeskFrame
      deskId={2}
      title="INDEX FUTURES DESK"
      code="IDX-FUT/CORR-LIQ"
      accent="emerald"
      right={
        <>
          <Badge tone="emerald" pulse>
            7 CONTRACTS LIVE
          </Badge>
          <Badge tone="zinc">MATRIX 1HZ</Badge>
        </>
      }
    >
      {/* ---------- header stats grid ---------- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {IDX.map((s) => (
          <QuoteCard key={s} sym={s} />
        ))}
      </div>

      <SectionLabel>CROSS-MARKET STRUCTURE</SectionLabel>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* ---------- correlation matrix ---------- */}
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Activity size={11} className="text-emerald-400" />
              INTER-MARKET CORRELATION MATRIX (240-TICK)
            </span>
          }
          right={
            <Badge tone={rhoAvg > 0.6 ? 'amber' : 'zinc'}>
              {'\u27E8\u03C1\u27E9 '}
              {isFinite(rhoAvg) ? rhoAvg.toFixed(2) : '\u2014'}
            </Badge>
          }
          bodyClass="p-2"
        >
          <Heatmap
            rows={() => CORR_ROWS}
            cols={() => CORR_COLS}
            values={() => (corrReady ? CORR : null)}
            scale="diverging"
            fmt={(v) => v.toFixed(2)}
            height="h-72"
          />
        </Panel>

        {/* ---------- liquidity density ---------- */}
        <Panel
          title="LIQUIDITY DENSITY — PRICE × TIME (288 TICKS)"
          right={<Badge tone="zinc">24T × 15PX BINS</Badge>}
          bodyClass="p-2"
        >
          <Heatmap
            rows={() => DENS_ROWS}
            cols={() => DENS_COLS}
            values={() => (densReady ? DENS : null)}
            scale="heat"
            fmt={(v) => v.toFixed(2)}
            height="h-72"
          />
        </Panel>
      </div>

      {/* ---------- dynamic L3 depth ---------- */}
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Layers size={11} className="text-emerald-400" />
            DYNAMIC L2/L3 VERTICAL DEPTH — {sel}
          </span>
        }
        right={
          <div className="flex flex-wrap gap-1">
            {IDX.map((s) => (
              <button key={s} onClick={() => select('desk3', s)} className={chipCls(s === sel)}>
                {s}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-[240px_1fr]">
          <div className="rounded border border-kborder bg-kbg-deep p-2">
            <DepthLadder symbol={sel} rows={8} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-200">{selSt.def.name}</span>
              <span className="ml-2 text-zinc-600">TICK {fPx(selSt.def.tick, selSt.def.dec)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat
                label="BID"
                value={fPx(selSt.bid, selSt.def.dec)}
                tone="text-emerald-300"
                sub={`L1 SZ ${fCompact(selSt.book.bidSz[0])}`}
              />
              <Stat
                label="ASK"
                value={fPx(selSt.ask, selSt.def.dec)}
                tone="text-rose-300"
                sub={`L1 SZ ${fCompact(selSt.book.askSz[0])}`}
              />
              <Stat
                label="SPREAD"
                value={fBps(selSt.spreadBps)}
                sub={`${fPx(selSt.ask - selSt.bid, selSt.def.dec)} PTS`}
              />
              <Stat
                label="LIQ SCORE"
                value={fN(selSt.liq, 1)}
                tone={selSt.liq > 60 ? 'text-emerald-300' : selSt.liq > 35 ? 'text-amber-300' : 'text-rose-300'}
                sub="MICROSTRUCTURE 0–99"
              />
              <Stat label="BOOK SEQ" value={fN(selSt.book.seq, 0)} sub="UPDATES SINCE BOOT" />
              <Stat label="OFI" value={fSign(selSt.ofi, 2)} tone={clsNum(selSt.ofi)} sub="ORDER-FLOW IMBALANCE" />
            </div>
          </div>
        </div>
      </Panel>

      {/* ---------- master quote board ---------- */}
      <SectionLabel>MASTER QUOTE BOARD — 5 HZ</SectionLabel>
      <Panel title="GLOBAL INDEX FUTURES — MASTER QUOTES">
        <Tbl head={['SYM', 'LAST', 'BID', 'ASK', 'CHG%', 'SPRD-BPS', 'VOLUME', 'OI', 'OFI', 'LIQ']}>
          {IDX.map((s) => {
            const st = ms.inst[s];
            if (!st) return null;
            return (
              <Tr key={s}>
                <Td className="font-semibold text-zinc-200">{s}</Td>
                <Td className="text-zinc-100">{fPx(st.last, st.def.dec)}</Td>
                <Td className="text-emerald-300/90">{fPx(st.bid, st.def.dec)}</Td>
                <Td className="text-rose-300/90">{fPx(st.ask, st.def.dec)}</Td>
                <Td className={`font-semibold ${toneNum(st.changePct)}`}>{fPct(st.changePct)}</Td>
                <Td className="text-zinc-400">{fBps(st.spreadBps)}</Td>
                <Td className="text-zinc-300">{fCompact(st.volume)}</Td>
                <Td className="text-zinc-300">{fCompact(st.oi)}</Td>
                <Td className={`font-semibold ${clsNum(st.ofi)}`}>{fSign(st.ofi, 2)}</Td>
                <Td className={st.liq > 60 ? 'text-emerald-300' : st.liq > 35 ? 'text-amber-300' : 'text-rose-300'}>
                  {fN(st.liq, 1)}
                </Td>
              </Tr>
            );
          })}
        </Tbl>
      </Panel>
    </DeskFrame>
  );
}
