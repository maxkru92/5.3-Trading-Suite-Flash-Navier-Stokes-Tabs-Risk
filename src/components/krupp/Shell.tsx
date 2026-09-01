'use client';
/**
 * KRUPP CAPITAL TRADING SUITE — Workspace Shell (MK-III)
 * 14-tab matrix: LONDON STRATEGIC EDGE landing terminal + 13 institutional
 * desks + persistent crisis steering block + dual-colourline switch.
 *
 * State guardrails: the market engine, L3 workers, infra telemetry and all
 * series live at module scope. Mounting/unmounting desks never clears
 * background calculations or disconnects streaming workers.
 *
 * Colourlines: every surface/chart token resolves through src/lib/theme.ts.
 * A theme flip remounts the workspace (key={theme}) so every canvas redraws
 * against the new palette; module-scope engines keep running uninterrupted.
 */
import { useEffect, useRef, useState } from 'react';
import { Bookmark, ClipboardList, NotebookPen, SquareTerminal, TriangleAlert, ShieldCheck, Star, Volume2, VolumeX } from 'lucide-react';
import { bootstrapKrupp, ms, startCrisis, endCrisis } from '@/lib/krupp/engine';
import { infra } from '@/lib/krupp/infraservice';
import { useKrupp, useRevision } from '@/lib/krupp/store';
import { useKrupp as useLondon } from '@/lib/london/store';
import { setSfxGate, sfxDesk } from '@/lib/krupp/sfx';
import { fClock, fCountdown, fN, fPx, fPct } from '@/lib/krupp/format';
import { hydrateTheme, useTheme, THEMES } from '@/lib/theme';
import { ThemeSwitcher } from './ThemeSwitcher';
import { CrisisOverlay } from './CrisisOverlay';
import { WorkspaceHelp } from './WorkspaceHelp';
import { WorkspacePalette } from './WorkspacePalette';
import { WorkspacePresets } from './WorkspacePresets';
import { WorkspaceJournal } from './WorkspaceJournal';
import { WorkspaceDigest } from './WorkspaceDigest';
import { TABS } from './tabs';

function UtcClock(): React.ReactElement {
  const [t, setT] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-[11px] text-zinc-300">{fClock(t)}</span>;
}

function HeaderChip({ label, value, tone = 'text-zinc-300' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="hidden items-center gap-1.5 rounded border border-kborder2 bg-kpanel px-2 py-1 md:flex">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={`font-mono text-[10.5px] font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function InterceptorChip({
  name,
  engaged,
  onClick,
}: {
  name: string;
  engaged: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title="Toggle pre-trade interceptor"
      className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors ${
        engaged
          ? 'border-rose-500/70 bg-rose-950/60 text-rose-300'
          : 'border-amber-700/60 bg-kpanel text-amber-400/80'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${engaged ? 'animate-pulse bg-rose-400' : 'bg-amber-500/70'}`} />
      {name}
      <span className={engaged ? 'text-rose-400' : 'text-amber-600/80'}>{engaged ? 'ENGAGED' : 'ARMED'}</span>
    </button>
  );
}

/** Live engine readout chip for the workspace breadcrumb rail (5 Hz).
 *  Direction changes fire a one-shot price flash (green/red pulse).
 *  Flash bookkeeping lives at module scope — same guardrail pattern as the
 *  market engine (ms.inst): background state survives tab switches. */
const TICKER_DIR = new Map<string, 'up' | 'dn'>();
const TICKER_FLASH = new Map<string, number>();

function TickerChip({ sym, label }: { sym: string; label?: string }) {
  useRevision(); // 5 Hz re-render so direction flips are observed
  const inst = ms.inst[sym];
  if (!inst) return null;
  const up = inst.changePct >= 0;
  const d = up ? 'up' : 'dn';
  if (TICKER_DIR.get(sym) !== d) {
    TICKER_DIR.set(sym, d);
    TICKER_FLASH.set(sym, (TICKER_FLASH.get(sym) ?? 0) + 1);
  }
  const flash = TICKER_FLASH.get(sym) ?? 0;
  return (
    <span className="hidden items-center gap-1.5 rounded border border-kborder2 bg-kpanel px-1.5 py-0.5 md:inline-flex" title={inst.def.name}>
      <span className="font-mono text-[9px] tracking-wider text-zinc-500">{label ?? sym.replace('1!', '')}</span>
      <span
        key={flash}
        className={`font-mono text-[10px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-rose-400'} ${flash > 0 ? (up ? 'flash-green' : 'flash-red') : ''}`}
      >
        {fPx(inst.last, inst.def.dec)}
      </span>
      <span className={`font-mono text-[9px] tabular-nums ${up ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
        {fPct(inst.changePct)}
      </span>
    </span>
  );
}

export default function Shell() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    hydrateTheme();
    bootstrapKrupp();
    // sfx kernel gate — sound is on when EITHER terminal's alarm switch is on
    setSfxGate(() => useKrupp.getState().sfxOn || useLondon.getState().soundOn);
    setMounted(true);
  }, []);

  const theme = useTheme((s) => s.theme);
  const activeTab = useKrupp((s) => s.activeTab);
  const setActiveTab = useKrupp((s) => s.setActiveTab);
  const favs = useKrupp((s) => s.favs);
  const toggleFav = useKrupp((s) => s.toggleFav);
  const sfxOn = useKrupp((s) => s.sfxOn);
  const journalOpen = useKrupp((s) => s.journalOpen);
  const setJournalOpen = useKrupp((s) => s.setJournalOpen);
  const digestOpen = useKrupp((s) => s.digestOpen);
  const setDigestOpen = useKrupp((s) => s.setDigestOpen);
  /* r9 — POINTER drag-to-reorder for the pinned quick rail: pointer events
   * (not HTML5 DnD) so mouse, touch AND pen all reorder; live moveFav swaps
   * as the pointer crosses a neighbouring chip. Click-after-drag is folded
   * back into a plain jump via the didDrag guard. */
  const [dragFav, setDragFav] = useState<number | null>(null);
  const dragFavRef = useRef<number | null>(null);
  const didDragRef = useRef(false);
  useRevision(); // 5 Hz re-render of status surfaces

  /* ---- colourline cut-over flash (rendered OUTSIDE the keyed workspace) ---- */
  const [flash, setFlash] = useState(0);
  const prevTheme = useRef(theme);
  useEffect(() => {
    if (prevTheme.current !== theme) {
      prevTheme.current = theme;
      setFlash((f) => f + 1);
    }
  }, [theme]);

  /* ---- r10: crisis auto-recovery all-clear — the engine tick loop ends the
   * lockdown when the timer expires with NO UI involved; the engine announces
   * it on the window bus and the shell answers with the desk-pitched recover
   * chirp (gate-checked in the sfx kernel). The manual TERMINATE button used
   * to own this call — now every end path (auto + manual + palette) chirps
   * exactly once, here. ---- */
  useEffect(() => {
    const onCrisisEnd = () => {
      sfxDesk(useKrupp.getState().activeTab, 'recover');
    };
    window.addEventListener('krupp:crisis-end', onCrisisEnd);
    return () => window.removeEventListener('krupp:crisis-end', onCrisisEnd);
  }, []);

  /* ---- r11: dwell heartbeat — charges wall-clock time to the ACTIVE desk
   * every 60s so the digest's TIME ON DESKS stays current without tab
   * switches; pagehide (and the theme-remount unmount) flush the tail chunk.
   * Tab switches flush inside the store's setActiveTab. ---- */
  useEffect(() => {
    const beat = setInterval(() => useKrupp.getState().tickDwell(), 60_000);
    const onHide = () => useKrupp.getState().tickDwell();
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(beat);
      window.removeEventListener('pagehide', onHide);
      useKrupp.getState().tickDwell();
    };
  }, []);

  /* ---- desk hotkeys: L landing · 1-9/0 desks 01-10 · Q/W/E desks 11-13 ·
         F pin/unpin active desk · P layout presets (anywhere) · J session
         journal (anywhere) · G post-mortem digest (anywhere) · V colourline ·
         ? workspace map · ⌘K palette
         (the LONDON EDGE tab routes plain 1/2/3/C/R/T + ? + ⌘K to its own
         terminal: 1/2/3 symbols, C crash, R reset, T engage, ? HotkeyHelp,
         ⌘K desk palette — P, J, G and V stay workspace-global) ---- */
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const presetsOpen = useKrupp((s) => s.presetsOpen);
  const setPresetsOpen = useKrupp((s) => s.setPresetsOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // on desks the workspace palette owns ⌘K; the landing terminal
        // (LondonEdge) keeps its own palette — both listeners never coexist
        if (activeTab !== 0) {
          e.preventDefault();
          setPaletteOpen((o) => !o);
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        useTheme.getState().toggleTheme();
        return;
      }
      if (e.key.toLowerCase() === 'f' && activeTab !== 0) {
        e.preventDefault();
        toggleFav(activeTab);
        return;
      }
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPresetsOpen(!useKrupp.getState().presetsOpen);
        return;
      }
      if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setJournalOpen(!useKrupp.getState().journalOpen);
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        useKrupp.getState().setDigestOpen(!useKrupp.getState().digestOpen);
        return;
      }
      if (activeTab === 0) return; // landing terminal owns plain keys + ?
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      const map: Record<string, number> = {
        l: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
        '6': 6, '7': 7, '8': 8, '9': 9, '0': 10, q: 11, w: 12, e: 13,
      };
      const idx = map[e.key.toLowerCase()];
      if (idx !== undefined) {
        e.preventDefault();
        setActiveTab(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, setActiveTab, toggleFav, setPresetsOpen, setJournalOpen]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-kbg">
        <div className="font-mono text-2xl font-black tracking-[0.4em] text-zinc-200">KRUPP CAPITAL</div>
        <div className="mt-2 font-mono text-[11px] tracking-[0.3em] text-kaccent-strong/80">
          TRADING SUITE // MK-III · DUAL COLOURLINE
        </div>
        <div className="mt-6 h-1 w-56 overflow-hidden rounded bg-kpanel2">
          <div className="krupp-boot h-full w-1/3 bg-kaccent-strong" />
        </div>
        <div className="mt-3 font-mono text-[10px] text-zinc-500">CALIBRATING VOLATILITY ENGINES…</div>
      </div>
    );
  }

  const crisis = ms.crisis;
  const tps = infra.tps.length > 0 ? infra.tps.last() : 0;
  const lat = infra.ws.length > 0 ? infra.ws.reduce((a, w) => a + w.latency, 0) / infra.ws.length : 0;
  const tokenLeft = infra.tokens.length > 0 ? Math.min(...infra.tokens.map((t) => t.expAt - Date.now())) : 0;
  const engaging = (offsetMs: number): boolean =>
    crisis.active && Date.now() - crisis.startedAt >= offsetMs;

  const tab = TABS[activeTab] ?? TABS[0];
  const Active = tab.Comp;
  const Icon = tab.icon;

  return (
    <>
      {/* colourline cut-over sweep — above the workspace, never intercepts input */}
      {flash > 0 && (
        <div key={flash} className="theme-cut pointer-events-none fixed inset-0 z-[95]" aria-hidden />
      )}
      <div
        key={theme}
        className="flex min-h-screen flex-col bg-kbg text-zinc-200 print:bg-white"
      >
      <CrisisOverlay />
      <WorkspaceHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <WorkspacePresets open={presetsOpen} onOpenChange={setPresetsOpen} />
      <WorkspaceJournal open={journalOpen} onOpenChange={setJournalOpen} />
      <WorkspaceDigest open={digestOpen} onOpenChange={setDigestOpen} />
      {tab.deskNo !== undefined && (
        <WorkspacePalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onRequestHelp={() => setHelpOpen(true)}
          onRequestPresets={() => setPresetsOpen(true)}
          onRequestJournal={() => setJournalOpen(true)}
          onRequestDigest={() => setDigestOpen(true)}
        />
      )}

      {/* ------------- header (hidden on print while the LONDON EDGE A4 report owns the paper) ------------- */}
      <header className={`sticky top-0 z-40 border-b border-kborder bg-kheader/95 backdrop-blur ${tab.deskNo === undefined ? 'print:hidden' : ''}`}>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded border ${crisis.active ? 'border-rose-500/70 bg-rose-950/50' : 'border-kborder2 bg-kpanel'}`}>
              {crisis.active ? (
                <TriangleAlert className="crisis-blink h-4.5 w-4.5 text-rose-400" size={18} />
              ) : (
                <ShieldCheck className="h-4.5 w-4.5 text-kaccent" size={18} />
              )}
            </div>
            <div>
              <div className="font-mono text-[13px] font-black leading-none tracking-[0.22em] text-zinc-100">
                KRUPP CAPITAL
              </div>
              <div className="font-mono text-[8.5px] tracking-[0.34em] text-zinc-500">
                TRADING SUITE // LONDON EDGE + 13-DESK MATRIX
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeSwitcher />
            <HeaderChip label="L3 FEED" value="LIVE" tone="text-emerald-400" />
            <HeaderChip label="TICKS/S" value={fN(tps, 0)} tone="text-kaccent-soft" />
            <HeaderChip label="WS LAT" value={`${fN(lat, 0)}ms`} tone={lat > 120 ? 'text-amber-400' : 'text-zinc-300'} />
            <HeaderChip label="AUTH TTL" value={fCountdown(tokenLeft)} tone={tokenLeft < 15000 ? 'text-amber-400' : 'text-zinc-300'} />
            <div className="rounded border border-kborder2 bg-kpanel px-2 py-1">
              <UtcClock />
            </div>
          </div>
        </div>

        {/* ------------- 14-tab bar (LONDON EDGE + 13 desks, ★ = pinned) ------------- */}
        <nav className="krupp-scroll flex gap-0.5 overflow-x-auto px-2" aria-label="Desk navigation">
          {TABS.map((t, i) => {
            const TIcon = t.icon;
            const active = i === activeTab;
            const pinned = favs.includes(i);
            return (
              <button
                key={t.label}
                onClick={() => setActiveTab(i)}
                aria-current={active ? 'page' : undefined}
                title={t.deskNo ? `${t.label} — desk ${String(t.deskNo).padStart(2, '0')}${pinned ? ' (pinned)' : ''}` : t.label}
                className={`group relative flex shrink-0 items-center gap-1.5 px-2.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider outline-none transition-colors focus-visible:ring-1 focus-visible:ring-kaccent/70 ${
                  active ? t.accent : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <TIcon size={12} strokeWidth={2.2} />
                <span className="hidden lg:inline">{t.label}</span>
                <span className="lg:hidden">{t.deskNo ? String(t.deskNo).padStart(2, '0') : '◆'}</span>
                {t.deskNo !== undefined && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={pinned ? `Unpin ${t.label}` : `Pin ${t.label}`}
                    aria-pressed={pinned}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav(i);
                    }}
                    className={`-mr-0.5 ml-0.5 rounded-sm p-0.5 transition-all hover:scale-110 ${
                      pinned ? 'text-amber-300 drop-shadow-[0_0_4px_rgba(252,211,77,0.8)]' : 'text-zinc-700 opacity-0 hover:text-amber-300 group-hover:opacity-100 focus-visible:opacity-100'
                    }`}
                  >
                    <Star size={9} strokeWidth={2.6} fill={pinned ? 'currentColor' : 'none'} />
                  </span>
                )}
                <span
                  className={`absolute inset-x-1 bottom-0 h-0.5 rounded-full transition-all ${t.bar} ${
                    active
                      ? 'opacity-100 shadow-[0_0_10px_var(--glow-accent,rgba(34,211,238,0.65))]'
                      : pinned
                        ? 'opacity-60'
                        : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}
        </nav>
      </header>

      {/* ------------- active workspace ------------- */}
      <main className="flex-1 px-2 py-3 md:px-3">
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-widest text-zinc-600 print:hidden">
          <Icon size={12} />
          <span>
            {tab.deskNo
              ? `DESK ${String(tab.deskNo).padStart(2, '0')} / 13 — ${tab.label}`
              : `LANDING TERMINAL — ${tab.label} // L3 RISK DESK`}
          </span>
          <span className="ml-1 hidden items-center gap-1.5 lg:inline-flex" aria-hidden>
            <span className="h-3 w-px bg-kborder2" />
          </span>
          <TickerChip sym="ES1!" label="ES" />
          <TickerChip sym="NQ1!" label="NQ" />
          <TickerChip sym="VIX" label="VIX" />
          <TickerChip sym="BTC-USD" label="BTC" />
          {/* right side — engine tick + compact workspace triggers (palette + presets reachable on small viewports) */}
          <span className="ml-auto flex items-center gap-1.5">
            {/* r10 — md floor: at 768 the label + four rail triggers overflowed
                the breadcrumb strip by 19px (doc bleed); the tick count is
                decorative here — the footer + header already carry tps */}
            <span className="hidden md:inline">ENGINE TICK #{fN(ms.tickCount, 0)}</span>
            {tab.deskNo !== undefined && (
              <button
                onClick={() => setPaletteOpen((o) => !o)}
                title="Workspace command palette (⌘K) — navigate, colourline, exports, crisis"
                aria-label="Open workspace command palette"
                className="rounded border border-kborder2 bg-kpanel p-1 text-zinc-400 outline-none transition-colors hover:border-kaccent/60 hover:text-kaccent focus-visible:ring-1 focus-visible:ring-kaccent/70"
              >
                <SquareTerminal size={12} aria-hidden />
              </button>
            )}
            <button
              onClick={() => setPresetsOpen(!presetsOpen)}
              title="Layout presets (P) — save / load named workspace snapshots"
              aria-label="Open layout presets"
              className="rounded border border-kborder2 bg-kpanel p-1 text-zinc-400 outline-none transition-colors hover:border-kaccent/60 hover:text-kaccent focus-visible:ring-1 focus-visible:ring-kaccent/70"
            >
              <Bookmark size={12} aria-hidden />
            </button>
            <button
              onClick={() => setJournalOpen(!journalOpen)}
              title="Session journal (J) — desk-side logbook, notes stamp desk + regime + score"
              aria-label="Open session journal"
              className="rounded border border-kborder2 bg-kpanel p-1 text-zinc-400 outline-none transition-colors hover:border-kaccent/60 hover:text-kaccent focus-visible:ring-1 focus-visible:ring-kaccent/70"
            >
              <NotebookPen size={12} aria-hidden />
            </button>
            <button
              onClick={() => setDigestOpen(!digestOpen)}
              title="Post-mortem digest (G) — workspace + ledger + journal brief"
              aria-label="Open post-mortem digest"
              className="rounded border border-kborder2 bg-kpanel p-1 text-zinc-400 outline-none transition-colors hover:border-kaccent/60 hover:text-kaccent focus-visible:ring-1 focus-visible:ring-kaccent/70"
            >
              <ClipboardList size={12} aria-hidden />
            </button>
          </span>
        </div>
        <Active />
      </main>

      {/* ------------- persistent steering block (hidden on print with the landing report) ------------- */}
      <footer className={`sticky bottom-0 z-40 border-t border-kborder bg-kheader/97 pb-[env(safe-area-inset-bottom)] backdrop-blur ${tab.deskNo === undefined ? 'print:hidden' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {crisis.active ? (
            <>
              <button
                onClick={() => {
                  endCrisis();
                  // recover chirp now fires from the krupp:crisis-end listener
                  // (r10) — manual terminate must not double-play it
                }}
                className="crisis-blink flex items-center gap-2 rounded border border-rose-500 bg-rose-950/70 px-4 py-2 font-mono text-[11px] font-black tracking-[0.2em] text-rose-200 shadow-[0_0_24px_rgba(225,29,72,0.35)]"
              >
                <TriangleAlert size={14} />
                SYSTEMIC LOCKDOWN ACTIVE — TERMINATE
              </button>
              <div className="font-mono text-[10px] tracking-wider text-rose-400">
                AUTO-RECOVERY T-{fCountdown(Math.max(0, crisis.endsAt - Date.now()))} · INTENSITY{' '}
                {(crisis.intensity * 100).toFixed(0)}% · CYCLE #{crisis.count}
              </div>
            </>
          ) : (
            <button
              onClick={() => {
                startCrisis();
                sfxDesk(useKrupp.getState().activeTab, 'crisis');
              }}
              className="flex items-center gap-2 rounded border border-rose-700/80 bg-gradient-to-b from-kcrit-deep to-kcrit-black px-4 py-2 font-mono text-[11px] font-black tracking-[0.2em] text-rose-300 transition-all hover:border-rose-500 hover:shadow-[0_0_24px_rgba(225,29,72,0.3)] active:scale-[0.98]"
            >
              <TriangleAlert size={14} />
              SIMULATE MARKET LIQUIDITY CRASH
            </button>
          )}

          <div className="ml-auto flex w-full flex-wrap items-center justify-center gap-1.5 sm:w-auto sm:justify-end">
            {/* master sfx gate — desk crisis klaxon + all workspace chirps;
                the landing SystemHeader alarm toggle flips the same kernel */}
            <button
              onClick={() => useKrupp.getState().toggleSfx()}
              aria-pressed={sfxOn}
              title={sfxOn ? 'Mute desk audio (alerts, crisis klaxon)' : 'Enable desk audio — per-sentinel call signs + crisis klaxon'}
              className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider transition-colors ${
                sfxOn ? 'border-kaccent/60 bg-kaccent/10' : 'border-kborder2 bg-kpanel text-zinc-500'
              }`}
            >
              {sfxOn ? <Volume2 size={13} className="text-kaccent" aria-hidden /> : <VolumeX size={13} aria-hidden />}
              SFX
            </button>
            <InterceptorChip
              name="Block Mean Reversion"
              engaged={engaging(400) && ms.interceptors.blockMR}
              onClick={() => {
                ms.interceptors.blockMR = !ms.interceptors.blockMR;
              }}
            />
            <InterceptorChip
              name="Reduce Size"
              engaged={engaging(900) && ms.interceptors.reduceSize}
              onClick={() => {
                ms.interceptors.reduceSize = !ms.interceptors.reduceSize;
              }}
            />
            <InterceptorChip
              name="Emergency Flattening"
              engaged={engaging(1400) && ms.interceptors.flatten}
              onClick={() => {
                ms.interceptors.flatten = !ms.interceptors.flatten;
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-kinset px-3 py-1 font-mono text-[9px] tracking-wider text-zinc-600">
          <span className="flex items-center gap-2">
            <span className="hidden md:inline">KRUPP CAPITAL // INSTITUTIONAL TERMINAL MK-III — ALL FEEDS SIMULATED IN-SANDBOX</span>
            <span className="md:hidden">KRUPP CAPITAL // MK-III</span>
            <span className="hidden items-center gap-1 lg:flex" aria-hidden>
              <span className="h-2.5 w-px bg-kborder2" />
            </span>
            <span className="hidden items-center gap-1.5 lg:flex" title="Workspace hotkeys — plain keys are live on the 13 desks; the landing terminal keeps its own routing keys">
              <kbd className="kbd-hint">L</kbd> EDGE
              <kbd className="kbd-hint">1-9</kbd><kbd className="kbd-hint">0</kbd> DESK 01-10
              <kbd className="kbd-hint">Q</kbd><kbd className="kbd-hint">W</kbd><kbd className="kbd-hint">E</kbd> DESK 11-13
              <kbd className="kbd-hint">F</kbd> PIN
              <button
                onClick={() => setPresetsOpen(true)}
                title="Layout presets — save / load named workspace snapshots"
                className="flex items-center gap-1 rounded-sm outline-none transition-transform hover:scale-105 focus-visible:ring-1 focus-visible:ring-kaccent/70"
              >
                <kbd className="kbd-hint">P</kbd> PRESETS
              </button>
              <button
                onClick={() => setJournalOpen(true)}
                title="Session journal — desk-side logbook (⌘⏎ to log, CSV export inside)"
                className="flex items-center gap-1 rounded-sm outline-none transition-transform hover:scale-105 focus-visible:ring-1 focus-visible:ring-kaccent/70"
              >
                <kbd className="kbd-hint">J</kbd> JOURNAL
              </button>
              <button
                onClick={() => setDigestOpen(true)}
                title="Post-mortem digest — workspace + ledger + journal brief, copyable/exportable"
                className="flex items-center gap-1 rounded-sm outline-none transition-transform hover:scale-105 focus-visible:ring-1 focus-visible:ring-kaccent/70"
              >
                <kbd className="kbd-hint">G</kbd> DIGEST
              </button>
              <kbd className="kbd-hint">V</kbd> COLOURLINE
              {activeTab !== 0 && (
                <>
                  <button
                    onClick={() => setPaletteOpen((o) => !o)}
                    title="Workspace command palette — navigate, colourline, exports, crisis"
                    className="flex items-center gap-1 rounded-sm outline-none transition-transform hover:scale-105 focus-visible:ring-1 focus-visible:ring-kaccent/70"
                  >
                    <kbd className="kbd-hint">⌘K</kbd> COMMANDS
                  </button>
                  <button
                    onClick={() => setHelpOpen(true)}
                    title="Workspace hotkey map & layout reset"
                    className="flex items-center gap-1 rounded-sm outline-none transition-transform hover:scale-105 focus-visible:ring-1 focus-visible:ring-kaccent/70"
                  >
                    <kbd className="kbd-hint">?</kbd> HELP
                  </button>
                </>
              )}
            </span>
            {/* pinned-desk quick rail — click to jump, POINTER-DRAG to reorder
                (mouse + touch + pen — pointer capture, live moveFav swaps) */}
            {favs.length > 0 && (
              <span className="hidden items-center gap-1 xl:flex" aria-label="Pinned desks">
                <span className="h-2.5 w-px bg-kborder2" aria-hidden />
                <Star size={8} className="text-amber-300" aria-hidden />
                {favs.map((i, pos) => (
                  <button
                    key={i}
                    data-fav-tab={i}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'mouse' && e.button !== 0) return;
                      dragFavRef.current = i;
                      didDragRef.current = false;
                      setDragFav(i);
                      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* capture unavailable */ }
                    }}
                    onPointerMove={(e) => {
                      if (dragFavRef.current === null) return;
                      const chip = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-fav-tab]') as HTMLElement | null;
                      if (!chip) return;
                      const target = Number(chip.dataset.favTab);
                      const cur = dragFavRef.current;
                      if (Number.isInteger(target) && target !== cur && favs.includes(target)) {
                        didDragRef.current = true;
                        useKrupp.getState().moveFav(cur, target);
                        dragFavRef.current = target;
                        setDragFav(target);
                      }
                    }}
                    onPointerUp={(e) => {
                      if (dragFavRef.current !== null) {
                        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
                        dragFavRef.current = null;
                        setDragFav(null);
                        // the click that follows a real drag is swallowed by
                        // didDragRef — clear the guard on the NEXT tick so
                        // keyboard activation still jumps
                        setTimeout(() => { didDragRef.current = false; }, 0);
                      }
                    }}
                    onPointerCancel={() => {
                      dragFavRef.current = null;
                      setDragFav(null);
                    }}
                    onClick={() => {
                      if (didDragRef.current) return; // a drag, not a jump
                      setActiveTab(i);
                    }}
                    title={`Jump to desk ${String(i).padStart(2, '0')} — ${TABS[i]?.label ?? ''} · drag to reorder (slot ${pos + 1})`}
                    className={`cursor-grab touch-none select-none rounded-sm border px-1 font-mono text-[8.5px] font-bold tracking-wider outline-none transition-all focus-visible:ring-1 focus-visible:ring-kaccent/70 active:cursor-grabbing ${
                      dragFav === i
                        ? 'scale-110 rotate-2 border-amber-300 bg-amber-400/25 text-amber-100 shadow-[0_0_12px_rgba(252,211,77,0.55)]'
                        : i === activeTab
                          ? 'border-amber-400/80 bg-amber-400/15 text-amber-200'
                          : 'border-amber-400/25 bg-amber-400/5 text-amber-300/70 hover:border-amber-400/60 hover:text-amber-200'
                    }`}
                  >
                    {String(i).padStart(2, '0')}
                  </button>
                ))}
              </span>
            )}
          </span>
          <span className="hidden sm:inline">
            ENGINE {fN(tps, 0)} tps · REV {useKrupp.getState().revision} · COLOURLINE {THEMES[useTheme.getState().theme].name}
          </span>
        </div>
      </footer>
      </div>
    </>
  );
}
