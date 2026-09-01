'use client';
/**
 * KRUPP CAPITAL // WORKSPACE COMMAND PALETTE (⌘K)
 *
 * Mounted on the 13 desks only — the LONDON EDGE landing terminal keeps its
 * own desk palette (auth / simulation / instruments / view, wired into the
 * london store context). This palette spans the WHOLE workspace:
 *   · navigation across all 14 tabs (with hotkey hints)
 *   · colourline cut-over (MK-II NAVY ↔ HFT MATRIX)
 *   · pins, workspace reference card, layout factory reset
 *   · audit exports (execution ledger + vol snapshot CSV)
 *   · crisis steering (simulate / terminate lockdown)
 *
 * Open/close is controlled by the Shell (its single key handler owns ⌘K on
 * desks — no second document listener, no stale closures).
 */
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import {
  Bookmark, FileDown, Keyboard, Palette, RotateCcw, Square, Star,
  TriangleAlert,
} from 'lucide-react';
import { useKrupp, useRevision } from '@/lib/krupp/store';
import { useTheme, THEMES, KT } from '@/lib/theme';
import { ms, startCrisis, endCrisis } from '@/lib/krupp/engine';
import { DESK_HOTKEY, TABS } from './tabs';

/** Anchor-download helper — same pattern as the panel CSV chips. */
function csvDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function WorkspacePalette({
  open,
  onOpenChange,
  onRequestHelp,
  onRequestPresets,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRequestHelp: () => void;
  onRequestPresets: () => void;
}) {
  useRevision(); // keeps the crisis group honest while the palette is open
  const theme = useTheme((s) => s.theme);
  const otherName = THEMES[theme === 'mk2' ? 'hft' : 'mk2'].name;

  const run = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };
  const jump = (i: number) => run(() => useKrupp.getState().setActiveTab(i));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workspace Command Palette"
      description="Navigate desks, flip the colourline, export audits, steer the crisis…"
      className="border-kborder2 bg-kheader"
    >
      <CommandInput
        placeholder="Type a workspace command or search desks…"
        className="font-mono"
      />
      <CommandList className="krupp-scroll bg-kheader">
        <CommandEmpty className="py-6 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          NO MATCHING WORKSPACE COMMAND
        </CommandEmpty>

        {/* ------------- navigation ------------- */}
        <CommandGroup heading="NAVIGATION — 14-TAB MATRIX">
          {TABS.map((t, i) => {
            const TIcon = t.icon;
            return (
              <CommandItem
                key={t.label}
                value={`${t.label} desk ${t.deskNo ?? 'landing'} tab ${i}`}
                onSelect={jump(i)}
                className="font-mono text-[11px]"
              >
                <TIcon size={13} className={t.accent} aria-hidden />
                {t.label}
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                  {t.deskNo ? `DESK ${String(t.deskNo).padStart(2, '0')}` : 'LANDING'} · {DESK_HOTKEY[i]}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />

        {/* ------------- colourline ------------- */}
        <CommandGroup heading="COLOURLINE">
          <CommandItem
            value="switch colourline theme toggle palette hft matrix mk2 navy"
            onSelect={run(() => useTheme.getState().toggleTheme())}
            className="font-mono text-[11px]"
          >
            <Palette size={13} style={{ color: KT('accent') }} aria-hidden />
            Cut over to <span className="ml-1 font-bold" style={{ color: KT('accent') }}>{otherName}</span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">V · whole workspace re-renders</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />

        {/* ------------- workspace ------------- */}
        <CommandGroup heading="WORKSPACE">
          <PinItem onRun={run} />
          <CommandItem
            value="layout presets save load snapshot workspace bookmark restore"
            onSelect={run(onRequestPresets)}
            className="font-mono text-[11px]"
          >
            <Bookmark size={13} style={{ color: KT('accent') }} aria-hidden />
            Layout presets — save / load named snapshots
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">P</span>
          </CommandItem>
          <CommandItem
            value="workspace hotkey map help reference keyboard"
            onSelect={run(onRequestHelp)}
            className="font-mono text-[11px]"
          >
            <Keyboard size={13} style={{ color: KT('accent') }} aria-hidden />
            Workspace hotkey map &amp; steering notes
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">?</span>
          </CommandItem>
          <CommandItem
            value="layout factory reset workspace pins subtabs selections"
            onSelect={run(() => useKrupp.getState().resetWorkspace())}
            className="font-mono text-[11px]"
          >
            <RotateCcw size={13} style={{ color: KT('warn') }} aria-hidden />
            Layout factory reset — pins, sub-tabs, selections
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">returns to LONDON EDGE</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />

        {/* ------------- audit exports ------------- */}
        <CommandGroup heading="REPORTING — AUDIT EXPORTS">
          <CommandItem
            value="export execution ledger csv blotter fills audit"
            onSelect={run(() => csvDownload('/api/ledger?format=csv'))}
            className="font-mono text-[11px]"
          >
            <FileDown size={13} style={{ color: KT('accent') }} aria-hidden />
            Export execution ledger (full blotter · CSV)
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">krupp-ledger-*.csv</span>
          </CommandItem>
          <CommandItem
            value="export vol snapshot series csv cboe vix history audit"
            onSelect={run(() => csvDownload('/api/volhistory?format=csv&limit=720'))}
            className="font-mono text-[11px]"
          >
            <FileDown size={13} style={{ color: KT('accent') }} aria-hidden />
            Export vol snapshot series (CBOE tape · CSV)
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">krupp-volhistory-*.csv</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />

        {/* ------------- crisis steering ------------- */}
        <CommandGroup heading="CRISIS STEERING">
          {ms.crisis.active ? (
            <CommandItem
              value="terminate lockdown end crisis recovery"
              onSelect={run(() => endCrisis())}
              className="font-mono text-[11px]"
            >
              <Square size={13} style={{ color: KT('down') }} aria-hidden />
              Terminate systemic lockdown
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                CYCLE #{ms.crisis.count}
              </span>
            </CommandItem>
          ) : (
            <CommandItem
              value="simulate market liquidity crash drill cascade"
              onSelect={run(() => startCrisis())}
              className="font-mono text-[11px]"
            >
              <TriangleAlert size={13} style={{ color: KT('down') }} aria-hidden />
              Simulate market liquidity crash
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">multi-stage cascade</span>
            </CommandItem>
          )}
        </CommandGroup>

        <div className="border-t border-kinset px-3 py-2 font-mono text-[7.5px] tracking-[0.14em] text-muted-foreground">
          KRUPP CAPITAL // WORKSPACE PALETTE · LANDING TERMINAL KEEPS ITS OWN DESK PALETTE (AUTH · SIM · INSTRUMENTS · VIEW)
        </div>
      </CommandList>
    </CommandDialog>
  );
}

/** Pin toggle for the ACTIVE desk — needs the live activeTab, kept isolated. */
function PinItem({ onRun }: { onRun: (fn: () => void) => () => void }) {
  const activeTab = useKrupp((s) => s.activeTab);
  const pinned = useKrupp((s) => s.favs.includes(activeTab));
  const label = TABS[activeTab]?.label ?? `DESK ${activeTab}`;
  return (
    <CommandItem
      value="pin unpin favourite star active desk"
      onSelect={onRun(() => useKrupp.getState().toggleFav(activeTab))}
      className="font-mono text-[11px]"
    >
      <Star
        size={13}
        style={{ color: KT('warn') }}
        fill={pinned ? 'currentColor' : 'none'}
        aria-hidden
      />
      {pinned ? `Unpin ${label}` : `Pin ${label} to the quick rail`}
      <span className="ml-auto font-mono text-[9px] text-muted-foreground">F · drag rail chips to reorder</span>
    </CommandItem>
  );
}
