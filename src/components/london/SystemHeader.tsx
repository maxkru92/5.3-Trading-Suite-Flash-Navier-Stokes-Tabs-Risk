'use client'

// ============================================================================
// KRUPP CAPITAL // SYSTEM CONTROL & AUTH HEADER + GLOBAL REGIME BADGE
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck, SquareTerminal, Trash2, Volume2, VolumeX, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useKrupp } from '@/lib/london/store'
import { useKruppApi } from '@/lib/london/context'
import { K, Led } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function LondonClock() {
  const [t, setT] = useState<{ now: string; off: string }>({ now: '', off: 'UTC+0' })
  useEffect(() => {
    // real London offset — label the clock honestly (BST summer = UTC+1)
    const offFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const tick = () => {
      let off = 'UTC+0'
      try {
        off = (offFmt.formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0').replace('GMT', 'UTC')
      } catch { /* keep the fallback label */ }
      setT({ now: fmt.format(new Date()), off })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="hidden xl:flex flex-col items-end leading-none gap-1">
      <span className="text-[9px] tracking-[0.2em] text-muted-foreground">LONDON DESK · {t.off}</span>
      <span className="text-sm font-bold tabular-nums text-glow-green" style={{ color: K.green }}>{t.now || '--:--:--'}</span>
    </div>
  )
}

function AuthChip() {
  const auth = useKrupp((s) => s.auth)
  const authenticated = auth?.authenticated ?? false
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 border rounded-sm min-w-[130px] sm:min-w-[150px] max-w-[240px] min-[1360px]:max-w-[300px] h-7 flex-[2] ${authenticated ? 'border-cyan-500/60 glow-box-cyan bg-cyan-950/20' : 'bg-orange-950/10'}`}
      style={authenticated ? undefined : { borderColor: hexA(KT('warn'), 0.4) }}
      role="status"
      aria-live="polite"
      title={auth?.message}
    >
      <Led color={authenticated ? 'cyan' : 'orange'} className={`shrink-0 ${authenticated ? 'anim-blink' : ''}`} />
      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.14em] leading-tight truncate whitespace-nowrap" style={{ color: authenticated ? K.cyan : KT('warnDeep') }}>
        {authenticated ? 'AUTHENTICATED / TRUE L3 FUTURES STREAM ACTIVE' : 'UNAUTHENTICATED / L1-L2 REST FALLBACK'}
      </span>
      {authenticated && (
        <span className="text-[8px] px-1 py-0.5 border border-cyan-500/40 text-cyan-300/90 tracking-widest shrink-0 hidden lg:inline">
          {auth?.mode === 'LIVE' ? 'LIVE ORIGIN' : auth?.tokenKind === 'DEMO' ? 'DEMO · PARITY BRIDGE' : 'PARITY BRIDGE'}
        </span>
      )}
    </div>
  )
}

function RegimeBadge() {
  const regime = useKrupp((s) => s.metrics.regime)
  const score = useKrupp((s) => s.metrics.score)
  if (regime === 'CRISIS') {
    return (
      <div className="anim-flash-red border px-3 py-2 rounded-sm flex items-center gap-2.5 min-w-0 max-w-full overflow-hidden" role="alert">
        <Zap size={16} color={K.red} className="shrink-0 anim-blink-fast" />
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-bold tracking-[0.1em] text-glow-red truncate whitespace-nowrap" style={{ color: K.red }}>
            CRITICAL SYSTEMIC CRISIS // MEAN REVERSION INTERCEPTED
          </div>
          <div className="text-[8px] tracking-[0.24em] text-red-300/70 truncate whitespace-nowrap">REGIME: CRISIS · SCORE {score.toFixed(1)} · KILL-CHAIN ARMED</div>
        </div>
      </div>
    )
  }
  if (regime === 'HIGH') {
    return (
      <div className="anim-pulse-orange border px-3 py-2 rounded-sm flex items-center gap-2.5 min-w-0 max-w-full overflow-hidden" style={{ borderColor: hexA(KT('warn'), 0.6), background: hexA(KT('warn'), 0.07) }} role="status">
        <Zap size={16} color={K.orange} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-bold tracking-[0.1em] text-glow-orange truncate whitespace-nowrap" style={{ color: K.orange }}>
            REGIME: HIGH TOXICITY // SCALING OFFSETS
          </div>
          <div className="text-[8px] tracking-[0.24em] text-orange-300/60 truncate whitespace-nowrap">REGIME: HIGH · SCORE {score.toFixed(1)}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="border px-3 py-2 rounded-sm flex items-center gap-2.5 min-w-0 max-w-full overflow-hidden glow-box-green" style={{ borderColor: hexA(KT('accent'), 0.4), background: hexA(KT('accent'), 0.05) }} role="status">
      <ShieldCheck size={16} color={K.green} className="shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] sm:text-xs font-bold tracking-[0.1em] text-glow-green truncate whitespace-nowrap" style={{ color: K.green }}>
          REGIME: CALM // STATE TENSOR NORMAL
        </div>
        <div className="text-[8px] tracking-[0.24em] text-green-300/60 truncate whitespace-nowrap">REGIME: CALM · SCORE {score.toFixed(1)}</div>
      </div>
    </div>
  )
}

export function SystemHeader() {
  const api = useKruppApi()
  const connection = useKrupp((s) => s.connection)
  const soundOn = useKrupp((s) => s.soundOn)
  const toggleSound = useKrupp((s) => s.toggleSound)
  const setPaletteOpen = useKrupp((s) => s.setPaletteOpen)
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [minting, setMinting] = useState(false)
  const autoAuthed = useRef(false)

  // restore cached credential once uplink is open
  useEffect(() => {
    if (connection !== 'open' || autoAuthed.current) return
    autoAuthed.current = true
    try {
      const saved = localStorage.getItem('krupp.fbtoken')
      if (saved) {
        setToken(saved)
        api.setToken(saved)
      }
    } catch { /* storage unavailable */ }
  }, [connection, api])

  const connect = async () => {
    setBusy(true)
    try {
      const t = token.trim()
      if (t) { try { localStorage.setItem('krupp.fbtoken', t) } catch { /* ignore */ } }
      api.setToken(t)
    } finally { setBusy(false) }
  }

  const mintDemo = async () => {
    setMinting(true)
    try {
      const res = await fetch('/api/auth/demo-token', { method: 'POST' })
      const j = await res.json()
      if (j?.token) {
        setToken(j.token)
        try { localStorage.setItem('krupp.fbtoken', j.token) } catch { /* ignore */ }
        api.setToken(j.token)
      }
    } catch { /* toast surfaces via terminal */ } finally { setMinting(false) }
  }

  const clear = () => {
    setToken('')
    try { localStorage.removeItem('krupp.fbtoken') } catch { /* ignore */ }
    api.clearToken()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gridline bg-kbg-deep/95 backdrop-blur-sm">
      {/* r9 FIX — the row layout squeezed the middle block below its ~460px
          min-content between 1280-1359px, so the auth chip painted OVER the
          regime badge (and bled the document 6px at 390px). Stack below
          1360px (where title+row+regime genuinely fit), clip the block as a
          hard guard, and let the input/chip floors breathe on small screens. */}
      {/* r10 FIX — the middle block now stacks at EVERY width: its ≥1280
          xl:flex-row variant flexed the token row (~358px of shrink-0
          controls at min-content) against the auth chip (~300px); at 1440
          the outer ≥1360 row starved the token row to 235px and its
          shrink-0 children painted OVER the AUTH / MINT L3 buttons.
          360 title + 358 row + 300 chip + 467 regime ≈ 1487px simply does
          not fit 1440 — column layout (row on top, chip beneath) is the
          only honest arrangement and matches the <1360 look. */}
      <div className="mx-auto max-w-[1800px] px-2.5 sm:px-4 py-2 flex flex-col min-[1360px]:flex-row min-[1360px]:items-center gap-2">
        {/* Title banner */}
        <div className="flex items-center gap-2.5 min-w-0 shrink max-w-[360px]">
          <div className="w-8 h-8 border border-hft/50 glow-box-green grid place-items-center shrink-0" style={{ borderColor: hexA(KT('accent'), 0.5) }} aria-hidden>
            <span className="text-[13px] font-black text-glow-green" style={{ color: K.green }}>K</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-[11px] sm:text-[13px] font-bold tracking-[0.08em] truncate text-glow-green" style={{ color: K.green }}>
              KRUPP CAPITAL <span className="opacity-60">{'//'}</span> TRADING SUITE
            </h1>
            <p className="text-[8px] sm:text-[9px] tracking-[0.12em] text-muted-foreground truncate">
              [LONDON STRATEGIC EDGE — L3 RISK DESK] · NAVIER-STOKES KERNEL
            </p>
          </div>
          <div className="ml-1 hidden xl:flex items-center gap-1.5 pl-2 border-l border-gridline shrink-0">
            <Led color={connection === 'open' ? 'green' : connection === 'connecting' ? 'orange' : 'red'} className={connection === 'open' ? '' : 'anim-blink'} />
            <span className="text-[8px] tracking-[0.2em] text-muted-foreground">{connection === 'open' ? 'UPLINK' : connection === 'connecting' ? 'LINKING' : 'DOWN'}</span>
          </div>
        </div>

        {/* Firebase token control */}
        <div className="flex-1 flex flex-col gap-1.5 justify-center min-w-0 w-full overflow-hidden">
          <div className="flex items-center gap-1.5 flex-1 min-h-[28px] min-w-0">
            <KeyRound size={13} className="text-muted-foreground shrink-0" aria-hidden />
            <Input
              type={show ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connect()}
              placeholder="Firebase Bearer Token — paste or mint a desk credential"
              className="h-7 text-[11px] bg-input/60 border-input font-mono rounded-sm min-w-0 sm:min-w-[150px] min-[1360px]:min-w-[170px] max-w-xl flex-1 w-full"
              aria-label="Firebase Bearer Token"
              spellCheck={false}
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide token' : 'Show token'} type="button">
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </Button>
            <Button size="sm" className="h-7 px-2.5 text-[10px] tracking-widest font-bold rounded-sm shrink-0" style={{ background: hexA(KT('accent'), 0.12), color: K.green, border: `1px solid ${hexA(KT('accent'), 0.5)}` }} onClick={connect} disabled={busy} type="button">
              AUTH
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[9px] tracking-wider rounded-sm shrink-0 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40" onClick={mintDemo} disabled={minting} type="button" title="Mint a locally-signed demo L3 credential">
              MINT L3
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-sm shrink-0 text-muted-foreground hover:text-red-400" onClick={clear} aria-label="Clear token" type="button">
              <Trash2 size={13} />
            </Button>
          </div>
          <AuthChip />
        </div>

        {/* Regime + clock + sound */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <div className="min-w-0 max-w-[200px] xl:max-w-[250px]">
            <RegimeBadge />
          </div>
          <LondonClock />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground shrink-0" onClick={toggleSound} aria-label={soundOn ? 'Mute alarms' : 'Enable crisis alarm'} aria-pressed={soundOn} type="button">
            {soundOn ? <Volume2 size={14} style={{ color: K.green }} /> : <VolumeX size={14} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground shrink-0"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open desk command palette"
            type="button"
            title="Desk command palette (⌘K)"
          >
            <SquareTerminal size={14} />
          </Button>
        </div>
      </div>
    </header>
  )
}
