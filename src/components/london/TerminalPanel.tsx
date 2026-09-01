'use client'

// ============================================================================
// COLUMN 3 // CARD 3 — EXECUTION LOGGING TERMINAL
// Command-line style, auto-scrolling real-time operational lines.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { K, Panel } from './shared'
import type { LogLine } from '@/lib/london/types'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const SRC_COLORS: Record<string, string> = {
  FIREBASE: K.cyan,
  INGESTION: K.green,
  VOLATILITY: K.orange,
  MATH: K.cyan,
  ROUTING: K.green,
  RISK: K.red,
  CBOE: K.orange,
  AGENT: KT('accentSoft'),
  SIM: K.red,
  SYSTEM: KT('zinc'),
  'L2-REST': KT('warnDeep'),
}

function lineColor(l: LogLine): string {
  if (l.level === 'crit') return K.red
  if (l.level === 'warn') return K.orange
  return SRC_COLORS[l.source] ?? KT('zinc')
}

export function TerminalPanel() {
  const logs = useKrupp((s) => s.logs)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 28
    setAutoScroll(atBottom)
  }

  return (
    <Panel
      title="EXECUTION LOGGING TERMINAL"
      sub={`${logs.length} LINES · RING 240`}
      accent="green"
      right={<TerminalSquare size={12} style={{ color: K.green }} className="shrink-0" aria-hidden />}
      bodyClass="p-0 flex flex-col min-h-0"
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto krupp-scroll px-2 py-1.5 font-mono text-[9.5px] leading-[1.5] bg-kbg-deep"
        aria-label="Execution log terminal"
        aria-live="off"
      >
        {logs.length === 0 && <div className="text-muted-foreground">{'// initializing desk…'}</div>}
        {logs.map((l) => {
          const c = lineColor(l)
          return (
            <div
              key={l.id}
              className="term-line whitespace-pre-wrap break-words pl-1.5 border-l-2 my-px"
              style={{ borderLeftColor: `${c}55`, background: l.level === 'crit' ? hexA(KT('down'), 0.05) : l.level === 'warn' ? hexA(KT('warn'), 0.04) : undefined }}
            >
              <span className="text-[#3d4a42]">{new Date(l.ts).toLocaleTimeString('en-GB', { hour12: false })} </span>
              <span className="font-bold" style={{ color: c }}>[{l.source}]</span>{' '}
              <span style={{ color: l.level === 'crit' ? KT('downSoft') : l.level === 'warn' ? KT('warnSoft') : KT('textDim') }}>{l.message}</span>
            </div>
          )
        })}
        <div className="text-[#3d4a42]">krupp@riskdesk:~$ <span className="boot-cursor" style={{ color: K.green }}>█</span></div>
      </div>
      <div className="flex items-center gap-2 px-2 py-1 border-t border-gridline text-[8px] tracking-[0.16em]">
        <span className={`led ${autoScroll ? 'led-green' : 'led-orange'}`} aria-hidden />
        <span className="text-muted-foreground">{autoScroll ? 'AUTO-SCROLL ENGAGED' : 'SCROLL PAUSED — PINNED'}</span>
        <button
          className="ml-auto text-muted-foreground hover:text-green-400 tracking-[0.16em]"
          onClick={() => setAutoScroll(true)}
          type="button"
        >
          RESUME TAIL ▸
        </button>
      </div>
    </Panel>
  )
}
