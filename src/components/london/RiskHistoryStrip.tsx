'use client'

// ============================================================================
// KRUPP CAPITAL // COMPOSITE RISK HISTORY STRIP
// Regime-banded area chart over the score ring buffer (rAF, zero-alloc).
// ============================================================================

import { useEffect, useRef } from 'react'
import { buffers } from '@/lib/london/buffers'
import { K } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const HISTORY_MIN = 40 // px height

export function RiskHistoryStrip({ height = 62 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth, h = cv.clientHeight
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // threshold gridlines: 50 (orange), 75 (red)
      const yOf = (v: number) => h - (v / 100) * h
      ctx.strokeStyle = hexA(KT('warn'), 0.35)
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(0, yOf(50)); ctx.lineTo(w, yOf(50)); ctx.stroke()
      ctx.strokeStyle = hexA(KT('down'), 0.4)
      ctx.beginPath(); ctx.moveTo(0, yOf(75)); ctx.lineTo(w, yOf(75)); ctx.stroke()
      ctx.setLineDash([])

      const n = buffers.score.filled
      if (n > 1) {
        const x = (i: number) => (i / (n - 1)) * w
        // regime-banded fill: draw per-sample vertical slivers colored by value
        for (let i = 1; i < n; i++) {
          const v = buffers.score.at(i)
          const col = v > 75 ? K.red : v >= 50 ? K.orange : K.green
          ctx.fillStyle = `${col}26`
          ctx.fillRect(x(i - 1), yOf(Math.max(v, 0.5)), Math.max(1, w / n + 0.5), h - yOf(Math.max(v, 0.5)))
        }
        // outline
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const px = x(i)
          const py = yOf(buffers.score.at(i))
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.strokeStyle = hexA(KT('text'), 0.55)
        ctx.lineWidth = 1
        ctx.stroke()

        // labels
        ctx.font = '7.5px monospace'
        ctx.fillStyle = hexA(KT('textMuted'), 0.9)
        ctx.fillText('50', 2, yOf(50) - 2)
        ctx.fillText('75', 2, yOf(75) - 2)
        // head marker
        const last = buffers.score.at(n - 1)
        ctx.beginPath()
        ctx.arc(w - 1, yOf(last), 2.4, 0, Math.PI * 2)
        ctx.fillStyle = last > 75 ? K.red : last >= 50 ? K.orange : K.green
        ctx.fill()
      } else {
        ctx.font = '8px monospace'
        ctx.fillStyle = KT('textFaint')
        ctx.fillText('ACCUMULATING RISK TAPE…', 4, h / 2)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="border border-gridline bg-kbg-deep rounded-sm overflow-hidden">
      <canvas ref={ref} style={{ height }} className="w-full block" role="img" aria-label="Composite risk score history" />
    </div>
  )
}
