'use client'

// ============================================================================
// COLUMN 2 // CARD 3 — PRE-TRADE RISK FILTERS (ACTIVE INTERCEPTORS)
// [LOCK] chaos > 0.85 · [SCALE] viscosity < 55% baseline · [KILL] score > 75
// ============================================================================

import { Lock, ShieldAlert, Skull } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useKrupp } from '@/lib/london/store'
import { K, Panel } from './shared'
import type { Regime } from '@/lib/london/types'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function Interceptor({
  code, name, detail, armed, reason, icon, color,
}: {
  code: string
  name: string
  detail: string
  armed: boolean
  reason: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div
      className={`flex items-center gap-2 border rounded-sm px-2 py-1.5 transition-all duration-150 ${armed ? 'glow-box-red' : ''}`}
      style={{ borderColor: armed ? hexA(KT('down'), 0.55) : KT('grid'), background: armed ? hexA(KT('down'), 0.05) : KT('bgDeep') }}
      role="status"
      aria-label={`${code} interceptor ${armed ? 'armed' : 'standby'}`}
    >
      <span className="shrink-0" style={{ color: armed ? K.red : KT('textFaint') }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-black tracking-[0.14em]" style={{ color: armed ? K.red : KT('textMuted') }}>[{code}]</span>
          <span className="text-[10px] font-bold tracking-wide truncate" style={{ color: armed ? K.text : KT('zinc') }}>{name}</span>
        </div>
        <div className="text-[8px] text-muted-foreground truncate">
          {armed ? <span className="anim-blink" style={{ color: K.orange }}>{reason}</span> : detail}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[7.5px] font-bold tracking-[0.2em]" style={{ color: armed ? K.red : KT('textFaint') }}>
          {armed ? 'ARMED' : 'STANDBY'}
        </span>
        <Switch checked={armed} disabled aria-label={`${code} interceptor switch`} className="data-[state=checked]:bg-red-600/80 data-[state=unchecked]:bg-kinset" />
      </div>
    </div>
  )
}

export function Interceptors() {
  const m = useKrupp((s) => s.metrics)
  const policy = useKrupp((s) => s.policy)
  const regime: Regime = m.regime
  const anyArmed = m.interceptors.lock || m.interceptors.scale || m.interceptors.kill

  return (
    <Panel
      title="PRE-TRADE RISK FILTERS"
      sub="ACTIVE INTERCEPTORS"
      accent={anyArmed ? 'red' : 'dim'}
      right={<ShieldAlert size={12} style={{ color: anyArmed ? K.red : KT('textFaint') }} className={anyArmed ? 'anim-blink' : ''} aria-hidden />}
    >
      <div className="flex flex-col gap-1.5">
        <Interceptor
          code="LOCK" name="Block Mean Reversion"
          detail={`Trigger: Shannon Chaos > ${policy.lockChaos.toFixed(2)}`} armed={m.interceptors.lock} reason={m.reasons.lock}
          icon={<Lock size={14} />} color={K.orange}
        />
        <Interceptor
          code="SCALE" name="Reduce Position Size"
          detail={`Trigger: Fluid Viscosity < ${Math.round(policy.scaleVisc * 100)}% baseline`} armed={m.interceptors.scale} reason={m.reasons.scale}
          icon={<ShieldAlert size={14} />} color={K.orange}
        />
        <Interceptor
          code="KILL" name="Emergency Liquidation"
          detail={`Trigger: Global Regime CRISIS (>${policy.killScore.toFixed(0)})`} armed={m.interceptors.kill} reason={m.reasons.kill}
          icon={<Skull size={14} />} color={K.red}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[8px] tracking-[0.18em] text-muted-foreground">
        <span>KILL-CHAIN: LOCK → SCALE → KILL</span>
        <span style={{ color: regime === 'CRISIS' ? K.red : regime === 'HIGH' ? K.orange : K.green }}>
          REGIME FEED: {regime}
        </span>
      </div>
    </Panel>
  )
}
