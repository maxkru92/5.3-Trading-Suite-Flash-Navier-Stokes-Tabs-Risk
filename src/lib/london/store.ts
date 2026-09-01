// ============================================================================
// KRUPP CAPITAL // DESK STORE (zustand)
// ============================================================================

import { create } from 'zustand'
import type { CboeSnapshot, DeskSession, EngineState, Fill, IvSurface, LogLine, LseStatus, OptTicket, Pos, Regime, RiskMetrics, VolSnap } from './types'
import type { AlertRule } from './alerts'
import { cboeHistory } from './cboeHistory'
import { bumpCdelta } from './feed'
import { applyPolicy, loadPolicy, loadProfiles, POLICY_DEFAULTS, setActiveProfileName, type DeskPolicy, type PolicyProfile } from './policy'

export const IDLE_METRICS: RiskMetrics = {
  ts: 0,
  hawkes: 0.1,
  toxZ: 0,
  viscosity: 0,
  viscRatio: 1,
  jerk: 0,
  jerkZ: 0,
  entropy: 0,
  hist: new Array(10).fill(0),
  score: 0,
  regime: 'CALM',
  shock: false,
  interceptors: { lock: false, scale: false, kill: false },
  policy: { lockChaos: 0.85, scaleVisc: 0.55, killScore: 75 },
  reasons: { lock: '', scale: '', kill: '' },
}

interface KruppStore {
  connection: 'connecting' | 'open' | 'closed'
  auth: LseStatus | null
  metrics: RiskMetrics
  logs: LogLine[]
  selectedSym: string
  bookRev: number
  cboe: CboeSnapshot | null
  iv: IvSurface | null
  engine: EngineState | null
  latencyMs: number
  crashUntil: number
  agentStatus: string
  soundOn: boolean
  bootDone: boolean
  paletteOpen: boolean

  // --- autonomous execution ledger ---
  engaged: boolean
  pos: Pos | null
  unrealized: number
  realized: number
  fees: number
  blocks: number
  volume: number
  fills: Fill[]
  realizedRev: number
  fillsRev: number

  // --- ledger persistence / hydration ---
  persistOn: boolean
  ledgerHydrated: boolean
  ledgerTotal: number
  deskSessions: DeskSession[]

  // --- options desk (IV-surface context tickets) ---
  optTickets: OptTicket[]
  optRealized: number
  optFees: number
  optUnrealized: number
  optRev: number
  lastAgentNote: { ts: number; text: string } | null

  // --- desk risk policy (interceptor thresholds) ---
  policy: DeskPolicy
  policyRev: number
  /** apply a policy; pass profile name when loading a named profile, else the pointer clears */
  setPolicy: (p: DeskPolicy, opts?: { silent?: boolean; profile?: string }) => void

  // --- session drill-down (blotter time travel) ---
  drillSession: number | null
  drillFills: Fill[]
  drillLoading: boolean
  setDrill: (idx: number | null, fills?: Fill[]) => void
  setDrillLoading: (b: boolean) => void

  // --- persisted volatility snapshots (cross-boot CBOE/IV history) ---
  volHistory: VolSnap[]
  volSyncOn: boolean
  setVolHistory: (s: VolSnap[]) => void
  pushVolSnap: (s: VolSnap) => void
  setVolSyncOn: (b: boolean) => void

  // --- desk alerts engine (round 8) ---
  /** mirror of the alerts module rules (hydrated client-side — SSR starts empty) */
  alerts: AlertRule[]
  alertsRev: number

  // --- policy profile manager dialog ---
  profilesOpen: boolean
  setProfilesOpen: (b: boolean) => void

  // --- hotkey / desk help overlay ---
  helpOpen: boolean
  setHelpOpen: (b: boolean) => void
  /** named policy profiles (mirror of localStorage — refreshed on dialog open / mutation) */
  deskProfiles: PolicyProfile[]
  refreshProfiles: () => void
  /** name of the active policy profile (mirror of the localStorage pointer) */
  activeProfile: string | null
  setActiveProfile: (n: string | null) => void

  setPersistOn: (b: boolean) => void
  bumpLedgerTotal: () => void
  setLastAgentNote: (text: string) => void
  hydrateLedger: (x: {
    fills: Fill[]; realized: number; fees: number; volume: number; blocks: number
    pos: Pos | null; optTickets: OptTicket[]; optRealized: number; ledgerTotal: number
    deskSessions?: DeskSession[]
  }) => void
  pushOptTicket: (t: OptTicket, fee: number) => void
  closeOptTicket: (id: string, closePx: number, pnl: number, fee: number) => void
  setOptUnrealized: (n: number) => void

  setConnection: (c: KruppStore['connection']) => void
  setAuth: (a: LseStatus) => void
  setMetrics: (m: RiskMetrics) => void
  pushLog: (l: LogLine) => void
  bumpBook: () => void
  selectSym: (s: string) => void
  setCboe: (c: CboeSnapshot) => void
  setIv: (i: IvSurface) => void
  setEngine: (e: EngineState) => void
  setLatency: (n: number) => void
  setCrashUntil: (t: number) => void
  setAgentStatus: (s: string) => void
  toggleSound: () => void
  setBootDone: (b: boolean) => void
  setPaletteOpen: (b: boolean) => void
  setEngaged: (b: boolean) => void
  setUnrealized: (n: number) => void
  pushFill: (f: Fill) => void
  bumpBlocks: () => void
  applyExecution: (x: { realizedDelta: number; feeDelta: number; pos: Pos | null; volume: number }) => void
}

const MAX_LOGS = 240

// SSR-safe: the store ALWAYS initializes to spec defaults; desk-local overrides
// (localStorage policy + profile pointer) are applied in the feed's client-only
// effect AFTER hydration — reading localStorage at store creation desyncs the
// server HTML from the client's first render (React hydration error).
const POLICY_FALLBACK: DeskPolicy = { ...POLICY_DEFAULTS }

// --- alert sound preference (persisted) -------------------------------------
// localStorage `krupp.sound` — hydrated client-side in the feed effect
// (SSR-safe: never read at module scope init for the React tree).
const SOUND_KEY = 'krupp.sound'
export function hydrateSound(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(SOUND_KEY)
    if (raw != null) useKrupp.setState({ soundOn: raw === '1' })
  } catch { /* storage unavailable */ }
}

export const useKrupp = create<KruppStore>((set) => ({
  connection: 'connecting',
  auth: null,
  metrics: IDLE_METRICS,
  logs: [],
  selectedSym: 'ES',
  bookRev: 0,
  cboe: null,
  iv: null,
  engine: null,
  latencyMs: 0,
  crashUntil: 0,
  agentStatus: 'STANDBY',
  soundOn: false,
  bootDone: false,
  paletteOpen: false,

  // autonomous execution ledger
  engaged: true,
  pos: null,
  unrealized: 0,
  realized: 0,
  fees: 0,
  blocks: 0,
  volume: 0,
  fills: [],
  realizedRev: 0,
  fillsRev: 0,

  // persistence / hydration
  persistOn: true,
  ledgerHydrated: false,
  ledgerTotal: 0,
  deskSessions: [],

  // options desk
  optTickets: [],
  optRealized: 0,
  optFees: 0,
  optUnrealized: 0,
  optRev: 0,
  lastAgentNote: null,

  // desk risk policy (loaded from localStorage on first client access)
  policy: POLICY_FALLBACK,
  policyRev: 0,

  // session drill-down
  drillSession: null,
  drillFills: [],
  drillLoading: false,

  // persisted volatility snapshots
  volHistory: [],
  volSyncOn: false,

  // desk alerts engine (round 8) — hydrated client-side like policy (SSR-safe)
  alerts: [],
  alertsRev: 0,

  // policy profile manager
  profilesOpen: false,
  deskProfiles: [],
  activeProfile: null, // hydrated from localStorage in the feed effect (SSR-safe)

  // hotkey / desk help overlay
  helpOpen: false,

  setPersistOn: (persistOn) => set({ persistOn }),
  bumpLedgerTotal: () => set((s) => ({ ledgerTotal: s.ledgerTotal + 1 })),
  setLastAgentNote: (text) => set({ lastAgentNote: { ts: Date.now(), text } }),
  hydrateLedger: ({ fills, realized, fees, volume, blocks, pos, optTickets, optRealized, ledgerTotal, deskSessions }) =>
    set({
      fills: fills.slice(-60),
      realized,
      fees,
      volume,
      blocks,
      pos,
      optTickets: optTickets.slice(-24),
      optRealized,
      ledgerTotal,
      deskSessions: deskSessions ?? [],
      ledgerHydrated: true,
      fillsRev: Date.now(), // force downstream memo refresh
    }),
  pushOptTicket: (t, fee) =>
    set((s) => ({
      optTickets: [...s.optTickets.slice(-23), t],
      optFees: s.optFees + fee,
      optRev: s.optRev + 1,
    })),
  closeOptTicket: (id, closePx, pnl, fee) =>
    set((s) => ({
      optTickets: s.optTickets.map((t) =>
        t.id === id ? { ...t, status: 'CLOSED' as const, closePx, pnl } : t,
      ),
      optRealized: s.optRealized + pnl,
      optFees: s.optFees + fee,
      optRev: s.optRev + 1,
    })),
  setOptUnrealized: (optUnrealized) => set({ optUnrealized }),

  setPolicy: (p, opts) => {
    const applied = applyPolicy(p)
    // profile pointer: only a named-profile LOAD keeps it; manual slider moves,
    // presets and SPEC resets deviate from the named profile → pointer clears
    setActiveProfileName(opts?.profile ?? null)
    set((s) => ({ policy: applied, policyRev: s.policyRev + 1, activeProfile: opts?.profile ?? null }))
    if (!opts?.silent) {
      set((s) => ({
        logs: [...s.logs.slice(-MAX_LOGS), {
          id: `pol-${Date.now()}`, ts: Date.now(), source: 'RISK', level: 'warn' as const,
          message: `[RISK] Desk policy updated — LOCK chaos>${applied.lockChaos.toFixed(2)} · SCALE visc<${Math.round(applied.scaleVisc * 100)}% · KILL score>${applied.killScore.toFixed(0)}`,
        }],
      }))
    }
  },

  setDrill: (drillSession, fills) => set({ drillSession, drillFills: fills ?? [], drillLoading: false }),
  setDrillLoading: (drillLoading) => set({ drillLoading }),

  // persisted vol snapshots (client-side cap 720 rows)
  setVolHistory: (volHistory) => set({ volHistory }),
  pushVolSnap: (snap) => set((s) => ({ volHistory: [...s.volHistory.slice(-719), snap] })),
  setVolSyncOn: (volSyncOn) => set({ volSyncOn }),

  setProfilesOpen: (profilesOpen) => set({ profilesOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  refreshProfiles: () => set({ deskProfiles: loadProfiles() }),
  setActiveProfile: (activeProfile) => set({ activeProfile }),

  setConnection: (connection) => set({ connection }),
  setAuth: (auth) => set({ auth }),
  setMetrics: (metrics) => set({ metrics }),
  pushLog: (l) => set((s) => ({ logs: [...s.logs.slice(-MAX_LOGS), l] })),
  bumpBook: () => set((s) => ({ bookRev: s.bookRev + 1 })),
  selectSym: (selectedSym) => set({ selectedSym }),
  setCboe: (cboe) => {
    // rolling VIX / P-C history for micro-charts
    cboeHistory.vix.push(cboe.vix)
    cboeHistory.pc.push(cboe.pcRatio)
    set({ cboe })
  },
  setIv: (iv) => set({ iv }),
  setEngine: (engine) => set({ engine }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setCrashUntil: (crashUntil) => set({ crashUntil }),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  toggleSound: () =>
    set((s) => {
      const soundOn = !s.soundOn
      try { window.localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0') } catch { /* storage unavailable */ }
      return { soundOn }
    }),
  setBootDone: (bootDone) => set({ bootDone }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setEngaged: (engaged) => set({ engaged }),
  setUnrealized: (unrealized) => set({ unrealized }),
  pushFill: (f) => set((s) => ({ fills: [...s.fills.slice(-59), f], fillsRev: s.fillsRev + 1 })),
  bumpBlocks: () => set((s) => ({ blocks: s.blocks + 1 })),
  applyExecution: ({ realizedDelta, feeDelta, pos, volume }) =>
    set((s) => ({
      pos,
      realized: s.realized + realizedDelta,
      fees: s.fees + feeDelta,
      volume: s.volume + volume,
      realizedRev: s.realizedRev + 1,
    })),
}))
