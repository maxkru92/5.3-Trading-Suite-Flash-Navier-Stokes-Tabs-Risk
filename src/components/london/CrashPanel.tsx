'use client'

// ============================================================================
// PART 4 // SIMULATE MARKET LIQUIDITY CRASH — interactive control panel
// Bypasses the API flow: injects massive negative price shocks, explosive
// volume bursts and rapid tick cascades; activates all interceptors.
// ============================================================================

import { useEffect, useState } from 'react'
import { Flame, RotateCcw, Skull } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useKrupp } from '@/lib/london/store'
import { useKruppApi } from '@/lib/london/context'
import { K, Led } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

export function CrashPanel() {
  const api = useKruppApi()
  const crashUntil = useKrupp((s) => s.crashUntil)
  const engine = useKrupp((s) => s.engine)
  const [severity, setSeverity] = useState([6])
  const [duration, setDuration] = useState('8000')
  const [now, setNow] = useState(Date.now())

  const active = crashUntil > now || engine?.crash.active
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const remainMs = Math.max(0, crashUntil - now)
  const remainS = (remainMs / 1000).toFixed(1)

  return (
    <section
      className={`krupp-panel p-3 ${active ? 'anim-flash-red' : ''}`}
      aria-label="Market liquidity crash simulator"
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <Flame size={16} style={{ color: K.red }} className={active ? 'anim-blink-fast' : ''} aria-hidden />
          <div className="min-w-0">
            <h2 className="text-[11px] font-black tracking-[0.18em]" style={{ color: K.red }}>
              SIMULATE MARKET LIQUIDITY CRASH
            </h2>
            <p className="text-[8px] tracking-[0.14em] text-muted-foreground">
              BYPASSES API FLOW · NEGATIVE SHOCK CASCADE · VOLUME DETONATION · INTERCEPTOR ARMING TEST
            </p>
          </div>
        </div>

        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <span className="text-[9px] tracking-[0.16em] text-muted-foreground shrink-0">SEVERITY</span>
            <Slider
              value={severity}
              onValueChange={setSeverity}
              min={1}
              max={10}
              step={1}
              className="flex-1 [&_[data-slot=slider-range]]:bg-red-600 [&_[data-slot=slider-thumb]]:border-red-500"
              aria-label="Crash severity 1 to 10"
            />
            <span className="text-sm font-bold tabular-nums w-8 text-right" style={{ color: K.red }}>{severity[0]}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] tracking-[0.16em] text-muted-foreground">CASCADE</span>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="h-7 w-[104px] text-[10px] rounded-sm bg-input/60" aria-label="Cascade duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-gridline">
                <SelectItem value="5000">5.0 s</SelectItem>
                <SelectItem value="8000">8.0 s</SelectItem>
                <SelectItem value="12000">12.0 s</SelectItem>
                <SelectItem value="20000">20.0 s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              type="button"
              disabled={!!active}
              onClick={() => api.injectCrash(severity[0], Number(duration))}
              className="h-9 px-4 font-black tracking-[0.14em] text-[10px] rounded-sm border border-red-500/70 text-red-100 anim-pulse-orange disabled:opacity-60"
              style={{ background: `linear-gradient(180deg, ${hexA(KT('down'), 0.5)}, ${hexA(KT('down'), 0.22)})` }}
            >
              <Skull size={13} className="mr-1.5" aria-hidden />
              {active ? `CRISIS ACTIVE — ${remainS}s` : 'INJECT LIQUIDITY CRASH'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => api.resetSim()}
              className="h-9 px-3 text-[9px] tracking-[0.14em] rounded-sm border-gridline text-muted-foreground hover:text-green-400"
            >
              <RotateCcw size={12} className="mr-1" aria-hidden />
              PURGE &amp; RESET FEED
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[8px] tracking-[0.18em]">
          <Led color={active ? 'red' : 'dim'} className={active ? 'anim-blink' : ''} />
          <span className="text-muted-foreground">{active ? 'CRISIS PIPELINE LIVE' : 'PIPELINE IDLE'}</span>
        </div>
      </div>
    </section>
  )
}
