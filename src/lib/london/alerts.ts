// ============================================================================
// KRUPP CAPITAL // DESK ALERTS ENGINE (round 8)
// Threshold sentinels over live desk scalars: composite score, Shannon chaos,
// ABE jerk z, VIX, contango, cross-asset ρ. Per-rule arm/disarm, 45s trip
// cooldown, desk-local persistence (localStorage `krupp.alerts`), and trip
// fan-out: terminal log + toast + optional siren blip + SQLite audit event.
// SSR-SAFE: rules load post-mount (feed effect), never at module scope init
// for React tree — the store mirror starts EMPTY and hydrates client-side.
// ============================================================================

import type { RiskMetrics } from './types'
import { useKrupp } from './store'

export type AlertKind = 'score' | 'entropy' | 'jerkZ' | 'vix' | 'contango' | 'rho'
export type AlertOp = '>' | '<'

export interface AlertRule {
  id: string
  kind: AlertKind
  op: AlertOp
  threshold: number
  armed: boolean
  tripCount: number
  lastTripped: number // epoch ms, 0 = never
}

export const ALERT_META: Record<AlertKind, { label: string; unit: string; lo: number; hi: number; step: number; source: 'metrics' | 'cboe' | 'rho'; hint: string }> = {
  score:    { label: 'COMPOSITE SCORE', unit: '',    lo: 0,   hi: 100, step: 1,    source: 'metrics', hint: 'Navier-Stokes systemic composite' },
  entropy:  { label: 'SHANNON CHAOS',   unit: 'H',   lo: 0,   hi: 1,   step: 0.01, source: 'metrics', hint: 'Normalized return-disorder entropy' },
  jerkZ:    { label: 'ABE JERK Z',      unit: 'σ',   lo: 0,   hi: 10,  step: 0.1,  source: 'metrics', hint: 'Regularized third-derivative shock' },
  vix:      { label: 'VIX LEVEL',       unit: '',    lo: 8,   hi: 80,  step: 0.5,  source: 'cboe',    hint: 'CBOE volatility index spot' },
  contango: { label: 'CONTANGO',        unit: '%',   lo: -40, hi: 40,  step: 0.5,  source: 'cboe',    hint: 'VIX3M−VIX term spread %' },
  rho:      { label: 'CROSS-ASSET ρ',   unit: '',    lo: -1,  hi: 1,   step: 0.01, source: 'rho',     hint: 'Mean pairwise correlation (300t)' },
}

const LS_KEY = 'krupp.alerts'
const TRIP_COOLDOWN_MS = 45_000
const BOOT_QUIET_MS = 22_000 // kernel warm-up transients — same guard as desk toasts

let rules: AlertRule[] = []
let initAt = 0
let loaded = false

/** live scalar readouts (kept fresh by the feed; rendered by the panel) */
export const alertValues: Record<AlertKind, number> = { score: NaN, entropy: NaN, jerkZ: NaN, vix: NaN, contango: NaN, rho: NaN }

// --- sinks (wired by useKruppFeed — keeps this module React-free) -----------
let notifySink: ((title: string, desc: string, crit: boolean) => void) | null = null
// sfx carries the ALERT KIND so the kernel can sound a per-kind call sign
// (r9: six distinct motifs instead of one generic blip)
let sfxSink: ((kind: 'warn' | 'crit', alertKind: AlertKind) => void) | null = null
export function setAlertSinks(notify: typeof notifySink, sfx: typeof sfxSink) {
  notifySink = notify
  sfxSink = sfx
}

function rid(): string {
  return `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function defaultAlerts(): AlertRule[] {
  return [
    { id: rid(), kind: 'score', op: '>', threshold: 75, armed: true, tripCount: 0, lastTripped: 0 },
    { id: rid(), kind: 'entropy', op: '>', threshold: 0.85, armed: true, tripCount: 0, lastTripped: 0 },
    { id: rid(), kind: 'jerkZ', op: '>', threshold: 3, armed: true, tripCount: 0, lastTripped: 0 },
    { id: rid(), kind: 'vix', op: '>', threshold: 22, armed: true, tripCount: 0, lastTripped: 0 },
    { id: rid(), kind: 'rho', op: '>', threshold: 0.9, armed: true, tripCount: 0, lastTripped: 0 },
  ]
}

function sanitize(raw: unknown): AlertRule | null {
  const r = raw as Partial<AlertRule> | null
  if (!r || typeof r !== 'object') return null
  const meta = ALERT_META[r.kind as AlertKind]
  if (!meta) return null
  const th = Number(r.threshold)
  return {
    id: typeof r.id === 'string' ? r.id : rid(),
    kind: r.kind as AlertKind,
    op: r.op === '<' ? '<' : '>',
    threshold: Number.isFinite(th) ? Math.min(meta.hi, Math.max(meta.lo, th)) : meta.lo,
    armed: r.armed !== false,
    tripCount: Number.isFinite(Number(r.tripCount)) ? Math.max(0, Math.floor(Number(r.tripCount))) : 0,
    lastTripped: Number.isFinite(Number(r.lastTripped)) ? Number(r.lastTripped) : 0,
  }
}

/** hydrate from localStorage (called in the feed effect — client-only) */
export function initAlerts(): void {
  if (loaded) return
  loaded = true
  initAt = Date.now()
  let hadStore = false
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        rules = arr.map(sanitize).filter(Boolean).slice(0, 8) as AlertRule[]
        hadStore = true
      }
    }
  } catch { /* corrupted store — fall through to defaults */ }
  if (!hadStore) {
    // first boot on this desk — station the standard sentinel bundle
    rules = defaultAlerts()
    persist()
  }
  syncToStore()
}

function persist(): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rules)) } catch { /* storage unavailable */ }
}

/** mirror to the zustand store (panel subscribes via alertsRev) */
function syncToStore(): void {
  useKrupp.setState((st) => ({ alerts: rules.map((r) => ({ ...r })), alertsRev: st.alertsRev + 1 }))
}

// --- CRUD --------------------------------------------------------------------
export function getAlerts(): AlertRule[] {
  return rules.map((r) => ({ ...r }))
}
export function addAlert(kind: AlertKind, op: AlertOp, threshold: number): boolean {
  if (rules.length >= 8) return false
  const meta = ALERT_META[kind]
  const th = Math.min(meta.hi, Math.max(meta.lo, Number(threshold)))
  if (!Number.isFinite(th)) return false
  rules = [...rules, { id: rid(), kind, op, threshold: th, armed: true, tripCount: 0, lastTripped: 0 }]
  persist(); syncToStore()
  return true
}
export function removeAlert(id: string): void {
  rules = rules.filter((r) => r.id !== id)
  persist(); syncToStore()
}
export function updateAlert(id: string, patch: Partial<Pick<AlertRule, 'op' | 'threshold' | 'armed'>>): void {
  rules = rules.map((r) => {
    if (r.id !== id) return r
    const next = { ...r, ...patch }
    const meta = ALERT_META[r.kind]
    if (patch.threshold !== undefined) next.threshold = Math.min(meta.hi, Math.max(meta.lo, Number(patch.threshold)))
    return next
  })
  persist(); syncToStore()
}
export function armAll(armed: boolean): void {
  rules = rules.map((r) => ({ ...r, armed }))
  persist(); syncToStore()
}
export function resetTrips(): void {
  rules = rules.map((r) => ({ ...r, tripCount: 0, lastTripped: 0 }))
  persist(); syncToStore()
}

// --- evaluation ---------------------------------------------------------------
function trip(r: AlertRule, value: number): void {
  r.tripCount++
  r.lastTripped = Date.now()
  const meta = ALERT_META[r.kind]
  const crit = r.kind === 'score' || r.kind === 'rho'
  const msg = `[ALERT] ${meta.label} ${r.op === '>' ? 'ABOVE' : 'BELOW'} SENTINEL — ${value.toFixed(meta.step < 0.1 ? 3 : 1)} ${meta.unit} ${r.op} ${r.threshold}${meta.step < 0.1 ? '' : ''} (trip #${r.tripCount})`
  useKrupp.getState().pushLog({
    id: `alert-${Date.now()}`, ts: Date.now(), source: 'ALERT',
    level: crit ? 'crit' : 'warn', message: msg,
  })
  notifySink?.(`ALERT — ${meta.label}`, `${r.op === '>' ? 'Above' : 'Below'} sentinel: ${value.toFixed(meta.step < 0.1 ? 3 : 2)} ${r.op} ${r.threshold}. Trip #${r.tripCount}.`, crit)
  if (useKrupp.getState().soundOn) sfxSink?.(crit ? 'crit' : 'warn', r.kind)
  persist()
  // audit trail (SQLite) — fire-and-forget. dedupeKey is IDENTITY-based
  // (kind+op+threshold — stable across browser profiles), so when several
  // desk clients stream the same feed the server floor (45s) keeps the audit
  // to one row per sentinel trip even though every tab trips locally.
  fetch('/api/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'ALERT_TRIP', severity: crit ? 'crit' : 'warn', source: 'ALERTS', message: msg,
      dedupeKey: `alert:${r.kind}:${r.op}:${r.threshold}`, dedupeWindowMs: TRIP_COOLDOWN_MS,
    }),
  }).catch(() => { /* audit unavailable — desk keeps running */ })
}

function check(kind: AlertKind, value: number): void {
  alertValues[kind] = value
  if (!Number.isFinite(value)) return
  if (loaded && Date.now() - initAt < BOOT_QUIET_MS) return
  const now = Date.now()
  let touched = false
  for (const r of rules) {
    if (r.kind !== kind || !r.armed) continue
    const hit = r.op === '>' ? value > r.threshold : value < r.threshold
    if (hit && now - r.lastTripped > TRIP_COOLDOWN_MS) {
      trip(r, value)
      touched = true
    }
  }
  if (touched) syncToStore()
}

export function evaluateMetrics(m: RiskMetrics): void {
  check('score', m.score)
  check('entropy', m.entropy)
  check('jerkZ', m.jerkZ)
}
export function evaluateCboe(c: { vix: number; contangoPct: number }): void {
  check('vix', c.vix)
  check('contango', c.contangoPct)
}
export function evaluateRho(rho: number): void {
  check('rho', rho)
}
