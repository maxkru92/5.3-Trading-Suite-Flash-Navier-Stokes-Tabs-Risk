'use client'

// ============================================================================
// KRUPP CAPITAL // DESK HOTKEY & CONTROL MAP (round 7)
// "?" opens a hardware-style overlay listing every desk hotkey + interaction
// map. Institutional terminals ship laminated keycards — this is the digital
// equivalent, and it doubles as discoverability for the ⌘K palette.
// ============================================================================

import { useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Keyboard } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { K } from './shared'
import { KT } from '@/lib/theme';

const HOTKEYS: Array<{ keys: string[]; action: string; tone: string }> = [
  { keys: ['⌘', 'K'], action: 'Command palette — every desk verb, searchable', tone: K.cyan },
  { keys: ['?'], action: 'This hotkey & control map', tone: K.cyan },
  { keys: ['T'], action: 'Engage / halt the autonomous execution desk', tone: K.green },
  { keys: ['C'], action: 'Inject liquidity crash (severity 6 · 8s cascade)', tone: K.red },
  { keys: ['R'], action: 'Purge & reset the feed to session anchor', tone: K.orange },
  { keys: ['1'], action: 'Track ES ladder (E-mini S&P 500)', tone: K.text },
  { keys: ['2'], action: 'Track NQ ladder (E-mini Nasdaq 100)', tone: K.text },
  { keys: ['3'], action: 'Track SPY ladder (SPDR S&P 500 ETF)', tone: K.text },
  { keys: ['P'], action: 'Layout presets — workspace snapshots (global, every tab)', tone: K.violet },
  { keys: ['V'], action: 'Cut over the colourline — MK-II NAVY ↔ HFT MATRIX (global)', tone: K.violet },
]

const CONTROLS: Array<{ area: string; lines: string[] }> = [
  { area: 'MARKET PULSE (HERO STRIP)', lines: [
    'Tri-instrument %Δ tape — ES / NQ / SPY normalized over a rolling 90s window with an ES volume lane underneath.',
    'Hover for a crosshair readout (time offset, per-symbol %Δ, volume, price); chips rail shows last/dir, window hi-lo, spread, tape C-Δ.',
    'A liquidity crash shades the whole strip red with a T− countdown until the cascade decays.',
  ] },
  { area: 'RISK OVERLAY (SYS.2)', lines: [
    'Pre-trade interceptors — LOCK blocks mean-reversion when chaos > seal, SCALE shrinks clips when viscosity thins, KILL flattens everything when composite > ceiling.',
    'DESK ALERTS — station threshold sentinels (score / chaos / jerk z / VIX / contango / ρ); trips fan out to toasts, terminal, siren + the SQLite audit trail (45s cooldown).',
    'DESK RISK POLICY sliders hot-load the kernel thresholds live; PRE-ARM ZONE highlights when a metric drifts within 18% of its trigger.',
    'PROFILES opens named threshold sets (save / load / delete / export / import JSON).',
  ] },
  { area: 'VOLATILITY (SYS.3)', lines: [
    'PERSISTED VOL STRIP — hover for a per-snapshot crosshair readout (time, VIX, contango, score, regime, source).',
    'IV surface — click any strike row to open an options context ticket; tickets mark to the live surface and settle on click.',
    'Option tickets book straight into OPT P&L with agent post-mortem notes on |P&L| ≥ $150.',
  ] },
  { area: 'WORKSPACE (GLOBAL, EVERY TAB)', lines: [
    'The 14-tab matrix — press L to return here, 1-9/0/Q/W/E to jump desks; ★ pins + P presets + V colourline work from anywhere, including this landing.',
    '⌘K palette now carries NAVIGATE (all 14 tabs) and WORKSPACE (colourline cut-over, layout presets) alongside the desk verbs.',
    'Layout presets capture the whole workspace (tab, sub-tabs, selections, pins) — rename/duplicate rows in the presets dialog; a demo MORNING BOOK preset is planted on first boot.',
  ] },
  { area: 'EXECUTION & AUDIT (BOTTOM ROW)', lines: [
    'DESK ENGAGED toggles the agent reason/act loop; FLATTEN market-outs the open position.',
    'SESSION chips — click to time-travel the blotter into a past boot session (EXIT DRILL returns to live).',
    'EXPORT downloads the full Markdown risk report; PDF (or ⌘P) renders an A4 print document.',
    'SIMULATE MARKET LIQUIDITY CRASH — severity slider + CASCADE duration, then INJECT (or hotkey C).',
  ] },
]

export function HotkeyHelp() {
  const open = useKrupp((s) => s.helpOpen)
  const setOpen = useKrupp((s) => s.setHelpOpen)

  // "?" (shift + /) opens the map — same guard rails as the palette hotkeys
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(!useKrupp.getState().helpOpen)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [setOpen])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="bg-kheader border-gridline max-h-[85vh] overflow-y-auto krupp-scroll sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-mono text-[12px] tracking-[0.22em] text-secondary-foreground flex items-center gap-2">
            <Keyboard size={13} style={{ color: K.cyan }} aria-hidden />
            DESK HOTKEY &amp; CONTROL MAP
          </DialogTitle>
          <DialogDescription className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            KRUPP TERMINAL REFERENCE CARD · PRESS ? ANYTIME · ALL SIMULATION, NO LIVE ORDERS
          </DialogDescription>
        </DialogHeader>

        {/* hotkey card */}
        <div className="border border-gridline bg-kbg-deep rounded-sm p-2">
          <div className="text-[8px] tracking-[0.2em] text-muted-foreground mb-1.5">KEYBOARD — SINGLE-KEY, IGNORED INSIDE INPUT FIELDS</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            {HOTKEYS.map((h) => (
              <div key={h.action} className="flex items-center gap-2 min-w-0 py-0.5 border-b border-kinset last:border-0">
                <span className="flex gap-1 shrink-0">
                  {h.keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-[3px] border font-mono text-[9px] font-bold"
                      style={{ borderColor: `${h.tone}55`, color: h.tone, background: 'rgba(255,255,255,0.03)', boxShadow: `0 1px 0 ${h.tone}33` }}
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
                <span className="text-[9px] tracking-[0.06em] text-muted-foreground truncate" title={h.action}>{h.action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* control map */}
        <div className="border border-gridline bg-kbg-deep rounded-sm p-2 flex flex-col gap-2">
          <div className="text-[8px] tracking-[0.2em] text-muted-foreground">POINTER — WHAT EACH CLUSTER DOES</div>
          {CONTROLS.map((c) => (
            <div key={c.area} className="flex flex-col gap-0.5">
              <div className="text-[9px] font-bold tracking-[0.16em]" style={{ color: K.orange }}>{c.area}</div>
              {c.lines.map((l, i) => (
                <div key={i} className="flex gap-1.5 text-[9px] leading-[1.45] text-muted-foreground">
                  <span className="mt-[5px] w-1 h-1 rounded-full shrink-0" style={{ background: `${K.cyan}88` }} aria-hidden />
                  <span>{l}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="text-[7.5px] tracking-[0.14em] text-muted-foreground font-mono">
          BUILD 2.4.1-LSE.9 · NAVIER-STOKES KERNEL RESIDENT · REDUCED-MOTION RESPECTED
        </div>
      </DialogContent>
    </Dialog>
  )
}
