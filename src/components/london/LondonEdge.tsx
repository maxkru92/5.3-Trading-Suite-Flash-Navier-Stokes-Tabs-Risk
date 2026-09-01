'use client';

// ============================================================================
// KRUPP CAPITAL // LONDON STRATEGIC EDGE — L3 RISK DESK (embedded landing tab)
// Ultra-high-density institutional SPA: L3 order-book streaming, real-time
// Hawkes/ABE/entropy risk kernel, CBOE term-structure, pre-trade interceptors.
// Ported from the standalone GLM5.3Flash frontend; every colour resolves via
// the dual-colourline theme kernel (src/lib/theme.ts).
// ============================================================================

import { useMemo } from 'react'
import { KruppApiContext } from '@/lib/london/context'
import { useKruppFeed } from '@/lib/london/useKruppFeed'
import { SystemHeader } from '@/components/london/SystemHeader'
import { RegimeBanner } from '@/components/london/RegimeBanner'
import { MarketPulse } from '@/components/london/MarketPulse'
import { CommandPalette } from '@/components/london/CommandPalette'
import { SessionAudit } from '@/components/london/SessionAudit'
import { HawkesPanel } from '@/components/london/HawkesPanel'
import { FluidPanel } from '@/components/london/FluidPanel'
import { EntropyPanel } from '@/components/london/EntropyPanel'
import { CorrelationPanel } from '@/components/london/CorrelationPanel'
import { RiskPolicy } from '@/components/london/RiskPolicy'
import { PolicyProfiles } from '@/components/london/PolicyProfiles'
import { RiskDial } from '@/components/london/RiskDial'
import { OrderBookLadder } from '@/components/london/OrderBookLadder'
import { Interceptors } from '@/components/london/Interceptors'
import { AlertsPanel } from '@/components/london/AlertsPanel'
import { IVSurface } from '@/components/london/IVSurface'
import { CboePanel } from '@/components/london/CboePanel'
import { TerminalPanel } from '@/components/london/TerminalPanel'
import { CrashPanel } from '@/components/london/CrashPanel'
import { ExecutionLedger } from '@/components/london/ExecutionLedger'
import { StatusBar } from '@/components/london/StatusBar'
import { BootOverlay } from '@/components/london/BootOverlay'
import { PrintReport } from '@/components/london/PrintReport'
import { HotkeyHelp } from '@/components/london/HotkeyHelp'

function ColumnLabel({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-2 px-0.5" aria-hidden>
      <span className={`sys-rail sys-rail-${n.slice(-1)} text-[8px] font-bold`}>{n}</span>
      <span className="text-[8px] tracking-[0.24em] text-muted-foreground">{title}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-gridline to-transparent" />
    </div>
  )
}

export default function LondonEdge() {
  const api = useKruppFeed()
  const apiValue = useMemo(() => api, [api])

  return (
    <KruppApiContext.Provider value={apiValue}>
      {/* print-doc renders as an A4 report via @media print (globals.css);
          the screen root below is display:none in the same media block */}
      <PrintReport />
      <HotkeyHelp />
      <div className="krupp-root print:hidden min-h-screen flex flex-col text-foreground">
        <div className="krupp-scanline fixed inset-0 z-50 pointer-events-none" aria-hidden />
        <BootOverlay />
        <CommandPalette />
        <PolicyProfiles />

        {/* SYSTEM CONTROL & AUTH HEADER */}
        <SystemHeader />
        <RegimeBanner />

        {/* MARKET PULSE — full-width tri-instrument tape strip */}
        <main className="flex-1 mx-auto w-full max-w-[1800px] px-2 sm:px-4 py-3 flex flex-col gap-3">
          <MarketPulse />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-1 min-h-0">
            {/* COLUMN 1 — QUANTITATIVE STATE ENGINE (SYSTEM 1 · FAST MATH) */}
            <div data-sys="1" className="flex flex-col gap-3 min-w-0">
              <ColumnLabel n="SYS.1" title="QUANTITATIVE STATE ENGINE — FAST MATH" />
              <div className="flex-1 min-h-0 flex [&>section]:flex-1 [&>section]:w-full"><HawkesPanel /></div>
              <div className="flex-1 min-h-0 flex [&>section]:flex-1 [&>section]:w-full"><FluidPanel /></div>
              <div className="flex-1 min-h-0 flex [&>section]:flex-1 [&>section]:w-full"><EntropyPanel /></div>
              <div className="flex-1 min-h-0 flex [&>section]:flex-1 [&>section]:w-full"><CorrelationPanel /></div>
            </div>

            {/* COLUMN 2 — RISK OVERLAY & TRACKABLE L3 ORDER BOOK (SYSTEM 2) */}
            <div data-sys="2" className="flex flex-col gap-3 min-w-0">
              <ColumnLabel n="SYS.2" title="RISK OVERLAY & TRACKABLE L3 ORDER BOOK" />
              <div className="flex-1 min-h-0 flex [&>section]:flex-1 [&>section]:w-full"><RiskDial /></div>
              <div className="flex-1 min-h-0 flex [&>section]:flex-1 [&>section]:w-full"><OrderBookLadder /></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch min-h-0 [&>section]:h-full">
                <Interceptors />
                <AlertsPanel />
              </div>
              <div className="flex-1 min-h-0 flex [&>section]:flex-1 [&>section]:w-full"><RiskPolicy /></div>
            </div>

            {/* COLUMN 3 — VOLATILITY PLOTS & ROUTING LOGS (SYSTEM 3) */}
            <div data-sys="3" className="flex flex-col gap-3 min-w-0">
              <ColumnLabel n="SYS.3" title="VOLATILITY SURFACE & ROUTING LOGS" />
              <IVSurface />
              <CboePanel />
              {/* FIXED-HEIGHT terminal viewport — ring scrolls internally */}
              <div className="h-[440px] xl:h-[500px] min-h-[220px] flex flex-col [&>section]:flex-1 [&>section]:min-h-0 [&>section]:w-full">
                <TerminalPanel />
              </div>
            </div>
          </div>

          {/* PART 4 — INTERACTION & SIMULATION CONTROLS */}
          <CrashPanel />

          {/* EXECUTION LEDGER + SESSION AUDIT — desk accountability row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch [&>section]:h-full">
            <ExecutionLedger />
            <SessionAudit />
          </div>
        </main>

        <StatusBar />
      </div>
    </KruppApiContext.Provider>
  )
}
