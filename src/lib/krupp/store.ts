/**
 * KRUPP CAPITAL — Global Workspace Store (Zustand)
 *
 * DESIGN CONTRACT (state guardrails):
 *  - The engine & services mutate module-level state OUTSIDE React.
 *  - This store only carries a tiny `revision` counter bumped each engine
 *    tick, plus workspace navigation state (active tab / sub-tab / selection).
 *  - Switching tabs or sub-tabs NEVER clears background calculations or
 *    disconnects streaming workers: they live at module scope.
 */
import { create } from 'zustand';

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

export const useKrupp = create<KruppState>()((set) => ({
  revision: 0,
  activeTab: 0,
  subTabs: {},
  selection: {},
  setActiveTab: (t) => set({ activeTab: t }),
  setSubTab: (desk, i) => set((s) => ({ subTabs: { ...s.subTabs, [desk]: i } })),
  select: (key, sym) => set((s) => ({ selection: { ...s.selection, [key]: sym } })),
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));

export const useRevision = (): number => useKrupp((s) => s.revision);
export const useSubTab = (desk: number): number => useKrupp((s) => s.subTabs[desk] ?? 0);
export const useSelected = (key: string, fallback: string): string =>
  useKrupp((s) => s.selection[key] ?? fallback);
