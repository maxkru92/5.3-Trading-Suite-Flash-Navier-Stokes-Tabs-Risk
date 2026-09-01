'use client';
/**
 * KRUPP CAPITAL — Desk 10 · CENTRAL BANK LIQUIDITY DESK
 * MACRO/GLI-NET-LIQ — Fed/ECB/BOJ balance sheets, TGA & RRP reserve
 * drains, live Net Liquidity Proxy resolution and the S&P 500
 * normalized overlay with liquidity-inflection markers.
 */
import { ms } from '@/lib/krupp/engine';
import { clamp } from '@/lib/krupp/math';
import { useRevision } from '@/lib/krupp/store';
import { fN, fSign, toneNum } from '@/lib/krupp/format';
import { Panel, Badge, Stat, FlashAlert, SectionLabel } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { LineChart, type Marker } from '@/components/krupp/charts/LineChart';
import { BarChart, type BarSpec } from '@/components/krupp/charts/BarChart';
import { Gauge } from '@/components/krupp/charts/Gauge';
import { KT } from '@/lib/theme';

/* ------------------------------------------------------------------ */
/* Module-level derived overlay state.                                 */
/* Rebuilt on a guarded 500ms interval — NEVER inside a draw closure.  */
/* ------------------------------------------------------------------ */
const OVERLAY_N = 360;
const SPX_CAP = 600;

const netNorm = new Float32Array(OVERLAY_N);
const spxNorm = new Float32Array(SPX_CAP);
let netView: Float32Array = netNorm.subarray(0, 0);
let spxView: Float32Array = spxNorm.subarray(0, 0);

/* LIQ inflection markers — scanned on the 500ms interval into this
 * preallocated pool; markers() below returns it by reference. */
const INFL_POOL: Marker[] = [
  { pos: 0, label: '', color: '' },
  { pos: 0, label: '', color: '' },
  { pos: 0, label: '', color: '' },
];
const inflMarkers: Marker[] = [];

const g10 = globalThis as unknown as { __kruppDesk10Series?: boolean };

function rebuildOverlay(): void {
  const L = ms.liquidity;

  /* NET-LIQ normalized: % change from the start of the 360-sample window */
  const nNet = Math.min(OVERLAY_N, L.netH.length);
  if (nNet > 2) {
    const base = L.netH.at(L.netH.length - nNet);
    if (isFinite(base) && Math.abs(base) > 1e-6) {
      for (let i = 0; i < nNet; i++) {
        netNorm[OVERLAY_N - nNet + i] = (L.netH.at(L.netH.length - nNet + i) / base - 1) * 100;
      }
      netView = netNorm.subarray(OVERLAY_N - nNet);
    }
  }

  /* SPX normalized from ES1! — 600 scratch, exposed as aligned tail 360 */
  const es = ms.inst['ES1!'];
  if (es) {
    const nS = Math.min(OVERLAY_N, es.hist.length);
    if (nS > 2) {
      const base = es.hist.at(es.hist.length - nS);
      if (isFinite(base) && Math.abs(base) > 1e-9) {
        for (let i = 0; i < nS; i++) {
          spxNorm[SPX_CAP - nS + i] = (es.hist.at(es.hist.length - nS + i) / base - 1) * 100;
        }
        spxView = spxNorm.subarray(SPX_CAP - nS);
      }
    }
  }

  /* last 3 sign-inflections of the netH 30-tick diff ($B deadband 1.0) */
  inflMarkers.length = 0;
  const n = L.netH.length;
  const w = Math.min(OVERLAY_N, n);
  let prevSign = 0;
  for (let k = 0; k < w && k + 30 < n && inflMarkers.length < 3; k++) {
    const d = L.netH.last(k) - L.netH.last(k + 30);
    if (!isFinite(d)) continue;
    const s = d > 1 ? 1 : d < -1 ? -1 : 0;
    if (s === 0) continue;
    if (prevSign !== 0 && s !== prevSign) {
      const m = INFL_POOL[inflMarkers.length];
      m.pos = k;
      m.label = s > 0 ? 'LIQ INFLECTION +' : 'LIQ INFLECTION −';
      m.color = s > 0 ? KT('up') : KT('down');
      inflMarkers.push(m);
    }
    prevSign = s;
  }
}

function ensureDesk10Series(): void {
  if (g10.__kruppDesk10Series || typeof window === 'undefined') return;
  g10.__kruppDesk10Series = true;
  rebuildOverlay();
  setInterval(rebuildOverlay, 500);
}

/** last − oldest retained sample of any ring-shaped buffer */
interface RingLike {
  at(i: number): number;
  last(k?: number): number;
  length: number;
}
function windowDelta(r: RingLike): number {
  if (r.length < 2) return 0;
  const oldest = r.at(0);
  return isFinite(oldest) ? r.last() - oldest : 0;
}

/* ------------------------------------------------------------------ */

export default function Desk10Liquidity() {
  ensureDesk10Series();
  useRevision(); // 5 Hz — stats/badges/bars refresh; charts poll via rAF

  const L = ms.liquidity;
  const crisis = ms.crisis;
  const net = L.fed - (L.tga + L.rrp);

  /* 60-tick diffs — regime badges + GLI pressure gauge input */
  const tgaD60 = L.tgaH.length > 60 ? L.tga - L.tgaH.last(60) : windowDelta(L.tgaH);
  const rrpD60 = L.rrpH.length > 60 ? L.rrp - L.rrpH.last(60) : windowDelta(L.rrpH);
  const netD60 = L.netH.length > 60 ? L.netH.last() - L.netH.last(60) : windowDelta(L.netH);

  /* 1h-window deltas (oldest retained ring sample vs last) */
  const fed1h = windowDelta(L.fedH);
  const ecb1h = windowDelta(L.ecbH);
  const boj1h = windowDelta(L.bojH);
  const tga1h = windowDelta(L.tgaH);
  const rrp1h = windowDelta(L.rrpH);
  const net1h = windowDelta(L.netH);

  /* contribution breakdown — rebuilt in render @5Hz (3 tiny objects, cheap);
   * the BarChart draw closure only reads the array, never allocates. */
  const cb = (v: number, label: string): BarSpec => ({
    v,
    color: v >= 0 ? KT('up') : KT('down'),
    label,
  });
  const contribBars: BarSpec[] = [cb(fed1h, 'FED Δ'), cb(-tga1h, '−TGA Δ'), cb(-rrp1h, '−RRP Δ')];

  return (
    <DeskFrame
      deskId={9}
      title="CENTRAL BANK LIQUIDITY DESK"
      code="MACRO/GLI-NET-LIQ"
      accent="emerald"
      right={
        <>
          <Badge tone={netD60 >= 0 ? 'emerald' : 'rose'}>NET LIQ {fN(net / 1000, 2)}T</Badge>
          <Badge tone={crisis.active ? 'rose' : 'zinc'} pulse={crisis.active}>
            {crisis.active ? 'CRISIS ACTIVE' : 'REGIME NORMAL'}
          </Badge>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* ---------------- GLOBAL LIQUIDITY INDEX ---------------- */}
        <Panel
          title="GLOBAL LIQUIDITY INDEX — FED / ECB / BOJ"
          className="xl:col-span-2"
          right={<Badge tone="zinc">1HZ · $B</Badge>}
        >
          <LineChart
            height="h-64"
            fmtV={(v) => (v / 1000).toFixed(2) + 'T'}
            series={[
              { label: 'FED_BS', color: KT('up'), data: () => L.fedH, width: 1.7 },
              { label: 'ECB_BS', color: KT('cyan'), data: () => L.ecbH, width: 1.3 },
              { label: 'BOJ_BS', color: KT('warn'), data: () => L.bojH, width: 1.3 },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stat
              label="FED BALANCE SHEET"
              value={fN(L.fed / 1000, 3) + 'T'}
              tone="text-emerald-300"
              sub={<span className={toneNum(fed1h)}>1H Δ {fSign(fed1h, 1)}B</span>}
            />
            <Stat
              label="ECB BALANCE SHEET"
              value={fN(L.ecb / 1000, 3) + 'T'}
              tone="text-kaccent-soft"
              sub={<span className={toneNum(ecb1h)}>1H Δ {fSign(ecb1h, 1)}B</span>}
            />
            <Stat
              label="BOJ BALANCE SHEET"
              value={fN(L.boj / 1000, 3) + 'T'}
              tone="text-amber-300"
              sub={<span className={toneNum(boj1h)}>1H Δ {fSign(boj1h, 1)}B</span>}
            />
          </div>
        </Panel>

        {/* ---------------- GLI PRESSURE + CRISIS ---------------- */}
        <Panel title="GLI PRESSURE — NET LIQ MOMENTUM">
          <Gauge
            className="h-28 w-full"
            label="GLI PRESSURE"
            value={() => clamp(50 + netD60 * 8, 0, 100)}
            zones={[
              { from: 0, to: 40, color: KT('downDeep') },
              { from: 40, to: 60, color: KT('warn') },
              { from: 60, to: 100, color: KT('up') },
            ]}
          />
          <FlashAlert
            active={crisis.active}
            tone="rose"
            title="LIQUIDITY CRISIS — TGA REBUILD + RRP SPIKE COMPOUNDING QT"
            className="mt-1"
          >
            QT roll-off continues while TGA rebuild and RRP spike drain reserves —
            intensity {(crisis.intensity * 100).toFixed(0)}% · phase {crisis.phase}.
          </FlashAlert>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat
              label="NET Δ 60T"
              value={<span className={toneNum(netD60)}>{fSign(netD60, 1) + 'B'}</span>}
              sub="60-TICK NET LIQ SWING"
            />
            <Stat
              label="CRISIS INTENSITY"
              value={(crisis.intensity * 100).toFixed(1) + '%'}
              tone={crisis.active ? 'text-rose-300' : 'text-zinc-400'}
              sub={'PHASE ' + crisis.phase}
            />
          </div>
        </Panel>

        {/* ---------------- TGA & RRP ---------------- */}
        <Panel title="TGA & RRP — RESERVE DRAIN MONITOR" right={<Badge tone="zinc">1HZ · $B</Badge>}>
          <LineChart
            height="h-48"
            fmtV={(v) => fN(v, 0)}
            series={[
              { label: 'TGA', color: KT('down'), data: () => L.tgaH, width: 1.5 },
              { label: 'RRP', color: KT('violet'), data: () => L.rrpH, width: 1.5 },
            ]}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat
              label="TGA LEVEL"
              value={fN(L.tga, 1) + 'B'}
              tone="text-rose-300"
              sub={<span className={toneNum(-tga1h)}>1H Δ {fSign(tga1h, 1)}B</span>}
            />
            <Stat
              label="RRP LEVEL"
              value={fN(L.rrp, 1) + 'B'}
              tone="text-violet-300"
              sub={<span className={toneNum(-rrp1h)}>1H Δ {fSign(rrp1h, 1)}B</span>}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rrpD60 < 0 ? (
              <Badge tone="emerald">RRP DRAWDOWN ⇒ COLLATERAL RELEASE</Badge>
            ) : (
              <Badge tone="rose">RRP BUILD ⇒ RESERVE ABSORPTION</Badge>
            )}
            {tgaD60 > 0 ? (
              <Badge tone="rose">TGA REBUILD ⇒ RESERVE DRAIN</Badge>
            ) : (
              <Badge tone="emerald">TGA DRAWDOWN ⇒ RESERVE RELEASE</Badge>
            )}
          </div>
        </Panel>

        {/* ---------------- NET LIQUIDITY PROXY ---------------- */}
        <Panel title="NET LIQUIDITY PROXY — LIVE RESOLVE" className="xl:col-span-2">
          <div className="rounded border border-kborder bg-kpanel p-4">
            <SectionLabel>NET LIQ = FED_BS − (TGA + RRP)</SectionLabel>
            <div className="mt-2 font-mono text-base font-semibold tracking-wide text-zinc-300 md:text-xl">
              {fN(L.fed / 1000, 2)}T − ({fN(L.tga / 1000, 2)}T + {fN(L.rrp / 1000, 2)}T)
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-bold tracking-wide md:text-3xl ${
                net >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              = {fN(net / 1000, 2)}T
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <SectionLabel className="mb-1">CONTRIBUTION BREAKDOWN — Δ WINDOW ($B)</SectionLabel>
              <BarChart bars={() => contribBars} symmetric height="h-40" fmtV={(v) => fSign(v, 0)} />
            </div>
            <div className="grid grid-cols-2 content-start gap-2">
              <Stat
                label="NET LIQ LEVEL"
                value={fN(net, 0) + 'B'}
                tone={net1h >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                sub={<span className={toneNum(net1h)}>Δ {fSign(net1h, 1)}B</span>}
              />
              <Stat
                label="FED CONTRIBUTION"
                value={<span className={toneNum(fed1h)}>{fSign(fed1h, 1) + 'B'}</span>}
                sub="BS EXPANSION ⇒ ADD"
              />
              <Stat
                label="−TGA CONTRIBUTION"
                value={<span className={toneNum(-tga1h)}>{fSign(-tga1h, 1) + 'B'}</span>}
                sub="TGA REBUILD ⇒ DRAIN"
              />
              <Stat
                label="−RRP CONTRIBUTION"
                value={<span className={toneNum(-rrp1h)}>{fSign(-rrp1h, 1) + 'B'}</span>}
                sub="RRP SPIKE ⇒ DRAIN"
              />
            </div>
          </div>
        </Panel>

        {/* ---------------- S&P 500 OVERLAY ---------------- */}
        <Panel
          title="S&P 500 × NET LIQUIDITY — NORMALIZED %"
          className="xl:col-span-3"
          right={<Badge tone="zinc">500MS REBUILD · TAIL {OVERLAY_N}</Badge>}
        >
          <LineChart
            height="h-72"
            fmtV={(v) => fSign(v, 2) + '%'}
            hlines={[{ y: 0, color: KT('axisFaint'), label: 'BASE 0%' }]}
            markers={() => inflMarkers}
            series={[
              { label: 'NET-LIQ %Δ', color: KT('up'), data: () => (netView.length > 2 ? netView : null), width: 1.8 },
              {
                label: 'SPX (ES1!) %Δ',
                color: KT('text'),
                data: () => (spxView.length > 2 ? spxView : null),
                width: 1.3,
                dash: [5, 3],
              },
            ]}
          />
          <p className="mt-2 font-mono text-[10px] tracking-wide text-zinc-500">
            BOTH SERIES REBASED TO 0% AT WINDOW START · ▲ MARKERS = LAST 3 SIGN-INFLECTIONS OF THE NET-LIQ 30-TICK DIFF
          </p>
        </Panel>
      </div>
    </DeskFrame>
  );
}
