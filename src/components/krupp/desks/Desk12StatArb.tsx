'use client';
/**
 * KRUPP CAPITAL — DESK 12 · STAT-ARB & CROSS-ASSET SPREAD DESK
 * QUANT/RV-COINTEG-RADAR
 *
 * Relative-value spread matrix over the engine's 4 co-integration pairs,
 * z-score entry bands (±2.5σ entry / ±3.5σ severe), co-integration gauges +
 * signal radar, and OU half-life premium-decay tracking sampled at 1 Hz into
 * module-scratch rings.
 *
 * Data contract: `ms.statarb` is engine-mutated OUTSIDE React at 5 Hz.
 * Charts poll the rings directly inside rAF closures (zero allocation).
 * Tables/stats re-render via useRevision() (5 Hz).
 */
import { useEffect } from 'react';
import { Radar } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { Ring } from '@/lib/krupp/ring';
import { fN, fSign } from '@/lib/krupp/format';
import { useRevision } from '@/lib/krupp/store';
import { Badge, FlashAlert, Panel, SectionLabel, Tbl, Td, Tr } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { Gauge } from '@/components/krupp/charts/Gauge';
import type { StatPair } from '@/lib/krupp/types';
import { KT } from '@/lib/theme';

/* ------------------------------------------------------------------ */
/* Module-scratch: OU half-life premium-decay sampler (1 Hz, guarded)  */
/* ------------------------------------------------------------------ */
const HL_DECAY: { ring: Ring; last: number }[] = ms.statarb.map(() => ({
  ring: new Ring(240),
  last: NaN,
}));

let hlSampler: ReturnType<typeof setInterval> | null = null;

function ensureHlDecaySampler(): void {
  if (hlSampler !== null || typeof window === 'undefined') return;
  hlSampler = setInterval(() => {
    for (let i = 0; i < ms.statarb.length; i++) {
      const cell = HL_DECAY[i];
      const hl = ms.statarb[i].hl;
      if (isFinite(hl)) {
        cell.last = hl;
        cell.ring.push(hl);
      } else if (isFinite(cell.last)) {
        // OU estimator not ready yet → hold last valid reading
        cell.ring.push(cell.last);
      }
    }
  }, 1000);
}

/* ------------------------------------------------------------------ */
/* Display kernels                                                     */
/* ------------------------------------------------------------------ */
const SIG_META: Record<
  StatPair['signal'],
  { tone: 'emerald' | 'rose' | 'zinc'; badge: string; text: string; cls: string }
> = {
  LONG_SPREAD: { tone: 'emerald', badge: 'LONG SPREAD — BUY A SELL B', text: 'LONG SPREAD', cls: 'text-emerald-400' },
  SHORT_SPREAD: { tone: 'rose', badge: 'SHORT SPREAD — SELL A BUY B', text: 'SHORT SPREAD', cls: 'text-rose-400' },
  FLAT: { tone: 'zinc', badge: 'FLAT — NO TRADE', text: 'FLAT', cls: 'text-zinc-500' },
};

const SEV_META: Record<StatPair['severity'], { tone: 'zinc' | 'amber' | 'rose'; label: string }> = {
  NONE: { tone: 'zinc', label: 'CO-INTEG STABLE' },
  WARN: { tone: 'amber', label: 'WARN ±2.5σ' },
  SEVERE: { tone: 'rose', label: 'SEVERE ±3.5σ' },
};

function zNow(p: StatPair): number {
  const z = p.z.last();
  return isFinite(z) ? z : 0;
}

function zTone(z: number): string {
  const a = Math.abs(z);
  if (a > 3.5) return 'text-rose-400';
  if (a > 2.5) return 'text-amber-400';
  return 'text-emerald-400';
}

/** engine ticks → seconds (engine runs at 5 Hz → 1 tick = 0.2 s) */
function hlSeconds(hl: number): string {
  return isFinite(hl) ? `≈ ${(hl * 0.2).toFixed(1)}s` : '—';
}

/** adjusted score: |z| per unit half-life (×100 for readability) — deviation speed */
function adjScore(z: number, hl: number): number {
  if (!isFinite(hl) || hl <= 0) return NaN;
  return (Math.abs(z) / hl) * 100;
}

function adjTone(v: number): string {
  if (!isFinite(v)) return 'text-zinc-500';
  if (v >= 8) return 'text-rose-400';
  if (v >= 4) return 'text-amber-400';
  return 'text-zinc-300';
}

function Cell({ label, value, tone = 'text-zinc-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border border-kborder bg-kpanel px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-[12.5px] font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pair card — spread + z-score charts, stats row, deviation flash     */
/* ------------------------------------------------------------------ */
function PairCard({ p }: { p: StatPair }) {
  const z = zNow(p);
  const sig = SIG_META[p.signal];
  const sev = SEV_META[p.severity];
  const ouDecay = isFinite(p.hl) && p.hl > 0 ? ((1 - Math.pow(2, -1 / p.hl)) * 100).toFixed(2) : '—';
  return (
    <Panel title={p.label} right={<Badge tone={sev.tone} pulse={p.severity === 'SEVERE'}>{sev.label}</Badge>}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">
          <span className="truncate">{p.desc}</span>
          <span className="shrink-0 text-zinc-600">{p.aSym} / {p.bSym}</span>
        </div>

        {/* raw spread trace — ring read directly in the rAF closure */}
        <LineChart
          height="h-20"
          series={[{ label: 'SPREAD', color: KT('cyan'), data: () => p.spread }]}
          fmtV={(v) => v.toFixed(3)}
          zeroLine
        />

        {/* z-score trace with entry / severe bands */}
        <LineChart
          height="h-28"
          series={[{ label: 'Z-SCORE', color: KT('violet'), data: () => p.z }]}
          hlines={[
            { y: 2.5, color: KT('warn'), label: 'ENTRY SHORT' },
            { y: -2.5, color: KT('warn'), label: 'ENTRY LONG' },
            { y: 3.5, color: KT('down'), dash: [2, 4] },
            { y: -3.5, color: KT('down'), dash: [2, 4] },
          ]}
          zeroLine
          fmtV={(v) => v.toFixed(2)}
        />

        {/* stats row */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Cell label="Z NOW" value={fSign(z, 2)} tone={zTone(z)} />
          <Cell label="SPREAD" value={fN(p.spread.last(), 3)} />
          <Cell label="HALF-LIFE" value={hlSeconds(p.hl)} tone={isFinite(p.hl) ? 'text-zinc-100' : 'text-zinc-500'} />
          <div className="flex items-end">
            <Badge tone={sig.tone} className="w-full justify-center py-1">{sig.badge}</Badge>
          </div>
        </div>

        {/* deviation flash */}
        <FlashAlert
          active={p.severity !== 'NONE'}
          tone={p.severity === 'SEVERE' ? 'rose' : 'amber'}
          title={
            p.severity === 'SEVERE'
              ? 'SEVERE DEVIATION ±3.5σ — CO-INTEGRATION STRESS'
              : 'DEVIATION SIGNAL ±2.5σ — PREMIUM DECAY TRACKING ENGAGED'
          }
        >
          OU decay ≈{ouDecay}%/tick · half-life {hlSeconds(p.hl)} · interceptor BLOCK-MR{' '}
          {ms.interceptors.blockMR ? 'ENGAGED' : 'STANDBY'}
        </FlashAlert>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Desk 12 root                                                        */
/* ------------------------------------------------------------------ */
export default function Desk12StatArb() {
  useRevision();
  useEffect(() => {
    ensureHlDecaySampler();
  }, []);

  const deviated = ms.statarb.filter((p) => p.severity !== 'NONE').length;
  const severe = ms.statarb.some((p) => p.severity === 'SEVERE');

  return (
    <DeskFrame
      deskId={11}
      title="STAT-ARB & CROSS-ASSET SPREAD DESK"
      code="QUANT/RV-COINTEG-RADAR"
      accent="rose"
      right={
        <>
          <Badge tone={severe ? 'rose' : deviated > 0 ? 'amber' : 'emerald'} pulse={severe}>
            {deviated}/4 PAIRS DEVIATED
          </Badge>
          <Badge tone="zinc">
            <Radar size={10} />
            OU RADAR LIVE
          </Badge>
        </>
      }
    >
      {/* crisis correlation regime */}
      <FlashAlert
        active={ms.crisis.active}
        tone="rose"
        title="CRISIS CORRELATION REGIME — SPREADS WIDE, CROWDED EXITS"
      >
        cross-asset correlation → 1 · mean-reversion fills degraded · intensity{' '}
        {(ms.crisis.intensity * 100).toFixed(0)}% · interceptor BLOCK-MR {ms.interceptors.blockMR ? 'ENGAGED' : 'STANDBY'}
      </FlashAlert>

      {/* ---------------- relative value spread matrix ---------------- */}
      <SectionLabel>RELATIVE VALUE SPREAD MATRIX — 4 PAIRS · ENGINE 5 HZ</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2">
        {ms.statarb.map((p) => (
          <PairCard key={p.id} p={p} />
        ))}
      </div>

      {/* ---------------- co-integration & mean-reversion radar ---------------- */}
      <SectionLabel>CO-INTEGRATION & MEAN-REVERSION RADAR</SectionLabel>
      <Panel
        title="PAIR DEVIATION GAUGES + SIGNAL RADAR"
        right={<Badge tone="violet">|z| SCALED 0–100</Badge>}
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {ms.statarb.map((p) => (
            <div key={p.id} className="rounded border border-kborder bg-kpanel px-1 pt-1">
              <Gauge
                value={() => {
                  const a = Math.abs(p.z.last());
                  return isFinite(a) ? Math.min(100, Math.max(0, (a / 4) * 100)) : 0;
                }}
                min={0}
                max={100}
                label={p.id}
                fmtV={(v) => v.toFixed(1)}
                className="h-24 w-full"
                zones={[
                  { from: 0, to: 50, color: KT('upDeep') },
                  { from: 50, to: 80, color: KT('warnDeep') },
                  { from: 80, to: 100, color: KT('downDeep') },
                ]}
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Tbl head={['PAIR', 'Z', 'SEVERITY', 'HALF-LIFE', 'ADJ-SCORE', 'SIGNAL']} maxH="max-h-72">
            {ms.statarb.map((p) => {
              const z = zNow(p);
              const adj = adjScore(z, p.hl);
              const sig = SIG_META[p.signal];
              return (
                <Tr key={p.id}>
                  <Td className="font-semibold text-zinc-200">
                    {p.id}
                    <span className="ml-2 text-[10px] text-zinc-500">{p.aSym}/{p.bSym}</span>
                  </Td>
                  <Td className={zTone(z)}>{fSign(z, 2)}</Td>
                  <Td>
                    <Badge tone={SEV_META[p.severity].tone} pulse={p.severity === 'SEVERE'}>
                      {p.severity}
                    </Badge>
                  </Td>
                  <Td className="text-zinc-300">{hlSeconds(p.hl)}</Td>
                  <Td className={adjTone(adj)}>{isFinite(adj) ? fN(adj, 2) : '—'}</Td>
                  <Td className={sig.cls}>{sig.text}</Td>
                </Tr>
              );
            })}
          </Tbl>
        </div>
      </Panel>

      {/* ---------------- historical premium decay strips ---------------- */}
      <SectionLabel>HISTORICAL PREMIUM DECAY — OU HALF-LIFE TRACK · 1 HZ SAMPLER</SectionLabel>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ms.statarb.map((p, i) => (
          <Panel
            key={p.id}
            title={p.id}
            right={<Badge tone="cyan">{hlSeconds(p.hl)}</Badge>}
            bodyClass="px-2 pb-2 pt-1"
          >
            <LineChart
              height="h-16"
              series={[{ label: 'HL', color: KT('up'), data: () => HL_DECAY[i].ring }]}
              fmtV={(v) => `${(v * 0.2).toFixed(1)}s`}
            />
          </Panel>
        ))}
      </div>
    </DeskFrame>
  );
}
