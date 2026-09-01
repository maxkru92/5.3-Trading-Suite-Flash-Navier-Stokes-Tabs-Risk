'use client'

// ============================================================================
// COLUMN 2 // CARD 4 — DESK RISK POLICY (INTERCEPTOR THRESHOLD CONTROL)
// Hot-loads threshold overrides into the Navier-Stokes risk kernel worker.
// Spec defaults: LOCK chaos>0.85 · SCALE visc<55% · KILL score>75.
// ============================================================================

import { FolderDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { useKrupp } from '@/lib/london/store'
import {
  POLICY_BOUNDS, POLICY_DEFAULTS, policyDrift, type DeskPolicy,
} from '@/lib/london/policy'
import { K, Led, Panel } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function ThresholdRow({
  code, name, value, live, liveLabel, bounds, format, onChange, armed, accent,
}: {
  code: string
  name: string
  value: number
  live: number
  liveLabel: string
  bounds: { min: number; max: number; step: number }
  format: (v: number) => string
  onChange: (v: number) => void
  armed: boolean
  accent: string
}) {
  const span = bounds.max - bounds.min
  // distance between the live metric and the trigger, in policy units
  const gap = code === 'SCALE' ? live - value : value - live
  const gapPct = (Math.max(0, gap) / span) * 100
  const close = gapPct < 18 // metric within 18% of the trigger — pre-arm zone

  return (
    <div
      className="border rounded-sm px-2 py-1.5 transition-colors"
      style={{
        borderColor: armed ? hexA(KT('down'), 0.55) : close ? hexA(KT('warn'), 0.4) : KT('grid'),
        background: armed ? hexA(KT('down'), 0.05) : KT('bgDeep'),
      }}
    >
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[9px] font-black tracking-[0.14em]" style={{ color: accent }}>[{code}]</span>
        <span className="text-[9px] font-bold tracking-wide text-[#8fa39a] truncate">{name}</span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[8px] tabular-nums text-muted-foreground">
            {liveLabel} <span className="font-bold" style={{ color: armed ? K.red : close ? K.orange : K.green }}>{typeof live === 'number' ? live.toFixed(code === 'KILL' ? 1 : code === 'SCALE' ? 2 : 3) : '—'}</span>
          </span>
          <span
            className="text-[9px] font-black tabular-nums px-1 rounded-sm"
            style={{ color: armed ? K.red : K.text, background: 'rgba(255,255,255,0.04)' }}
            aria-live="off"
          >
            {format(value)}
          </span>
        </span>
      </div>
      <Slider
        value={[value]}
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        onValueChange={(v) => onChange(v[0])}
        aria-label={`${code} threshold — ${name}`}
        className="h-3 [&_[data-slot=slider-track]]:h-[5px] [&_[data-slot=slider-track]]:bg-kinset [&_[data-slot=slider-track]]:border [&_[data-slot=slider-track]]:border-gridline [&_[data-slot=slider-range]]:bg-transparent"
      />
      <div className="flex justify-between text-[7px] tracking-[0.14em] text-muted-foreground tabular-nums mt-0.5">
        <span>{format(bounds.min)}</span>
        <span style={{ color: armed ? K.red : close ? K.orange : KT('textMuted') }}>
          {armed ? '◆ TRIGGER LIVE — INTERCEPTOR ARMED' : close ? `PRE-ARM ZONE · Δ ${gap.toFixed(code === 'KILL' ? 1 : code === 'SCALE' ? 2 : 3)}` : `Δ ${gap.toFixed(code === 'KILL' ? 1 : code === 'SCALE' ? 2 : 3)} TO TRIGGER`}
        </span>
        <span>{format(bounds.max)}</span>
      </div>
    </div>
  )
}

export function RiskPolicy() {
  const policy = useKrupp((s) => s.policy)
  const setPolicy = useKrupp((s) => s.setPolicy)
  const m = useKrupp((s) => s.metrics)
  const setProfilesOpen = useKrupp((s) => s.setProfilesOpen)
  const activeProfile = useKrupp((s) => s.activeProfile)

  const drift = policyDrift(policy)
  const onSpec = drift < 1e-9

  const patch = (k: keyof DeskPolicy, v: number) => setPolicy({ ...policy, [k]: v })

  return (
    <Panel
      title="DESK RISK POLICY"
      sub={activeProfile ? `PROFILE “${activeProfile}” · KERNEL HOT-LOAD` : 'INTERCEPTOR THRESHOLDS · KERNEL HOT-LOAD'}
      accent={onSpec ? 'green' : 'orange'}
      right={
        <span className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[7px] tracking-[0.18em] px-1 py-0.5 border rounded-sm tabular-nums"
            style={{
              borderColor: onSpec ? hexA(KT('up'), 0.35) : hexA(KT('warn'), 0.5),
              color: onSpec ? K.green : K.orange,
            }}
            title="Aggregate deviation from the spec defaults"
          >
            {onSpec ? 'SPEC' : `DRIFT ${(drift * 100).toFixed(0)}bp`}
          </span>
          <SlidersHorizontal size={12} style={{ color: onSpec ? K.green : K.orange }} className="shrink-0" aria-hidden />
        </span>
      }
      className="min-h-[170px]"
    >
      <div className="flex flex-col gap-1.5">
        <ThresholdRow
          code="LOCK" name="Chaos seal (Shannon H)"
          value={policy.lockChaos} live={m.entropy} liveLabel="H"
          bounds={POLICY_BOUNDS.lockChaos}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patch('lockChaos', v)}
          armed={m.interceptors.lock} accent={K.orange}
        />
        <ThresholdRow
          code="SCALE" name="Viscosity floor (×baseline)"
          value={policy.scaleVisc} live={m.viscRatio} liveLabel="νR"
          bounds={POLICY_BOUNDS.scaleVisc}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          onChange={(v) => patch('scaleVisc', v)}
          armed={m.interceptors.scale} accent={K.orange}
        />
        <ThresholdRow
          code="KILL" name="Crisis score ceiling"
          value={policy.killScore} live={m.score} liveLabel="SCR"
          bounds={POLICY_BOUNDS.killScore}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patch('killScore', v)}
          armed={m.interceptors.kill} accent={K.red}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[8px] tracking-[0.16em] text-muted-foreground truncate">
          <Led color={onSpec ? 'green' : 'orange'} className="mr-1 align-middle" />
          {onSpec ? 'SPEC PARAMETERS — KERNEL INSTITUTIONAL BASELINE' : 'NON-STANDARD POLICY — PERSISTED TO DESK PROFILE'}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost" size="sm"
            className="h-5 px-1.5 text-[7.5px] tracking-[0.16em] font-bold text-muted-foreground hover:text-cyan-300 hover:bg-cyan-950/30 shrink-0"
            onClick={() => { useKrupp.getState().refreshProfiles(); setProfilesOpen(true) }}
            type="button"
            aria-label="Manage policy profiles"
          >
            <FolderDown size={10} className="mr-1" aria-hidden /> PROFILES
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-5 px-1.5 text-[7.5px] tracking-[0.16em] font-bold text-muted-foreground hover:text-green-300 hover:bg-green-950/30 shrink-0"
            onClick={() => setPolicy({ ...POLICY_DEFAULTS })}
            disabled={onSpec}
            type="button"
            aria-label="Reset risk policy to spec defaults"
          >
            <RotateCcw size={10} className="mr-1" aria-hidden /> RESET TO SPEC
          </Button>
        </span>
      </div>
    </Panel>
  )
}
