'use client';
/**
 * KRUPP CAPITAL — Desk 08 · STOCKS DESK — GLOBAL LIQUID EQUITIES
 * Mag-7 + FTSE/DAX leaders quotes (5 Hz), ZIP-manifest fundamentals parser
 * telemetry, L3 orderbook depth monitor with top-of-book imbalance alarm and
 * the Mag-7 intraday sparkline strip.
 *
 * All hot series live at module scope / engine rings — draw closures never
 * allocate. Module timers follow the guarded globalThis ensure pattern.
 */
import { Building2, FileArchive, Layers3, Activity } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { G } from '@/lib/krupp/universe';
import {
  fClock, fCompact, fN, fPct, fPx, fSign,
} from '@/lib/krupp/format';
import { useKrupp, useRevision, useSelected } from '@/lib/krupp/store';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import {
  Panel, Badge, Stat, FlashAlert, SectionLabel, Tbl, Tr, Td, clsNum,
} from '@/components/krupp/ui';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { DepthLadder } from '@/components/krupp/charts/DepthLadder';
import { KT } from '@/lib/theme';

const SYMS: string[] = [...G.STOCKS_US, ...G.STOCKS_EU];
const N = SYMS.length;
const IDX: Record<string, number> = {};
SYMS.forEach((s, i) => { IDX[s] = i; });

/* ------------------------------------------------------------------ *
 * INSTITUTIONAL FUNDAMENTALS — static ZIP manifest (per-symbol record)
 * P/E × EPS reconciles to the sandbox reference price for all 12 names.
 * ------------------------------------------------------------------ */
interface FundRow {
  pe: number;
  eps: number;
  mcap: number; // $B
  revGrowth: number; // % y/y
  divYield: number; // %
  sector: string;
}

const FUNDAMENTALS: Record<string, FundRow> = {
  AAPL:  { pe: 33.4, eps: 6.42,  mcap: 3284.0, revGrowth: 4.8,   divYield: 0.44, sector: 'TECH' },
  MSFT:  { pe: 36.4, eps: 11.68, mcap: 3152.0, revGrowth: 15.2,  divYield: 0.72, sector: 'TECH' },
  NVDA:  { pe: 62.7, eps: 2.05,  mcap: 3141.0, revGrowth: 94.0,  divYield: 0.03, sector: 'SEMIS' },
  GOOGL: { pe: 24.6, eps: 7.24,  mcap: 2193.0, revGrowth: 13.6,  divYield: 0.46, sector: 'INTERNET' },
  AMZN:  { pe: 41.8, eps: 4.46,  mcap: 1942.0, revGrowth: 11.9,  divYield: 0.00, sector: 'INTERNET' },
  META:  { pe: 26.4, eps: 19.12, mcap: 1284.0, revGrowth: 21.4,  divYield: 0.38, sector: 'INTERNET' },
  TSLA:  { pe: 74.6, eps: 2.65,  mcap: 631.0,  revGrowth: 1.2,   divYield: 0.00, sector: 'AUTO' },
  SHEL:  { pe: 12.4, eps: 5.20,  mcap: 211.0,  revGrowth: -6.4,  divYield: 3.96, sector: 'ENERGY' },
  HSBA:  { pe: 7.8,  eps: 0.93,  mcap: 166.0,  revGrowth: 3.1,   divYield: 7.42, sector: 'BANKS' },
  SAP:   { pe: 48.2, eps: 3.70,  mcap: 208.0,  revGrowth: 9.8,   divYield: 1.12, sector: 'SOFTWARE' },
  SIE:   { pe: 17.6, eps: 10.02, mcap: 142.0,  revGrowth: 6.4,   divYield: 2.64, sector: 'INDUSTRIALS' },
  ALV:   { pe: 12.9, eps: 20.34, mcap: 131.0,  revGrowth: 4.2,   divYield: 4.58, sector: 'INSURANCE' },
};

/* ------------------------------------------------------------------ *
 * Module-level persistent state (zero-GC, survives tab switches)
 * ------------------------------------------------------------------ */
const g8 = globalThis as unknown as { __kruppDesk08?: boolean };

/** top-3 cumulative book sizes + bid-side imbalance ratio per symbol */
const top3Bid = new Float32Array(N);
const top3Ask = new Float32Array(N);
const bookImb = new Float32Array(N);

/** ZIP manifest parser telemetry line (rotates every 2 s) */
let parserLine = 'PARSER COLD-START :: MOUNTING FUND.ZIP ARCHIVE…';
let parserAt = Date.now();
let parserSeq = 0;

function ensureDesk08(): void {
  if (g8.__kruppDesk08 || typeof window === 'undefined') return;
  g8.__kruppDesk08 = true;

  /* --- 200 ms L3 book imbalance computer (aligned to engine tick) --- */
  setInterval(() => {
    for (let i = 0; i < N; i++) {
      const st = ms.inst[SYMS[i]];
      if (!st) continue;
      const b = st.book;
      let bs = 0;
      let as = 0;
      for (let k = 0; k < 3; k++) {
        bs += b.bidSz[k];
        as += b.askSz[k];
      }
      top3Bid[i] = bs;
      top3Ask[i] = as;
      bookImb[i] = bs + as > 0 ? bs / (bs + as) : 0.5;
    }
  }, 200);

  /* --- 2 s guarded ZIP manifest parser telemetry cycler --- */
  const tickParser = (): void => {
    const sym = SYMS[parserSeq % N];
    parserAt = Date.now();
    parserLine = parserSeq % 2 === 0
      ? `PARSING ZIP MANIFEST :: ${sym}.FUND.zip → 6 RECORDS OK (crc ✓)`
      : `ZIP MANIFEST BOUND :: ${sym}.FUND.zip → 6 FIELDS INFLATED — DELTA APPLIED (crc ✓)`;
    parserSeq++;
  };
  tickParser();
  setInterval(tickParser, 2000);
}

/* ------------------------------------------------------------------ *
 * Subcomponents
 * ------------------------------------------------------------------ */
function Chip({ sym, sel, onClick }: { sym: string; sel: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider transition-colors ${
        sel
          ? 'border-kaccent/70 bg-kaccent/10 text-kaccent-soft'
          : 'border-kborder2 text-zinc-500 hover:border-kborder4 hover:text-zinc-300'
      }`}
    >
      {sym}
    </button>
  );
}

function SparkCard({ sym }: { sym: string }) {
  const st = ms.inst[sym];
  if (!st) return null;
  const up = st.changePct >= 0;
  return (
    <div className="flex flex-col gap-1 rounded border border-kborder bg-kheader px-2 py-1.5">
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span className="font-bold tracking-wider text-kaccent-soft">{sym}</span>
        <span className={clsNum(st.changePct)}>{fPct(st.changePct)}</span>
      </div>
      <div className="font-mono text-[13px] font-semibold leading-none text-zinc-100">
        {fPx(st.last, st.def.dec)}
      </div>
      <Sparkline
        data={() => (ms.inst[sym] ? ms.inst[sym].hist : null)}
        color={up ? KT('upDeep') : KT('downDeep')}
        className="h-8 w-full"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Desk 08 — Stocks
 * ------------------------------------------------------------------ */
export default function Desk08Stocks() {
  ensureDesk08();
  useRevision(); // 5 Hz table / stats refresh

  const sel = useSelected('desk8', 'NVDA');
  const select = useKrupp((s) => s.select);
  const selSt = ms.inst[sel] ?? ms.inst.NVDA;
  const si = selSt ? (IDX[selSt.def.symbol] ?? 0) : 0;
  const imb = bookImb[si];
  const crisis = ms.crisis;

  return (
    <DeskFrame
      deskId={7}
      title="STOCKS DESK — GLOBAL LIQUID EQUITIES"
      code="EQ/CORE-L3-MONITOR"
      accent="cyan"
      right={<Badge tone="zinc">12 NAMES · 5 HZ</Badge>}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* ------------- global liquid equities quotes ------------- */}
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Building2 size={11} className="text-kaccent" />
              MAGNIFICENT 7 + FTSE/DAX LEADERS
            </span>
          }
          right={
            <Badge tone={crisis.active ? 'rose' : 'zinc'} pulse={crisis.active}>
              {crisis.active ? `CRISIS ${crisis.phase}` : 'LIQUID SESSION'}
            </Badge>
          }
          className="xl:col-span-2"
        >
          <Tbl head={['SYM', 'NAME', 'LAST', 'CHG%', 'BID×ASK', 'SPREAD', 'VOL', 'IV', 'OFI', 'LIQ']}>
            {SYMS.map((sym) => {
              const st = ms.inst[sym];
              if (!st) return null;
              return (
                <Tr key={sym}>
                  <Td className="font-bold tracking-wider text-kaccent-soft">{sym}</Td>
                  <Td className="text-zinc-400">{st.def.name}</Td>
                  <Td className={`font-semibold ${clsNum(st.changePct)}`}>{fPx(st.last, st.def.dec)}</Td>
                  <Td className={clsNum(st.changePct)}>{fPct(st.changePct)}</Td>
                  <Td>
                    <span className="text-emerald-400">{fPx(st.bid, st.def.dec)}</span>
                    <span className="text-zinc-600"> × </span>
                    <span className="text-rose-400">{fPx(st.ask, st.def.dec)}</span>
                  </Td>
                  <Td className="text-zinc-400">{fN(st.spreadBps, 1)}bp</Td>
                  <Td className="text-zinc-300">{fCompact(st.volume)}</Td>
                  <Td className="text-zinc-300">{fN(st.iv, 2)}</Td>
                  <Td className={clsNum(st.ofi)}>{fSign(st.ofi, 2)}</Td>
                  <Td className="text-zinc-300">{fN(st.liq, 1)}</Td>
                </Tr>
              );
            })}
          </Tbl>
        </Panel>

        {/* ------------- L3 orderbook depth monitor ------------- */}
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Layers3 size={11} className="text-kaccent" />
              L3 ORDERBOOK DEPTH MONITOR
            </span>
          }
          right={<Badge tone="cyan">L2+ 8 LVL</Badge>}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Mag-7 · Select Instrument</SectionLabel>
              <div className="flex flex-wrap gap-1">
                {G.STOCKS_US.map((sym) => (
                  <Chip key={sym} sym={sym} sel={sel === sym} onClick={() => select('desk8', sym)} />
                ))}
              </div>
              <SectionLabel>FTSE/DAX Leaders</SectionLabel>
              <div className="flex flex-wrap gap-1">
                {G.STOCKS_EU.map((sym) => (
                  <Chip key={sym} sym={sym} sel={sel === sym} onClick={() => select('desk8', sym)} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <DepthLadder symbol={selSt.def.symbol} rows={8} />
              <div className="grid grid-cols-2 content-start gap-2">
                <Stat
                  label="TOP-3 BID Σ"
                  value={fCompact(top3Bid[si])}
                  tone="text-emerald-400"
                  sub="shares stacked"
                />
                <Stat
                  label="TOP-3 ASK Σ"
                  value={fCompact(top3Ask[si])}
                  tone="text-rose-400"
                  sub="shares offered"
                />
                <Stat
                  label="BID IMBALANCE"
                  value={`${(imb * 100).toFixed(1)}%`}
                  tone={imb > 0.65 ? 'text-emerald-300' : imb < 0.35 ? 'text-rose-300' : 'text-zinc-100'}
                  sub={imb > 0.5 ? 'bid-heavy book' : 'ask-heavy book'}
                />
                <Stat
                  label="SPREAD"
                  value={fN(selSt.spreadBps, 1) + 'bp'}
                  sub={`tick ${selSt.def.tick}`}
                />
                <Stat label="BOOK SEQ" value={fN(selSt.book.seq, 0)} sub="updates" />
                <Stat
                  label="LIQ SCORE"
                  value={fN(selSt.liq, 1)}
                  tone={selSt.liq > 70 ? 'text-emerald-400' : selSt.liq > 40 ? 'text-amber-400' : 'text-rose-400'}
                  sub="0–100 depth index"
                />
              </div>
            </div>

            {/* imbalance pressure bar */}
            <div>
              <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                <span className="text-emerald-400">BID {(imb * 100).toFixed(1)}%</span>
                <span>TOP-3 MASS SPLIT</span>
                <span className="text-rose-400">ASK {((1 - imb) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-sm border border-kborder2 bg-kheader">
                <div className="bg-emerald-500/70" style={{ width: `${imb * 100}%` }} />
                <div className="bg-rose-500/70" style={{ width: `${(1 - imb) * 100}%` }} />
              </div>
            </div>

            <FlashAlert
              active={imb > 0.65}
              tone="amber"
              title="L3 BOOK IMBALANCE — INSTITUTIONAL SIDE LOADING"
            >
              {selSt.def.symbol} top-3 bid mass {(imb * 100).toFixed(1)}% — size being pressed into the
              bid stack · seq {fN(selSt.book.seq, 0)} · watch for sweep prints through the offer.
            </FlashAlert>
          </div>
        </Panel>

        {/* ------------- fundamentals / zip manifest parser ------------- */}
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <FileArchive size={11} className="text-kaccent" />
              INSTITUTIONAL FUNDAMENTALS — ZIP MANIFEST PARSER
            </span>
          }
          right={<Badge tone="emerald">12/12 MANIFESTS</Badge>}
          className="xl:col-span-2"
        >
          <div className="mb-2 flex items-center justify-between gap-3 rounded border border-kborder bg-kheader px-2 py-1.5 font-mono text-[10.5px]">
            <div className="min-w-0 truncate">
              <span className="text-zinc-500">[{fClock(parserAt)}] </span>
              <span className="text-emerald-300">{parserLine}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[9px] uppercase tracking-wider text-zinc-500">
              <span>DEFLATE · CRC-32</span>
              <span className="animate-pulse text-kaccent">▮</span>
            </div>
          </div>
          <Tbl head={['SYM', 'SECTOR', 'P/E', 'EPS', 'MKT CAP $B', 'REV GR %', 'DIV YLD %']}>
            {SYMS.map((sym) => {
              const f = FUNDAMENTALS[sym];
              if (!f) return null;
              return (
                <Tr key={sym}>
                  <Td className="font-bold tracking-wider text-kaccent-soft">{sym}</Td>
                  <Td className="text-zinc-400">{f.sector}</Td>
                  <Td className="text-zinc-200">{fN(f.pe, 1)}</Td>
                  <Td className="text-zinc-200">{fN(f.eps, 2)}</Td>
                  <Td className="text-zinc-200">{fN(f.mcap, 0)}</Td>
                  <Td className={clsNum(f.revGrowth)}>{fPct(f.revGrowth, 1)}</Td>
                  <Td className="text-zinc-300">{fN(f.divYield, 2)}</Td>
                </Tr>
              );
            })}
          </Tbl>
        </Panel>

        {/* ------------- mag-7 intraday sparkline strip ------------- */}
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Activity size={11} className="text-kaccent" />
              MAG-7 INTRADAY SPARKLINE STRIP
            </span>
          }
          right={<Badge tone="zinc">600-TICK RING · 5 HZ</Badge>}
          className="xl:col-span-3"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {G.STOCKS_US.map((sym) => (
              <SparkCard key={sym} sym={sym} />
            ))}
          </div>
        </Panel>
      </div>
    </DeskFrame>
  );
}
