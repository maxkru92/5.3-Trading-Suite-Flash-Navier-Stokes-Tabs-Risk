'use client';
/**
 * KRUPP CAPITAL // DUAL-COLOURLINE THEME KERNEL
 *
 * Two institutional palettes live side by side and every surface, chart,
 * glow and semantic tone resolves through this single token registry:
 *
 *  - 'mk2' — KRUPP CAPITAL TERMINAL MK-II (navy-black #05070b, cyan accent,
 *            multi-hue desk accents: cyan/violet/emerald/amber/teal/rose)
 *            → reference colourline of the 13-desk matrix suite. DEFAULT.
 *  - 'hft' — LONDON STRATEGIC EDGE HFT MATRIX (void-black #020202, #00ff66
 *            phosphor-green accent, cyber-cyan / crimson / warning-orange)
 *            → colourline of the L3 Risk Desk frontend.
 *
 * The active theme is applied twice:
 *  1. CSS layer — <html data-theme="…"> switches every --color-* / --k-*
 *     custom property in globals.css (Tailwind v4 palette vars included).
 *  2. JS layer — canvas draw closures / inline styles call KT('token') to
 *     resolve the same values. The app shell remounts on theme change, so
 *     every chart re-renders against the fresh palette.
 */

export type ThemeId = 'mk2' | 'hft';

export interface ThemeTokens {
  /* display name */
  name: string;
  tag: string;

  /* ---- surfaces ---- */
  bg: string;          // page background
  bgDeep: string;      // deepest wells / recessed canvas floors
  panel: string;       // standard panel fill
  panel2: string;      // raised chip / alt panel fill
  header: string;      // header + status bar fill
  inset: string;       // input / inset controls fill

  /* ---- borders ---- */
  border: string;      // standard hairline
  border2: string;     // chip / control border
  border3: string;     // panel-header hairline (softer)
  border4: string;     // hover / focus border
  grid: string;        // chart gridline

  /* ---- text ---- */
  text: string;        // primary
  textDim: string;     // secondary
  textMuted: string;   // labels
  textFaint: string;   // faint / disabled

  /* ---- semantics ---- */
  up: string;          // positive delta
  upDeep: string;      // positive fill / strong
  down: string;        // negative delta
  downDeep: string;    // negative fill / strong
  warn: string;        // warning
  warnDeep: string;    // warning strong
  warnSoft: string;    // warning pale (SVG fills / soft highlights)
  downSoft: string;    // negative pale (SVG fills / soft highlights)
  crit: string;        // critical / crisis

  /* ---- series accents (charts) ---- */
  accent: string;      // brand accent (MK-II cyan / HFT green)
  accentSoft: string;  // lighter brand accent
  cyan: string;
  violet: string;
  teal: string;
  orange: string;
  yellow: string;
  rose: string;
  emerald: string;
  zinc: string;        // neutral series / dashed comparators
  axisFaint: string;   // chart axis ticks
  textOnCanvas: string; // bright canvas labels

  /* ---- glows (rgba) ---- */
  glowAccent: string;
  glowCyan: string;
  glowUp: string;
  glowDown: string;
  glowWarn: string;

  /* ---- boot screen ---- */
  bootBg: string;
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  mk2: {
    name: 'MK-II NAVY',
    tag: 'KRUPP CAPITAL MK-II — INSTITUTIONAL NAVY / CYAN',

    bg: '#05070b',
    bgDeep: '#080c14',
    panel: '#0a0e17',
    panel2: '#0f1524',
    header: '#070a12',
    inset: '#10151f',

    border: '#161d2c',
    border2: '#1c2333',
    border3: '#141b29',
    border4: '#2a3448',
    grid: '#1a2231',

    text: '#e4e4e7',
    textDim: '#d4d4d8',
    textMuted: '#71717a',
    textFaint: '#52525b',

    up: '#34d399',
    upDeep: '#10b981',
    down: '#fb7185',
    downDeep: '#f43f5e',
    warn: '#fbbf24',
    warnDeep: '#f59e0b',
    warnSoft: '#fcd34d',
    downSoft: '#fda4af',
    crit: '#f43f5e',

    accent: '#22d3ee',
    accentSoft: '#67e8f9',
    cyan: '#22d3ee',
    violet: '#a78bfa',
    teal: '#2dd4bf',
    orange: '#fb923c',
    yellow: '#facc15',
    rose: '#fb7185',
    emerald: '#34d399',
    zinc: '#8b93a7',
    axisFaint: '#4b5568',
    textOnCanvas: '#e4e4e7',

    glowAccent: 'rgba(34, 211, 238, 0.30)',
    glowCyan: 'rgba(34, 211, 238, 0.30)',
    glowUp: 'rgba(52, 211, 153, 0.30)',
    glowDown: 'rgba(244, 63, 94, 0.35)',
    glowWarn: 'rgba(251, 191, 36, 0.30)',

    bootBg: '#05070b',
  },

  hft: {
    name: 'HFT MATRIX',
    tag: 'LONDON STRATEGIC EDGE — VOID-BLACK PHOSPHOR GREEN',

    bg: '#020202',
    bgDeep: '#030308',
    panel: '#08080c',
    panel2: '#0b0b12',
    header: '#06060a',
    inset: '#05050b',

    border: '#1a1a24',
    border2: '#232330',
    border3: '#15151f',
    border4: '#2a2a38',
    grid: '#1a1a24',

    text: '#d8ffe9',
    textDim: '#b8c9c0',
    textMuted: '#5c6b64',
    textFaint: '#3d4a42',

    up: '#00ff66',
    upDeep: '#00ff66',
    down: '#ff1133',
    downDeep: '#ff1133',
    warn: '#ff8800',
    warnDeep: '#ff8800',
    warnSoft: '#ffcc66',
    downSoft: '#ffb3bd',
    crit: '#ff1133',

    accent: '#00ff66',
    accentSoft: '#7dffc0',
    cyan: '#00e5ff',
    violet: '#9d00ff',
    teal: '#00e5cc',
    orange: '#ff8800',
    yellow: '#ffd166',
    rose: '#ff1133',
    emerald: '#00ff66',
    zinc: '#7d8f86',
    axisFaint: '#4a5462',
    textOnCanvas: '#d8ffe9',

    glowAccent: 'rgba(0, 255, 102, 0.30)',
    glowCyan: 'rgba(0, 229, 255, 0.32)',
    glowUp: 'rgba(0, 255, 102, 0.30)',
    glowDown: 'rgba(255, 17, 51, 0.38)',
    glowWarn: 'rgba(255, 136, 0, 0.32)',

    bootBg: '#020202',
  },
};

export const THEME_ORDER: ThemeId[] = ['mk2', 'hft'];
export const DEFAULT_THEME: ThemeId = 'mk2';
const STORAGE_KEY = 'krupp-colourline';

/* ------------------------------------------------------------------ */
/* zustand store + persistence                                         */
/* ------------------------------------------------------------------ */
import { create } from 'zustand';

interface ThemeStore {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  toggleTheme: () => void;
}

function readStored(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'hft' || v === 'mk2' ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function persist(t: ThemeId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* storage unavailable */
  }
}

export const useTheme = create<ThemeStore>((set, get) => ({
  theme: DEFAULT_THEME,
  setTheme: (t) => {
    persist(t);
    applyThemeAttr(t);
    syncThemeRuntime(t);
    set({ theme: t });
  },
  toggleTheme: () => {
    const next: ThemeId = get().theme === 'mk2' ? 'hft' : 'mk2';
    get().setTheme(next);
  },
}));

/** Initialize store from localStorage during first client render. */
export function hydrateTheme() {
  const t = readStored();
  applyThemeAttr(t);
  syncThemeRuntime(t);
  useTheme.setState({ theme: t });
}

export function applyThemeAttr(t: ThemeId) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = t;
  }
}

/* ------------------------------------------------------------------ */
/* JS-side token resolver — safe in canvas draw closures & styles      */
/* ------------------------------------------------------------------ */
let current: ThemeId = DEFAULT_THEME;

/** Keep the module-level resolver in sync (called on every apply). */
export function syncThemeRuntime(t: ThemeId) {
  current = t;
}
syncThemeRuntime(readStored());

/** Resolve a colour token for the ACTIVE theme. */
export function KT(token: keyof Omit<ThemeTokens, 'name' | 'tag'>): string {
  return THEMES[current][token];
}

/** Current theme id (module scope, non-reactive). */
export function currentTheme(): ThemeId {
  return current;
}
