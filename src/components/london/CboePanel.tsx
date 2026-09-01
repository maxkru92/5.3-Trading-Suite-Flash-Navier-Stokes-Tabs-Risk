'use client'

// ============================================================================
// COLUMN 3 // CARD 2 — CBOE VOLATILITY & SENTIMENT COLLECTOR
// VIX spot · VIX9D · VIX3M · SKEW · VVIX · piecewise multiplier · real
// contango % · Put/Call volume-to-OI contrarian gauges.
// ============================================================================

import { useEffect, useRef } from 'react'
import { Database, TrendingDown, TrendingUp } from 'lucide-react'
import { cboeHistory } from '@/lib/london/cboeHistory'
import { useKrupp } from '@/lib/london/store'
import { K, Panel, Spark, fmt } from './shared'
import type { VolSnap } from '@/lib/london/types'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function TermCurve({ points }: { points: Array<{ label: string; value: number }> }) {
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
      // grid
      ctx.strokeStyle = hexA(KT('grid'), 0.9)
      for (let g = 1; g < 3; g++) { ctx.beginPath(); ctx.moveTo(0, (h / 3) * g); ctx.lineTo(w, (h / 3) * g); ctx.stroke() }
      if (points.length > 1) {
        const vs = points.map((p) => p.value)
        const lo = Math.min(...vs) * 0.96, hi = Math.max(...vs) * 1.04
        const x = (i: number) => 8 + (i / (points.length - 1)) * (w - 16)
        const y = (v: number) => h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 14)
        // area
        ctx.beginPath(); ctx.moveTo(x(0), h)
        points.forEach((p, i) => ctx.lineTo(x(i), y(p.value)))
        ctx.lineTo(x(points.length - 1), h); ctx.closePath()
        ctx.fillStyle = hexA(KT('cyan'), 0.07); ctx.fill()
        // line + nodes
        ctx.beginPath()
        points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(i), y(p.value)) : ctx.lineTo(x(i), y(p.value))))
        ctx.strokeStyle = K.cyan; ctx.lineWidth = 1.4
        ctx.shadowColor = K.cyan; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0
        points.forEach((p, i) => {
          ctx.beginPath(); ctx.arc(x(i), y(p.value), 2.4, 0, Math.PI * 2)
          ctx.fillStyle = i === 1 ? K.orange : K.cyan; ctx.fill()
          ctx.fillStyle = KT('textMuted'); ctx.font = '7.5px monospace'; ctx.textAlign = 'center'
          ctx.fillText(p.label, x(i), h - 0.5)
          ctx.fillStyle = i === 1 ? K.orange : K.cyan
          ctx.fillText(p.value.toFixed(1), x(i), Math.max(7, y(p.value) - 6))
        })
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [points])
  return <canvas ref={ref} className="w-full block" style={{ height: 74 }} aria-label="VIX term structure curve" role="img" />
}

function PCGauge({ ratio }: { ratio: number }) {
  const lo = 0.4, hi = 2.1
  const pct = Math.min(100, Math.max(0, ((ratio - lo) / (hi - lo)) * 100))
  return (
    <div>
      <div className="relative h-2.5 w-full bg-kpanel2 border border-gridline rounded-sm overflow-hidden" role="meter" aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={ratio} aria-label="Put/Call ratio">
        {/* contrarian zones */}
        <div className="absolute inset-y-0 left-0" style={{ width: `${((0.7 - lo) / (hi - lo)) * 100}%`, background: hexA(KT('up'), 0.12) }} aria-hidden />
        <div className="absolute inset-y-0 right-0" style={{ width: `${((hi - 1.3) / (hi - lo)) * 100}%`, background: hexA(KT('cyan'), 0.12) }} aria-hidden />
        <div className="absolute inset-y-0 w-[2px]" style={{ left: `${pct}%`, background: ratio > 1.3 ? K.cyan : ratio < 0.7 ? K.green : K.orange, boxShadow: '0 0 8px currentColor' }} aria-hidden />
      </div>
      <div className="flex justify-between text-[7.5px] text-muted-foreground mt-0.5 tabular-nums">
        <span>0.70 <span style={{ color: K.green }}>CONTRARIAN SELL</span></span>
        <span><span style={{ color: K.cyan }}>CONTRARIAN BUY</span> 1.30</span>
      </div>
    </div>
  )
}

/**
 * PERSISTED VOL STRIP — cross-boot SQLite-backed history (VolSnap rows).
 * Top lane: VIX line (auto-scale, >25 crisis dash). Bottom lane: contango
 * bipolar bars. Bottom rail: regime ticks per snapshot. Redraws on data
 * change + 4s heartbeat (dpr-safe, no per-frame allocs).
 * Round 7: pointer crosshair — nearest-snap readout (time, VIX, contango,
 * score, regime) drawn in-canvas; snap node highlights on both lanes.
 */
function VolStrip({ snaps }: { snaps: VolSnap[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef(snaps)
  const hoverIdxRef = useRef<number | null>(null)
  useEffect(() => {
    dataRef.current = snaps
    // keep the crosshair honest when new snapshots shift the series
    if (hoverIdxRef.current !== null && hoverIdxRef.current >= snaps.length) hoverIdxRef.current = null
  }, [snaps])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = 0

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 250) return // 4fps is plenty for a 60s-cadence strip
      last = t
      const d = dataRef.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // lanes
      const laneH = h * 0.58
      const contTop = laneH + 4
      const contH = h - contTop - 4

      ctx.strokeStyle = hexA(KT('grid'), 0.9)
      for (let g = 1; g < 3; g++) { ctx.beginPath(); ctx.moveTo(0, (laneH / 3) * g); ctx.lineTo(w, (laneH / 3) * g); ctx.stroke() }

      if (d.length < 2) {
        ctx.fillStyle = KT('textMuted'); ctx.font = '8px monospace'; ctx.textAlign = 'center'
        ctx.fillText('AWAITING PERSISTED SNAPSHOTS (60s CADENCE)…', w / 2, h / 2)
        return
      }

      const n = d.length
      const x = (i: number) => (i / (n - 1)) * (w - 2) + 1

      // --- VIX lane ---
      let lo = Infinity, hi = -Infinity
      for (const s of d) { if (s.vix < lo) lo = s.vix; if (s.vix > hi) hi = s.vix }
      const pad = Math.max((hi - lo) * 0.15, 0.4)
      lo -= pad; hi += pad
      const yV = (v: number) => laneH - ((v - lo) / (hi - lo || 1)) * laneH

      // crisis threshold 25
      if (25 >= lo && 25 <= hi) {
        const ty = yV(25)
        ctx.strokeStyle = hexA(KT('down'), 0.55); ctx.setLineDash([3, 3])
        ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = hexA(KT('down'), 0.8); ctx.font = '6.5px monospace'; ctx.textAlign = 'right'
        ctx.fillText('CRISIS 25', w - 2, Math.max(7, ty - 2))
      }

      // area + line
      ctx.beginPath(); ctx.moveTo(x(0), laneH)
      for (let i = 0; i < n; i++) ctx.lineTo(x(i), yV(d[i].vix))
      ctx.lineTo(x(n - 1), laneH); ctx.closePath()
      ctx.fillStyle = hexA(KT('warn'), 0.10); ctx.fill()
      ctx.beginPath()
      for (let i = 0; i < n; i++) { const px = x(i), py = yV(d[i].vix); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) }
      ctx.strokeStyle = K.orange; ctx.lineWidth = 1.2
      ctx.shadowColor = K.orange; ctx.shadowBlur = 5; ctx.stroke(); ctx.shadowBlur = 0
      ctx.beginPath(); ctx.arc(x(n - 1), yV(d[n - 1].vix), 2, 0, Math.PI * 2)
      ctx.fillStyle = K.orange; ctx.fill()

      // --- contango lane (bipolar bars) ---
      const mid = contTop + contH / 2
      ctx.strokeStyle = hexA(KT('accent'), 0.25)
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke()
      const maxC = Math.max(3, ...d.map((s) => Math.abs(s.contango)))
      const bw = Math.max(1.5, (w / n) * 0.6)
      for (let i = 0; i < n; i++) {
        const c = d[i].contango
        const bh = (Math.abs(c) / maxC) * (contH / 2)
        ctx.fillStyle = c >= 0 ? hexA(KT('up'), 0.5) : hexA(KT('down'), 0.55)
        ctx.fillRect(x(i) - bw / 2, c >= 0 ? mid - bh : mid, bw, Math.max(1, bh))
      }
      ctx.fillStyle = KT('textMuted'); ctx.font = '6.5px monospace'; ctx.textAlign = 'left'
      ctx.fillText('CONTANGO', 2, contTop + 7)

      // --- regime rail (bottom edge ticks) ---
      for (let i = 0; i < n; i++) {
        const r = d[i].regime
        ctx.fillStyle = r === 'CRISIS' ? K.red : r === 'HIGH' ? K.orange : hexA(KT('up'), 0.55)
        ctx.fillRect(x(i) - 1, h - 2.5, 2, 2.5)
      }

      // --- crosshair + nearest-snap readout (round 7) ---
      const hi2 = hoverIdxRef.current
      if (hi2 !== null && hi2 >= 0 && hi2 < n) {
        const s = d[hi2]
        const cx = x(hi2)
        ctx.strokeStyle = hexA(KT('cyan'), 0.65)
        ctx.setLineDash([2, 2])
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h - 3); ctx.stroke()
        ctx.setLineDash([])
        // node highlights on both lanes
        ctx.beginPath(); ctx.arc(cx, yV(s.vix), 3, 0, Math.PI * 2)
        ctx.fillStyle = K.cyan; ctx.shadowColor = K.cyan; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0
        const cbh = (Math.abs(s.contango) / maxC) * (contH / 2)
        ctx.fillStyle = K.cyan
        ctx.fillRect(cx - 1.5, s.contango >= 0 ? mid - cbh : mid, 3, Math.max(1.5, cbh))

        // readout plate (top-left anchored, flips right when the pin is near the edge)
        const lines = [
          `${new Date(s.ts).toLocaleTimeString('en-GB', { hour12: false })} · ${s.source === 'RELAY-KERNEL' || s.source === 'RELAY-CBOE' ? 'RELAY' : 'DESK'}`,
          `VIX ${s.vix.toFixed(2)} · CTG ${s.contango >= 0 ? '+' : ''}${s.contango.toFixed(1)}%`,
          `SCORE ${s.score.toFixed(0)} · ${s.regime}`,
        ]
        ctx.font = '7.5px monospace'
        const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10
        const boxH = lines.length * 9.5 + 5
        const bx = cx + 6 + boxW > w ? Math.max(1, cx - boxW - 6) : cx + 6
        const by = 2
        ctx.fillStyle = hexA(KT('bgDeep'), 0.92)
        ctx.strokeStyle = hexA(KT('cyan'), 0.5)
        ctx.beginPath(); ctx.rect(bx, by, boxW, boxH); ctx.fill(); ctx.stroke()
        lines.forEach((l, li) => {
          ctx.fillStyle = li === 1 ? K.orange : li === 2 ? (s.regime === 'CRISIS' ? K.red : s.regime === 'HIGH' ? K.orange : K.green) : KT('zinc')
          ctx.textAlign = 'left'
          ctx.fillText(l, bx + 5, by + 9.5 * (li + 1) - 2)
        })
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // pointer → nearest snapshot index (hover crosshair; no state → no re-renders)
  const toIdx = (clientX: number) => {
    const cv = ref.current
    if (!cv) return null
    const r = cv.getBoundingClientRect()
    const px = clientX - r.left
    const d = dataRef.current
    if (d.length < 2 || r.width === 0) return null
    return Math.max(0, Math.min(d.length - 1, Math.round((px / r.width) * (d.length - 1))))
  }

  return (
    <canvas
      ref={ref}
      className="w-full block cursor-crosshair"
      style={{ height: 58 }}
      aria-label="Persisted cross-boot volatility strip — hover for snapshot readout"
      role="img"
      onPointerMove={(e) => { hoverIdxRef.current = toIdx(e.clientX) }}
      onPointerLeave={() => { hoverIdxRef.current = null }}
    />
  )
}

function VolStripFooter({ snaps, syncOn }: { snaps: VolSnap[]; syncOn: boolean }) {
  const first = snaps[0], last = snaps[snaps.length - 1]
  const spanMin = first && last ? Math.max(1, Math.round((last.ts - first.ts) / 60000)) : 0
  const dVix = first && last ? last.vix - first.vix : 0
  return (
    <div className="flex items-center gap-2 text-[7.5px] tracking-[0.14em] text-muted-foreground tabular-nums">
      <Database size={9} style={{ color: syncOn ? K.green : K.dim }} className="shrink-0" aria-hidden />
      <span>PERSISTED VOL STRIP · SQLITE</span>
      <span style={{ color: syncOn ? K.green : K.red }}>{syncOn ? '● SYNC' : '○ OFFLINE'}</span>
      {snaps.length > 0 && (
        <>
          <span>{snaps.length} SNAPS · {spanMin}min</span>
          <span style={{ color: dVix > 0.2 ? K.red : dVix < -0.2 ? K.green : K.dim }}>
            ΔVIX {dVix >= 0 ? '+' : ''}{dVix.toFixed(2)}
          </span>
          <span className="ml-auto">SINCE {first ? fmt.time(first.ts) : '—'}</span>
        </>
      )}
    </div>
  )
}

export function CboePanel() {
  const c = useKrupp((s) => s.cboe)
  const volHistory = useKrupp((s) => s.volHistory)
  const volSyncOn = useKrupp((s) => s.volSyncOn)
  const contango = c?.contangoPct ?? 0
  const vix = c?.vix ?? 0

  const chips: Array<{ label: string; v: string; c: string; note?: string }> = c
    ? [
        { label: 'VIX', v: c.vix.toFixed(2), c: vix > 25 ? K.red : vix > 18 ? K.orange : K.green },
        { label: 'VIX9D', v: c.vix9d.toFixed(2), c: c.vix9d > c.vix ? K.red : K.cyan, note: c.vix9d > c.vix ? '1×2 BACK' : undefined },
        { label: 'VIX3M', v: c.vix3m.toFixed(2), c: K.cyan },
        { label: 'SKEW', v: c.skew.toFixed(1), c: K.orange },
        { label: 'VVIX', v: c.vvix.toFixed(1), c: K.orange },
      ]
    : []

  return (
    <Panel
      title="CBOE VOLATILITY & SENTIMENT"
      sub={c ? `${c.source} · TERM ${c.termLabel}` : 'COLLECTING…'}
      accent="orange"
      right={c ? (contango >= 0 ? <TrendingUp size={12} style={{ color: K.green }} aria-hidden /> : <TrendingDown size={12} style={{ color: K.red }} aria-hidden />) : undefined}
      bodyClass="p-2 flex flex-col gap-2"
    >
      <div className="grid grid-cols-5 gap-1">
        {chips.length === 0 && Array.from({ length: 5 }, (_, i) => <div key={i} className="h-9 border border-gridline bg-kbg-deep rounded-sm animate-pulse" />)}
        {chips.map((ch) => (
          <div key={ch.label} className="border border-gridline bg-kbg-deep rounded-sm px-1 py-1 text-center min-w-0">
            <div className="text-[7.5px] tracking-[0.16em] text-muted-foreground truncate">{ch.label}</div>
            <div className="text-[12px] sm:text-sm font-bold tabular-nums leading-tight" style={{ color: ch.c, textShadow: `0 0 8px ${ch.c}44` }}>{ch.v}</div>
            {ch.note && <div className="text-[6.5px] tracking-[0.1em] text-red-300/80">{ch.note}</div>}
          </div>
        ))}
      </div>

      {/* VIX rolling history (6 min @ 3s) */}
      <div className="border border-gridline bg-kbg-deep rounded-sm overflow-hidden relative">
        <Spark buffer={cboeHistory.vix} color={K.orange} height={34} min={0} />
        <span className="absolute top-0.5 right-1.5 text-[7px] tracking-[0.2em] text-muted-foreground/80">VIX · 6M WINDOW</span>
      </div>

      {/* cross-boot persisted strip (SQLite VolSnapshot series) */}
      <div data-panel="cboe-chips" className="vol-strip-box border border-gridline bg-kbg-deep rounded-sm overflow-hidden px-1.5 pt-1 pb-0.5">
        <span className="strip-sweep" aria-hidden />
        <VolStrip snaps={volHistory} />
        <VolStripFooter snaps={volHistory} syncOn={volSyncOn} />
      </div>

      <div className="border border-gridline bg-kbg-deep rounded-sm overflow-hidden">
        <TermCurve points={c?.termCurve ?? []} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[9px] tabular-nums">
        <div className="border border-gridline bg-kbg-deep rounded-sm px-2 py-1">
          <div className="text-[8px] tracking-[0.18em] text-muted-foreground">REAL CONTANGO ((VIX3M−VIX)/VIX)</div>
          <div className="text-base font-bold" style={{ color: contango >= 0 ? K.green : K.red }}>
            {contango >= 0 ? '+' : ''}{fmt.n2(contango)}%
          </div>
        </div>
        <div className="border border-gridline bg-kbg-deep rounded-sm px-2 py-1">
          <div className="text-[8px] tracking-[0.18em] text-muted-foreground">PIECEWISE MULTIPLIER ×</div>
          <div className="text-base font-bold" style={{ color: K.orange }}>
            ×{c ? c.multiplier.toFixed(3) : '—'}
          </div>
          <div className="text-[7px] tracking-[0.14em] text-muted-foreground truncate">{c?.termLabel ?? ''}</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[8px] tracking-[0.18em] text-muted-foreground">PUT/CALL VOLUME-TO-OI SENTIMENT</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: (c?.pcRatio ?? 1) > 1.3 ? K.cyan : (c?.pcRatio ?? 1) < 0.7 ? K.green : K.orange }}>
            P/C {c ? c.pcRatio.toFixed(2) : '—'} · {c?.pcClass ?? ''}
          </span>
        </div>
        <PCGauge ratio={c?.pcRatio ?? 1} />
        <div className="flex gap-3 mt-1.5 text-[8px] text-muted-foreground tabular-nums">
          <span>CEQ VOL <span style={{ color: K.green }}>{fmt.compact(c?.callVol)}</span></span>
          <span>PEQ VOL <span style={{ color: K.red }}>{fmt.compact(c?.putVol)}</span></span>
          <span>OI <span style={{ color: K.cyan }}>{fmt.compact((c?.callOI ?? 0) + (c?.putOI ?? 0))}</span></span>
          <span className="ml-auto" style={{ color: c?.live ? K.green : KT('textMuted') }}>{c?.live ? '● LIVE CDN SEAM' : '○ PARITY SIM'}</span>
        </div>
      </div>
    </Panel>
  )
}
