'use client'

// ============================================================================
// STATUS BAR — sticky footer (min-h-screen flex-col + mt-auto pattern)
// ============================================================================

import { useEffect, useState } from 'react'
import { Cpu } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { K, Led, fmt } from './shared'
import { KT } from '@/lib/theme';

export function StatusBar() {
  const engine = useKrupp((s) => s.engine)
  const latency = useKrupp((s) => s.latencyMs)
  const auth = useKrupp((s) => s.auth)
  const metrics = useKrupp((s) => s.metrics)
  const realized = useKrupp((s) => s.realized)
  const fees = useKrupp((s) => s.fees)
  const unrealized = useKrupp((s) => s.unrealized)
  const optRealized = useKrupp((s) => s.optRealized)
  const optFees = useKrupp((s) => s.optFees)
  const optUnrealized = useKrupp((s) => s.optUnrealized)
  const persistOn = useKrupp((s) => s.persistOn)
  const net = realized - fees + unrealized
  const optNet = optRealized - optFees + optUnrealized
  const [uptime, setUptime] = useState('00:00:00')
  const [now, setNow] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
      const ms = engine?.uptimeMs ?? 0
      const s = Math.floor(ms / 1000)
      setUptime(`${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [engine])

  const feedLabel = auth?.mode === 'LIVE' ? 'L3 LIVE ORIGIN' : auth?.mode === 'SIM_BRIDGE' ? 'L3 PARITY BRIDGE' : 'L1/L2 REST FALLBACK'

  return (
    <footer className="mt-auto border-t border-gridline bg-kbg-deep/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto max-w-[1800px] px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[8.5px] tracking-[0.14em] text-muted-foreground">
        <span className="flex items-center gap-1.5 font-bold" style={{ color: K.green }}>
          <Cpu size={11} aria-hidden /> KRUPP CAPITAL // RISK DESK v2.4.1 — NAVIER-STOKES KERNEL RESIDENT
        </span>
        <span className="tabular-nums">TICKS <span style={{ color: K.cyan }}>{fmt.int(engine?.tickCount)}</span></span>
        <span className="tabular-nums">UPTIME <span style={{ color: K.cyan }}>{uptime}</span></span>
        <span className="tabular-nums">GW RTT <span style={{ color: latency < 60 ? K.green : latency < 150 ? K.orange : K.red }}>{latency || '—'}ms</span></span>
        <span className="tabular-nums">FEED <span style={{ color: auth?.authenticated ? K.cyan : K.orange }}>{feedLabel}</span></span>
        <span className="tabular-nums hidden md:inline">BUFFERS <span style={{ color: K.cyan }}>8×F32[900]@10Hz</span></span>
        <span className="tabular-nums hidden lg:inline">SCORE <span style={{ color: metrics.score > 75 ? K.red : metrics.score >= 50 ? K.orange : K.green }}>{metrics.score.toFixed(1)}</span></span>
        <span className="tabular-nums hidden md:inline">DESK P&L <span style={{ color: net >= 0 ? K.green : K.red }}>{net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(0)}</span></span>
        <span className="tabular-nums hidden lg:inline">OPT P&L <span style={{ color: optNet >= 0 ? K.green : K.red }}>{optNet >= 0 ? '+' : '−'}${Math.abs(optNet).toFixed(0)}</span></span>
        <span className="tabular-nums hidden xl:inline" title={persistOn ? 'Ledger persistence healthy (SQLite)' : 'Ledger persistence degraded'}>LEDGER <span style={{ color: persistOn ? K.green : K.orange }}>{persistOn ? 'SYNC' : 'DEGRADED'}</span></span>
        <span className="ml-auto flex items-center gap-1.5">
          <Led color={metrics.regime === 'CRISIS' ? 'red' : metrics.regime === 'HIGH' ? 'orange' : 'green'} className={metrics.regime === 'CRISIS' ? 'anim-blink' : ''} />
          <span style={{ color: metrics.regime === 'CRISIS' ? K.red : metrics.regime === 'HIGH' ? K.orange : K.green }}>{metrics.regime}</span>
          <span className="text-[#3d4a42]">· {now > 0 ? new Date(now).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—— —— ——'}</span>
        </span>
      </div>
    </footer>
  )
}
