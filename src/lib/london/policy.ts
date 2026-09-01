// ============================================================================
// KRUPP CAPITAL // DESK RISK POLICY
// Desk-configurable interceptor thresholds for the Navier-Stokes risk kernel.
// Spec defaults: LOCK chaos>0.85 · SCALE viscosity<55% · KILL score>75.
// Thresholds persist to localStorage and hot-load into the worker thread.
// ============================================================================

export interface DeskPolicy {
  /** [LOCK] arm when Shannon entropy exceeds this */
  lockChaos: number
  /** [SCALE] arm when viscosity ratio (vs baseline) falls below this */
  scaleVisc: number
  /** [KILL] arm when composite risk score exceeds this */
  killScore: number
}

export const POLICY_DEFAULTS: DeskPolicy = {
  lockChaos: 0.85,
  scaleVisc: 0.55,
  killScore: 75,
}

/** hard bounds — the kernel's regime bands (50/75) stay authoritative */
export const POLICY_BOUNDS = {
  lockChaos: { min: 0.6, max: 0.97, step: 0.005 },
  scaleVisc: { min: 0.2, max: 0.9, step: 0.01 },
  killScore: { min: 60, max: 92, step: 0.5 },
} as const

const LS_KEY = 'krupp.policy'

function clamp(v: number, b: { min: number; max: number }): number {
  if (!Number.isFinite(v)) return b.min
  return Math.min(b.max, Math.max(b.min, v))
}

export function sanitizePolicy(raw: unknown): DeskPolicy {
  const r = (raw ?? {}) as Partial<DeskPolicy>
  return {
    lockChaos: clamp(Number(r.lockChaos ?? POLICY_DEFAULTS.lockChaos), POLICY_BOUNDS.lockChaos),
    scaleVisc: clamp(Number(r.scaleVisc ?? POLICY_DEFAULTS.scaleVisc), POLICY_BOUNDS.scaleVisc),
    killScore: clamp(Number(r.killScore ?? POLICY_DEFAULTS.killScore), POLICY_BOUNDS.killScore),
  }
}

export function loadPolicy(): DeskPolicy {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (!s) return { ...POLICY_DEFAULTS }
    return sanitizePolicy(JSON.parse(s))
  } catch {
    return { ...POLICY_DEFAULTS }
  }
}

export function savePolicy(p: DeskPolicy): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch { /* storage unavailable — policy stays session-local */ }
}

/** distance from spec — used for the policy-drift indicator */
export function policyDrift(p: DeskPolicy): number {
  return (
    Math.abs(p.lockChaos - POLICY_DEFAULTS.lockChaos) +
    Math.abs(p.scaleVisc - POLICY_DEFAULTS.scaleVisc) +
    Math.abs(p.killScore - POLICY_DEFAULTS.killScore) / 100
  )
}

// --- named policy profiles (desk desk-profile manager) -----------------------
// Profiles live in localStorage (`krupp.policyProfiles`); the ACTIVE pointer
// (`krupp.policyActive`) names the profile the current thresholds came from
// (null = spec / ad-hoc). Load applies through applyPolicy → worker hot-load.

export interface PolicyProfile {
  name: string
  policy: DeskPolicy
  ts: number
}

const PROFILES_KEY = 'krupp.policyProfiles'
const ACTIVE_KEY = 'krupp.policyActive'

export function loadProfiles(): PolicyProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p.name === 'string' && p.policy)
      .slice(0, 24)
      .map((p) => ({ name: String(p.name).slice(0, 24), policy: sanitizePolicy(p.policy), ts: Number(p.ts) || 0 }))
  } catch {
    return []
  }
}

function persistProfiles(list: PolicyProfile[]): void {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list.slice(0, 24))) } catch { /* storage unavailable */ }
}

export function saveProfile(name: string, p: DeskPolicy): PolicyProfile[] {
  const clean = name.trim().slice(0, 24) || `PROFILE-${Date.now() % 10000}`
  const list = loadProfiles().filter((x) => x.name !== clean)
  list.unshift({ name: clean, policy: sanitizePolicy(p), ts: Date.now() })
  persistProfiles(list)
  setActiveProfileName(clean)
  return list
}

export function deleteProfile(name: string): PolicyProfile[] {
  const list = loadProfiles().filter((x) => x.name !== name)
  persistProfiles(list)
  if (getActiveProfileName() === name) setActiveProfileName(null)
  return list
}

export function getActiveProfileName(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
}

export function setActiveProfileName(name: string | null): void {
  try {
    if (name) localStorage.setItem(ACTIVE_KEY, name)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch { /* storage unavailable */ }
}

// --- profile portability (desk ⇄ desk JSON round-trip) ----------------------
// Export: versioned JSON envelope with the full profile list (NOT the active
// pointer — importing is additive, it never hijacks the current kernel state).
// Import: sanitize everything, dedupe by name with -N suffixes, cap 24.

const EXPORT_VERSION = 1

export function exportProfiles(): string {
  return JSON.stringify({
    kind: 'krupp.policyProfiles',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profiles: loadProfiles(),
  }, null, 2)
}

export interface ImportResult { added: number; skipped: number; names: string[] }

export function importProfiles(json: string): ImportResult {
  const res: ImportResult = { added: 0, skipped: 0, names: [] }
  let parsed: any
  try {
    parsed = JSON.parse(json)
  } catch {
    return res // unparsable → nothing imported
  }
  const incoming: unknown[] = Array.isArray(parsed)
    ? parsed // tolerate a bare array too
    : parsed?.kind === 'krupp.policyProfiles' && Array.isArray(parsed?.profiles)
      ? parsed.profiles
      : []
  if (incoming.length === 0) return res

  const list = loadProfiles()
  const names = new Set(list.map((p) => p.name))
  for (const raw of incoming) {
    if (res.added + list.length >= 24) { res.skipped++; continue }
    const p = raw as Partial<PolicyProfile>
    if (!p || typeof p !== 'object' || !p.policy) { res.skipped++; continue }
    let name = String(p.name ?? '').trim().slice(0, 24) || 'IMPORT'
    let n = 2
    while (names.has(name)) name = `${String(p.name ?? 'IMPORT').trim().slice(0, 20)}-${n++}`
    names.add(name)
    list.push({ name, policy: sanitizePolicy(p.policy), ts: Number(p.ts) || Date.now() })
    res.added++
    res.names.push(name)
  }
  if (res.added > 0) persistProfiles(list)
  return res
}

// --- worker sink wiring -----------------------------------------------------
// The feed orchestrator registers a sink (posts to the risk worker); the policy
// panel / command palette call applyPolicy(). Module-level to avoid import cycles.
type Sink = (p: DeskPolicy) => void
let sink: Sink | null = null
let current: DeskPolicy | null = null

export function setPolicySink(fn: Sink | null): void {
  sink = fn
  if (sink && current) sink(current)
}

/** Update the active policy everywhere (worker + persistence). */
export function applyPolicy(p: DeskPolicy): DeskPolicy {
  current = sanitizePolicy(p)
  savePolicy(current)
  try { sink?.(current) } catch { /* worker not ready yet */ }
  return current
}
