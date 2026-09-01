/**
 * KRUPP CAPITAL // DESK SFX KERNEL (round 9)
 *
 * One tiny WebAudio synth for the WHOLE workspace — every chirp is derived
 * from a musical root so the desk can be identified by ear:
 *   · ALERT sentinels  — 6 alert kinds → 6 distinct two-note motifs
 *                        (score G2, entropy A2, jerkZ B2, vix D3, contango
 *                        E3, rho G3) — crit variants are sawtooth + doubled
 *                        length + louder, warn variants are sine blips.
 *   · REGIME siren     — crisis: 620→180→620 sweep (unchanged voice, moved
 *                        here so the landing + desks share one kernel);
 *                        warn: 440 blip.
 *   · DESK crisis stg. — start/terminate the liquidity-crisis drill: each of
 *                        the 13 desks sounds its own root (+1 semitone per
 *                        desk no.) so a lockdown on METALS is audibly
 *                        different from one on CRYPTO.
 *
 * SSR-SAFE + FAIL-SILENT: every entry point lazily creates the AudioContext
 * on first user-gesture-adjacent call and swallows everything — audio may
 * never break the trading surface. The master gate (sfxOn, persisted in the
 * krupp workspace store) is read THROUGH the store accessor so callers can't
 * bypass the toggle.
 */

export type AlertSfxKind = 'score' | 'entropy' | 'jerkZ' | 'vix' | 'contango' | 'rho'
export type DeskSfxVariant = 'crisis' | 'recover'

/** two-note motif roots (Hz) — one octave, spread so neighbours differ */
const ALERT_ROOT: Record<AlertSfxKind, number> = {
  score: 98, // G2  — the doomsday root (crit-most sentinel)
  entropy: 110, // A2
  jerkZ: 123.47, // B2
  vix: 146.83, // D3
  contango: 164.81, // E3
  rho: 196, // G3
}

/** semitone offset per desk (1-13) — C-based, each desk a half-step apart */
function deskRoot(deskNo: number): number {
  const semis = Math.max(0, Math.min(13, deskNo)) - 1
  return 220 * Math.pow(2, semis / 12) // A3 upward
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function blip(
  a: AudioContext,
  freq: number,
  at: number,
  dur: number,
  peak: number,
  type: OscillatorType,
  glideTo?: number,
): void {
  try {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.connect(gain)
    gain.connect(a.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    if (glideTo !== undefined) osc.frequency.linearRampToValueAtTime(glideTo, at + dur)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  } catch {
    /* audio unavailable */
  }
}

/** master gate — wired from the krupp workspace store (sfxOn) */
let gate: () => boolean = () => false
export function setSfxGate(read: () => boolean): void {
  gate = read ?? (() => false)
}

/** per-alert-kind sentinel chirp. `crit` sentinels (score/ρ) double the motif. */
export function sfxAlert(kind: AlertSfxKind, crit: boolean): void {
  if (!gate()) return
  const a = audio()
  if (!a) return
  const root = ALERT_ROOT[kind] ?? 110
  const type: OscillatorType = crit ? 'sawtooth' : 'sine'
  const peak = crit ? 0.09 : 0.05
  const dur = crit ? 0.22 : 0.12
  const t0 = a.currentTime
  blip(a, root, t0, dur, peak, type)
  blip(a, root * 1.5, t0 + dur + 0.03, dur, peak, type) // fifth up — call sign
  if (crit) blip(a, root * 2, t0 + 2 * (dur + 0.03), dur, peak * 0.8, type)
}

/** regime siren — moved from useKruppFeed so both terminals share the voice */
export function sfxRegime(kind: 'crisis' | 'warn'): void {
  if (!gate()) return
  const a = audio()
  if (!a) return
  const t0 = a.currentTime
  if (kind === 'crisis') {
    blip(a, 620, t0, 0.42, 0.12, 'sawtooth', 180)
    blip(a, 180, t0 + 0.42, 0.42, 0.12, 'sawtooth', 620)
  } else {
    blip(a, 440, t0, 0.5, 0.07, 'sawtooth')
  }
}

/** desk-pitched crisis steering: start = descending klaxon, recover = rising chirp */
export function sfxDesk(deskNo: number, variant: DeskSfxVariant): void {
  if (!gate()) return
  const a = audio()
  if (!a) return
  const root = deskRoot(deskNo)
  const t0 = a.currentTime
  if (variant === 'crisis') {
    blip(a, root * 2, t0, 0.3, 0.11, 'sawtooth', root) // drop an octave — alarm
    blip(a, root * 2, t0 + 0.36, 0.3, 0.11, 'sawtooth', root)
  } else {
    blip(a, root, t0, 0.14, 0.06, 'sine')
    blip(a, root * 1.5, t0 + 0.16, 0.14, 0.06, 'sine') // all-clear fifth
  }
}
