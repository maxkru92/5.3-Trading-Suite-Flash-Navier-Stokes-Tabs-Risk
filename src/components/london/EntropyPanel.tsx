'use client'

// ============================================================================
// COLUMN 1 // CARD 3 — SHANNON CHAOS MATRIX
// H = −Σ pᵢ·ln(pᵢ) / ln(10)  over 10-bin |log-return| histogram (100 ticks)
// ============================================================================

import { Sigma } from 'lucide-react'
import { buffers } from '@/lib/london/buffers'
import { useKrupp } from '@/lib/london/store'
import { K, Panel, Spark } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

export function EntropyPanel() {
  const m = useKrupp((s) => s.metrics)
  const lockChaos = useKrupp((s) => s.policy.lockChaos)
  const over = m.entropy > lockChaos
  const pct = Math.min(100, Math.max(0, m.entropy * 100))
  const thrPct = Math.min(100, Math.max(0, lockChaos * 100))
  const maxBin = Math.max(...m.hist, 0.001)

  return (
    <Panel
      title="SHANNON CHAOS MATRIX"
      sub="ENTROPY OF |LOG RETURNS| · 10-BIN"
      accent={over ? 'red' : 'green'}
      right={<Sigma size={12} style={{ color: over ? K.red : K.green }} className="shrink-0" aria-hidden />}
      className="min-h-[196px]"
    >
      <div className="flex gap-3 h-full">
        {/* vertical entropy bar */}
        <div className="relative w-10 shrink-0 border border-gridline bg-kbg-deep rounded-sm overflow-hidden" role="meter" aria-valuenow={m.entropy} aria-valuemin={0} aria-valuemax={1} aria-label="Shannon entropy">
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-150"
            style={{
              height: `${pct}%`,
              background: over
                ? `linear-gradient(180deg, ${K.red}, ${K.red}55)`
                : `linear-gradient(180deg, ${K.green}, ${K.green}44)`,
              boxShadow: `0 0 12px ${over ? K.red : K.green}77`,
            }}
          />
          {/* laser-red reversion threshold @ desk policy */}
          <div className="absolute left-0 right-0 flex items-center" style={{ bottom: `${thrPct}%` }} aria-hidden>
            <div className="h-px flex-1" style={{ background: K.red, boxShadow: `0 0 6px ${K.red}` }} />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] tracking-[0.2em] text-muted-foreground">ENTROPY H</span>
            <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: over ? K.red : K.green, textShadow: `0 0 12px ${over ? K.red : K.green}66` }}>
              {m.entropy.toFixed(3)}
            </span>
          </div>
          <div className={`text-[8px] tracking-[0.26em] mt-1 ${over ? 'anim-blink-fast' : ''}`} style={{ color: K.red }}>
            ▮ CHAOS REVERSION THRESHOLD · {lockChaos.toFixed(3)}
          </div>
          {/* entropy history — 90s rolling, policy threshold overlay */}
          <div className="mt-1.5 border border-gridline bg-kbg-deep rounded-sm overflow-hidden">
            <Spark
              buffer={buffers.entropy}
              color={over ? K.red : K.green}
              height={34}
              min={0}
              max={1}
              threshold={lockChaos}
              areaGradient
            />
          </div>
          <div className="flex justify-between text-[7px] tracking-[0.14em] text-muted-foreground tabular-nums">
            <span>H(t) · 90s ROLLING</span>
            <span style={{ color: K.red }}>SEAL @ {lockChaos.toFixed(2)}</span>
          </div>
          <div className="mt-auto pt-2">
            <div className="text-[8px] tracking-[0.2em] text-muted-foreground mb-1">DISTRIBUTION · LAST 100 TICKS</div>
            <div className="flex items-end gap-[2px] h-8" aria-hidden>
              {m.hist.map((p, i) => (
                <div key={i} className="flex-1 min-w-[3px] relative flex flex-col justify-end" style={{ height: '100%' }}>
                  <span className="text-[6.5px] leading-none text-center tabular-nums mb-px" style={{ color: p > 0 ? hexA(KT('text'), 0.55) : hexA(KT('textMuted'), 0.4) }}>
                    {p > 0 ? Math.round(p * 100) : '·'}
                  </span>
                  <div
                    className="w-full transition-all duration-150"
                    style={{ height: `${(p / maxBin) * 84}%`, background: over ? K.red : K.cyan, opacity: 0.28 + (i / BINS_G) * 0.72 }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[7px] text-muted-foreground tabular-nums mt-0.5">
              <span>bin 0 (calm)</span>
              <span>bin 9 (violent)</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

const BINS_G = 9
