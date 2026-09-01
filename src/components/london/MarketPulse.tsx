'use client'

// ============================================================================
// KRUPP CAPITAL // MARKET PULSE — TRI-INSTRUMENT TAPE STRIP (round 8)
// Full-width hero strip under the regime banner: 90s normalized %Δ overlay of
// ES/NQ/SPY drawn from Float32 ring buffers (zero-alloc rAF), ES volume lane,
// liquidity-crash shading, in-canvas crosshair readout, and a live chip rail
// (last/dir/Δ per symbol, ES window hi-lo, tape C-Δ, spread, regime, crash T-…).
// Series are TAIL-ANCHORED (newest n samples of each buffer) so lopsided fill
// counts after a cold boot or feed reset stay time-aligned.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { buffers } from '@/lib/london/buffers'
import { feed } from '@/lib/london/feed'
import { useKrupp } from '@/lib/london/store'
import { K, Led } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

interface PulseSeries { sym: string; buf: typeof buffers.price; color: string; hero: boolean; filled: number; base: number; arr: Float32Array }
const SERIES_META = [
  { sym: 'ES', buf: buffers.price, color: K.green, hero: true },
  { sym: 'NQ', buf: buffers.nq, color: K.cyan, hero: false },
  { sym: 'SPY', buf: buffers.spy, color: K.violet, hero: false },
] as const

/** tail-anchored %Δ series over the newest n samples of each buffer */
function buildSeries(n: number): PulseSeries[] {
  return SERIES_META.map((s) => {
    const f = s.buf.filled
    const base = s.buf.at(f - n)
    const arr = new Float32Array(n)
    for (let i = 0; i < n; i++) arr[i] = ((s.buf.at(f - n + i) - base) / base) * 100
    return { ...s, filled: f, base, arr }
  })
}

interface ChipState {
  es: number; esDir: number; esDelta: number
  nq: number; nqDir: number; nqDelta: number
  spy: number; spyDir: number; spyDelta: number
  hi: number; lo: number
  spread: number
  cdelta: number
  regime: string
  crashIn: number // seconds of crash remaining (0 = calm)
}

const EMPTY_CHIPS: ChipState = {
  es: NaN, esDir: 0, esDelta: NaN, nq: NaN, nqDir: 0, nqDelta: NaN,
  spy: NaN, spyDir: 0, spyDelta: NaN, hi: NaN, lo: NaN, spread: NaN,
  cdelta: NaN, regime: '—', crashIn: 0,
}

function fmtPx(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '———'
}
function fmtPct(v: number): string {
  return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}%` : '—'
}

export function MarketPulse() {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const hoverRef = useRef<number | null>(null)
  const [chips, setChips] = useState<ChipState>(EMPTY_CHIPS)

  // --- canvas rAF loop (reads ring buffers directly, zero per-frame allocs) ---
  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = 0

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 66) return // ~15fps — tape strip cadence
      last = t
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const n = Math.min(buffers.price.filled, buffers.nq.filled, buffers.spy.filled)
      const laneH = Math.round(h * 0.72)
      const volTop = laneH + 5
      const volH = h - volTop - 2

      if (n < 10) {
        ctx.fillStyle = K.dim
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('SYNCHRONIZING TRI-INSTRUMENT TAPE — AWAITING TICK PARITY…', w / 2, h / 2)
        return
      }

      const series = buildSeries(n)
      const px = (i: number) => (i / (n - 1)) * (w - 2) + 1

      let lo = Infinity, hi = -Infinity
      for (const s of series) for (let i = 0; i < n; i++) { const v = s.arr[i]; if (v < lo) lo = v; if (v > hi) hi = v }
      const pad = Math.max((hi - lo) * 0.18, 0.02)
      lo -= pad; hi += pad
      const y = (v: number) => laneH - ((v - lo) / (hi - lo || 1)) * (laneH - 6) - 3

      // grid + zero axis
      ctx.strokeStyle = hexA(KT('grid'), 0.85)
      for (let g = 1; g < 4; g++) { const gy = (laneH / 4) * g; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke() }
      if (lo < 0 && hi > 0) {
        const zy = y(0)
        ctx.strokeStyle = hexA(KT('cyan'), 0.22)
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(w, zy); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = hexA(KT('cyan'), 0.5)
        ctx.font = '6.5px monospace'
        ctx.textAlign = 'left'
        ctx.fillText('±0.00%', 2, zy - 2)
      }

      // --- liquidity-crash shading (engine crash window active) ---
      const crashIn = Math.max(0, (useKrupp.getState().crashUntil - Date.now()) / 1000)
      if (crashIn > 0) {
        const alpha = calm ? 0.08 : 0.055 + 0.035 * Math.abs(Math.sin(t / 260))
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, rgbaDyn('down', alpha * 1.6))
        grad.addColorStop(1, rgbaDyn('down', alpha * 0.5))
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = K.red
        ctx.font = 'bold 8px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`◈ LIQUIDITY CRASH — T−${crashIn.toFixed(0)}s`, w - 4, 10)
      }

      // --- hero ES area ---
      const es = series[0]
      const yOf = (s: PulseSeries, i: number) => y(s.arr[i])
      ctx.beginPath()
      ctx.moveTo(px(0), laneH)
      for (let i = 0; i < n; i++) ctx.lineTo(px(i), yOf(es, i))
      ctx.lineTo(px(n - 1), laneH)
      ctx.closePath()
      ctx.fillStyle = hexA(KT('up'), 0.07)
      ctx.fill()

      // --- series lines + last nodes ---
      for (const s of series) {
        ctx.beginPath()
        for (let i = 0; i < n; i++) { const ax = px(i), ay = yOf(s, i); if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay) }
        ctx.strokeStyle = s.color
        ctx.lineWidth = s.hero ? 1.6 : 1
        if (s.hero) { ctx.shadowColor = s.color; ctx.shadowBlur = 6 }
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.beginPath()
        ctx.arc(px(n - 1), yOf(s, n - 1), s.hero ? 2.4 : 1.6, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.fill()
      }

      // --- ES volume lane (bars colored by tick direction; tail-anchored) ---
      const esF = buffers.price.filled
      let vmax = 0
      for (let i = 0; i < n; i++) { const v = buffers.volume.at(esF - n + i); if (v > vmax) vmax = v }
      const bw = Math.max(1, (w / n) * 0.7)
      for (let i = 0; i < n; i++) {
        const v = buffers.volume.at(esF - n + i)
        const pNow = buffers.price.at(esF - n + i)
        const pPrev = buffers.price.at(esF - n + Math.max(0, i - 1))
        const up = pNow >= pPrev
        const bh = (v / (vmax || 1)) * volH
        ctx.fillStyle = up ? hexA(KT('up'), 0.42) : hexA(KT('down'), 0.45)
        ctx.fillRect(px(i) - bw / 2, volTop + volH - bh, bw, bh)
      }
      ctx.strokeStyle = hexA(KT('grid'), 0.9)
      ctx.beginPath(); ctx.moveTo(0, volTop - 2.5); ctx.lineTo(w, volTop - 2.5); ctx.stroke()
      ctx.fillStyle = K.dim
      ctx.font = '6.5px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('ES VOL', 2, volTop + 7)

      // --- crosshair + readout (hover) ---
      const hx = hoverRef.current
      if (hx !== null && hx >= 0 && hx < n) {
        const cx = px(hx)
        ctx.strokeStyle = hexA(KT('cyan'), 0.6)
        ctx.setLineDash([2, 2])
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h - 1); ctx.stroke()
        ctx.setLineDash([])
        for (const s of series) {
          ctx.beginPath(); ctx.arc(cx, yOf(s, hx), 2.6, 0, Math.PI * 2)
          ctx.strokeStyle = s.color; ctx.lineWidth = 1.2; ctx.stroke()
        }
        const secs = Math.abs((hx - (n - 1)) / 10).toFixed(1)
        const line1 = `T−${secs}s`
        const line2 = series.map((s) => `${s.sym} ${fmtPct(s.arr[hx])}`).join('  ')
        const line3 = `VOL ${buffers.volume.at(esF - n + hx).toFixed(0)} · ES ${fmtPx(buffers.price.at(esF - n + hx))}`
        ctx.font = '8px monospace'
        const tw = Math.max(ctx.measureText(line2).width, ctx.measureText(line3).width) + 12
        const bx = Math.min(Math.max(cx + 6, 2), Math.max(2, w - tw - 2))
        ctx.fillStyle = hexA(KT('bgDeep'), 0.92)
        ctx.fillRect(bx, 2, tw, 34)
        ctx.strokeStyle = hexA(KT('cyan'), 0.4)
        ctx.strokeRect(bx + 0.5, 2.5, tw - 1, 33)
        ctx.fillStyle = K.cyan
        ctx.textAlign = 'left'
        ctx.fillText(line1, bx + 5, 11)
        ctx.fillStyle = K.text
        ctx.fillText(line2, bx + 5, 20)
        ctx.fillStyle = K.dim
        ctx.fillText(line3, bx + 5, 29)
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // --- chip rail (2Hz imperative read — no 10Hz re-render storm) ---
  useEffect(() => {
    const id = setInterval(() => {
      const n = Math.min(buffers.price.filled, buffers.nq.filled, buffers.spy.filled)
      if (n < 2) return
      const eF = buffers.price.filled, nF = buffers.nq.filled, sF = buffers.spy.filled
      const eL = buffers.price.at(eF - 1), eP = buffers.price.at(eF - 2)
      const qL = buffers.nq.at(nF - 1), qP = buffers.nq.at(nF - 2)
      const sL = buffers.spy.at(sF - 1), sP = buffers.spy.at(sF - 2)
      const eB = buffers.price.at(eF - n), nB = buffers.nq.at(nF - n), sB = buffers.spy.at(sF - n)
      let hi = -Infinity, lo = Infinity
      for (let i = eF - n; i < eF; i++) { const v = buffers.price.at(i); if (v > hi) hi = v; if (v < lo) lo = v }
      const esMicro = feed.micro.get('ES')
      setChips({
        es: eL, esDir: Math.sign(eL - eP) || 0, esDelta: ((eL - eB) / eB) * 100,
        nq: qL, nqDir: Math.sign(qL - qP) || 0, nqDelta: ((qL - nB) / nB) * 100,
        spy: sL, spyDir: Math.sign(sL - sP) || 0, spyDelta: ((sL - sB) / sB) * 100,
        hi, lo,
        spread: esMicro?.spread.last() ?? NaN,
        cdelta: feed.cdelta.get('ES') ?? NaN,
        regime: useKrupp.getState().metrics.regime,
        crashIn: Math.max(0, (useKrupp.getState().crashUntil - Date.now()) / 1000),
      })
    }, 500)
    return () => clearInterval(id)
  }, [])

  const dirGlyph = (d: number) => (d > 0 ? '▲' : d < 0 ? '▼' : '●')
  const dirColor = (d: number) => (d > 0 ? K.green : d < 0 ? K.red : K.dim)

  return (
    <section className="krupp-panel pulse-strip shrink-0" data-panel aria-label="Market pulse — tri-instrument tape">
      <header className="krupp-panel-head flex items-center justify-between gap-2 px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Led color="cyan" />
          <h2 className="text-[10px] sm:text-[11px] font-semibold tracking-[0.22em] text-secondary-foreground truncate">
            MARKET PULSE
          </h2>
          <span className="text-[9px] tracking-[0.14em] text-muted-foreground truncate hidden sm:inline">
            TRI-INSTRUMENT %Δ TAPE · 90S WINDOW · 10HZ
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" aria-hidden>
          <span className="pulse-legend-dot" style={{ background: K.green }} />
          <span className="text-[8px] text-muted-foreground mr-1">ES</span>
          <span className="pulse-legend-dot" style={{ background: K.cyan }} />
          <span className="text-[8px] text-muted-foreground mr-1">NQ</span>
          <span className="pulse-legend-dot" style={{ background: K.violet }} />
          <span className="text-[8px] text-muted-foreground">SPY</span>
          <Activity size={11} className="ml-1 text-[#00e5ff]" />
        </div>
      </header>

      <div className="px-2.5 pb-2 pt-1 flex flex-col gap-1.5">
        <div className="pulse-canvas-wrap relative rounded-sm overflow-hidden">
          <canvas
            ref={cvRef}
            className="w-full block cursor-crosshair"
            style={{ height: 118 }}
            role="img"
            aria-label="90-second tri-instrument price tape with volume"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const n = Math.min(buffers.price.filled, buffers.nq.filled, buffers.spy.filled)
              if (n < 2) return
              hoverRef.current = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))
            }}
            onPointerLeave={() => { hoverRef.current = null }}
          />
        </div>

        {/* chip rail */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] tabular-nums" data-testid="pulse-chips">
          {([
            ['es', chips.es, chips.esDir, chips.esDelta],
            ['nq', chips.nq, chips.nqDir, chips.nqDelta],
            ['spy', chips.spy, chips.spyDir, chips.spyDelta],
          ] as const).map(([sym, px, d, dl]) => (
            <span key={sym} className="pulse-chip inline-flex items-center gap-1">
              <b className="font-bold" style={{ color: dirColor(d) }}>{sym.toUpperCase()}</b>
              <span style={{ color: dirColor(d) }}>{dirGlyph(d)}</span>
              <span className="text-foreground/90">{fmtPx(px)}</span>
              <span style={{ color: dirColor(d) }}>{fmtPct(dl)}</span>
            </span>
          ))}
          <span className="text-muted-foreground hidden md:inline">
            ES WIN <span className="text-foreground/80">{fmtPx(chips.hi)}</span> / <span className="text-foreground/80">{fmtPx(chips.lo)}</span>
          </span>
          <span className="text-muted-foreground hidden lg:inline">
            SPRD <span className="text-[#00e5ff]">{Number.isFinite(chips.spread) ? `${chips.spread.toFixed(0)}t` : '—'}</span>
          </span>
          <span className="text-muted-foreground hidden lg:inline">
            C-Δ <span style={{ color: chips.cdelta >= 0 ? K.green : K.red }}>{Number.isFinite(chips.cdelta) ? (chips.cdelta >= 0 ? '+' : '') + chips.cdelta.toFixed(0) : '—'}</span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            {chips.crashIn > 0 ? (
              <span className="pulse-crash-chip">◈ CRASH ACTIVE T−{chips.crashIn.toFixed(0)}s</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                REGIME <b className="font-bold" style={{ color: chips.regime === 'CRISIS' ? K.red : chips.regime === 'HIGH' ? K.orange : K.green }}>{chips.regime}</b>
              </span>
            )}
          </span>
        </div>
      </div>
    </section>
  )
}

function rgbaDyn(tok: string, a: number): string {
  const hex = KT(tok as never)
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
