'use client';
/**
 * KRUPP CAPITAL // WORKSPACE HOTKEY MAP & LAYOUT RESET
 * "?" on any of the 13 desks opens this reference card (the LONDON EDGE
 * landing terminal owns its own "?" via HotkeyHelp). Doubles as the layout
 * control surface: pinned-desk quick list + workspace factory reset.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Keyboard, RotateCcw, Star } from 'lucide-react';
import { useKrupp } from '@/lib/krupp/store';
import { KT } from '@/lib/theme';

const WORKSPACE_KEYS: Array<{ keys: string[]; action: string; tone: keyof typeof TONE_MAP }> = [
  { keys: ['L'], action: 'Return to the LONDON EDGE landing terminal', tone: 'accent' },
  { keys: ['1', '…', '9'], action: 'Jump to desks 01–09', tone: 'text' },
  { keys: ['0'], action: 'Jump to desk 10 — CENTRAL BANK LIQ', tone: 'text' },
  { keys: ['Q', 'W', 'E'], action: 'Jump to desks 11–13 (CRYPTO / STAT-ARB / INFRA)', tone: 'text' },
  { keys: ['F'], action: 'Pin / unpin the active desk (★ persists)', tone: 'warn' },
  { keys: ['P'], action: 'Layout presets — save / load named workspace snapshots', tone: 'accent' },
  { keys: ['V'], action: 'Flip colourline — MK-II NAVY ↔ HFT MATRIX', tone: 'accent' },
  { keys: ['?'], action: 'This workspace reference card', tone: 'accent' },
  { keys: ['⌘', 'K'], action: 'Workspace command palette on the 13 desks (landing keeps its own)', tone: 'accent' },
];

const TONE_MAP = {
  accent: () => KT('accent'),
  warn: () => KT('warn'),
  text: () => KT('text'),
  muted: () => KT('textMuted'),
} as const;

const DESK_KEY_HINT: Record<number, string> = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '0', 11: 'Q', 12: 'W', 13: 'E',
};

const STEERING_LINES: string[] = [
  'SIMULATE MARKET LIQUIDITY CRASH (footer) injects a multi-stage liquidity cascade; the lockdown overlay, interceptor chain and auto-recovery countdown take over until the cycle decays.',
  'Interceptor chips — BLOCK MEAN REVERSION / REDUCE SIZE / EMERGENCY FLATTENING engage on a staged schedule once the cascade is live; click to arm or disarm manually.',
  'Colourline switch (header) re-renders every desk and chart against the other palette; the choice persists across reloads and the market engine never misses a tick during the cut-over.',
  '★ pins persist per desk — hover a tab and click the star (or press F while the desk is active) to build your own quick-access rail in the footer; DRAG the rail chips to reorder them, the order is saved with the workspace.',
  'Layout presets (P) snapshot the WHOLE workspace — active tab, sub-tabs, instrument selections and pins — under a name; LOAD restores it in one click. Presets are stored separately, so the layout factory reset never destroys them.',
];

export function WorkspaceHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const favs = useKrupp((s) => s.favs);
  const resetWorkspace = useKrupp((s) => s.resetWorkspace);
  const [armed, setArmed] = useState(false);

  // re-arm the destructive button on every open/close transition (covers
  // outside clicks + ESC via Radix onOpenChange — no setState-in-effect)
  const handleOpenChange = (v: boolean) => {
    setArmed(false);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-kheader border-kborder2 max-h-[85vh] overflow-y-auto krupp-scroll sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-mono text-[12px] tracking-[0.22em] text-secondary-foreground flex items-center gap-2">
            <Keyboard size={13} style={{ color: KT('accent') }} aria-hidden />
            WORKSPACE HOTKEY MAP
          </DialogTitle>
          <DialogDescription className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            13-DESK MATRIX REFERENCE CARD · PRESS ? ON ANY DESK · LANDING TERMINAL KEEPS ITS OWN MAP
          </DialogDescription>
        </DialogHeader>

        {/* keyboard map */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2">
          <div className="text-[8px] tracking-[0.2em] text-muted-foreground mb-1.5">KEYBOARD — SINGLE-KEY ON THE 13 DESKS, IGNORED INSIDE INPUT FIELDS</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            {WORKSPACE_KEYS.map((h, i) => (
              <div key={`${h.action}-${i}`} className="flex items-center gap-2 min-w-0 py-0.5 border-b border-kinset last:border-0">
                <span className="flex gap-1 shrink-0">
                  {h.keys.map((k, j) => (
                    <kbd
                      key={`${k}-${j}`}
                      className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-[3px] border font-mono text-[9px] font-bold"
                      style={{
                        borderColor: `${TONE_MAP[h.tone]()}55`,
                        color: TONE_MAP[h.tone](),
                        background: 'rgba(255,255,255,0.03)',
                        boxShadow: `0 1px 0 ${TONE_MAP[h.tone]()}33`,
                      }}
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

        {/* pinned desks */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2">
          <div className="flex items-center gap-1.5 text-[8px] tracking-[0.2em] text-muted-foreground mb-1.5">
            <Star size={9} className="text-amber-300" aria-hidden />
            PINNED DESKS — CLICK TO JUMP
          </div>
          {favs.length === 0 ? (
            <div className="text-[9px] text-muted-foreground/70 font-mono py-1">
              NO PINS YET — HOVER A DESK TAB AND CLICK ★, OR PRESS F ON AN ACTIVE DESK.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {favs.map((i) => (
                <button
                  key={i}
                  onClick={() => { useKrupp.getState().setActiveTab(i); onOpenChange(false); }}
                  className="flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider transition-colors hover:border-amber-400/70"
                  style={{ color: KT('warn'), borderColor: `${KT('warn')}44`, background: `${KT('warn')}0d` }}
                >
                  <Star size={8} fill="currentColor" aria-hidden />
                  {String(i).padStart(2, '0')}
                  {DESK_KEY_HINT[i] && <span className="text-muted-foreground font-normal">· {DESK_KEY_HINT[i]}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* steering notes */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2 flex flex-col gap-1.5">
          <div className="text-[8px] tracking-[0.2em] text-muted-foreground">STEERING — CRISIS, COLOURLINE &amp; LAYOUT</div>
          {STEERING_LINES.map((l, i) => (
            <div key={i} className="flex gap-1.5 text-[9px] leading-[1.45] text-muted-foreground">
              <span className="mt-[5px] w-1 h-1 rounded-full shrink-0" style={{ background: `${KT('accent')}88` }} aria-hidden />
              <span>{l}</span>
            </div>
          ))}
        </div>

        {/* layout reset */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2 flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-bold tracking-[0.16em]" style={{ color: KT('warn') }}>LAYOUT FACTORY RESET</div>
            <div className="text-[8.5px] text-muted-foreground leading-snug">
              Clears pins, per-desk sub-tabs, instrument selections and the active tab, then returns to LONDON EDGE.
            </div>
          </div>
          <button
            onClick={() => {
              if (!armed) { setArmed(true); return; }
              resetWorkspace();
              onOpenChange(false);
            }}
            className={`ml-auto flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[9.5px] font-bold tracking-[0.14em] transition-colors ${
              armed ? 'border-rose-500/80 bg-rose-950/50 text-rose-300' : 'border-kborder2 bg-kpanel text-muted-foreground hover:text-foreground hover:border-kborder4'
            }`}
          >
            <RotateCcw size={11} aria-hidden />
            {armed ? 'CONFIRM RESET' : 'RESET LAYOUT'}
          </button>
        </div>

        <div className="text-[7.5px] tracking-[0.14em] text-muted-foreground font-mono">
          BUILD 2.4.1-MK3.W · DUAL-COLOURLINE KERNEL RESIDENT · REDUCED-MOTION RESPECTED
        </div>
      </DialogContent>
    </Dialog>
  );
}
