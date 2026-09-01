'use client';
/**
 * KRUPP CAPITAL — DESK 02: OPTIONS TRADING & RISK MANAGEMENT
 * DERIV-HUB / VOL-SURFACE
 *
 * Sub-tabs:
 *   1. VOL SURFACE & SKEW ENGINE   — 24×41 upsampled IV surface, 7D/30D smiles, ATM term structure
 *   2. GEX & VANNA PROFILE DESK    — dealer gamma per strike, flip level, vanna proxy
 *   3. MAX PAIN & EXP MOVE CALC    — pain curve, EM cone, pin risk
 *   4. ORDER EXECUTION & GREEKS TERMINAL — full-greek ladder, execution ticket, sim blotter
 *
 * Engineering contract: all chart data lives in MODULE-LEVEL persistent
 * buffers mutated by a single 1 Hz rebuild interval. Draw closures handed to
 * the canvas charts return those buffers by reference — zero allocation per
 * frame. React re-renders (stats/tables) ride the 5 Hz engine revision.
 */
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  Activity, BarChart3, Crosshair, Receipt, Sigma, Target, Waves, Zap,
  type LucideIcon,
} from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { getDerivs } from '@/lib/krupp/derivs';
import { bsGreeks, type Greeks } from '@/lib/krupp/math';
import { fCompact, fN, fPct, fPx, fSign, fVolPts, toneNum } from '@/lib/krupp/format';
import { useKrupp, useRevision, useSelected, useSubTab } from '@/lib/krupp/store';
import { Badge, clsNum, FlashAlert, Panel, SectionLabel, Stat, Tbl, Td, Tr } from '@/components/krupp/ui';
import { DeskFrame, SubPane } from '@/components/krupp/DeskFrame';
import { Surface3D } from '@/components/krupp/charts/Surface3D';
import { BarChart, type BarSpec } from '@/components/krupp/charts/BarChart';
import { LineChart, type HLine, type Marker } from '@/components/krupp/charts/LineChart';
import { KT } from '@/lib/theme';

/* ================================================================ *
 * MODULE-LEVEL PERSISTENT STATE (survives tab switches, zero-GC)
 * ================================================================ */
const N_STRIKES = 41; // 0.90 → 1.10 relative strikes
const N_EXP = 9; // 0/1/2/3/7/14/30/60/90 DTE
const N_ROWS = 24; // upsampled expiry rows for the surface
const MID = 20; // ATM strike index
const C = {
  emerald: KT('upDeep'),
  emeraldLt: KT('up'),
  rose: KT('downDeep'),
  roseLt: KT('down'),
  amber: KT('warnDeep'),
  cyan: KT('cyan'),
  teal: KT('teal'),
  violet: KT('violet'),
  zinc: KT('text'),
  axis: KT('axisFaint'),
};

let started = false;

/* ---- chart scratch (returned by reference from draw closures) ---- */
const grid: number[][] = []; // 24 × 41 IV surface, rebuilt 1 Hz
const xLabelsArr: string[] = new Array<string>(N_STRIKES).fill('');
const yLabelsArr: string[] = new Array<string>(N_ROWS).fill('');
const smile7 = new Float32Array(N_STRIKES);
const smile30 = new Float32Array(N_STRIKES);
const termBars: BarSpec[] = Array.from({ length: N_EXP }, () => ({ v: 0, color: C.violet, label: '' }));
const gexBars: BarSpec[] = Array.from({ length: N_STRIKES }, () => ({ v: 0, color: C.emerald, label: '' }));
const vannaBars: BarSpec[] = Array.from({ length: N_STRIKES }, () => ({ v: 0, color: C.teal, label: '' }));
const painArr = new Float32Array(N_STRIKES);
const painMarkers: Marker[] = [{ pos: MID, label: 'MAX PAIN', color: C.rose }];
const spotLine = new Float32Array(2); // [spot, spot] constant overlay series

/* ---- 1 Hz recomputed aggregates ---- */
let spotS = 0;
let atmS = 0;
let rr25 = 0; // 25Δ risk-reversal proxy (7D, K=105% − K=95%)
let skewSlope = 0; // LSQ slope of 7D smile vs log-moneyness
let termSpread = 0; // ATM 30D − 7D IV
let netGex = 0; // Σ dealer gamma exposure
let oiCallSum = 0;
let oiPutSum = 0;
let strikeLo = 0;
let strikeHi = 0;
let gexPeakIdx = 0;
let callWallIdx = 0;
let putWallIdx = 0;

/* ---- simulated order blotter (module-persistent, cap 20) ---- */
interface BlotterRow {
  t: number;
  sym: string;
  side: 'CALL' | 'PUT';
  qty: number;
  px: number;
  status: 'FILLED';
}
const blotter: BlotterRow[] = [];

/** Module-scope mutator — blotter is never touched from component scope. */
function pushBlotter(sym: string, side: 'CALL' | 'PUT', qty: number, px: number): void {
  blotter.unshift({ t: Date.now(), sym, side, qty, px, status: 'FILLED' });
  if (blotter.length > 20) blotter.length = 20;
}

/* ================================================================ *
 * 1 Hz REBUILD — the ONLY place that allocates chart data
 * ================================================================ */
function rebuild(): void {
  const D = getDerivs();
  if (D.updatedAt === 0 || D.iv.length !== N_EXP || D.iv[0].length !== N_STRIKES) return;
  const S = D.spot;
  spotS = S;
  atmS = D.atmVol;

  /* --- vol surface: upsample 9 expiry rows → 24 (linear in expiry index) --- */
  for (let r = 0; r < N_ROWS; r++) {
    let row = grid[r];
    if (row === undefined || row.length !== N_STRIKES) {
      row = new Array<number>(N_STRIKES).fill(0);
      grid[r] = row;
    }
    const t = (r / (N_ROWS - 1)) * (N_EXP - 1);
    const j0 = Math.min(N_EXP - 2, Math.floor(t));
    const f = t - j0;
    const ra = D.iv[j0];
    const rb = D.iv[j0 + 1];
    for (let i = 0; i < N_STRIKES; i++) row[i] = ra[i] + (rb[i] - ra[i]) * f;
    const dte = D.expiries[j0] + (D.expiries[j0 + 1] - D.expiries[j0]) * f;
    yLabelsArr[r] =
      'D' + (dte < 10 && Math.abs(dte - Math.round(dte)) > 1e-9 ? dte.toFixed(1) : String(Math.round(dte)));
  }
  for (let i = 0; i < N_STRIKES; i++) {
    xLabelsArr[i] = '$' + fN(Math.round((S * D.mult[i]) / 5) * 5, 0);
  }

  /* --- skew smiles (zero-alloc draw scratches) --- */
  smile7.set(D.iv[4]);
  smile30.set(D.iv[6]);

  /* --- ATM term structure bars --- */
  for (let j = 0; j < N_EXP; j++) {
    termBars[j].v = D.iv[j][MID];
    termBars[j].color = C.violet;
    termBars[j].label = String(D.expiries[j]);
  }

  /* --- skew analytics --- */
  rr25 = D.iv[4][30] - D.iv[4][10]; // mult[30]=1.05, mult[10]=0.95
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < N_STRIKES; i++) {
    const x = Math.log(D.mult[i]);
    const y = D.iv[4][i];
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const dnm = N_STRIKES * sxx - sx * sx;
  skewSlope = Math.abs(dnm) > 1e-9 ? (N_STRIKES * sxy - sx * sy) / dnm : 0;
  termSpread = D.iv[6][MID] - D.iv[4][MID];

  /* --- dealer GEX bars + aggregates --- */
  netGex = 0;
  gexPeakIdx = 0;
  for (let i = 0; i < N_STRIKES; i++) {
    const v = D.gex[i];
    const b = gexBars[i];
    b.v = v;
    b.color = v >= 0 ? C.emerald : C.rose;
    b.label = String(Math.round((S * D.mult[i]) / 25) * 25);
    netGex += v;
    if (Math.abs(v) > Math.abs(D.gex[gexPeakIdx])) gexPeakIdx = i;
  }

  /* --- vanna proxy: vega × 0.02 × (K/S − 1), 7-DTE --- */
  for (let i = 0; i < N_STRIKES; i++) {
    const K = S * D.mult[i];
    const gk = bsGreeks(S, K, 7 / 365, D.iv[4][i] / 100, 0.045, true);
    const v = gk.vega * 0.02 * (K / S - 1);
    const b = vannaBars[i];
    b.v = v;
    b.color = v >= 0 ? C.teal : C.roseLt;
    b.label = '';
  }

  /* --- pain curve + max-pain marker index --- */
  painArr.set(D.pain);
  let bi = 0;
  for (let i = 1; i < N_STRIKES; i++) if (painArr[i] < painArr[bi]) bi = i;
  painMarkers[0].pos = N_STRIKES - 1 - bi;

  /* --- EM cone spot scratch --- */
  spotLine[0] = S;
  spotLine[1] = S;

  /* --- OI aggregates + walls --- */
  oiCallSum = 0;
  oiPutSum = 0;
  callWallIdx = 0;
  putWallIdx = 0;
  for (let i = 0; i < N_STRIKES; i++) {
    oiCallSum += D.oiCall[i];
    oiPutSum += D.oiPut[i];
    if (D.oiCall[i] > D.oiCall[callWallIdx]) callWallIdx = i;
    if (D.oiPut[i] > D.oiPut[putWallIdx]) putWallIdx = i;
  }

  strikeLo = S * D.mult[0];
  strikeHi = S * D.mult[N_STRIKES - 1];
}

function ensureDesk2(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  setInterval(rebuild, 1000);
  rebuild();
}

/* ================================================================ *
 * SMALL HELPERS (module level — stable identity across renders)
 * ================================================================ */
function fx(v: number, d: number): string {
  return isFinite(v) ? v.toFixed(d) : '—';
}

function Tit({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon size={11} className="text-violet-400" />
      {text}
    </span>
  );
}

function MiniCell({ k, v, tone = 'text-zinc-200' }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded border border-kborder bg-kpanel px-2 py-1">
      <div className="font-mono text-[8.5px] uppercase tracking-wider text-zinc-500">{k}</div>
      <div className={`font-mono text-[12px] font-semibold ${tone}`}>{v}</div>
    </div>
  );
}

function GuardChip({ label, on }: { label: string; on: boolean }) {
  return on ? (
    <Badge tone="rose" pulse>
      {label} · ENGAGED
    </Badge>
  ) : (
    <Badge tone="zinc">{label} · ARMED</Badge>
  );
}

/* ================================================================ *
 * DESK 02
 * ================================================================ */
export default function Desk02Options() {
  useRevision(); // 5 Hz repaint of stats / tables
  useEffect(() => {
    ensureDesk2();
  }, []);

  const sub = useSubTab(1);
  const select = useKrupp((s) => s.select);
  const D = getDerivs();
  const spot = D.spot;

  /* ---------- shared risk flags ---------- */
  const flipGapPct = spot > 0 ? ((spot - D.gexFlip) / spot) * 100 : 0;
  const flipNear = Math.abs(flipGapPct) < 0.4;
  const painGapPct = spot > 0 ? ((D.maxPain - spot) / spot) * 100 : 0;
  const pinRisk = Math.abs(painGapPct) < 0.3;
  const crisisActive = ms.crisis.active;

  /* ---------- execution ticket state ---------- */
  const [side, setSide] = useState<'CALL' | 'PUT'>('CALL');
  const [qty, setQty] = useState('10');
  const isCall = side === 'CALL';

  const midRow = D.ladder.length > 0 ? D.ladder[Math.floor(D.ladder.length / 2)] : undefined;
  const selStr = useSelected('desk2opt', midRow ? String(midRow.strike) : '');
  const selRow = D.ladder.find((r) => String(r.strike) === selStr) ?? undefined;

  /* live contract analytics — recomputed every 5 Hz render */
  let tk: Greeks | null = null;
  if (selRow) tk = bsGreeks(spot, selRow.strike, 1 / 365, selRow.ivC / 100, 0.045, isCall);
  const tkBid = selRow ? (isCall ? selRow.bidC : selRow.bidP) : NaN;
  const tkAsk = selRow ? (isCall ? selRow.askC : selRow.askP) : NaN;
  const qtyN = Math.max(0, Math.round(Number(qty) || 0));
  const estPrem = tk && qtyN > 0 ? qtyN * 100 * tk.price : NaN;
  const cpRatio = oiPutSum > 0 ? oiCallSum / oiPutSum : NaN;

  const submitOrder = (): void => {
    if (!selRow || !tk || qtyN <= 0) return;
    pushBlotter(
      `ES1! ${isCall ? 'C' : 'P'} ${fN(selRow.strike, 0)}`,
      side,
      qtyN,
      (tkBid + tkAsk) / 2,
    );
    useKrupp.getState().bump(); // instant repaint
  };

  /* ---------- expected-move cone hlines ---------- */
  const em0 = D.expMove[0];
  const em7 = D.expMove[2];
  const emHlines: HLine[] = [];
  if (em0) {
    emHlines.push({ y: em0.up, color: C.emeraldLt, label: '0D +EM' });
    emHlines.push({ y: em0.dn, color: C.roseLt, label: '0D −EM' });
  }
  if (em7) {
    emHlines.push({ y: em7.up, color: C.emerald, label: '7D +EM' });
    emHlines.push({ y: em7.dn, color: C.rose, label: '7D −EM' });
  }

  /* ---------- 7D wing monitor (render-time read, trivial cost) ---------- */
  const iv7 = D.iv.length === N_EXP ? D.iv[4] : undefined;
  const atm7 = iv7 ? iv7[MID] : NaN;

  return (
    <DeskFrame
      deskId={1}
      title="OPTIONS TRADING & RISK DESK"
      code="DERIV-HUB/VOL-SURFACE"
      subtabs={['VOL SURFACE & SKEW', 'GEX & VANNA', 'MAX PAIN & EXP MOVE', 'GREEKS TERMINAL']}
      accent="violet"
      right={
        <Badge tone="violet">
          {fN(spot, 2)} · ATM {fVolPts(D.atmVol)}
        </Badge>
      }
    >
      {/* ============================== SUB-TAB 1 — VOL SURFACE & SKEW ============================== */}
      <SubPane active={sub} index={0}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title={<Tit icon={Waves} text="VOL SURFACE — ES1! RELATIVE STRIKE GRID 90–110%" />}
            right={
              <>
                <Badge tone="violet">41 K × 24 T</Badge>
                <Badge tone="zinc">LINEAR UPSAMPLE · 1 HZ</Badge>
              </>
            }
            bodyClass="p-2"
          >
            <Surface3D
              z={() => (grid.length === N_ROWS ? grid : null)}
              xLabels={() => xLabelsArr}
              yLabels={() => yLabelsArr}
              height="h-[330px]"
            />
          </Panel>
          <Panel
            title={<Tit icon={Activity} text="SKEW SMILE — 7D VS 30D" />}
            right={<Badge tone={rr25 <= 0 ? 'emerald' : 'amber'}>RR25 {fSign(rr25, 2)}</Badge>}
            bodyClass="p-2"
          >
            <LineChart
              series={[
                { label: '7-DTE', color: C.cyan, data: () => smile7, width: 1.6 },
                { label: '30-DTE', color: C.amber, data: () => smile30, width: 1.6 },
              ]}
              fmtV={(v) => v.toFixed(1)}
              height="h-[330px]"
              yPad={0.18}
            />
          </Panel>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Panel title={<Tit icon={BarChart3} text="ATM TERM STRUCTURE — BASE IV BY DTE" />} bodyClass="p-2">
            <BarChart bars={() => termBars} fmtV={(v) => v.toFixed(1)} height="h-44" zeroLine={false} />
          </Panel>
          <Panel title={<Tit icon={Sigma} text="SKEW & TERM ANALYTICS" />}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="ATM IV (VIX PROXY)" value={fVolPts(atmS)} sub="ES1! SURFACE ANCHOR" tone="text-violet-300" />
              <Stat
                label="25Δ RISK REVERSAL"
                value={fSign(rr25, 2)}
                sub="7D · 105% IV − 95% IV"
                tone={rr25 <= 0 ? 'text-emerald-400' : 'text-rose-400'}
              />
              <Stat
                label="SKEW SLOPE (LSQ)"
                value={fSign(skewSlope, 1)}
                sub="IV PTS / LOG-MONEYNESS"
                tone={skewSlope <= 0 ? 'text-emerald-400' : 'text-rose-400'}
              />
              <Stat
                label="TERM SPREAD 30−7"
                value={fSign(termSpread, 2)}
                sub="ATM IV PTS · CONTANGO"
                tone={termSpread >= 0 ? 'text-emerald-400' : 'text-rose-400'}
              />
            </div>
          </Panel>
          <Panel title={<Tit icon={Target} text="7-DTE WING MONITOR" />} bodyClass="p-0">
            <Tbl head={['POINT', 'STRIKE', 'IV', 'VS ATM']} maxH="max-h-48">
              {[
                { p: 'PUT WING 90%', k: spot * 0.9, iv: iv7 ? iv7[0] : NaN },
                { p: 'ATM 100%', k: spot, iv: atm7 },
                { p: 'CALL WING 110%', k: spot * 1.1, iv: iv7 ? iv7[N_STRIKES - 1] : NaN },
              ].map((row) => (
                <Tr key={row.p}>
                  <Td className="text-zinc-300">{row.p}</Td>
                  <Td className="text-zinc-400">{fN(row.k, 0)}</Td>
                  <Td className="text-kaccent-soft">{fx(row.iv, 2)}</Td>
                  <Td className={clsNum(row.iv - atm7)}>{fx(row.iv - atm7, 2)}</Td>
                </Tr>
              ))}
            </Tbl>
          </Panel>
        </div>
      </SubPane>

      {/* ============================== SUB-TAB 2 — GEX & VANNA ============================== */}
      <SubPane active={sub} index={1}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title={<Tit icon={Zap} text="DEALER GEX PROFILE — GAMMA EXPOSURE PER STRIKE" />}
            right={
              <>
                <Badge tone="zinc">7D GAMMA · 1% MOVE</Badge>
                <Badge tone="zinc">STRIKES ×25</Badge>
              </>
            }
            bodyClass="p-2"
          >
            <BarChart
              bars={() => gexBars}
              symmetric
              zeroLine={false}
              hlines={[{ y: 0, color: C.axis }]}
              fmtV={(v) => fCompact(v)}
              height="h-64"
            />
          </Panel>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="GEX FLIP LEVEL" value={'$' + fN(D.gexFlip, 0)} sub="CUM GAMMA SIGN FLIP" tone="text-amber-300" />
              <Stat
                label="SPOT → FLIP DIST"
                value={fSign(spot - D.gexFlip, 1)}
                sub={`${fSign((spot - D.gexFlip) / spot * 1e4, 1)} BPS · ALERT < 0.40%`}
                tone={clsNum(spot - D.gexFlip)}
              />
              <div className="col-span-2">
                <Stat
                  label="NET DEALER POSITIONING"
                  value={`${fCompact(netGex)} / 1%`}
                  sub={
                    netGex >= 0
                      ? 'DEALERS LONG GAMMA — VOL SUPPRESSED'
                      : 'DEALERS SHORT GAMMA — VOL AMPLIFIED'
                  }
                  tone={netGex >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                  className="w-full"
                />
              </div>
            </div>
            <FlashAlert active={flipNear} tone="rose" title="GEX FLIP IMMINENT — PINNING REGIME UNSTABLE">
              SPOT {fN(spot, 1)} VS FLIP {fN(D.gexFlip, 1)} · Δ{fSign(flipGapPct, 2)}% — dealer re-hedging
              flips sign; expect gamma squeeze, chop pins and vol amplification.
            </FlashAlert>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title={<Tit icon={Waves} text="VANNA PROFILE — $ΔVEGA PER 1% IV MOVE" />}
            right={<Badge tone="zinc">PROXY: VEGA × 0.02 × (K/S−1) · 7D</Badge>}
            bodyClass="p-2"
          >
            <BarChart
              bars={() => vannaBars}
              symmetric
              zeroLine={false}
              hlines={[{ y: 0, color: C.axis }]}
              fmtV={(v) => fx(v, 3)}
              height="h-44"
            />
          </Panel>
          <Panel title={<Tit icon={Target} text="DEALER BOOK REFERENCE" />} bodyClass="p-0">
            <Tbl head={['METRIC', 'STRIKE', 'VALUE']} maxH="max-h-48">
              {[
                { m: 'CALL WALL', k: spot * D.mult[callWallIdx], v: fCompact(D.oiCall[callWallIdx]), t: 'text-emerald-400' },
                { m: 'PUT WALL', k: spot * D.mult[putWallIdx], v: fCompact(D.oiPut[putWallIdx]), t: 'text-rose-400' },
                { m: 'GAMMA PEAK', k: spot * D.mult[gexPeakIdx], v: fCompact(D.gex[gexPeakIdx]), t: 'text-amber-300' },
                { m: 'MAX PAIN', k: D.maxPain, v: fPct(painGapPct, 2), t: 'text-zinc-300' },
                { m: 'NET GEX', k: NaN, v: fCompact(netGex), t: netGex >= 0 ? 'text-emerald-400' : 'text-rose-400' },
              ].map((row) => (
                <Tr key={row.m}>
                  <Td className="text-zinc-300">{row.m}</Td>
                  <Td className="text-zinc-400">{fN(row.k, 0)}</Td>
                  <Td className={row.t}>{row.v}</Td>
                </Tr>
              ))}
            </Tbl>
          </Panel>
        </div>
      </SubPane>

      {/* ============================== SUB-TAB 3 — MAX PAIN & EXP MOVE ============================== */}
      <SubPane active={sub} index={2}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title={<Tit icon={Crosshair} text="DEALER PAIN CURVE — SETTLEMENT PAIN BY STRIKE ($M)" />}
            right={
              <>
                <Badge tone="amber">MAX PAIN {fN(D.maxPain, 0)}</Badge>
                <Badge tone="zinc">
                  ${fN(strikeLo, 0)}–${fN(strikeHi, 0)}
                </Badge>
              </>
            }
            bodyClass="p-2"
          >
            <LineChart
              series={[{ label: 'PAIN $M', color: C.amber, data: () => painArr, width: 1.6 }]}
              markers={() => painMarkers}
              fmtV={(v) => v.toFixed(0)}
              height="h-56"
              yPad={0.08}
            />
          </Panel>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="MAX PAIN STRIKE" value={fN(D.maxPain, 0)} sub="MIN-DEALER-LOSS LEVEL" tone="text-amber-300" />
              <Stat
                label="PAIN GAP"
                value={fPct(painGapPct, 2)}
                sub="SPOT → PAIN WELL · ALERT < 0.30%"
                tone={pinRisk ? 'text-rose-400' : 'text-zinc-100'}
              />
              <Stat
                label="TOTAL OPEN INTEREST"
                value={fCompact(oiCallSum + oiPutSum)}
                sub={`C/P ${fN(cpRatio, 2)}`}
                tone="text-zinc-100"
                className="col-span-2"
              />
            </div>
            <FlashAlert active={pinRisk} tone="amber" title="PIN RISK — SPOT INSIDE MAX PAIN GRAVITY WELL">
              Gap {fSign(painGapPct, 2)}% — dealers minimize payout by dragging spot into {fN(D.maxPain, 0)}{' '}
              into expiry; expect suppressed range and heavy pinning flow.
            </FlashAlert>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title={<Tit icon={Activity} text="EXPECTED MOVE CONE — 0DTE VS 7D" />}
            right={<Badge tone="zinc">1σ STRADDLE BREACH LEVELS</Badge>}
            bodyClass="p-2"
          >
            <LineChart
              series={[{ label: 'SPOT', color: C.zinc, data: () => spotLine, width: 1.4 }]}
              hlines={emHlines}
              fmtV={(v) => fN(v, 0)}
              height="h-56"
              yPad={0.06}
            />
          </Panel>
          <Panel title={<Tit icon={Target} text="EXPECTED MOVE TABLE" />} bodyClass="p-0">
            <Tbl head={['DTE', 'IV', 'UPPER', 'LOWER', 'RANGE %']} maxH="max-h-56">
              {D.expMove.map((e) => (
                <Tr key={e.dte}>
                  <Td className="text-zinc-300">{e.dte}D</Td>
                  <Td className="text-kaccent-soft">{fVolPts(e.iv)}</Td>
                  <Td className="text-emerald-400">{fN(e.up, 1)}</Td>
                  <Td className="text-rose-400">{fN(e.dn, 1)}</Td>
                  <Td className="text-zinc-300">{fPct(spot > 0 ? ((e.up - e.dn) / spot) * 100 : NaN, 2)}</Td>
                </Tr>
              ))}
            </Tbl>
            {em7 && (
              <div className="border-t border-kinset px-3 py-2">
                <Stat
                  label="7D HALF-RANGE"
                  value={`±${fN((em7.up - em7.dn) / 2, 0)} PTS`}
                  sub={`IV ${fVolPts(em7.iv)} · 1σ WEEKLY`}
                  tone="text-violet-300"
                />
              </div>
            )}
          </Panel>
        </div>
      </SubPane>

      {/* ============================== SUB-TAB 4 — GREEKS TERMINAL ============================== */}
      <SubPane active={sub} index={3}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="CONTRACTS TRACKED" value={String(D.ladder.length)} sub="±11 STRIKES · T+1 DTE" />
          <Stat label="AGG CALL OI" value={fCompact(oiCallSum)} sub="41-STRIKE TOTAL" tone="text-emerald-400" />
          <Stat
            label="AGG PUT OI"
            value={fCompact(oiPutSum)}
            sub={crisisActive ? 'CRISIS PUT BUILD-UP' : 'BASELINE PUT SKEW'}
            tone="text-rose-400"
          />
          <Stat
            label="C/P OI RATIO"
            value={fx(cpRatio, 2)}
            sub={cpRatio < 0.8 ? 'PUT-HEAVY — HEDGE DOMINANT' : 'CALL-LEAN — CARRY FLOW'}
            tone={cpRatio < 0.8 ? 'text-rose-400' : 'text-emerald-400'}
          />
          <div className="col-span-2 flex items-center md:col-span-1">
            <Badge tone="amber" pulse className="w-full justify-center py-1.5">
              0-1 DTE CHURN
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title={<Tit icon={Sigma} text="ES1! OPTION LADDER — FULL GREEKS" />}
            right={<Badge tone="violet">5 HZ REFRESH · T+1</Badge>}
            bodyClass="p-2"
          >
            <Tbl
              head={[
                'STRIKE', 'C-BID', 'C-ASK', 'C-IV', 'C-Δ', 'C-Γ', 'C-Θ', 'C-VEGA', 'C-ρ', 'OI-C', 'VOL-C',
                'P-BID', 'P-ASK', 'P-IV', 'P-Δ', 'P-Θ', 'OI-P', 'VOL-P',
              ]}
              maxH="max-h-[520px]"
            >
              {D.ladder.map((r) => {
                const dc = Math.abs(r.deltaC);
                const flash = dc > 0.8 ? 'bg-rose-950/30' : dc < 0.2 ? 'bg-emerald-950/30' : '';
                return (
                  <Tr key={r.strike} className={flash}>
                    <Td className="font-semibold text-zinc-100">{fN(r.strike, 0)}</Td>
                    <Td className="text-zinc-300">{fPx(r.bidC, 2)}</Td>
                    <Td className="text-zinc-300">{fPx(r.askC, 2)}</Td>
                    <Td className="text-kaccent-soft">{fVolPts(r.ivC)}</Td>
                    <Td className={toneNum(r.deltaC)}>{fx(r.deltaC, 2)}</Td>
                    <Td className="text-amber-300">{fx(r.gamma, 4)}</Td>
                    <Td className={toneNum(r.thetaC)}>{fx(r.thetaC, 2)}</Td>
                    <Td className="text-kaccent-soft">{fx(r.vega, 2)}</Td>
                    <Td className="text-zinc-500">{fx(r.rhoC, 3)}</Td>
                    <Td className="text-zinc-400">{fCompact(r.oic)}</Td>
                    <Td className="text-zinc-300">{fCompact(r.volC)}</Td>
                    <Td className="border-l border-kborder text-zinc-300">{fPx(r.bidP, 2)}</Td>
                    <Td className="text-zinc-300">{fPx(r.askP, 2)}</Td>
                    <Td className="text-kaccent-soft">{fVolPts(r.ivP)}</Td>
                    <Td className={toneNum(r.deltaP)}>{fx(r.deltaP, 2)}</Td>
                    <Td className={toneNum(r.thetaP)}>{fx(r.thetaP, 2)}</Td>
                    <Td className="text-zinc-400">{fCompact(r.oip)}</Td>
                    <Td className="text-zinc-300">{fCompact(r.volP)}</Td>
                  </Tr>
                );
              })}
            </Tbl>
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title={<Tit icon={Receipt} text="EXECUTION TICKET — ES1! OPTIONS" />}>
              <SectionLabel>CONTRACT</SectionLabel>
              <select
                value={selStr}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => select('desk2opt', e.target.value)}
                className="mt-1 w-full rounded border border-kborder2 bg-kpanel px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-violet-500/60"
              >
                {D.ladder.map((r) => (
                  <option key={r.strike} value={String(r.strike)}>
                    {fN(r.strike, 0)} · IV {fVolPts(r.ivC)}
                  </option>
                ))}
              </select>
              <div className="mt-1 font-mono text-[10px] tracking-wider text-zinc-500">
                {selRow
                  ? `ES1! ${isCall ? 'C' : 'P'} ${fN(selRow.strike, 0)} · T+1 DTE · IV ${fVolPts(selRow.ivC)}`
                  : 'AWAITING LADDER STREAM…'}
              </div>

              <div className="mt-2">
                <SectionLabel>SIDE</SectionLabel>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSide('CALL')}
                    className={`rounded border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.18em] transition-colors ${
                      isCall
                        ? 'border-emerald-400/70 bg-emerald-400/10 text-emerald-300'
                        : 'border-kborder2 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    CALL
                  </button>
                  <button
                    onClick={() => setSide('PUT')}
                    className={`rounded border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.18em] transition-colors ${
                      !isCall
                        ? 'border-rose-400/70 bg-rose-400/10 text-rose-300'
                        : 'border-kborder2 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    PUT
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <SectionLabel>QUANTITY</SectionLabel>
                <input
                  value={qty}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  aria-label="Order quantity"
                  className="mt-1 w-full rounded border border-kborder2 bg-kpanel px-2 py-1.5 font-mono text-[12px] text-zinc-200 outline-none focus:border-violet-500/60"
                />
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <MiniCell k="MODEL PX" v={fx(tk ? tk.price : NaN, 2)} tone="text-zinc-100" />
                <MiniCell k="MID" v={fx((tkBid + tkAsk) / 2, 2)} />
                <MiniCell k="SPREAD" v={fx(tkAsk - tkBid, 2)} tone="text-zinc-400" />
                <MiniCell k="DELTA" v={fx(tk ? tk.delta : NaN, 2)} tone={toneNum(tk ? tk.delta : 0)} />
                <MiniCell k="GAMMA" v={fx(tk ? tk.gamma : NaN, 4)} tone="text-amber-300" />
                <MiniCell k="THETA" v={fx(tk ? tk.theta : NaN, 2)} tone={toneNum(tk ? tk.theta : 0)} />
                <MiniCell k="VEGA" v={fx(tk ? tk.vega : NaN, 2)} tone="text-kaccent-soft" />
                <MiniCell k="RHO" v={fx(tk ? tk.rho : NaN, 3)} tone="text-zinc-400" />
                <MiniCell k="EST PREMIUM" v={fx(estPrem, 0)} tone="text-violet-300" />
              </div>

              <button
                onClick={submitOrder}
                disabled={!selRow || qtyN <= 0}
                className="mt-2 w-full rounded border border-violet-500/70 bg-violet-500/10 px-3 py-2 font-mono text-[11px] font-bold tracking-[0.22em] text-violet-300 transition-colors hover:bg-violet-500/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                SUBMIT MARKET ORDER — SIM
              </button>

              <div className="mt-3 border-t border-kborder3 pt-2">
                <SectionLabel>PRE-TRADE INTERCEPTOR</SectionLabel>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {crisisActive ? (
                    <>
                      <GuardChip label="BLOCK MR" on={ms.interceptors.blockMR} />
                      <GuardChip label="REDUCE SIZE" on={ms.interceptors.reduceSize} />
                      <GuardChip label="FLATTEN" on={ms.interceptors.flatten} />
                    </>
                  ) : (
                    <Badge tone="emerald">ALL CLEAR — PASS-THROUGH</Badge>
                  )}
                </div>
              </div>
            </Panel>
            <Panel
              title={<Tit icon={Receipt} text="ORDER BLOTTER (SIM)" />}
              right={<Badge tone={blotter.length > 0 ? 'emerald' : 'zinc'}>{blotter.length}/20 FILLS</Badge>}
              bodyClass="p-0"
            >
              {blotter.length === 0 ? (
                <div className="px-3 py-5 text-center font-mono text-[10px] tracking-wider text-zinc-600">
                  NO FILLS YET — SUBMIT A TICKET TO POPULATE
                </div>
              ) : (
                <Tbl head={['TIME', 'SYM', 'SIDE', 'QTY', 'PX', 'STATUS']} maxH="max-h-64">
                  {blotter.map((o) => (
                    <Tr key={`${o.t}-${o.sym}`}>
                      <Td className="text-zinc-500">{new Date(o.t).toISOString().slice(11, 19)}</Td>
                      <Td className="text-zinc-200">{o.sym}</Td>
                      <Td className={o.side === 'CALL' ? 'text-emerald-400' : 'text-rose-400'}>{o.side}</Td>
                      <Td className="text-zinc-300">{o.qty}</Td>
                      <Td className="text-zinc-300">{fx(o.px, 2)}</Td>
                      <Td className="font-semibold text-emerald-400">{o.status}</Td>
                    </Tr>
                  ))}
                </Tbl>
              )}
            </Panel>
          </div>
        </div>
      </SubPane>
    </DeskFrame>
  );
}
