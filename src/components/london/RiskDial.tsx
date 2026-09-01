'use client'

// ============================================================================
// COLUMN 2 // CARD 1 — CENTRAL RISK SCORE DIAL (composite Z-score 0..100)
// Score = min(100, max(0, toxZ·20 + jerkZ·10 + entropy·50))
// ============================================================================

import { Bot } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { K, Panel } from './shared'
import { RiskHistoryStrip } from './RiskHistoryStrip'
import { KT } from '@/lib/theme';

const R = 74
const CX = 100
const CY = 96
const A0 = Math.PI * 0.75 // 135°
const A1 = Math.PI * 2.25 // 405°

function polar(angle: number, r: number): [number, number] {
  // 3-decimal rounding keeps SSR/client SVG attributes byte-identical
  return [
    Math.round((CX + r * Math.cos(angle)) * 1000) / 1000,
    Math.round((CY + r * Math.sin(angle)) * 1000) / 1000,
  ]
}

function arcPath(from: number, to: number, r: number): string {
  const [x0, y0] = polar(from, r)
  const [x1, y1] = polar(to, r)
  const large = to - from > Math.PI ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

function scoreColor(score: number): string {
  return score > 75 ? K.red : score >= 50 ? K.orange : K.green
}

export function RiskDial() {
  const m = useKrupp((s) => s.metrics)
  const agentStatus = useKrupp((s) => s.agentStatus)
  const col = scoreColor(m.score)
  const angle = A0 + (Math.min(100, Math.max(0, m.score)) / 100) * (A1 - A0)
  const needleAngle = Math.round(angle * 1000) / 1000
  const [nx, ny] = polar(needleAngle, R - 10)
  const [tailX, tailY] = polar(needleAngle + Math.PI, 14)
  const active = m.ts > 0

  return (
    <Panel title="CENTRAL RISK SCORE DIAL" sub="COMPOSITE Z-SYNTHESIS" accent={m.regime === 'CRISIS' ? 'red' : m.regime === 'HIGH' ? 'orange' : 'green'}>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 200 150" className="w-full max-w-[240px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.score} aria-label="Composite risk score">
          <defs>
            <filter id="dialGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* zone arcs */}
          <path d={arcPath(A0, A0 + (A1 - A0) * 0.5, R)} stroke={KT('upDeep')} strokeWidth={13} fill="none" />
          <path d={arcPath(A0 + (A1 - A0) * 0.5, A0 + (A1 - A0) * 0.75, R)} stroke={KT('warnDeep')} strokeWidth={13} fill="none" />
          <path d={arcPath(A0 + (A1 - A0) * 0.75, A1, R)} stroke={KT('downDeep')} strokeWidth={13} fill="none" />

          {/* value arc */}
          {m.score > 0.5 && (
            <path d={arcPath(A0, angle, R)} stroke={col} strokeWidth={13} fill="none" filter="url(#dialGlow)" strokeLinecap="butt" opacity={0.95} />
          )}

          {/* ticks */}
          {Array.from({ length: 21 }, (_, i) => {
            const a = A0 + (i / 20) * (A1 - A0)
            const [x0, y0] = polar(a, R - 9)
            const [x1, y1] = polar(a, i % 5 === 0 ? R - 16 : R - 13)
            return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={i % 5 === 0 ? KT('textFaint') : KT('border4')} strokeWidth={i % 5 === 0 ? 1.4 : 0.8} />
          })}
          {[0, 50, 75, 100].map((v) => {
            const a = A0 + (v / 100) * (A1 - A0)
            const [x, y] = polar(a, R + 12)
            return <text key={v} x={x} y={y} fontSize={7.5} fill={KT('textMuted')} textAnchor="middle" dominantBaseline="middle">{v}</text>
          })}

          {/* needle */}
          <line x1={tailX} y1={tailY} x2={nx} y2={ny} stroke={col} strokeWidth={2.2} filter="url(#dialGlow)" />
          <circle cx={CX} cy={CY} r={5} fill={KT('panel2')} stroke={col} strokeWidth={1.6} />

          {/* digital readout */}
          <text x={CX} y={CY - 26} textAnchor="middle" fontSize={34} fontWeight={800} fill={col} style={{ textShadow: `0 0 14px ${col}` }} fontFamily="var(--font-geist-mono), monospace">
            {m.score.toFixed(1)}
          </text>
          <text x={CX} y={CY - 12} textAnchor="middle" fontSize={7} fill={KT('textMuted')} letterSpacing={2}>
            {active ? `COMPOSITE RISK · ${m.regime}` : 'AWAITING TICK STREAM'}
          </text>
        </svg>

        {/* synthesis breakdown */}
        <div className="grid grid-cols-3 gap-1.5 w-full mt-1">
          {[
            { k: 'TOX×20', v: m.toxZ * 20, c: K.cyan },
            { k: 'JERK×10', v: m.jerkZ * 10, c: K.cyan },
            { k: 'ENT×50', v: m.entropy * 50, c: K.green },
          ].map((x) => (
            <div key={x.k} className="border border-gridline bg-kbg-deep rounded-sm px-1.5 py-1 text-center">
              <div className="text-[7.5px] tracking-[0.18em] text-muted-foreground">{x.k}</div>
              <div className="text-[11px] font-bold tabular-nums" style={{ color: x.c }}>{x.v >= 0 ? '+' : ''}{x.v.toFixed(1)}</div>
            </div>
          ))}
        </div>

        {/* risk tape history */}
        <div className="w-full mt-2">
          <div className="flex items-center justify-between text-[8px] tracking-[0.2em] text-muted-foreground mb-1">
            <span>COMPOSITE RISK TAPE · RING 900 @ 10Hz</span>
            <span>CALM ▼50 ▼75 CRISIS</span>
          </div>
          <RiskHistoryStrip height={58} />
        </div>

        {/* agent core */}
        <div className="mt-2 w-full border border-gridline bg-kbg-deep rounded-sm px-2 py-1.5 flex items-center gap-2">
          <Bot size={13} style={{ color: K.cyan }} className="shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="text-[9px] font-bold tracking-[0.12em]" style={{ color: K.cyan }}>
              Agent Core: <span className="anim-blink" style={{ color: K.green }}>●</span> ACTIVE
            </div>
            <div className="text-[8px] text-muted-foreground truncate">(Asynchronous Reason/Act via Llama 3 70B Core) {agentStatus !== 'STANDBY' && agentStatus !== 'ACTIVE (Asynchronous Reason/Act via Llama 3 70B Core)' ? `· ${agentStatus}` : ''}</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
