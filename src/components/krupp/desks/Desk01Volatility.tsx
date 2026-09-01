'use client';
/**
 * KRUPP CAPITAL — DESK 01 · VOLATILITY COMPLEX DESK (VOL-COMPLEX/MACRO-HUB)
 *
 * Institutional macro vol hub: term-structure spline engine, real contango
 * regime engine, vol-of-vol / tail-risk signal engine, MS-GARCH IV-vs-RV
 * tensor, cross-asset vol vectors.
 *
 * All series live in MODULE-LEVEL ring buffers / Float32Array scratch that
 * survive tab switches. Charts read them directly inside rAF draw closures
 * (zero React re-render, zero per-frame allocation). Stats/tables re-render
 * on the 5 Hz engine revision.
 */
import { ms } from '@/lib/krupp/engine';
import { Ring } from '@/lib/krupp/ring';
import {
  clamp,
  piecewise,
  splineAt,
  VIX_BASIS_ANCHORS,
  zOf,
  type ContangoRegime,
} from '@/lib/krupp/math';
import { fN, fPct, fPx, fSign, fVolPts, toneNum } from '@/lib/krupp/format';
import { G } from '@/lib/krupp/universe';
import { useRevision, useSubTab } from '@/lib/krupp/store';
import {
  Badge,
  clsNum,
  FlashAlert,
  Panel,
  SectionLabel,
  Stat,
  Tbl,
  Td,
  Tr,
} from '@/components/krupp/ui';
import { DeskFrame, SubPane } from '@/components/krupp/DeskFrame';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { KT } from '@/lib/theme';

/* ==================================================================== */
/* MODULE-LEVEL PERSISTENT STATE — survives tab switches (NEVER in React) */
/* ==================================================================== */

const SPLINE_N = 24;
const MAT_DAYS = [9, 30, 91, 182] as const;

/** IV60 forward blend ring: pushed every 200 ms as 0.55·VIX + 0.45·VIX3M */
const iv60Ring = new Ring(600);
/** Catmull-Rom sampled maturity curve (24 pts) — current snapshot */
const curveNow = new Float32Array(SPLINE_N);
/** Same spline ~5 s ago — shows curve drift */
const curvePrev = new Float32Array(SPLINE_N);
/** Raw spline anchors [VIX9D, VIX, VIX3M, VIX6M] — now / 5 s ago */
const anchorNow = new Float32Array(4);
const anchorPrev = new Float32Array(4);

let started = false;
let lastPrevCopy = 0;

function rebuildCurve(): void {
  anchorNow[0] = ms.inst.VIX9D.last;
  anchorNow[1] = ms.inst.VIX.last;
  anchorNow[2] = ms.inst.VIX3M.last;
  anchorNow[3] = ms.inst.VIX6M.last;
  for (let k = 0; k < SPLINE_N; k++) {
    curveNow[k] = splineAt(anchorNow, (k * 3) / (SPLINE_N - 1));
  }
}

/** Idempotent 200 ms module interval: spline rebuild + IV60 push + 5 s drift copy */
function ensureDesk1Series(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  rebuildCurve();
  curvePrev.set(curveNow);
  anchorPrev.set(anchorNow);
  lastPrevCopy = Date.now();
  setInterval(() => {
    rebuildCurve();
    iv60Ring.push(0.55 * ms.inst.VIX.last + 0.45 * ms.inst.VIX3M.last);
    const now = Date.now();
    if (now - lastPrevCopy >= 5000) {
      curvePrev.set(curveNow);
      anchorPrev.set(anchorNow);
      lastPrevCopy = now;
    }
  }, 200);
}

/* ==================================================================== */
/* Static desk metadata                                                  */
/* ==================================================================== */

type RegimeTone = 'emerald' | 'cyan' | 'amber' | 'rose';

const REGIME_TONE: Record<ContangoRegime, RegimeTone> = {
  STRONG_CONTANGO: 'emerald',
  MILD_CONTANGO: 'cyan',
  FLAT: 'amber',
  BACKWARDATION: 'rose',
  CRISIS_BACKWARDATION: 'rose',
};

const REGIME_COPY: Record<ContangoRegime, string> = {
  STRONG_CONTANGO:
    'Steep carry — short-dated vol rich vs paper; roll-down programs harvesting basis with tailwind.',
  MILD_CONTANGO:
    'Normalized carry — healthy term structure; hedge cost moderate, no stress signature.',
  FLAT:
    'Curve flat — vol sellers unpaid for risk; transition regime, gamma positioning fragile.',
  BACKWARDATION:
    'Curve inverted — event-hedge demand exceeds supply; spot vol premium over forward.',
  CRISIS_BACKWARDATION:
    'Short-end panic — vol sellers being run over; gamma unwind risk extreme',
};

/** CBOECollector piecewise segments for the anchor table */
const SEGMENTS: { band: string; ratio: string; slope: string; state: string }[] = [
  { band: 'VIX ≤ 10', ratio: '1.0800', slope: '0.0000 FLAT', state: 'CALM FLOOR · MAX CARRY' },
  { band: '10 – 20', ratio: '1.08 → 1.01', slope: '-0.0070', state: 'NORMAL CARRY DECAY' },
  { band: '20 – 35', ratio: '1.01 → 0.90', slope: '-0.0073', state: 'STRESS TRANSITION' },
  { band: '35 – 80', ratio: '0.90 → 0.75', slope: '-0.0033', state: 'FEAR ACCELERANT' },
  { band: '≥ 80', ratio: '0.7500', slope: '0.0000 FLAT', state: 'PANIC PLATEAU · DEEP BACK' },
];

function segIdx(v: number): number {
  if (v <= 10) return 0;
  if (v <= 20) return 1;
  if (v <= 35) return 2;
  if (v <= 80) return 3;
  return 4;
}

/** VVIX put/call tail-stress bands */
const VVIX_BANDS: { band: string; state: string; tone: string; positioning: string; playbook: string }[] = [
  {
    band: 'VVIX ≥ 120',
    state: 'CAPITULATION',
    tone: 'text-rose-300',
    positioning:
      'Dealers max-long gamma after the vol blowoff; vanna/charm flows into the close become powerful spot tailwinds.',
    playbook: 'FADE THE SPIKE — sell front vol into panic, buy wings cheap',
  },
  {
    band: '100 – 120',
    state: 'ELEVATED',
    tone: 'text-amber-300',
    positioning:
      'Charm flows building; dealer inventory rebalancing amplifies the spot-vol feedback loop.',
    playbook: 'REDUCE SHORT VOL — roll hedges, size down new premium sales',
  },
  {
    band: '80 – 100',
    state: 'NEUTRAL',
    tone: 'text-zinc-400',
    positioning:
      'Balanced vanna/charm regime; no structural edge in vol-of-vol space.',
    playbook: 'RUN CARRY — standard roll-down programs, baseline sizing',
  },
  {
    band: 'VVIX < 80',
    state: 'COMPLACENCY',
    tone: 'text-amber-300',
    positioning:
      'Dealer short-vol inventory quietly building; vanna exposure primed for violent unwind.',
    playbook: 'BUY TAIL — own long-dated wings / VIX calls as crash lottery tickets',
  },
];

function vvixBandIdx(v: number): number {
  return v >= 120 ? 0 : v >= 100 ? 1 : v >= 80 ? 2 : 3;
}

const TENSOR_ROWS: string[] = [...G.VOL_ASSETS, ...G.VOL_HUB];

/* ==================================================================== */
/* DESK 01                                                               */
/* ==================================================================== */

export default function Desk01Volatility() {
  ensureDesk1Series();
  const rev = useRevision(); // 5 Hz engine revision → stats/tables re-render; charts poll module state via rAF
  const sub = useSubTab(0);

  const regime: ContangoRegime = ms.volComplex.regime;
  const vix = ms.inst.VIX.last;
  const vixChg = ms.inst.VIX.changePct;
  const cr = ms.volComplex.contangoReal.last();
  const cm = ms.volComplex.contangoMarket.last();
  const seg = segIdx(vix);
  void rev;

  const vvix = ms.inst.VVIX.last;
  const skew = ms.inst.SKEW.last;
  const skewZ = zOf(ms.inst.SKEW.ivHist, 240);
  const vvixZ = zOf(ms.inst.VVIX.ivHist, 240);
  const vvixPct = clamp(vvixZ * 50 + 50, 0, 100);
  const vb = vvixBandIdx(vvix);

  const garchLast = ms.garch.last();
  const iv60 = iv60Ring.last();
  const prem = vix - garchLast;

  return (
    <DeskFrame
      deskId={0}
      title="VOLATILITY COMPLEX DESK"
      code="VOL-COMPLEX/MACRO-HUB"
      subtabs={['TERM STRUCTURE', 'VOL-OF-VOL', 'IV vs RV TENSOR', 'ASSET VECTORS']}
      accent="cyan"
      right={
        <>
          <Badge tone={REGIME_TONE[regime]} pulse={regime === 'CRISIS_BACKWARDATION'}>
            {regime}
          </Badge>
          <span className="font-mono text-xs text-zinc-400">
            VIX{' '}
            <span className="font-semibold text-zinc-100">{fPx(vix, 2)}</span>{' '}
            <span className={toneNum(vixChg)}>{fPct(vixChg, 2)}</span>
          </span>
        </>
      }
    >
      {/* ============================ SUB-TAB 1 — TERM STRUCTURE ============================ */}
      <SubPane active={sub} index={0}>
        <Panel
          title="VOL MATURITY CURVE — CATMULL-ROM SPLINE // 9D → 1M → 3M → 6M"
          right={<Badge tone="cyan">PIECEWISE MODEL · CBOECOLLECTOR</Badge>}
        >
          <LineChart
            height="h-64"
            fmtV={(v) => v.toFixed(2)}
            series={[
              { label: 'CURVE T', color: KT('cyan'), data: () => curveNow, width: 1.8 },
              { label: 'CURVE T−5s', color: KT('textMuted'), data: () => curvePrev, width: 1.2, dash: [4, 3] },
            ]}
          />
          <div className="mt-2">
            <SectionLabel>SPLINE ANCHORS — MATURITY IN DAYS · 5s DRIFT</SectionLabel>
            <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-4">
              {(['VIX9D', 'VIX', 'VIX3M', 'VIX6M'] as const).map((sym, i) => {
                const st = ms.inst[sym];
                const drift = st.last - anchorPrev[i];
                return (
                  <div key={sym} className="rounded border border-kborder bg-kpanel px-2 py-1.5">
                    <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">
                      <span className="text-kaccent-soft">{sym}</span>
                      <span>{MAT_DAYS[i]}D</span>
                    </div>
                    <div className="font-mono text-sm font-semibold text-zinc-100">{fPx(st.last, 2)}</div>
                    <div className={`font-mono text-[10px] ${toneNum(-drift)}`}>
                      Δ5s {fSign(drift, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            title="REAL VIX CONTANGO — MODEL vs MARKET"
            right={<Badge tone={REGIME_TONE[regime]}>{regime}</Badge>}
          >
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="MODEL RATIO (ANCHORS)"
                value={fN(cr, 4)}
                sub="piecewise(VIX, CBOECollector)"
                tone="text-emerald-300"
              />
              <Stat
                label="MARKET RATIO VIX3M/VIX"
                value={fN(cm, 4)}
                sub={`basis vs model ${fSign(cm - cr, 4)}`}
              />
            </div>
            <div className="mt-2">
              <LineChart
                height="h-44"
                hlines={[{ y: 1, color: KT('border4'), label: 'PARITY 1.00' }]}
                series={[
                  { label: 'REAL (MODEL)', color: KT('up'), data: () => ms.volComplex.contangoReal, width: 1.6 },
                  { label: 'MARKET', color: KT('zinc'), data: () => ms.volComplex.contangoMarket, width: 1.2, dash: [5, 3] },
                ]}
              />
            </div>
          </Panel>

          <Panel
            title="CBOECOLLECTOR BASIS ANCHORS"
            right={
              <span className="font-mono text-[10px] text-zinc-500">
                ACTIVE SEGMENT <span className="text-kaccent-soft">{SEGMENTS[seg].band}</span>
              </span>
            }
          >
            <Tbl head={['VIX BAND', 'MODEL RATIO', 'SLOPE / VOL PT', 'STATE']} maxH="max-h-64">
              {SEGMENTS.map((s, i) => (
                <Tr key={s.band} className={i === seg ? 'border-l-2 border-l-kaccent bg-kaccent/10' : ''}>
                  <Td className={i === seg ? 'text-kaccent-soft' : 'text-zinc-300'}>{s.band}</Td>
                  <Td className="text-zinc-100">{s.ratio}</Td>
                  <Td className="text-zinc-400">{s.slope}</Td>
                  <Td className={i === seg ? 'text-kaccent-soft' : 'text-zinc-500'}>{s.state}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="text-zinc-500">PIECEWISE(VIX) NOW</Td>
                <Td className="text-emerald-300">{fN(piecewise(vix, VIX_BASIS_ANCHORS), 4)}</Td>
                <Td className="text-zinc-500">VIX {fPx(vix, 2)}</Td>
                <Td className="text-zinc-500">ENGINE RING {fN(cr, 4)}</Td>
              </Tr>
            </Tbl>
          </Panel>
        </div>

        <FlashAlert active tone={REGIME_TONE[regime]} title={`CONTANGO REGIME ENGINE — ${regime}`}>
          {REGIME_COPY[regime]} · model {fN(cr, 4)} vs market {fN(cm, 4)} (Δ {fSign(cm - cr, 4)})
        </FlashAlert>
      </SubPane>

      {/* ============================ SUB-TAB 2 — VOL-OF-VOL ============================ */}
      <SubPane active={sub} index={1}>
        <Panel
          title="VOL-OF-VOL COMPOSITE — VVIX × SKEW HUB"
          right={<Badge tone="cyan">TAIL RISK ENGINE</Badge>}
        >
          <LineChart
            height="h-64"
            fmtV={(v) => v.toFixed(1)}
            hlines={[
              { y: 120, color: KT('up'), label: 'CONTRARIAN BUY THRESHOLD 120' },
              { y: 80, color: KT('warn'), label: 'COMPLACENCY FLOOR 80' },
            ]}
            series={[
              { label: 'VVIX', color: KT('cyan'), data: () => ms.inst.VVIX.ivHist, width: 1.6 },
              { label: 'SKEW', color: KT('violet'), data: () => ms.inst.SKEW.ivHist, width: 1.4 },
            ]}
          />
        </Panel>

        {vvix >= 120 ? (
          <FlashAlert active tone="rose" title="STRONG CONTRARIAN BUY SIGNAL — VVIX ≥ 120">
            Historic capitulation turning point — powerful vanna/charm tailwinds imminent. VVIX {fPx(vvix, 2)}.
          </FlashAlert>
        ) : vvix < 80 ? (
          <FlashAlert active tone="amber" title="EXTREME COMPLACENCY ALERT — VVIX < 80">
            Dealer short-vol inventory building; tail-risk underpriced. VVIX {fPx(vvix, 2)}.
          </FlashAlert>
        ) : (
          <FlashAlert active={false} tone="zinc" title="VOL-OF-VOL MONITOR: NEUTRAL">
            VVIX {fPx(vvix, 2)} inside neutral band 80–120 — no contrarian trigger armed.
          </FlashAlert>
        )}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat
            label="VVIX LAST"
            value={fPx(vvix, 2)}
            sub={`zone ${VVIX_BANDS[vb].state}`}
            tone="text-kaccent-soft"
          />
          <Stat
            label="SKEW LAST"
            value={fPx(skew, 2)}
            sub="CBOE put-skew richness"
            tone="text-violet-300"
          />
          <Stat
            label="SKEW Z-SCORE (240)"
            value={fSign(skewZ, 2)}
            sub="zOf(ivHist, 240)"
            tone={toneNum(skewZ)}
          />
          <Stat
            label="VVIX PCTL PROXY"
            value={`${fN(vvixPct, 1)} / 100`}
            sub="clamp(z·50+50, 0, 100)"
            tone={vvixPct >= 80 ? 'text-rose-300' : vvixPct <= 20 ? 'text-emerald-300' : 'text-zinc-100'}
          />
        </div>

        <Panel
          title="PUT/CALL TAIL STRESS MATRIX — VVIX BANDS"
          right={
            <span className="font-mono text-[10px] text-zinc-500">
              CURRENT <span className={VVIX_BANDS[vb].tone}>{VVIX_BANDS[vb].state}</span>
            </span>
          }
        >
          <Tbl head={['VVIX BAND', 'STATE', 'DEALER POSITIONING (VANNA / CHARM)', 'PLAYBOOK']} maxH="max-h-72">
            {VVIX_BANDS.map((b, i) => (
              <Tr key={b.band} className={i === vb ? 'border-l-2 border-l-kaccent bg-kaccent/10' : ''}>
                <Td className={i === vb ? 'text-kaccent-soft' : 'text-zinc-300'}>{b.band}</Td>
                <Td className={`font-semibold ${b.tone}`}>{b.state}</Td>
                <Td className="whitespace-normal text-zinc-400">{b.positioning}</Td>
                <Td className="whitespace-normal text-zinc-300">{b.playbook}</Td>
              </Tr>
            ))}
          </Tbl>
        </Panel>
      </SubPane>

      {/* ============================ SUB-TAB 3 — IV vs RV TENSOR ============================ */}
      <SubPane active={sub} index={2}>
        <Panel
          title="IMPLIED vs REALIZED VOLATILITY TENSOR — MS-GARCH(1,1) VIEW"
          right={<Badge tone="violet">VOL-PREMIUM BAND SHADED</Badge>}
        >
          <LineChart
            height="h-64"
            shade={{ a: () => ms.inst.VIX.ivHist, b: () => ms.garch, color: KT('warnDeep') }}
            series={[
              { label: 'IV30 (VIX FWD)', color: KT('down'), data: () => ms.inst.VIX.ivHist, width: 1.6 },
              { label: 'RV (MS-GARCH)', color: KT('up'), data: () => ms.garch, width: 1.4 },
              { label: 'IV60 BLEND', color: KT('violet'), data: () => iv60Ring, width: 1.2, dash: [5, 3] },
            ]}
          />
        </Panel>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat
            label="VOL-PREMIUM (IV30 − RV)"
            value={fVolPts(prem)}
            sub={prem >= 0 ? 'VOL-PREMIUM — CARRY POSITIVE' : 'VOL-DISCOUNT — HEDGE RICH'}
            tone={clsNum(prem)}
            className="md:col-span-2"
          />
          <Stat label="IV30 FORWARD (VIX)" value={fVolPts(vix)} sub="inst.VIX.ivHist last" tone="text-rose-300" />
          <Stat label="IV60 BLEND" value={fVolPts(iv60)} sub="0.55·VIX + 0.45·VIX3M @ 5 Hz" tone="text-violet-300" />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="GARCH(1,1) PARAMETER STATE">
            <Tbl head={['PARAMETER', 'VALUE', 'NOTE']} maxH="max-h-72">
              <Tr>
                <Td className="text-zinc-300">ω OMEGA</Td>
                <Td className="text-zinc-100">1.00000000e-09</Td>
                <Td className="text-zinc-500">LONG-RUN VARIANCE FLOOR</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-300">α ALPHA</Td>
                <Td className="text-zinc-100">0.06000000</Td>
                <Td className="text-zinc-500">SHOCK LOADING</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-300">β BETA</Td>
                <Td className="text-zinc-100">0.92000000</Td>
                <Td className="text-zinc-500">VOL PERSISTENCE DECAY</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-300">α+β PERSISTENCE</Td>
                <Td className="text-emerald-300">0.98000000</Td>
                <Td className="text-zinc-500">STATIONARY · HALF-LIFE ≈ 34 TICKS</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-300">σ̂ TICK</Td>
                <Td className="text-kaccent-soft">{ms.garchS.toFixed(8)}</Td>
                <Td className="text-zinc-500">MS-GARCH(1,1) STATE σ</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-300">ANNUALIZATION</Td>
                <Td className="text-zinc-100">× 46000</Td>
                <Td className="text-zinc-500">PER-TICK → VOL POINTS</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-300">RV PUSHED</Td>
                <Td className="text-zinc-100">{fVolPts(garchLast)}</Td>
                <Td className="text-zinc-500">RING CAP 600 @ 5 HZ</Td>
              </Tr>
            </Tbl>
          </Panel>

          <Panel title="VOL-PREMIUM DIAGNOSTICS">
            <Tbl head={['METRIC', 'VALUE']} maxH="max-h-72">
              <Tr>
                <Td className="text-zinc-400">IV30 (VIX FORWARD)</Td>
                <Td className="text-rose-300">{fVolPts(vix)}</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-400">IV60 BLEND</Td>
                <Td className="text-violet-300">{fVolPts(iv60)}</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-400">RV (MS-GARCH)</Td>
                <Td className="text-emerald-300">{fVolPts(garchLast)}</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-400">IV30 − RV PREMIUM</Td>
                <Td className={clsNum(prem)}>{fSign(prem, 2)} pts</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-400">IV60 − RV PREMIUM</Td>
                <Td className={clsNum(iv60 - garchLast)}>{fSign(iv60 - garchLast, 2)} pts</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-400">IV30 − IV60 FRONT SPREAD</Td>
                <Td className={clsNum(vix - iv60)}>{fSign(vix - iv60, 2)} pts</Td>
              </Tr>
              <Tr>
                <Td className="text-zinc-400">RV / IV30 RATIO</Td>
                <Td className="text-zinc-100">{fN(garchLast / Math.max(1e-9, vix), 3)}</Td>
              </Tr>
            </Tbl>
          </Panel>
        </div>
      </SubPane>

      {/* ============================ SUB-TAB 4 — ASSET VECTORS ============================ */}
      <SubPane active={sub} index={3}>
        <FlashAlert
          active={ms.crisis.active}
          tone="rose"
          title={ms.crisis.active ? 'VOL COMPLEX UNDER CRISIS SHOCK' : 'CRISIS MONITOR: NO SYSTEMIC SHOCK'}
        >
          {ms.crisis.active
            ? 'Term structure inversion likely — short-end vol decoupling from hedges; roll-down & variance-swap programs at immediate risk.'
            : `Phase ${ms.crisis.phase} · intensity ${(ms.crisis.intensity * 100).toFixed(1)}% · complex coherently priced`}
        </FlashAlert>

        <Panel
          title="ASSET CLASS VOLATILITY VECTORS — IV REGIME CARDS"
          right={<Badge tone="cyan">REGIME zOf(ivHist, 240)</Badge>}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {G.VOL_ASSETS.map((sym) => {
              const st = ms.inst[sym];
              const z = zOf(st.ivHist, 240);
              const hi = z > 1;
              const lo = z < -1;
              return (
                <Stat
                  key={sym}
                  label={sym}
                  value={fPx(st.last, st.def.dec)}
                  tone="text-zinc-100"
                  sub={
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <Badge tone={hi ? 'rose' : lo ? 'emerald' : 'zinc'} pulse={hi}>
                          {hi ? 'IV-HIGH' : lo ? 'IV-LOW' : 'IV-MID'}
                        </Badge>
                        <span className={`font-mono text-[10px] ${toneNum(st.changePct)}`}>
                          {fPct(st.changePct, 2)}
                        </span>
                      </div>
                      <Sparkline
                        data={() => st.ivHist}
                        color={hi ? KT('down') : lo ? KT('up') : KT('cyan')}
                        className="mt-1 h-7 w-full"
                      />
                    </>
                  }
                />
              );
            })}
          </div>
        </Panel>

        <Panel
          title="CROSS-ASSET VOL TENSOR"
          right={
            <span className="font-mono text-[10px] text-zinc-500">
              {TENSOR_ROWS.length} TICKERS · IV−RV &gt; 0 = SELLER EDGE
            </span>
          }
        >
          <Tbl
            head={['TICKER', 'LAST', 'CHG%', 'IV-LEVEL', 'RV-PROXY', 'SPREAD (IV−RV)', 'Z-SCORE', 'LIQ']}
            maxH="max-h-[420px]"
          >
            {TENSOR_ROWS.map((sym) => {
              const st = ms.inst[sym];
              const z = zOf(st.ivHist, 240);
              const spread = st.iv - st.rv;
              return (
                <Tr key={sym}>
                  <Td className="font-semibold text-kaccent-soft">{sym}</Td>
                  <Td className="text-zinc-100">{fPx(st.last, st.def.dec)}</Td>
                  <Td className={toneNum(st.changePct)}>{fPct(st.changePct, 2)}</Td>
                  <Td className="text-zinc-100">{fVolPts(st.iv)}</Td>
                  <Td className="text-zinc-300">{fVolPts(st.rv)}</Td>
                  <Td className={clsNum(spread)}>{fSign(spread, 2)}</Td>
                  <Td className={toneNum(z)}>{fSign(z, 2)}</Td>
                  <Td className="text-zinc-400">{fN(st.liq, 1)}</Td>
                </Tr>
              );
            })}
          </Tbl>
        </Panel>
      </SubPane>
    </DeskFrame>
  );
}
