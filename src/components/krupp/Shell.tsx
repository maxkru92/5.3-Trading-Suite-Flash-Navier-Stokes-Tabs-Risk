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
import {
  Activity, Sigma, TrendingUp, Landmark, Coins, Flame, DollarSign,
  Building2, Layers, Droplets, Bitcoin, Radar, ServerCog,
  TriangleAlert, ShieldCheck, Zap,
} from 'lucide-react';
import { bootstrapKrupp, ms, startCrisis, endCrisis } from '@/lib/krupp/engine';
import { infra } from '@/lib/krupp/infraservice';
import { useKrupp, useRevision } from '@/lib/krupp/store';
import { fClock, fCountdown, fN, fPx, fPct } from '@/lib/krupp/format';
import { hydrateTheme, useTheme, THEMES } from '@/lib/theme';
import { ThemeSwitcher } from './ThemeSwitcher';
import { CrisisOverlay } from './CrisisOverlay';
import LondonEdge from '@/components/london/LondonEdge';
import Desk01Volatility from './desks/Desk01Volatility';
import Desk02Options from './desks/Desk02Options';
import Desk03IndexFutures from './desks/Desk03IndexFutures';
import Desk04Bonds from './desks/Desk04Bonds';
import Desk05Metals from './desks/Desk05Metals';
import Desk06Energies from './desks/Desk06Energies';
import Desk07Fx from './desks/Desk07Fx';
import Desk08Stocks from './desks/Desk08Stocks';
import Desk09Etf from './desks/Desk09Etf';
import Desk10Liquidity from './desks/Desk10Liquidity';
import Desk11Crypto from './desks/Desk11Crypto';
import Desk12StatArb from './desks/Desk12StatArb';
import Desk13Infra from './desks/Desk13Infra';
import { Star } from 'lucide-react';

type TabDef = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  accent: string;
  bar: string;
  Comp: React.ComponentType;
  deskNo?: number; // 1..13 for the 13-desk matrix; undefined for the landing terminal
};

const TABS: TabDef[] = [
  {
    label: 'LONDON EDGE', icon: Zap,
    accent: 'text-kaccent-soft', bar: 'bg-kaccent',
    Comp: LondonEdge,
  },
  { label: 'VOL COMPLEX', icon: Activity, accent: 'text-kaccent-soft', bar: 'bg-kaccent', Comp: Desk01Volatility, deskNo: 1 },
  { label: 'OPTIONS & RISK', icon: Sigma, accent: 'text-violet-300', bar: 'bg-violet-400', Comp: Desk02Options, deskNo: 2 },
  { label: 'INDEX FUTURES', icon: TrendingUp, accent: 'text-emerald-300', bar: 'bg-emerald-400', Comp: Desk03IndexFutures, deskNo: 3 },
  { label: 'BOND FUTURES', icon: Landmark, accent: 'text-amber-300', bar: 'bg-amber-400', Comp: Desk04Bonds, deskNo: 4 },
  { label: 'METALS', icon: Coins, accent: 'text-yellow-300', bar: 'bg-yellow-400', Comp: Desk05Metals, deskNo: 5 },
  { label: 'ENERGIES', icon: Flame, accent: 'text-orange-300', bar: 'bg-orange-400', Comp: Desk06Energies, deskNo: 6 },
  { label: 'FX FUTURES', icon: DollarSign, accent: 'text-teal-300', bar: 'bg-teal-400', Comp: Desk07Fx, deskNo: 7 },
  { label: 'STOCKS', icon: Building2, accent: 'text-kaccent-soft', bar: 'bg-kaccent', Comp: Desk08Stocks, deskNo: 8 },
  { label: 'SPDR & MACRO ETF', icon: Layers, accent: 'text-violet-300', bar: 'bg-violet-400', Comp: Desk09Etf, deskNo: 9 },
  { label: 'CENTRAL BANK LIQ', icon: Droplets, accent: 'text-emerald-300', bar: 'bg-emerald-400', Comp: Desk10Liquidity, deskNo: 10 },
  { label: 'CRYPTO L3 MBO', icon: Bitcoin, accent: 'text-amber-300', bar: 'bg-amber-400', Comp: Desk11Crypto, deskNo: 11 },
  { label: 'STAT ARB & SPREADS', icon: Radar, accent: 'text-rose-300', bar: 'bg-rose-400', Comp: Desk12StatArb, deskNo: 12 },
  { label: 'SYSTEM INFRA', icon: ServerCog, accent: 'text-zinc-300', bar: 'bg-zinc-400', Comp: Desk13Infra, deskNo: 13 },
];

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
    setMounted(true);
  }, []);

  const theme = useTheme((s) => s.theme);
  const activeTab = useKrupp((s) => s.activeTab);
  const setActiveTab = useKrupp((s) => s.setActiveTab);
  const favs = useKrupp((s) => s.favs);
  const toggleFav = useKrupp((s) => s.toggleFav);
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

  /* ---- desk hotkeys: L landing · 1-9/0 desks 01-10 · Q/W/E desks 11-13 ·
         F pin/unpin active desk · V colourline. Plain keys are skipped on the
         LONDON EDGE tab — the landing terminal owns its own single-key routing
         (1/2/3 symbols, C crash, R reset, T engage) ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
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
      if (activeTab === 0) return; // landing terminal owns plain keys
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
  }, [activeTab, setActiveTab, toggleFav]);

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
          <span className="ml-auto hidden sm:inline">ENGINE TICK #{fN(ms.tickCount, 0)}</span>
        </div>
        <Active />
      </main>

      {/* ------------- persistent steering block (hidden on print with the landing report) ------------- */}
      <footer className={`sticky bottom-0 z-40 border-t border-kborder bg-kheader/97 pb-[env(safe-area-inset-bottom)] backdrop-blur ${tab.deskNo === undefined ? 'print:hidden' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {crisis.active ? (
            <>
              <button
                onClick={endCrisis}
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
              onClick={startCrisis}
              className="flex items-center gap-2 rounded border border-rose-700/80 bg-gradient-to-b from-kcrit-deep to-kcrit-black px-4 py-2 font-mono text-[11px] font-black tracking-[0.2em] text-rose-300 transition-all hover:border-rose-500 hover:shadow-[0_0_24px_rgba(225,29,72,0.3)] active:scale-[0.98]"
            >
              <TriangleAlert size={14} />
              SIMULATE MARKET LIQUIDITY CRASH
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
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
              <kbd className="kbd-hint">V</kbd> COLOURLINE
            </span>
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
