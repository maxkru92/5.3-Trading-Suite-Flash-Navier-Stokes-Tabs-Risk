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
 * layout factory reset never destroys saved presets. On the very first boot
 * (key absent) a demo 'MORNING BOOK' preset is seeded for discoverability —
 * deleting it is respected forever (the key then exists, even as '{}').
 *
 * UI SLICE: `presetsOpen` lives in the store (not in the Shell) so ANY
 * surface — the 13-desk ⌘K palette, the P hotkey on desks AND the LONDON
 * EDGE landing palette — can open the same presets dialog.
 */
import { create } from 'zustand';

const WS_KEY = 'krupp-workspace';
const PRESETS_KEY = 'krupp-presets';
const SFX_KEY = 'krupp-sfx';
const CLIENT_ID_KEY = 'krupp-client-id';
const DWELL_KEY = 'krupp-dwell';
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
export type PresetRenameResult = 'ok' | 'invalid' | 'exists';
export type PresetDuplicateResult = 'ok' | 'full' | 'invalid';

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
  /** master sfx gate — desk alert chirps / crisis klaxon / regime siren
   *  (persisted 'krupp-sfx'; the landing alarm toggle is the london store's
   *  own soundOn — both read the SAME kernel gate via setSfxGate) */
  sfxOn: boolean;
  /** shared UI slice — the presets dialog is reachable from every surface */
  presetsOpen: boolean;
  /** shared UI slice — the session-journal dialog (J hotkey, ⌘K, rail chip) */
  journalOpen: boolean;
  /** shared UI slice — the post-mortem digest dialog (G hotkey, ⌘K, rail chip) */
  digestOpen: boolean;
  /** per-desk dwell time (accumulated ms, persisted 'krupp-dwell') — feeds
   *  the digest's TIME ON DESKS breakdown; survives reloads, survives the
   *  layout factory reset (analytics, not layout) */
  dwell: Record<number, number>;
  /** charge the pending dwell chunk to the ACTIVE tab + persist (60s Shell
   *  heartbeat + pagehide + tab switches all route here) */
  tickDwell(): void;
  /** zero the dwell ledger ('krupp-dwell' cleared) — audit-friendly */
  resetDwell(): void;
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
  /** rename a snapshot (snapshot + savedAt preserved). 'invalid' — bad
   *  source/target name · 'exists' — target name already in use */
  renamePreset(from: string, to: string): PresetRenameResult;
  /** duplicate a snapshot under "NAME COPY" / "NAME #n" (new savedAt).
   *  'full' — store at 12 slots · 'invalid' — unknown source name */
  duplicatePreset(name: string): PresetDuplicateResult;
  /** open/close the layout-presets dialog (global UI slice) */
  setPresetsOpen(v: boolean): void;
  /** open/close the session-journal dialog (global UI slice) */
  setJournalOpen(v: boolean): void;
  /** open/close the post-mortem digest dialog (global UI slice) */
  setDigestOpen(v: boolean): void;
  /** flip the master sfx gate (persisted) */
  toggleSfx(): void;
  /** stable per-browser desk identity for journal rows ('krupp-client-id') */
  clientId(): string;
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

function hydrateSfx(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SFX_KEY) === '1';
  } catch {
    return false;
  }
}

/* ---- r11: PER-DESK DWELL TIME -------------------------------------------
 * Accumulated wall-clock ms per tab, persisted under 'krupp-dwell' and fed
 * to the post-mortem digest's TIME ON DESKS section. Flush points: every
 * setActiveTab, a 60s Shell heartbeat, and pagehide — so long sessions stay
 * fresh even without tab switches. Elapsed chunks clamp at 5 minutes (a
 * sleeping laptop must not book hours of phantom dwell). ---------------- */
let lastDwellAt = Date.now();

function loadDwell(): Record<number, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DWELL_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(p)) {
      const tab = Number(k);
      if (Number.isInteger(tab) && tab >= 0 && tab <= 13 && typeof v === 'number' && isFinite(v) && v >= 0) {
        out[tab] = Math.min(v, 1000 * 3600 * 24 * 7); // sanity cap: 7d per tab
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistDwell(dwell: Record<number, number>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DWELL_KEY, JSON.stringify(dwell));
  } catch {
    /* storage unavailable */
  }
}

/** charge the elapsed chunk to `activeTab` and move the flush marker */
function flushDwell(dwell: Record<number, number>, activeTab: number): Record<number, number> {
  const now = Date.now();
  const dt = Math.min(Math.max(0, now - lastDwellAt), 5 * 60_000);
  lastDwellAt = now;
  if (dt < 1_000) return dwell; // sub-second churn — not worth a write
  return { ...dwell, [activeTab]: (dwell[activeTab] ?? 0) + dt };
}

const boot = loadWorkspace();
const bootPresets = loadPresets();

/** FIRST-BOOT SEED: if the presets key has NEVER existed, plant a demo
 *  'MORNING BOOK' snapshot so the presets system is discoverable (pinned
 *  OPTIONS & RISK + INDEX FUTURES quick rail). Deleting every preset writes
 *  '{}' — the key then exists and no seed ever returns. */
function seedPresetsOnFirstBoot(): Record<string, WorkspaceSnapshot> {
  if (typeof window === 'undefined') return bootPresets;
  try {
    if (window.localStorage.getItem(PRESETS_KEY) !== null) return bootPresets;
    const seeded: Record<string, WorkspaceSnapshot> = {
      'MORNING BOOK': {
        activeTab: 0,
        subTabs: {},
        selection: {},
        favs: [2, 3],
        savedAt: Date.now(),
      },
    };
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return bootPresets;
  }
}

export const useKrupp = create<KruppState>()((set, get) => ({
  revision: 0,
  activeTab: boot.activeTab,
  subTabs: boot.subTabs,
  selection: boot.selection,
  favs: boot.favs,
  presets: seedPresetsOnFirstBoot(),
  sfxOn: hydrateSfx(),
  presetsOpen: false,
  journalOpen: false,
  digestOpen: false,
  dwell: loadDwell(),
  tickDwell: () => {
    const dwell = flushDwell(get().dwell, get().activeTab);
    set({ dwell });
    persistDwell(dwell);
  },
  resetDwell: () => {
    lastDwellAt = Date.now();
    set({ dwell: {} });
    persistDwell({});
  },
  setPresetsOpen: (v) => set({ presetsOpen: v }),
  setJournalOpen: (v) => set({ journalOpen: v }),
  setDigestOpen: (v) => set({ digestOpen: v }),
  toggleSfx: () => {
    const sfxOn = !get().sfxOn;
    set({ sfxOn });
    try {
      window.localStorage.setItem(SFX_KEY, sfxOn ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  },
  clientId: () => {
    try {
      let id = window.localStorage.getItem(CLIENT_ID_KEY);
      if (!id) {
        id = `desk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        window.localStorage.setItem(CLIENT_ID_KEY, id);
      }
      return id;
    } catch {
      return 'desk-anon';
    }
  },
  setActiveTab: (t) => {
    // charge the pending dwell chunk to the tab being LEFT before the switch
    const dwell = flushDwell(get().dwell, get().activeTab);
    set({ activeTab: t, dwell });
    persistWorkspace(get());
    persistDwell(dwell);
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
  renamePreset: (from, to) => {
    const keyFrom = from.trim().slice(0, MAX_NAME);
    const keyTo = to.trim().slice(0, MAX_NAME);
    const presets = { ...get().presets };
    if (!keyTo || !(keyFrom in presets)) return 'invalid';
    if (keyTo === keyFrom) return 'ok';
    if (keyTo in presets) return 'exists';
    presets[keyTo] = presets[keyFrom];
    delete presets[keyFrom];
    set({ presets });
    persistPresets(presets);
    return 'ok';
  },
  duplicatePreset: (name) => {
    const key = name.trim().slice(0, MAX_NAME);
    const presets = { ...get().presets };
    const snap = presets[key];
    if (!snap) return 'invalid';
    if (Object.keys(presets).length >= MAX_PRESETS) return 'full';
    let dup = `${key} COPY`;
    let n = 2;
    while (dup in presets) {
      const suffix = ` #${n}`;
      dup = `${key.slice(0, MAX_NAME - suffix.length)}${suffix}`;
      n += 1;
    }
    presets[dup.slice(0, MAX_NAME)] = {
      ...snap,
      subTabs: { ...snap.subTabs },
      selection: { ...snap.selection },
      favs: [...snap.favs],
      savedAt: Date.now(),
    };
    set({ presets });
    persistPresets(presets);
    return 'ok';
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
