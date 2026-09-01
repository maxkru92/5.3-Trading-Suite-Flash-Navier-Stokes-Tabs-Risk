'use client';
/**
 * KRUPP CAPITAL — DESK 07 · FX FUTURES DESK (deskId 6)
 *
 * Six G1 currency-future quote cards (last, chg%, EVZ-linked IV, sparkline,
 * OFI) on top of a quantitative overlay stack:
 *   · Cross-rate matrix cross[i][j] = lastᵢ/lastⱼ — module-level 6×6 number
 *     matrix recomputed on a guarded 1s interval, rendered via Heatmap mono.
 *   · PPP overlay: PPP_BASE = px0ᵢ/px0ⱼ fixed at module init; deviation% =
 *     (cross/PPP − 1)×100 heat-mapped; per-pair entropy = clamp(|dev|×20);
 *     PURCHASING POWER ENTROPY INDEX = mean |dev| with zoned gauge.
 *   · Hawkes self-exciting flow-toxicity engine: λ pushed on a guarded 200ms
 *     interval, λₜ = μ + (λₜ₋₁−μ)·e^(−0.2/5) + 8·Σ|ret_tick|, μ = 0.35;
 *     toxicity spike line 2.0 / calm line 0.8, FlashAlert + λ gauge (0..4).
 *   · USD COMPOSITE BETA — inverted mean Δ of the six futures vs listing px.
 * Module-level persistent state; Heatmap values() returns module arrays;
 * zero allocation inside chart draw closures.
 */
import { useEffect } from 'react';
import { Repeat, Waves } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { G } from '@/lib/krupp/universe';
import { Ring } from '@/lib/krupp/ring';
import { clamp } from '@/lib/krupp/math';
import { fN, fSign, fPct, fBps, fPx, toneNum } from '@/lib/krupp/format';
import { useRevision } from '@/lib/krupp/store';
import { Panel, Badge, Stat, FlashAlert, Tbl, Tr, Td, clsNum } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { Heatmap } from '@/components/krupp/charts/Heatmap';
import { Gauge } from '@/components/krupp/charts/Gauge';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { KT } from '@/lib/theme';

/* ================= module-level persistent state ================= */

const FX: readonly string[] = G.FX_FUT;
const N = FX.length; // 6
const LBL: string[] = FX.map((s) => s.slice(0, 2)); // 6E 6J 6B 6A 6C 6F

/** PPP base matrix px0ᵢ/px0ⱼ — fixed constants, computed once at module init */
const pppBase: number[][] = [];
/** live cross rates lastᵢ/lastⱼ — mutated in place on the 1s interval */
const cross: number[][] = [];
/** deviation% = (cross/PPP − 1)×100 */
const devPct: number[][] = [];
/** per-pair PPP entropy = clamp(|dev|×20, 0, 100) */
const entMat: number[][] = [];

for (let i = 0; i < N; i++) {
  pppBase.push([]);
  cross.push([]);
  devPct.push([]);
  entMat.push([]);
  const pi = ms.inst[FX[i]]?.def.px0 ?? 1;
  for (let j = 0; j < N; j++) {
    const pj = ms.inst[FX[j]]?.def.px0 ?? 1;
    pppBase[i].push(pi / pj);
    cross[i].push(i === j ? 0 : pi / pj);
    devPct[i].push(0);
    entMat[i].push(0);
  }
}

let pppEntropy = 0;
let worst = { label: '—', dev: 0 };

/** Hawkes intensity λ(t), baseline μ = 0.35 */
let lam = 0.35;
const lambdaRing = new Ring(600);

let booted = false;

/* ================= guarded ensure loops ================= */

function recomputeCross(): void {
  const last: number[] = [];
  for (let i = 0; i < N; i++) last.push(ms.inst[FX[i]]?.last ?? pppBase[i][0]);
  let sum = 0;
  let cnt = 0;
  let worstAbs = -1;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) {
        cross[i][j] = 0;
        devPct[i][j] = 0;
        entMat[i][j] = 0;
        continue;
      }
      const x = last[i] / Math.max(1e-12, last[j]);
      cross[i][j] = x;
      const dev = (x / pppBase[i][j] - 1) * 100;
      devPct[i][j] = dev;
      entMat[i][j] = clamp(Math.abs(dev) * 20, 0, 100);
      const a = Math.abs(dev);
      sum += a;
      cnt++;
      if (a > worstAbs) {
        worstAbs = a;
        worst = { label: `${LBL[i]}×${LBL[j]}`, dev };
      }
    }
  }
  pppEntropy = cnt > 0 ? sum / cnt : 0;
}

/** λₜ = μ + (λₜ₋₁ − μ)·exp(−0.2/5) + Σ α·|ret_tick|, α = 8 over the 6 contracts */
function tickLambda(): void {
  let s = 0;
  for (let i = 0; i < N; i++) {
    const st = ms.inst[FX[i]];
    if (!st || st.hist.length < 2) continue;
    const prev = st.hist.last(1);
    if (!(prev > 0)) continue;
    s += Math.abs(st.hist.last() / prev - 1);
  }
  lam = 0.35 + (lam - 0.35) * Math.exp(-0.2 / 5) + 8 * s;
  lambdaRing.push(lam);
}

/** pre-fill λ history so the toxicity chart is populated at first paint */
function seedLambda(): void {
  for (let k = 0; k < 260; k++) {
    let s = 0;
    for (let i = 0; i < N; i++) s += Math.random() * 0.00014;
    lam = 0.35 + (lam - 0.35) * Math.exp(-0.2 / 5) + 8 * s;
    lambdaRing.push(lam);
  }
}

/** guarded ensure pattern — 200ms Hawkes cadence + 1s cross/PPP recompute */
export function ensureDesk07(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  recomputeCross();
  seedLambda();
  tickLambda();
  setInterval(tickLambda, 200);
  setInterval(recomputeCross, 1000);
}

/* ================= component ================= */

export default function Desk07Fx() {
  useRevision(); // 5 Hz re-render of cards / stats / table
  useEffect(() => {
    ensureDesk07();
  }, []);

  /* USD composite beta — inverted mean drift of the 6 FX futures vs listing px */
  let usdSum = 0;
  for (const sym of FX) {
    const st = ms.inst[sym];
    if (st) usdSum += st.last / st.def.px0 - 1;
  }
  const usdBeta = -(usdSum / FX.length) * 100;

  const lamTone = lam > 2 ? 'rose' : lam > 0.8 ? 'amber' : 'emerald';
  const entTone = pppEntropy < 1 ? 'text-emerald-400' : pppEntropy < 2.5 ? 'text-amber-400' : 'text-rose-400';

  return (
    <DeskFrame
      deskId={6}
      title="FX FUTURES DESK"
      code="CURRENCIES/PPP-ENTROPY-HAWKES"
      accent="teal"
      right={
        <Badge tone={ms.crisis.active ? 'rose' : 'emerald'} pulse={ms.crisis.active}>
          {ms.crisis.active ? `CRISIS ${(ms.crisis.intensity * 100).toFixed(0)}%` : 'NORMAL REGIME'}
        </Badge>
      }
    >
      {/* -------- quote cards -------- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {FX.map((sym) => {
          const st = ms.inst[sym];
          if (!st) return null;
          const up = st.changePct >= 0;
          return (
            <div key={sym} className="rounded border border-kborder bg-kpanel/90 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold tracking-wider text-teal-300">{sym}</span>
                <span className={`font-mono text-[10px] font-semibold ${toneNum(st.changePct)}`}>{fPct(st.changePct)}</span>
              </div>
              <div className="mt-1 font-mono text-lg font-semibold leading-tight text-zinc-100">
                {fPx(st.last, st.def.dec)}
              </div>
              <Sparkline data={() => st.hist} color={up ? KT('teal') : KT('down')} className="mt-1 h-9 w-full" />
              <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-zinc-500">
                <span>
                  IV <span className="text-zinc-300">{fN(st.iv, 2)}</span>
                </span>
                <span>
                  OFI <span className={toneNum(st.ofi)}>{fSign(st.ofi, 2)}</span>
                </span>
                <span>
                  LIQ <span className="text-zinc-300">{fN(st.liq, 0)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* -------- cross-rate / PPP / entropy row -------- */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Repeat size={12} className="text-teal-300" />
              CROSS-RATE MATRIX LASTi / LASTj
            </span>
          }
          right={<span className="font-mono text-[9px] text-zinc-600">RECOMPUTE 1s</span>}
        >
          <Heatmap rows={() => LBL} cols={() => LBL} values={() => cross} scale="mono" fmt={(v) => v.toPrecision(4)} height="h-64" />
        </Panel>

        <Panel
          title="PPP DEVIATION % — (CROSS / PPP − 1) × 100"
          right={<span className="font-mono text-[9px] text-zinc-600">PPP BASE = PX0 RATIOS</span>}
        >
          <Heatmap rows={() => LBL} cols={() => LBL} values={() => devPct} scale="heat" fmt={(v) => `${fSign(v, 2)}%`} height="h-64" />
        </Panel>

        <Panel title="PPP ENTROPY DESK">
          <Stat
            label="PURCHASING POWER ENTROPY INDEX"
            value={`${fN(pppEntropy, 3)}%`}
            sub={`MEAN |PPP DEV| · WORST ${worst.label} ${fSign(worst.dev, 2)}%`}
            tone={entTone}
          />
          <Gauge
            value={() => pppEntropy}
            min={0}
            max={5}
            label="PPP ENTROPY %"
            fmtV={(v) => v.toFixed(2)}
            className="mt-1 h-28 w-full"
            zones={[
              { from: 0, to: 1, color: KT('upDeep') },
              { from: 1, to: 2.5, color: KT('warnDeep') },
              { from: 2.5, to: 5, color: KT('downDeep') },
            ]}
          />
          <Stat
            className="mt-1"
            label="USD COMPOSITE BETA"
            value={`${fSign(usdBeta, 3)}%`}
            sub="INVERTED MEAN Δ OF 6 FX FUT VS LISTING PX"
            tone={clsNum(usdBeta)}
          />
        </Panel>
      </div>

      {/* -------- Hawkes flow toxicity -------- */}
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Waves size={12} className="text-teal-300" />
            HAWKES FLOW TOXICITY ENGINE — λ(t)
          </span>
        }
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9.5px] text-zinc-500">μ=0.35 · α=8 · Δt=200ms</span>
            <Badge tone={lamTone} pulse={lam > 2}>
              {lam > 2 ? 'SELF-EXCITING' : lam > 0.8 ? 'ELEVATED' : 'CALM'}
            </Badge>
          </div>
        }
      >
        <LineChart
          height="h-48"
          fmtV={(v) => v.toFixed(2)}
          series={[{ label: 'λ(t)', color: KT('teal'), data: () => lambdaRing, width: 1.6 }]}
          hlines={[
            { y: 2.0, color: KT('downDeep'), label: 'TOXICITY SPIKE 2.0' },
            { y: 0.8, color: KT('up'), label: 'CALM 0.8' },
          ]}
        />
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
          <FlashAlert
            active={lam > 2}
            tone="rose"
            title="HAWKES TOXICITY SPIKE — FLOW SELF-EXCITATION DETECTED, WIDEN FAIR VALUE BANDS"
          >
            λ = {fN(lam, 3)} — branching ratio above critical threshold. EXECUTION: halve clip size, passive-only
            fills until λ settles back below 0.8; requote skew against the excitation direction.
          </FlashAlert>
          <Gauge
            value={() => lam}
            min={0}
            max={4}
            label="HAWKES λ"
            fmtV={(v) => v.toFixed(2)}
            className="h-24 w-full"
            zones={[
              { from: 0, to: 0.8, color: KT('upDeep') },
              { from: 0.8, to: 2, color: KT('warnDeep') },
              { from: 2, to: 4, color: KT('downDeep') },
            ]}
          />
        </div>
      </Panel>

      {/* -------- futures board -------- */}
      <Panel title="FX FUTURES BOARD">
        <Tbl head={['SYM', 'LAST', 'CHG%', 'BID', 'ASK', 'SPREAD', 'IV', 'OFI', 'CVD', 'LIQ']}>
          {FX.map((sym) => {
            const st = ms.inst[sym];
            if (!st) return null;
            return (
              <Tr key={sym}>
                <Td className="font-semibold text-teal-300">{sym}</Td>
                <Td className="font-semibold text-zinc-100">{fPx(st.last, st.def.dec)}</Td>
                <Td className={toneNum(st.changePct)}>{fPct(st.changePct)}</Td>
                <Td className="text-zinc-400">{fPx(st.bid, st.def.dec)}</Td>
                <Td className="text-zinc-400">{fPx(st.ask, st.def.dec)}</Td>
                <Td className="text-zinc-400">{fBps(st.spreadBps, 1)}</Td>
                <Td className="text-zinc-300">{fN(st.iv, 2)}</Td>
                <Td className={toneNum(st.ofi)}>{fSign(st.ofi, 2)}</Td>
                <Td className={toneNum(st.cvd)}>{fN(st.cvd, 0)}</Td>
                <Td className="text-zinc-300">{fN(st.liq, 0)}</Td>
              </Tr>
            );
          })}
        </Tbl>
      </Panel>
    </DeskFrame>
  );
}
