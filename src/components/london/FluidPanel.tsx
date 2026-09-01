'use client'

// ============================================================================
// COLUMN 1 // CARD 2 — ABE FLUID DYNAMICS SOLVER
// Viscosity = mean(volumes) / (mean(ranges) + ε)
// Jerk = |p_t − 3p_{t−1} + 3p_{t−2} − p_{t−3}| / (max(Δt, 0.005)³ + ε)
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion'
import { Waves } from 'lucide-react'
import { buffers } from '@/lib/london/buffers'
import { useKrupp } from '@/lib/london/store'
import { K, Metric, Panel, Spark, fmt } from './shared'
import { KT } from '@/lib/theme';

export function FluidPanel() {
  const m = useKrupp((s) => s.metrics)
  const shock = m.shock
  const viscLow = m.interceptors.scale

  return (
    <Panel
      title="ABE FLUID DYNAMICS SOLVER"
      sub="VISCOSITY · REGULARIZED JERK"
      accent={shock ? 'red' : viscLow ? 'orange' : 'cyan'}
      right={<Waves size={12} style={{ color: shock ? K.red : K.cyan }} className="shrink-0" aria-hidden />}
      className="min-h-[196px]"
    >
      <div className="relative">
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-gridline bg-kbg-deep rounded-sm p-2">
            <Metric
              label="VISCOSITY ν"
              value={fmt.n2(m.viscosity)}
              unit="vol/rng"
              color={viscLow ? K.orange : K.cyan}
              glow={!viscLow}
              sub={`baseline × ${m.viscRatio.toFixed(2)}`}
            />
            <div className="mt-1.5 h-1 bg-kpanel2 rounded-sm overflow-hidden" aria-hidden>
              <div
                className="h-full transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(2, m.viscRatio * 60))}%`, background: viscLow ? K.orange : K.cyan, boxShadow: `0 0 6px ${viscLow ? K.orange : K.cyan}` }}
              />
            </div>
          </div>
          <div className="border border-gridline bg-kbg-deep rounded-sm p-2">
            <Metric
              label="JERK j (3rd DERIV)"
              value={fmt.int(m.jerk)}
              unit="px/s³"
              color={m.jerkZ > 3 ? K.red : m.jerkZ > 1.8 ? K.orange : K.green}
              glow={m.jerkZ > 3}
              sub={`z=${m.jerkZ >= 0 ? '+' : ''}${m.jerkZ.toFixed(2)}σ · Δt≥0.005s`}
            />
            <div className="mt-1.5 h-1 bg-kpanel2 rounded-sm overflow-hidden" aria-hidden>
              <div
                className="h-full transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(2, Math.abs(m.jerkZ) * 22))}%`, background: m.jerkZ > 3 ? K.red : m.jerkZ > 1.8 ? K.orange : K.green, boxShadow: `0 0 6px ${m.jerkZ > 3 ? K.red : K.green}` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-2 border border-gridline bg-kbg-deep rounded-sm overflow-hidden">
          <Spark buffer={buffers.jerk} color={m.jerkZ > 3 ? K.red : K.cyan} height={44} logScale />
        </div>

        {/* HEAVY VOLATILITY SHOCK overlay */}
        <AnimatePresence>
          {shock && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 z-10 grid place-items-center anim-flash-red border border-red-500/80 rounded-sm backdrop-blur-[1px]"
              role="alert"
            >
              <div className="text-center px-2">
                <div className="text-[11px] sm:text-sm font-black tracking-[0.14em] text-glow-red anim-blink-fast" style={{ color: K.red }}>
                  HEAVY VOLATILITY SHOCK DETECTED
                </div>
                <div className="text-[8px] tracking-[0.3em] text-red-300/80 mt-0.5">JERK Z-SCORE &gt; 3.0 · REGULARIZER ENGAGED</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  )
}
