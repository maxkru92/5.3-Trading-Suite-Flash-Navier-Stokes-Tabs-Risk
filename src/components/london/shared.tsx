'use client'

// ============================================================================
// KRUPP CAPITAL // SHARED UI PRIMITIVES
// ============================================================================

import { ReactNode, useEffect, useRef } from 'react'
import type { RingBuffer } from '@/lib/london/buffers'
import { KT, type ThemeTokens } from '@/lib/theme'

/**
 * Live palette — every property resolves against the ACTIVE colourline at
 * access time (safe inside rAF draw closures and style objects alike).
 */
export const K = new Proxy<Record<string, string>>({} as Record<string, string>, {
  get(_t, prop: string) {
    const map: Record<string, keyof Omit<ThemeTokens, 'name' | 'tag'>> = {
      green: 'accent', orange: 'warn', red: 'down', cyan: 'cyan',
      dim: 'textMuted', grid: 'grid', text: 'text', violet: 'violet',
    }
    const key = map[prop]
    return key ? KT(key) : ''
  },
})

export function Led({ color, className = '' }: { color: 'green' | 'orange' | 'red' | 'cyan' | 'dim'; className?: string }) {
  return <span aria-hidden className={`led led-${color} ${className}`} />
}

export function Panel({
  title, sub, accent = 'green', right, children, className = '', bodyClass = '',
}: {
  title: string
  sub?: string
  accent?: 'green' | 'orange' | 'red' | 'cyan' | 'dim'
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section className={`krupp-panel flex flex-col min-h-0 ${className}`} aria-label={title}>
      <header className="krupp-panel-head flex items-center justify-between gap-2 px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Led color={accent} />
          <h2 className="text-[10px] sm:text-[11px] font-semibold tracking-[0.22em] text-secondary-foreground truncate">
            {title}
          </h2>
          {sub && <span className="text-[9px] tracking-[0.14em] text-muted-foreground truncate hidden sm:inline">{sub}</span>}
        </div>
        {right}
      </header>
      <div className={`p-2.5 flex-1 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  )
}

/** Big numeric telemetry readout */
export function Metric({
  label, value, unit, color = K.text, glow, sub, className = '',
}: {
  label: string
  value: string
  unit?: string
  color?: string
  glow?: boolean
  sub?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
      <span className="text-[9px] tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className="text-xl sm:text-2xl font-bold tabular-nums leading-none" style={{ color, textShadow: glow ? `0 0 10px ${color}66` : undefined }}>
        {value}
        {unit && <span className="text-[11px] font-normal ml-1 opacity-70">{unit}</span>}
      </span>
      {sub && <span className="text-[9px] text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  )
}

/**
 * Canvas sparkline driven by rAF, reading a Float32 RingBuffer directly.
 * No per-frame allocations → zero GC pressure.
 */
export function Spark({
  buffer, color, height = 56, min, max, autoPad = 0.08, logScale = false, threshold, thresholdColor = K.red, areaGradient = false,
}: {
  buffer: RingBuffer
  color: string
  height?: number
  min?: number
  max?: number
  autoPad?: number
  logScale?: boolean
  threshold?: number
  thresholdColor?: string
  /** vertical gradient fill (top = color 33% → transparent) instead of flat wash */
  areaGradient?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    const map = (v: number) => (logScale ? Math.log10(Math.max(v, 1e-3)) : v)

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth, h = cv.clientHeight
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr
        cv.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const fillStyle = areaGradient
        ? (() => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `${color}38`); g.addColorStop(1, `${color}03`); return g })()
        : `${color}14`

      const n = buffer?.filled ?? 0
      // gridlines
      ctx.strokeStyle = KT('grid')
      ctx.lineWidth = 1
      for (let gy = 1; gy < 4; gy++) {
        ctx.beginPath(); ctx.moveTo(0, (h / 4) * gy); ctx.lineTo(w, (h / 4) * gy); ctx.stroke()
      }

      if (n > 1 && buffer) {
        let lo = min ?? Infinity, hi = max ?? -Infinity
        if (min == null || max == null) {
          for (let i = 0; i < n; i++) {
            const v = map(buffer.at(i))
            if (min == null && v < lo) lo = v
            if (max == null && v > hi) hi = v
          }
          if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1 }
          const pad = (hi - lo) * autoPad || 1e-6
          if (min == null) lo -= pad
          if (max == null) hi += pad
        }
        const range = hi - lo || 1e-6
        const yOf = (v: number) => h - ((map(v) - lo) / range) * h

        if (threshold != null && threshold >= lo && threshold <= hi) {
          const ty = yOf(threshold)
          ctx.strokeStyle = thresholdColor
          ctx.setLineDash([4, 3])
          ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke()
          ctx.setLineDash([])
        }

        // fill
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let i = 0; i < n; i++) ctx.lineTo((i / (n - 1)) * w, yOf(buffer.at(i)))
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fillStyle = fillStyle
        ctx.fill()

        // line
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w
          const y = yOf(buffer.at(i))
          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.strokeStyle = color
        ctx.lineWidth = 1.4
        ctx.shadowColor = color
        ctx.shadowBlur = 6
        ctx.stroke()
        ctx.shadowBlur = 0

        // head dot
        const hx = ((n - 1) / (n - 1)) * w
        ctx.beginPath()
        ctx.arc(hx, yOf(buffer.at(n - 1)), 2.2, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [buffer, color, min, max, autoPad, logScale, threshold, thresholdColor, areaGradient])

  return <canvas ref={ref} style={{ height }} className="w-full block" aria-hidden />
}

export const fmt = {
  time: (v: string | number) => new Date(v).toLocaleTimeString('en-GB', { hour12: false }),
  n2: (v: number | undefined | null) => (v == null || !isFinite(v) ? '—' : v.toFixed(2)),
  n3: (v: number | undefined | null) => (v == null || !isFinite(v) ? '—' : v.toFixed(3)),
  n4: (v: number | undefined | null) => (v == null || !isFinite(v) ? '—' : v.toFixed(4)),
  int: (v: number | undefined | null) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US')),
  price: (v: number | undefined | null) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
  compact: (v: number | undefined | null) => {
    if (v == null || !isFinite(v)) return '—'
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`
    return v.toFixed(0)
  },
}
