'use client'

// ============================================================================
// COLUMN 1 // CARD 1 — HAWKES PROCESS (ORDER FLOW TOXICITY)
// λt = μ + (λt-Δt − μ)·e^(−β·Δt) + α·volume·|Δp|/(high−low)
// ============================================================================

import { Activity } from 'lucide-react'
import { buffers } from '@/lib/london/buffers'
import { useKrupp } from '@/lib/london/store'
import { K, Metric, Panel, Spark, fmt } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

export function HawkesPanel() {
  const m = useKrupp((s) => s.metrics)
  const hot = m.toxZ > 1.8
  const critical = m.toxZ > 2.8

  return (
    <Panel
      title="HAWKES PROCESS"
      sub="ORDER-FLOW TOXICITY"
      accent={critical ? 'red' : hot ? 'orange' : 'cyan'}
      right={<Activity size={12} style={{ color: critical ? K.red : hot ? K.orange : K.cyan }} className="shrink-0" aria-hidden />}
      className="min-h-[168px]"
    >
      <div className="flex items-start justify-between gap-3">
        <Metric
          label="λ INTENSITY (HAWKES)"
          value={fmt.n4(m.hawkes)}
          color={critical ? K.red : hot ? K.orange : K.cyan}
          glow
          sub={`shock Kernel: α·v·|Δp|/(h−l)  ·  window 100t`}
        />
        <div className="text-right shrink-0">
          <div className="text-[9px] tracking-[0.2em] text-muted-foreground">TOXICITY Z</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: critical ? K.red : hot ? K.orange : K.green, textShadow: `0 0 10px ${critical ? K.red : hot ? K.orange : K.green}55` }}>
            {m.toxZ >= 0 ? '+' : ''}{m.toxZ.toFixed(2)}σ
          </div>
        </div>
      </div>

      <div className="mt-2 border border-gridline bg-kbg-deep rounded-sm overflow-hidden">
        <Spark buffer={buffers.hawkes} color={critical ? K.red : hot ? K.orange : K.cyan} height={64} />
      </div>

      {/* toxicity z — symmetric ±3.5σ strip with zero-axis + alert rails */}
      <div className="mt-1 border border-gridline bg-kbg-deep rounded-sm overflow-hidden relative">
        <Spark
          buffer={buffers.toxz}
          color={critical ? K.red : hot ? K.orange : K.green}
          height={34}
          min={-3.5}
          max={3.5}
          threshold={0}
          thresholdColor={hexA(KT('text'), 0.18)}
        />
        <span className="absolute left-1 top-0.5 text-[6.5px] tracking-[0.2em] text-muted-foreground pointer-events-none">z(λ) ±3.5σ</span>
        <span
          className="absolute right-1 top-0.5 text-[6.5px] tracking-[0.16em] pointer-events-none"
          style={{ color: critical ? K.red : hot ? K.orange : KT('textFaint') }}
        >
          {critical ? 'CASCADE' : hot ? 'EXCITED' : 'NOMINAL'}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span>μ=0.1</span>
        <span style={{ color: K.cyan }}>α=0.4</span>
        <span style={{ color: K.cyan }}>β=1.8</span>
        <span className="ml-auto">{critical ? 'EXCITATION CASCADE ACTIVE' : hot ? 'SELF-EXCITATION ELEVATED' : 'BRANCHING RATIO NOMINAL'}</span>
      </div>
    </Panel>
  )
}
