'use client'

// ============================================================================
// BOOT SEQUENCE OVERLAY — terminal power-on ritual (skippable, ~2s)
// ============================================================================

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { K } from './shared'
import { KT } from '@/lib/theme';

const LINES: Array<{ text: string; color?: string; delay: number }> = [
  { text: 'KRUPP-BIOS v9.4.1 // NAVIER-STOKES QUANT KERNEL', color: K.green, delay: 0 },
  { text: '> mounting Float32 tensor buffers [10 × 900 @ 10Hz] ........ OK', delay: 240 },
  { text: '> Hawkes excititation core (μ=0.1 α=0.4 β=1.8) ............. OK', color: K.cyan, delay: 580 },
  { text: '> ABE fluid solver — jerk regularizer Δt≥0.005 ............. OK', color: K.cyan, delay: 900 },
  { text: '> execution ledger — hamiltonian routing desk .............. ENGAGED', color: K.cyan, delay: 1200 },
  { text: '> pre-trade interceptor chain LOCK→SCALE→KILL .............. ARMED', color: K.orange, delay: 1480 },
  { text: '> LSE strategic-edge gateway ://londonstrategicedge.com .... ARMED', color: K.orange, delay: 1740 },
  { text: '> CBOE collector cache-seam (VIX·SKEW·VVIX·P/C) ............ SYNCING', delay: 1980 },
  { text: '> awaiting Firebase Bearer Token injection _', delay: 2260 },
]

export function BootOverlay() {
  const [done, setDone] = useState(false)

  useEffect(() => {
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
        {LINES.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: l.delay / 1000, duration: 0.05 }}
            style={{ color: l.color ?? KT('zinc'), textShadow: l.color ? `0 0 8px ${l.color}55` : undefined }}
          >
            {l.text}
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.65 }}
          className="mt-3 text-[8px] tracking-[0.3em] text-[#3d4a42]"
        >
          KRUPP CAPITAL // L3 RISK DESK — CLICK TO SKIP
        </motion.div>
      </div>
    </motion.div>
  )
}
