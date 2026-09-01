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
 */
import { create } from 'zustand';

const WS_KEY = 'krupp-workspace';

interface KruppState {
  /** bumped by the market engine every tick (5 Hz) */
  revision: number;
  activeTab: number;
  subTabs: Record<number, number>;
  selection: Record<string, string>;
  setActiveTab(t: number): void;
  setSubTab(desk: number, i: number): void;
  select(key: string, sym: string): void;
  bump(): void;
}

function loadWorkspace(): { activeTab: number; subTabs: Record<number, number>; selection: Record<string, string> } {
  if (typeof window === 'undefined') return { activeTab: 0, subTabs: {}, selection: {} };
  try {
    const raw = window.localStorage.getItem(WS_KEY);
    if (!raw) return { activeTab: 0, subTabs: {}, selection: {} };
    const p = JSON.parse(raw) as Partial<{ activeTab: number; subTabs: Record<number, number>; selection: Record<string, string> }>;
    const tab = typeof p.activeTab === 'number' && p.activeTab >= 0 && p.activeTab <= 13 ? p.activeTab : 0;
    return {
      activeTab: tab,
      subTabs: p.subTabs && typeof p.subTabs === 'object' ? p.subTabs : {},
      selection: p.selection && typeof p.selection === 'object' ? p.selection : {},
    };
  } catch {
    return { activeTab: 0, subTabs: {}, selection: {} };
  }
}

function persistWorkspace(s: Pick<KruppState, 'activeTab' | 'subTabs' | 'selection'>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      WS_KEY,
      JSON.stringify({ activeTab: s.activeTab, subTabs: s.subTabs, selection: s.selection }),
    );
  } catch {
    /* storage unavailable */
  }
}

const boot = loadWorkspace();

export const useKrupp = create<KruppState>()((set, get) => ({
  revision: 0,
  activeTab: boot.activeTab,
  subTabs: boot.subTabs,
  selection: boot.selection,
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
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));

export const useRevision = (): number => useKrupp((s) => s.revision);
export const useSubTab = (desk: number): number => useKrupp((s) => s.subTabs[desk] ?? 0);
export const useSelected = (key: string, fallback: string): string =>
  useKrupp((s) => s.selection[key] ?? fallback);
