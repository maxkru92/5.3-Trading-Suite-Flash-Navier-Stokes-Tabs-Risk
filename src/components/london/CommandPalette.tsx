'use client'

// ============================================================================
// KRUPP CAPITAL // DESK COMMAND PALETTE (⌘K)
// Authentication · Simulation · Instruments · View
// ============================================================================

import { useEffect } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { AlertOctagon, Bell, BellRing, Crosshair, Eraser, FileText, FolderDown, Keyboard, KeyRound, Play, Printer, Radio, RotateCcw, ShieldHalf, Skull, Sparkles, Square, Volume2, VolumeX } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { useKruppApi } from '@/lib/london/context'
import { ledger } from '@/lib/london/execution'
import { downloadRiskReport } from '@/lib/london/report'
import { printRiskReport } from '@/components/london/PrintReport'
import { POLICY_DEFAULTS } from '@/lib/london/policy'
import { armAll, resetTrips } from '@/lib/london/alerts'
import { K } from './shared'
import { KT } from '@/lib/theme';

export function CommandPalette() {
  const open = useKrupp((s) => s.paletteOpen)
  const setOpen = useKrupp((s) => s.setPaletteOpen)
  const api = useKruppApi()
  const soundOn = useKrupp((s) => s.soundOn)

  // ⌘K / Ctrl+K, plus desk hotkeys
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!useKrupp.getState().paletteOpen)
        return
      }
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '1') useKrupp.getState().selectSym('ES')
      if (e.key === '2') useKrupp.getState().selectSym('NQ')
      if (e.key === '3') useKrupp.getState().selectSym('SPY')
      if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) api.injectCrash(6, 8000)
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) api.resetSim()
      // NOTE: the '?' hotkey is owned by HotkeyHelp (single listener — a second
      // toggle here would open and immediately close the overlay)
      if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey) {
        const next = !useKrupp.getState().engaged
        useKrupp.getState().setEngaged(next)
        useKrupp.getState().pushLog({
          id: `leg-${Date.now()}`, ts: Date.now(), source: 'ROUTING', level: 'info',
          message: next
            ? '[ROUTING] Execution desk ENGAGED — agent order flow armed, interceptor chain live.'
            : '[ROUTING] Execution desk HALTED — no new tickets will be routed.',
        })
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [setOpen, api])

  const mint = async () => {
    try {
      const res = await fetch('/api/auth/demo-token', { method: 'POST' })
      const j = await res.json()
      if (j?.token) api.setToken(j.token)
    } catch { /* terminal surfaces errors */ }
  }

  const run = (fn: () => void) => () => { fn(); setOpen(false) }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="border-gridline">
      <CommandInput placeholder="Type a desk command or search…" className="font-mono" />
      <CommandList className="krupp-scroll bg-kheader">
        <CommandEmpty className="text-[10px] tracking-[0.2em] text-muted-foreground py-6 text-center font-mono">NO MATCHING DESK COMMAND</CommandEmpty>
        <CommandGroup heading="AUTHENTICATION">
          <CommandItem onSelect={run(mint)} className="font-mono text-[11px]">
            <KeyRound size={13} style={{ color: K.cyan }} /> Mint L3 demo credential <span className="ml-auto text-muted-foreground text-[9px]">HMAC · 24h</span>
          </CommandItem>
          <CommandItem onSelect={run(() => api.clearToken())} className="font-mono text-[11px]">
            <Eraser size={13} style={{ color: K.orange }} /> Clear token → L1/L2 fallback
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="SIMULATION">
          <CommandItem onSelect={run(() => api.injectCrash(6, 8000))} className="font-mono text-[11px]">
            <Skull size={13} style={{ color: K.red }} /> Inject liquidity crash <span className="text-muted-foreground text-[9px] ml-auto">sev 6 · 8s</span>
          </CommandItem>
          <CommandItem onSelect={run(() => api.injectCrash(9, 12000))} className="font-mono text-[11px] text-red-300">
            <AlertOctagon size={13} style={{ color: K.red }} /> Inject EXTREME crash <span className="text-muted-foreground text-[9px] ml-auto">sev 9 · 12s</span>
          </CommandItem>
          <CommandItem onSelect={run(() => api.resetSim())} className="font-mono text-[11px]">
            <RotateCcw size={13} style={{ color: K.green }} /> Purge &amp; reset feed
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="INSTRUMENTS">
          {['ES', 'NQ', 'SPY'].map((s) => (
            <CommandItem key={s} onSelect={run(() => useKrupp.getState().selectSym(s))} className="font-mono text-[11px]">
              <Radio size={13} style={{ color: K.green }} /> Track {s} ladder
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="EXECUTION DESK">
          <CommandItem
            onSelect={run(() => {
              const next = !useKrupp.getState().engaged
              useKrupp.getState().setEngaged(next)
              useKrupp.getState().pushLog({
                id: `leg-${Date.now()}`, ts: Date.now(), source: 'ROUTING', level: 'info',
                message: next
                  ? '[ROUTING] Execution desk ENGAGED — agent order flow armed, interceptor chain live.'
                  : '[ROUTING] Execution desk HALTED — no new tickets will be routed.',
              })
            })}
            className="font-mono text-[11px]"
          >
            {useKrupp.getState().engaged ? <Square size={13} style={{ color: K.orange }} /> : <Play size={13} style={{ color: K.cyan }} />}
            {useKrupp.getState().engaged ? 'Halt execution desk' : 'Engage execution desk'}
            <span className="ml-auto text-muted-foreground text-[9px]">hotkey T</span>
          </CommandItem>
          <CommandItem onSelect={run(() => ledger.flatten('MANUAL'))} className="font-mono text-[11px]">
            <Crosshair size={13} style={{ color: K.red }} /> Flatten open position <span className="ml-auto text-muted-foreground text-[9px]">market-out</span>
          </CommandItem>
          <CommandItem onSelect={run(() => api.flattenOptions())} className="font-mono text-[11px]">
            <Crosshair size={13} style={{ color: K.orange }} /> Flatten option book <span className="ml-auto text-muted-foreground text-[9px]">all context tickets</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="RISK POLICY">
          <CommandItem
            onSelect={run(() => { useKrupp.getState().refreshProfiles(); useKrupp.getState().setProfilesOpen(true) })}
            className="font-mono text-[11px]"
          >
            <FolderDown size={13} style={{ color: K.cyan }} /> Manage policy profiles
            <span className="ml-auto text-muted-foreground text-[9px]">save · load · delete</span>
          </CommandItem>
          <CommandItem
            onSelect={run(() => useKrupp.getState().setPolicy(POLICY_DEFAULTS))}
            className="font-mono text-[11px]"
          >
            <ShieldHalf size={13} style={{ color: K.green }} /> Reset risk policy to spec
            <span className="ml-auto text-muted-foreground text-[9px]">0.85 · 55% · 75</span>
          </CommandItem>
          <CommandItem
            onSelect={run(() => useKrupp.getState().setPolicy({ lockChaos: 0.8, scaleVisc: 0.6, killScore: 70 }))}
            className="font-mono text-[11px]"
          >
            <ShieldHalf size={13} style={{ color: K.orange }} /> Hawk mode — tighten all thresholds
            <span className="ml-auto text-muted-foreground text-[9px]">0.80 · 60% · 70</span>
          </CommandItem>
          <CommandItem
            onSelect={run(() => useKrupp.getState().setPolicy({ lockChaos: 0.92, scaleVisc: 0.4, killScore: 85 }))}
            className="font-mono text-[11px]"
          >
            <ShieldHalf size={13} style={{ color: K.cyan }} /> Dove mode — widen all thresholds
            <span className="ml-auto text-muted-foreground text-[9px]">0.92 · 40% · 85</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="DESK ALERTS">
          <CommandItem onSelect={run(() => armAll(true))} className="font-mono text-[11px]">
            <BellRing size={13} style={{ color: K.green }} /> Arm all alert sentinels
            <span className="ml-auto text-muted-foreground text-[9px]">threshold watches</span>
          </CommandItem>
          <CommandItem onSelect={run(() => armAll(false))} className="font-mono text-[11px]">
            <Bell size={13} style={{ color: K.orange }} /> Disarm all alert sentinels
            <span className="ml-auto text-muted-foreground text-[9px]">all quiet</span>
          </CommandItem>
          <CommandItem onSelect={run(() => resetTrips())} className="font-mono text-[11px]">
            <RotateCcw size={13} style={{ color: K.cyan }} /> Reset alert trip counters
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="REPORTING">
          <CommandItem onSelect={run(() => void downloadRiskReport())} className="font-mono text-[11px]">
            <FileText size={13} style={{ color: K.cyan }} /> Export risk report <span className="ml-auto text-muted-foreground text-[9px]">markdown snapshot</span>
          </CommandItem>
          <CommandItem onSelect={run(() => printRiskReport())} className="font-mono text-[11px]">
            <Printer size={13} style={{ color: K.green }} /> Print / save report as PDF <span className="ml-auto text-muted-foreground text-[9px]">A4 print pipeline</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="VIEW">
          <CommandItem onSelect={run(() => { useKrupp.getState().setHelpOpen(true) })} className="font-mono text-[11px]">
            <Keyboard size={13} style={{ color: K.orange }} /> Desk hotkey &amp; control map <span className="ml-auto text-muted-foreground text-[9px]">hotkey ?</span>
          </CommandItem>
          <CommandItem onSelect={run(() => { if (!useKrupp.getState().soundOn) useKrupp.getState().toggleSound() })} className="font-mono text-[11px]">
            {soundOn ? <Volume2 size={13} style={{ color: K.green }} /> : <VolumeX size={13} />} Crisis alarm: {soundOn ? 'ON' : 'OFF'}
          </CommandItem>
          <CommandItem onSelect={run(() => window.scrollTo({ top: 0, behavior: 'smooth' }))} className="font-mono text-[11px]">
            <Sparkles size={13} style={{ color: K.cyan }} /> Scroll to desk header
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
