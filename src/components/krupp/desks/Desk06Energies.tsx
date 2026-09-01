'use client';
/**
 * KRUPP CAPITAL — DESK 06 // COMMODITY FUTURES — ENERGIES
 *
 * Energy quote stack (CL primary + NG/RB/HO), real-time 3-2-1 crack
 * spread calculator with custom weights, order-flow imbalance tracker,
 * institutional crude accumulator sweep detector and the crude complex
 * basis / crack-strip board.
 *
 * Architecture: module-singleton 200 ms interval maintains the crack
 * Ring and the sweep log OUTSIDE React; 5 Hz store revision drives
 * cards/tables; chart draw closures read rings directly.
 */
import { useState } from 'react';
import { Calculator, Flame, Zap } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { ringStd } from '@/lib/krupp/math';
import { Ring } from '@/lib/krupp/ring';
import { G } from '@/lib/krupp/universe';
import { fBps, fClock, fCompact, fN, fPct, fPx, fSign, toneNum } from '@/lib/krupp/format';
import { useRevision } from '@/lib/krupp/store';
import { Badge, FlashAlert, Panel, Stat, Tbl, Td, Tr, clsNum } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { KT } from '@/lib/theme';

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

/* ================= module-persistent state ================= */
const EN: readonly string[] = G.ENERGIES;

/** 3-2-1 crack ($/bbl) history — pushed every 200 ms */
const crackRing = new Ring(600);

interface SweepEvt {
  t: number;
  px: number;
  side: 'BUY' | 'SELL';
  bp: number;
}
const SWEEPS: SweepEvt[] = [];
let sweepCount = 0;
let prevCl = NaN;
let started6 = false;

function ensureDesk6(): void {
  if (started6 || typeof window === 'undefined') return;
  started6 = true;

  /* one-time backfill of the crack ring from aligned engine histories */
  const cl0 = ms.inst['CL1!'];
  const rb0 = ms.inst['RB1!'];
  const ho0 = ms.inst['HO1!'];
  if (cl0 && rb0 && ho0) {
    const hc = cl0.hist;
    const hr = rb0.hist;
    const hh = ho0.hist;
    const n = Math.min(600, hc.length, hr.length, hh.length);
    for (let k = 0; k < n; k++) {
      const i = hc.length - n + k;
      crackRing.push((2 * hr.at(i) + hh.at(i) - 3 * hc.at(i)) / 3);
    }
    prevCl = cl0.last;
  }

  setInterval(() => {
    const cl = ms.inst['CL1!'];
    const rb = ms.inst['RB1!'];
    const ho = ms.inst['HO1!'];
    if (!cl || !rb || !ho) return;

    crackRing.push((2 * rb.last + ho.last - 3 * cl.last) / 3);

    /* institutional accumulator sweep: |ln(P/P_prev)| > 3 × per-tick vol */
    if (prevCl > 0) {
      const ret = Math.log(cl.last / prevCl);
      if (Math.abs(ret) > 3 * cl.def.vol) {
        sweepCount++;
        SWEEPS.unshift({ t: Date.now(), px: cl.last, side: ret > 0 ? 'BUY' : 'SELL', bp: ret * 10000 });
        if (SWEEPS.length > 8) SWEEPS.length = 8;
      }
    }
    prevCl = cl.last;
  }, 200);
}

/* ================= derived analytics helpers ================= */
function ringChgPct(r: Ring, back = 120): number {
  if (r.length < back + 2) return NaN;
  const past = r.at(r.length - 1 - back);
  return past !== 0 ? (r.last() / past - 1) * 100 : NaN;
}

/** spread between two instruments + % change of the spread vs `back` ticks ago */
function diffStrip(aSym: string, bSym: string, back = 120): { v: number; chg: number } {
  const a = ms.inst[aSym];
  const b = ms.inst[bSym];
  if (!a || !b || a.hist.length < back + 2 || b.hist.length < back + 2) return { v: NaN, chg: NaN };
  const v = a.last - b.last;
  const past = a.hist.at(a.hist.length - 1 - back) - b.hist.at(b.hist.length - 1 - back);
  return { v, chg: past !== 0 ? ((v - past) / Math.abs(past)) * 100 : NaN };
}

/* ================= pure display helpers ================= */
function OfiBar({ v }: { v: number }) {
  const pct = Math.min(50, Math.abs(v) * 50);
  return (
    <div className="relative h-1.5 min-w-14 flex-1 rounded bg-[#111827]">
      <div className="absolute inset-y-0 left-1/2 w-px bg-[#2a3448]" />
      <div
        className={`absolute inset-y-0 rounded ${v >= 0 ? 'bg-orange-400' : 'bg-rose-500'}`}
        style={v >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
      />
    </div>
  );
}

function EnergyCard({ sym, big = false }: { sym: string; big?: boolean }) {
  const st = ms.inst[sym];
  if (!st) return null;
  const up = st.changePct >= 0;
  return (
    <div
      className={`rounded border bg-[#0a0e17] px-3 py-2.5 ${
        big ? 'border-orange-500/40 md:col-span-2 lg:col-span-2' : 'border-[#161d2c]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`font-mono font-bold tracking-wider ${big ? 'text-[13px] text-orange-200' : 'text-[12px] text-zinc-200'}`}>
            {sym}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{st.def.name}</div>
        </div>
        <span className={`font-mono font-semibold ${toneNum(st.changePct)} ${big ? 'text-[13px]' : 'text-[11px]'}`}>
          {fPct(st.changePct)}
        </span>
      </div>
      <div className={`mt-1 font-mono font-bold leading-tight text-zinc-100 ${big ? 'text-3xl' : 'text-lg'}`}>
        {fPx(st.last, st.def.dec)}
      </div>
      {big && <Sparkline data={() => st.hist} color={up ? KT('orange') : KT('down')} className="mt-1 h-9 w-full" />}
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-[9px] whitespace-nowrap text-zinc-500">{fBps(st.spreadBps)}</span>
        <OfiBar v={st.ofi} />
        <span className={`font-mono text-[9px] ${clsNum(st.ofi)}`}>{fSign(st.ofi, 2)}</span>
      </div>
      {big && (
        <div className="mt-1.5 grid grid-cols-3 gap-x-3 font-mono text-[9.5px]">
          <span className="text-zinc-500">
            H <span className="text-zinc-300">{fPx(st.high, st.def.dec)}</span>
          </span>
          <span className="text-zinc-500">
            L <span className="text-zinc-300">{fPx(st.low, st.def.dec)}</span>
          </span>
          <span className="text-zinc-500">
            CVD <span className="text-zinc-300">{fCompact(st.cvd)}</span>
          </span>
          <span className="text-zinc-500">
            IV <span className="text-amber-300">{fN(st.iv, 1)}</span>
          </span>
          <span className="text-zinc-500">
            RV <span className="text-emerald-300">{fN(st.rv, 1)}</span>
          </span>
          <span className="text-zinc-500">
            VOL <span className="text-zinc-300">{fCompact(st.volume)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function NumIn({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded border border-[#1c2333] bg-[#080c14] px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none focus:border-orange-500/60"
      />
    </label>
  );
}

/* ================= desk ================= */
export default function Desk06Energies() {
  ensureDesk6();
  useRevision();

  const [rbW, setRbW] = useState(2);
  const [hoW, setHoW] = useState(1);
  const [clW, setClW] = useState(3);
  const [gal, setGal] = useState(42);

  const cl = ms.inst['CL1!'];
  const ng = ms.inst['NG1!'];
  const rb = ms.inst['RB1!'];
  const ho = ms.inst['HO1!'];

  const crack321 = crackRing.length > 0 ? crackRing.last() : NaN;
  const uncC = ringStd(crackRing, 120) * 100; /* per-tick σ of the strip, in cents */
  const customBbl = cl && rb && ho && clW > 0 ? (rbW * rb.last + hoW * ho.last - clW * cl.last) / clW : NaN;
  const customGal = customBbl / (gal > 0 ? gal : NaN);

  const lastSweep = SWEEPS.length > 0 ? SWEEPS[0] : null;
  const sweepHot = lastSweep !== null && Date.now() - lastSweep.t < 10000;

  const stripRb = diffStrip('RB1!', 'CL1!');
  const stripHo = diffStrip('HO1!', 'CL1!');
  const stripNg = diffStrip('NG1!', 'CL1!');
  const strips: Array<{ label: string; v: number; chg: number }> = [
    { label: '3-2-1 CRACK', v: crack321, chg: ringChgPct(crackRing) },
    { label: 'RB−CL SPREAD', v: stripRb.v, chg: stripRb.chg },
    { label: 'HO−CL SPREAD', v: stripHo.v, chg: stripHo.chg },
    { label: 'NG−CL SPREAD', v: stripNg.v, chg: stripNg.chg },
  ];

  return (
    <DeskFrame
      deskId={5}
      title="COMMODITY DESK — ENERGIES"
      code="CMDTY-ENERGY/OIB-TRACK"
      accent="orange"
      right={
        <>
          <Badge tone="amber" pulse>
            CRACK LIVE
          </Badge>
          <Badge tone="zinc">200MS SWEEP SCAN</Badge>
        </>
      }
    >
      {/* ---------- quote cards ---------- */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <EnergyCard sym="CL1!" big />
        <EnergyCard sym="NG1!" />
        <EnergyCard sym="RB1!" />
        <EnergyCard sym="HO1!" />
      </div>

      {/* ---------- 3-2-1 crack spread calculator ---------- */}
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Calculator size={11} className="text-orange-400" />
            3-2-1 CRACK SPREAD CALCULATOR
          </span>
        }
        right={
          <Badge tone={uncC > 8 ? 'rose' : 'amber'}>σ ±{isFinite(uncC) ? uncC.toFixed(1) : '—'}¢</Badge>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <div className="flex items-end gap-3">
              <div className="font-mono text-4xl font-black leading-none text-orange-300">
                {isFinite(crack321) ? fN(crack321, 3) : '—'}
              </div>
              <div className="font-mono text-[10px] leading-tight text-zinc-500">
                USD / BBL
                <br />
                (2·RB + HO − 3·CL) / 3
              </div>
            </div>
            <LineChart
              series={[{ label: '3-2-1 CRACK', color: KT('orange'), data: () => crackRing }]}
              height="h-40"
              zeroLine
              fmtV={(v) => v.toFixed(2)}
            />
          </div>
          <div className="rounded border border-[#161d2c] bg-[#080c14] p-2.5">
            <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">
              CUSTOM CRACK — (a·RB + b·HO − c·CL) / c
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumIn label="RB RATIO (a)" value={rbW} onChange={setRbW} step={0.5} />
              <NumIn label="HO RATIO (b)" value={hoW} onChange={setHoW} step={0.5} />
              <NumIn label="CL RATIO (c)" value={clW} onChange={setClW} step={0.5} />
              <NumIn label="GAL / BBL" value={gal} onChange={setGal} step={1} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat
                label="CUSTOM CRACK"
                value={fSign(customBbl, 3)}
                tone={clsNum(customBbl)}
                sub="USD / BBL — LIVE"
              />
              <Stat
                label="PER GALLON"
                value={fSign(customGal, 4)}
                tone={clsNum(customGal)}
                sub={`${fN(customGal * 100, 2)}¢ / GAL`}
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* ---------- OIB tracker + sweep detector ---------- */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="ORDER-FLOW IMBALANCE (OIB) TRACKER — CL vs NG" right={<Badge tone="zinc">±0.5 BANDS</Badge>}>
          <LineChart
            series={[
              { label: 'CL OFI', color: KT('orange'), data: () => ms.inst['CL1!']?.ofiHist ?? null },
              { label: 'NG OFI', color: KT('teal'), data: () => ms.inst['NG1!']?.ofiHist ?? null },
            ]}
            hlines={[
              { y: 0.5, color: hexA(KT('orange'), 0.45), label: '+0.5' },
              { y: -0.5, color: hexA(KT('orange'), 0.45), label: '-0.5' },
            ]}
            height="h-44"
            fmtV={(v) => v.toFixed(2)}
          />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="CL1! OFI" value={fSign(cl ? cl.ofi : NaN, 2)} tone={clsNum(cl ? cl.ofi : 0)} />
            <Stat label="NG1! OFI" value={fSign(ng ? ng.ofi : NaN, 2)} tone={clsNum(ng ? ng.ofi : 0)} />
            <Stat
              label="CL1! CVD"
              value={cl ? fCompact(cl.cvd) : '—'}
              sub={`NG ${ng ? fCompact(ng.cvd) : '—'} · RB ${rb ? fCompact(rb.cvd) : '—'}`}
            />
            <Stat
              label="SWEEP COUNTER"
              value={fN(sweepCount, 0)}
              tone={sweepHot ? 'text-rose-300' : 'text-zinc-100'}
              sub="|Δln| > 3σ EV"
            />
          </div>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Zap size={11} className="text-rose-400" />
              INSTITUTIONAL CRUDE ACCUMULATOR SWEEP
            </span>
          }
          right={<Badge tone="rose">THRESH 3.0σ</Badge>}
        >
          <FlashAlert
            active={sweepHot}
            tone="rose"
            title={
              lastSweep
                ? `SWEEP ${lastSweep.side} @ ${fPx(lastSweep.px, 2)} — ${Math.max(0, Math.round((Date.now() - lastSweep.t) / 1000))}S AGO`
                : 'ARMED — MONITORING CRUDE TAPE'
            }
          >
            {sweepHot
              ? 'Aggressive size crossing the book on WTI front month — accumulator footprint detected.'
              : 'Detector armed: |ln(P/Pprev)| > 3× per-tick expected vol flags institutional accumulation.'}
          </FlashAlert>
          <div className="mt-2">
            <Tbl head={['UTC TIME', 'PRICE', 'SIDE', '|Δ| BP']} maxH="max-h-56">
              {SWEEPS.length === 0 ? (
                <Tr>
                  <Td className="text-zinc-600">NO SWEEPS LOGGED — DETECTOR ARMED</Td>
                  <Td className="text-zinc-600">—</Td>
                  <Td className="text-zinc-600">—</Td>
                  <Td className="text-zinc-600">—</Td>
                </Tr>
              ) : (
                SWEEPS.map((s, i) => (
                  <Tr key={`${s.t}-${i}`}>
                    <Td className="text-zinc-400">{fClock(s.t)}</Td>
                    <Td className="text-zinc-100">{fPx(s.px, 2)}</Td>
                    <Td>
                      <Badge tone={s.side === 'BUY' ? 'emerald' : 'rose'}>{s.side}</Badge>
                    </Td>
                    <Td className="text-zinc-300">{fN(Math.abs(s.bp), 1)}</Td>
                  </Tr>
                ))
              )}
            </Tbl>
          </div>
        </Panel>
      </div>

      {/* ---------- crude complex basis + crack strips ---------- */}
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Flame size={11} className="text-orange-400" />
            CRUDE COMPLEX BASIS & CRACK STRIPS
          </span>
        }
        right={<Badge tone="zinc">Δ vs 120 TICKS</Badge>}
      >
        <Tbl head={['INSTRUMENT', 'LAST', 'CHG%', 'BID', 'ASK', 'SPRD-BPS', 'OFI', 'CVD', 'IV', 'RV']}>
          {EN.map((s) => {
            const st = ms.inst[s];
            if (!st) return null;
            return (
              <Tr key={s}>
                <Td className="font-semibold text-zinc-200">{s}</Td>
                <Td className="text-zinc-100">{fPx(st.last, st.def.dec)}</Td>
                <Td className={`font-semibold ${toneNum(st.changePct)}`}>{fPct(st.changePct)}</Td>
                <Td className="text-emerald-300/90">{fPx(st.bid, st.def.dec)}</Td>
                <Td className="text-rose-300/90">{fPx(st.ask, st.def.dec)}</Td>
                <Td className="text-zinc-400">{fBps(st.spreadBps)}</Td>
                <Td className={`font-semibold ${clsNum(st.ofi)}`}>{fSign(st.ofi, 2)}</Td>
                <Td className="text-zinc-300">{fCompact(st.cvd)}</Td>
                <Td className="text-amber-300/90">{fN(st.iv, 1)}</Td>
                <Td className="text-emerald-300/90">{fN(st.rv, 1)}</Td>
              </Tr>
            );
          })}
          {strips.map((s) => (
            <Tr key={s.label}>
              <Td className="font-semibold text-orange-300">{s.label}</Td>
              <Td className="text-zinc-100">{isFinite(s.v) ? fN(s.v, 3) : '—'}</Td>
              <Td className={`font-semibold ${toneNum(s.chg)}`}>{fPct(s.chg)}</Td>
              <Td className="text-zinc-600">—</Td>
              <Td className="text-zinc-600">—</Td>
              <Td className="text-zinc-600">—</Td>
              <Td className="text-zinc-600">—</Td>
              <Td className="text-zinc-600">—</Td>
              <Td className="text-zinc-600">—</Td>
              <Td className="text-zinc-600">—</Td>
            </Tr>
          ))}
        </Tbl>
      </Panel>
    </DeskFrame>
  );
}
