'use client'

// ============================================================================
// COLUMN 1 // CARD 4 — CROSS-INSTRUMENT CORRELATION MATRIX
// Rolling Pearson ρ (300 ticks ≈ 30s) across ES / NQ / SPY — systemic
// co-movement gauge. ρ→1 = single-factor risk; ρ↓ = diversification live.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { GitCompareArrows } from 'lucide-react'
import { CORR_SYMS, corrSamples, correlationMatrix, meanPairwiseRho } from '@/lib/london/correlation'
import { useKrupp } from '@/lib/london/store'
import { K, Panel, fmt } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
function rhoColor(v: number): string {
  if (!Number.isFinite(v)) return KT('textFaint')
  if (v >= 0.95) return K.red // systemic lockstep — correlation risk max
  if (v >= 0.8) return K.orange
  if (v >= 0.4) return K.green
  if (v > -0.2) return K.cyan
  return K.violet // meaningful negative ρ — hedge-like behavior
}

/**
 * AVG-ρ HEAT HISTORY — rolling mean-pairwise correlation rendered as a heat
 * column strip (1 sample/s). Red column wall forming = systemic lockstep;
 * cyan/violet dispersion = diversification live. Dashed line = 0.95 systemic.
 */
function HeatStrip({ history }: { history: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef(history)
  useEffect(() => { dataRef.current = history }, [history])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 200) return
      last = t
      const d = dataRef.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (d.length < 2) return
      const n = d.length
      const CAP = 120
      // newest samples anchor right; empty lead-in on a cold boot
      const lead = Math.max(0, CAP - n)
      const bw = w / CAP
      for (let i = 0; i < n; i++) {
        const v = d[i]
        ctx.fillStyle = rhoColor(v)
        ctx.globalAlpha = 0.28 + 0.6 * Math.abs(v) // stronger ρ → hotter column
        ctx.fillRect((lead + i) * bw, 1.5, Math.max(1, bw - 0.6), h - 3)
      }
      ctx.globalAlpha = 1
      // 0.95 systemic threshold (dashed red)
      const ty = 1.5 + ((1 - 0.95) / 2) * (h - 3)
      ctx.strokeStyle = hexA(KT('down'), 0.7)
      ctx.setLineDash([3, 2])
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke()
      ctx.setLineDash([])
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="heat-strip relative border border-gridline bg-kbg-deep rounded-sm overflow-hidden mt-1">
      <canvas ref={ref} className="w-full block" style={{ height: 22 }} aria-label="Mean pairwise correlation heat history" role="img" />
      <span className="absolute top-0.5 left-1.5 text-[6.5px] tracking-[0.18em] text-muted-foreground/70 pointer-events-none">ρ HEAT · 120s</span>
      <span className="absolute top-0.5 right-1.5 text-[6.5px] tracking-[0.14em] text-muted-foreground/70 pointer-events-none">0.95 SYSTEMIC</span>
    </div>
  )
}

export function CorrelationPanel() {
  const regime = useKrupp((s) => s.metrics.regime)
  const [snapshot, setSnapshot] = useState<{ m: number[][]; n: number }>({ m: [], n: 0 })
  const [trend, setTrend] = useState(NaN)
  const [heat, setHeat] = useState<number[]>([])
  const history = useRef<number[]>([])

  // 1s sampler — matrix reads are cached; history/trend tracked here
  useEffect(() => {
    const sample = () => {
      const { m } = correlationMatrix()
      setSnapshot({ m, n: m.length ? m[0].length : 0 })
      if (m.length === 3) {
        const avg = meanPairwiseRho(m)
        if (Number.isFinite(avg)) {
          const h = history.current
          h.push(avg)
          if (h.length > 120) h.shift()
          setHeat([...h])
          setTrend(h.length >= 20 ? avg - h[h.length - 20] : NaN)
        }
      }
    }
    const id = setInterval(sample, 1000)
    return () => clearInterval(id)
  }, [])

  const { m } = snapshot
  const avg = m.length ? meanPairwiseRho(m) : NaN
  const samples = corrSamples()
  const warming = samples < 30

  const systemic = Number.isFinite(avg) && avg >= 0.95

  return (
    <Panel
      title="CROSS-ASSET CORRELATION"
      sub="PEARSON ρ · 300t WINDOW"
      accent={systemic ? 'red' : Number.isFinite(avg) && avg < 0.4 ? 'cyan' : 'green'}
      right={<GitCompareArrows size={12} style={{ color: systemic ? K.red : K.cyan }} className="shrink-0" aria-hidden />}
      className="min-h-[132px]"
    >
      {warming ? (
        <div className="h-full grid place-items-center text-[9px] tracking-[0.24em] text-muted-foreground">
          CORRELATION ENGINE WARMING · {samples}/300 SAMPLES
        </div>
      ) : (
        <div className="flex items-center gap-3 h-full">
          {/* 3×3 heatmap */}
          <div className="grid grid-cols-[16px_repeat(3,1fr)] gap-[2px] w-[172px] shrink-0 tabular-nums" role="table" aria-label="Rolling correlation matrix">
            <span />
            {CORR_SYMS.map((s) => (
              <span key={s} className="text-[7.5px] text-center tracking-[0.1em] text-muted-foreground">{s}</span>
            ))}
            {CORR_SYMS.map((ri, i) => (
              <CorrRow key={ri} sym={ri} row={m[i] ?? []} j={i} />
            ))}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[8px] tracking-[0.2em] text-muted-foreground">MEAN PAIRWISE ρ</span>
              <span
                className="text-lg font-bold tabular-nums leading-none"
                style={{ color: rhoColor(avg), textShadow: `0 0 10px ${rhoColor(avg)}55` }}
              >
                {fmt.n3(avg)}
              </span>
            </div>
            <div className="h-1 bg-kpanel2 rounded-sm overflow-hidden relative" aria-hidden>
              {/* −1..1 axis with center tick */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-kborder4" />
              <div
                className="absolute top-0 bottom-0 transition-all duration-300"
                style={{
                  left: avg >= 0 ? '50%' : `${50 + avg * 50}%`,
                  width: `${Math.abs(avg) * 50}%`,
                  background: rhoColor(avg),
                  boxShadow: `0 0 6px ${rhoColor(avg)}`,
                }}
              />
            </div>
            <div className="flex justify-between text-[7px] text-muted-foreground tabular-nums">
              <span>−1.0</span>
              <span>0</span>
              <span>+1.0</span>
            </div>
            <div className="text-[8px] leading-snug mt-0.5" style={{ color: systemic ? K.red : KT('zinc') }}>
              {systemic
                ? '⚠ SYSTEMIC LOCKSTEP — SINGLE-FACTOR RISK, DIVERSIFICATION IMPAIRED'
                : Number.isFinite(avg) && avg < 0.4
                  ? 'DIVERSIFICATION LIVE — CROSS-ASSET DISPERSION HEALTHY'
                  : 'ELEVATED CO-MOVEMENT — RISK CLUSTERING NORMATIVE'}
            </div>
            <HeatStrip history={heat} />
            <div className="flex items-center gap-2 text-[7.5px] tabular-nums text-muted-foreground mt-auto">
              <span>REGIME <span style={{ color: regime === 'CRISIS' ? K.red : regime === 'HIGH' ? K.orange : K.green }}>{regime}</span></span>
              <span>Δ20 <span style={{ color: !Number.isFinite(trend) ? KT('textMuted') : trend > 0.01 ? K.red : trend < -0.01 ? K.green : KT('textMuted') }}>
                {Number.isFinite(trend) ? `${trend >= 0 ? '+' : '−'}${Math.abs(trend).toFixed(3)}` : '—'}
              </span></span>
              <span className="ml-auto">{samples}t</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function CorrRow({ sym, row, j }: { sym: string; row: number[]; j: number }) {
  return (
    <>
      <span className="text-[7.5px] tracking-[0.1em] text-muted-foreground flex items-center">{sym}</span>
      {row.map((v, i) => (
        <span
          key={i}
          className="text-[8px] font-bold text-center py-[3px] rounded-[1px] border border-kinset"
          role="cell"
          aria-label={`ρ(${sym}, ${CORR_SYMS[i]}) = ${fmt.n3(v)}`}
          style={{
            background: i === j ? 'rgba(255,255,255,0.03)' : `${rhoColor(v)}${Number.isFinite(v) ? '1f' : '08'}`,
            color: i === j ? KT('textMuted') : rhoColor(v),
          }}
          title={`ρ(${sym}, ${CORR_SYMS[i]}) = ${fmt.n3(v)}`}
        >
          {i === j ? '—' : fmt.n2(v)}
        </span>
      ))}
      <span className="sr-only">row {j}</span>
    </>
  )
}
