'use client'

// ============================================================================
// BOOT SEQUENCE OVERLAY — terminal power-on ritual (skippable, ~2s)
// ============================================================================

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { KT } from '@/lib/theme';

const LINES: Array<{ text: string; color?: string; delay: number }> = [
  { text: 'KRUPP-BIOS v9.4.1 // NAVIER-STOKES QUANT KERNEL', color: 'up', delay: 0 },
  { text: '> mounting Float32 tensor buffers [10 × 900 @ 10Hz] ........ OK', delay: 240 },
  { text: '> Hawkes excititation core (μ=0.1 α=0.4 β=1.8) ............. OK', color: 'accent', delay: 580 },
  { text: '> ABE fluid solver — jerk regularizer Δt≥0.005 ............. OK', color: 'accent', delay: 900 },
  { text: '> execution ledger — hamiltonian routing desk .............. ENGAGED', color: 'accent', delay: 1200 },
  { text: '> pre-trade interceptor chain LOCK→SCALE→KILL .............. ARMED', color: 'warn', delay: 1480 },
  { text: '> LSE strategic-edge gateway ://londonstrategicedge.com .... ARMED', color: 'warn', delay: 1740 },
  { text: '> CBOE collector cache-seam (VIX·SKEW·VVIX·P/C) ............ SYNCING', delay: 1980 },
  { text: '> awaiting Firebase Bearer Token injection _', delay: 2260 },
]

// The overlay lives INSIDE the theme-keyed workspace subtree (Shell remounts
// key={theme} on every colourline cut-over so all canvases redraw). Without
// this guard the 2.9s BIOS ritual would replay on every theme flip — a
// full-screen blocker mid-session. Module flag = once per real page load.
let playedThisLoad = false

export function BootOverlay() {
  const [done, setDone] = useState(playedThisLoad)

  useEffect(() => {
    if (playedThisLoad) return
    playedThisLoad = true
    const id = setTimeout(() => setDone(true), 2900)
    return () => clearTimeout(id)
  }, [])

  if (done) return null
  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-kbg flex items-center justify-center cursor-pointer"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 2.6, duration: 0.32 }}
      onClick={() => setDone(true)}
      aria-hidden
    >
      <div className="font-mono text-[10px] sm:text-[11px] leading-relaxed w-full max-w-xl px-6">
        {LINES.map((l, i) => {
          const c = l.color ? KT(l.color as 'up' | 'accent' | 'warn') : KT('zinc');
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: l.delay / 1000, duration: 0.05 }}
              style={{ color: c, textShadow: `0 0 8px ${c}55` }}
            >
              {l.text}
            </motion.div>
          );
        })}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.65 }}
          className="mt-3 text-[8px] tracking-[0.3em]"
          style={{ color: KT('textFaint') }}
        >
          KRUPP CAPITAL // L3 RISK DESK — CLICK TO SKIP
        </motion.div>
        {/* kernel load progress — fills over the boot sequence (r3 styling, r10 theme-resolved) */}
        <div className="mt-2 h-px w-full" style={{ background: KT('grid') }} role="presentation">
          <motion.div
            className="h-full"
            style={{ background: KT('cyan'), boxShadow: `0 0 6px ${KT('cyan')}` }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ delay: 0.1, duration: 2.4, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  )
}
