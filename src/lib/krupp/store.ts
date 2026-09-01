/**
 * KRUPP CAPITAL — Global Workspace Store (Zustand)
 *
 * DESIGN CONTRACT (state guardrails):
 *  - The engine & services mutate module-level state OUTSIDE React.
 *  - This store only carries a tiny `revision` counter bumped each engine
 *    tick, plus workspace navigation state (active tab / sub-tab / selection).
 *  - Switching tabs or sub-tabs NEVER clears background calculations or
 *    disconnects streaming workers: they live at module scope.
 *
 * PERSISTENCE: workspace navigation (active tab, per-desk sub-tabs, desk
 * selections) survives reloads via localStorage ('krupp-workspace'). Only the
 * three navigation fields are written — never the 5 Hz revision counter.
 *
 * LAYOUT PRESETS: named workspace snapshots (active tab + sub-tabs +
 * selections + pins) stored under 'krupp-presets' — a SEPARATE key so the
 * layout factory reset never destroys saved presets.
 */
import { create } from 'zustand';

const WS_KEY = 'krupp-workspace';
const PRESETS_KEY = 'krupp-presets';
const MAX_PRESETS = 12;
const MAX_NAME = 24;

/** A named workspace layout snapshot. */
export interface WorkspaceSnapshot {
  activeTab: number;
  subTabs: Record<number, number>;
  selection: Record<string, string>;
  favs: number[];
  savedAt: number;
}

export type PresetSaveResult = 'ok' | 'overwrite-ok' | 'overwrite-needed' | 'full' | 'invalid';

interface KruppState {
  /** bumped by the market engine every tick (5 Hz) */
  revision: number;
  activeTab: number;
  subTabs: Record<number, number>;
  selection: Record<string, string>;
  /** pinned desks (favourites) — rendered with a ★ marker in the tab rail */
  favs: number[];
  /** named workspace layout snapshots ('krupp-presets', survives factory reset) */
  presets: Record<string, WorkspaceSnapshot>;
  setActiveTab(t: number): void;
  setSubTab(desk: number, i: number): void;
  select(key: string, sym: string): void;
  toggleFav(t: number): void;
  /** reorder the pinned-desk quick rail: move tab `from` to the position of
   *  tab `to` inside the favs order (drag & drop persistence) */
  moveFav(from: number, to: number): void;
  /** snapshot the CURRENT layout under `name` (trimmed, ≤24 chars).
   *  'invalid' — bad name · 'full' — store at 12 slots and new name
   *  'overwrite-needed' — name exists, call again with overwrite=true
   *  'overwrite-ok' — replaced an existing snapshot · 'ok' — new slot */
  savePreset(name: string, overwrite?: boolean): PresetSaveResult;
  /** restore a named snapshot into the live workspace (validated) */
  applyPreset(name: string): boolean;
  /** delete a named snapshot */
  deletePreset(name: string): void;
  /** wipe all persisted workspace state (pins / sub-tabs / selections) and
   *  return to the LONDON EDGE landing tab — layout factory reset.
   *  Preserved: saved layout presets (separate storage key). */
  resetWorkspace(): void;
  bump(): void;
}

function loadWorkspace(): { activeTab: number; subTabs: Record<number, number>; selection: Record<string, string>; favs: number[] } {
  const empty = { activeTab: 0, subTabs: {}, selection: {}, favs: [] as number[] };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(WS_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<{ activeTab: number; subTabs: Record<number, number>; selection: Record<string, string>; favs: number[] }>;
    const tab = typeof p.activeTab === 'number' && p.activeTab >= 0 && p.activeTab <= 13 ? p.activeTab : 0;
    const favs = Array.isArray(p.favs) ? p.favs.filter((f) => Number.isInteger(f) && f >= 0 && f <= 13).slice(0, 14) : [];
    return {
      activeTab: tab,
      subTabs: p.subTabs && typeof p.subTabs === 'object' ? p.subTabs : {},
      selection: p.selection && typeof p.selection === 'object' ? p.selection : {},
      favs,
    };
  } catch {
    return empty;
  }
}

function persistWorkspace(s: Pick<KruppState, 'activeTab' | 'subTabs' | 'selection' | 'favs'>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      WS_KEY,
      JSON.stringify({ activeTab: s.activeTab, subTabs: s.subTabs, selection: s.selection, favs: s.favs }),
    );
  } catch {
    /* storage unavailable */
  }
}

function loadPresets(): Record<string, WorkspaceSnapshot> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, WorkspaceSnapshot> = {};
    for (const [name, v] of Object.entries(p)) {
      const key = name.trim().slice(0, MAX_NAME);
      const s = v as Partial<WorkspaceSnapshot>;
      if (!key || !s || typeof s !== 'object') continue;
      if (typeof s.activeTab !== 'number' || s.activeTab < 0 || s.activeTab > 13) continue;
      if (typeof s.savedAt !== 'number') continue;
      const favs = Array.isArray(s.favs)
        ? s.favs.filter((f) => Number.isInteger(f) && f >= 0 && f <= 13).slice(0, 14)
        : [];
      out[key] = {
        activeTab: s.activeTab,
        subTabs: s.subTabs && typeof s.subTabs === 'object' ? s.subTabs : {},
        selection: s.selection && typeof s.selection === 'object' ? s.selection : {},
        favs,
        savedAt: s.savedAt,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistPresets(presets: Record<string, WorkspaceSnapshot>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* storage unavailable */
  }
}

const boot = loadWorkspace();
const bootPresets = loadPresets();

export const useKrupp = create<KruppState>()((set, get) => ({
  revision: 0,
  activeTab: boot.activeTab,
  subTabs: boot.subTabs,
  selection: boot.selection,
  favs: boot.favs,
  presets: bootPresets,
  setActiveTab: (t) => {
    set({ activeTab: t });
    persistWorkspace(get());
  },
  setSubTab: (desk, i) => {
    set((s) => ({ subTabs: { ...s.subTabs, [desk]: i } }));
    persistWorkspace(get());
  },
  select: (key, sym) => {
    set((s) => ({ selection: { ...s.selection, [key]: sym } }));
    persistWorkspace(get());
  },
  toggleFav: (t) => {
    set((s) => ({
      favs: s.favs.includes(t) ? s.favs.filter((f) => f !== t) : [...s.favs, t],
    }));
    persistWorkspace(get());
  },
  moveFav: (from, to) => {
    set((s) => {
      const i = s.favs.indexOf(from);
      const j = s.favs.indexOf(to);
      if (i === -1 || j === -1 || i === j) return s;
      const favs = [...s.favs];
      favs.splice(i, 1);
      favs.splice(j, 0, from);
      return { favs };
    });
    persistWorkspace(get());
  },
  savePreset: (name, overwrite = false) => {
    const key = name.trim().slice(0, MAX_NAME);
    if (!key) return 'invalid';
    const presets = { ...get().presets };
    const exists = key in presets;
    if (exists && !overwrite) return 'overwrite-needed';
    if (!exists && Object.keys(presets).length >= MAX_PRESETS) return 'full';
    const s = get();
    presets[key] = {
      activeTab: s.activeTab,
      subTabs: { ...s.subTabs },
      selection: { ...s.selection },
      favs: [...s.favs],
      savedAt: Date.now(),
    };
    set({ presets });
    persistPresets(presets);
    return exists ? 'overwrite-ok' : 'ok';
  },
  applyPreset: (name) => {
    const key = name.trim().slice(0, MAX_NAME);
    const snap = get().presets[key];
    if (!snap) return false;
    const tab = snap.activeTab >= 0 && snap.activeTab <= 13 ? snap.activeTab : 0;
    const favs = snap.favs.filter((f) => Number.isInteger(f) && f >= 0 && f <= 13);
    set({
      activeTab: tab,
      subTabs: { ...snap.subTabs },
      selection: { ...snap.selection },
      favs,
    });
    persistWorkspace(get());
    return true;
  },
  deletePreset: (name) => {
    const key = name.trim().slice(0, MAX_NAME);
    const presets = { ...get().presets };
    if (!(key in presets)) return;
    delete presets[key];
    set({ presets });
    persistPresets(presets);
  },
  resetWorkspace: () => {
    try {
      window.localStorage.removeItem(WS_KEY);
    } catch {
      /* storage unavailable */
    }
    set({ activeTab: 0, subTabs: {}, selection: {}, favs: [] });
  },
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));

export const useRevision = (): number => useKrupp((s) => s.revision);
export const useSubTab = (desk: number): number => useKrupp((s) => s.subTabs[desk] ?? 0);
export const useSelected = (key: string, fallback: string): string =>
  useKrupp((s) => s.selection[key] ?? fallback);
