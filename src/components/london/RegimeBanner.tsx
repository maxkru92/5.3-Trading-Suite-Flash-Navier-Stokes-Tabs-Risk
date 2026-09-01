'use client'

// ============================================================================
// GLOBAL REGIME BANNER — full-width flashing crisis strip (below header)
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion'
import { AlertOctagon } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { K } from './shared'

export function RegimeBanner() {
  const regime = useKrupp((s) => s.metrics.regime)
  const interceptors = useKrupp((s) => s.metrics.interceptors)
  return (
    <AnimatePresence>
      {regime === 'CRISIS' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden shrink-0"
          role="alert"
        >
          <div className="anim-flash-red border-b border-red-500/70 px-3 py-1.5 flex items-center gap-2.5">
            <AlertOctagon size={15} color={K.red} className="anim-blink-fast shrink-0" aria-hidden />
            <span className="text-[10px] sm:text-[11px] font-black tracking-[0.12em] text-glow-red truncate" style={{ color: K.red }}>
              CRITICAL SYSTEMIC CRISIS // MEAN REVERSION INTERCEPTED
            </span>
            <span className="ml-auto hidden md:flex gap-2 text-[8px] tracking-[0.2em] text-red-200/80 shrink-0">
              <span className={interceptors.lock ? 'opacity-100' : 'opacity-30'}>LOCK</span>
              <span className={interceptors.scale ? 'opacity-100' : 'opacity-30'}>SCALE</span>
              <span className={interceptors.kill ? 'opacity-100' : 'opacity-30'}>KILL</span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
