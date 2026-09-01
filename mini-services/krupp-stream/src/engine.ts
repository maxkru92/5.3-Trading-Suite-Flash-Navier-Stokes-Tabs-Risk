// ============================================================================
// KRUPP CAPITAL // MARKET PARITY ENGINE
// Synthetic Level-3 parity feed mirroring London Strategic Edge L3 schema.
// Regime state-machine + jump-diffusion ticks + deep order-book construction.
// ============================================================================

export type Regime = 'CALM' | 'HIGH' | 'CRISIS'
export type FeedMode = 'LIVE' | 'SIM_BRIDGE' | 'FALLBACK'

export interface InstrumentDef {
  sym: string
  name: string
  kind: 'CME_FUTURE' | 'EQUITY'
  base: number
  vol: number // per-root-second return vol
  tickSize: number
  baseVolume: number // per-tick volume baseline
  bookBase: number // order-book size baseline
}

export const INSTRUMENTS: InstrumentDef[] = [
  { sym: 'ES', name: 'E-MINI S&P 500', kind: 'CME_FUTURE', base: 6124.25, vol: 0.00042, tickSize: 0.25, baseVolume: 42, bookBase: 220 },
  { sym: 'NQ', name: 'E-MINI NASDAQ 100', kind: 'CME_FUTURE', base: 21905.75, vol: 0.00061, tickSize: 0.25, baseVolume: 31, bookBase: 160 },
  { sym: 'SPY', name: 'SPDR S&P 500 ETF', kind: 'EQUITY', base: 603.18, vol: 0.00036, tickSize: 0.01, baseVolume: 85, bookBase: 420 },
]

export interface Tick {
  sym: string
  t: number
  price: number
  open: number
  volume: number
  high: number
  low: number
}

export interface BookLevel { price: number; size: number }

export interface Book {
  sym: string
  ts: number
  mid: number
  bids: BookLevel[]
  asks: BookLevel[]
  spread: number
  spreadTicks: number
  imbalance: number
}

export interface TapeItem { t: number; price: number; size: number; side: 'B' | 'S' }

export interface CrashState {
  active: boolean
  severity: number
  startedAt: number
  endsAt: number
  vacuumUntil: number
  recoverUntil: number
}

interface InstState {
  def: InstrumentDef
  price: number
  anchor: number
  cluster: number
  book: Book
  tape: TapeItem[]
  driftBias: number
}

// --- deterministic-enough RNG helpers ---------------------------------------
let spare: number | null = null
export function gauss(): number {
  if (spare !== null) { const v = spare; spare = null; return v }
  let u = 0, v = 0, s = 0
  do {
    u = Math.random() * 2 - 1
    v = Math.random() * 2 - 1
    s = u * u + v * v
  } while (s === 0 || s >= 1)
  const mul = Math.sqrt((-2 * Math.log(s)) / s)
  spare = v * mul
  return u * mul
}

const roundToTick = (p: number, ts: number) => Math.round(p / ts) * ts

const round2 = (x: number) => Math.round(x * 100) / 100

// ----------------------------------------------------------------------------
export class MarketEngine {
  regime: Regime = 'CALM'
  crash: CrashState = { active: false, severity: 0, startedAt: 0, endsAt: 0, vacuumUntil: 0, recoverUntil: 0 }
  tickCount = 0
  startedAt = Date.now()

  private insts = new Map<string, InstState>()
  private nextRegimeShift = Date.now() + 38_000
  private onStep: ((ticks: Tick[], books: Book[], tape: Record<string, TapeItem[]>) => void) | null = null
  private onRegimeChange: ((r: Regime, cause: string) => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor() {
    for (const def of INSTRUMENTS) {
      this.insts.set(def.sym, {
        def,
        price: def.base,
        anchor: def.base,
        cluster: 1,
        tape: [],
        driftBias: 0,
        book: {
          sym: def.sym, ts: Date.now(), mid: def.base,
          bids: [], asks: [], spread: def.tickSize, spreadTicks: 1, imbalance: 0,
        },
      })
    }
  }

  bind(onStep: (ticks: Tick[], books: Book[], tape: Record<string, TapeItem[]>) => void, onRegimeChange: (r: Regime, cause: string) => void) {
    this.onStep = onStep
    this.onRegimeChange = onRegimeChange
  }

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.step(Date.now()), 100)
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  // --- regime / crash --------------------------------------------------------
  private volMult(now: number): number {
    const c = this.crash
    if (c.active) return 6 + c.severity * 0.85
    if (now < c.recoverUntil) {
      const k = Math.max(0, (c.recoverUntil - now) / 18_000) // 1 -> 0
      return 1 + 3.2 * k
    }
    return this.regime === 'CRISIS' ? 5.2 : this.regime === 'HIGH' ? 2.3 : 1
  }

  private maybeShiftRegime(now: number) {
    if (this.crash.active || now < c_recoverGuard(this.crash) || now < this.nextRegimeShift) return
    this.nextRegimeShift = now + 28_000 + Math.random() * 26_000
    const roll = Math.random()
    if (this.regime === 'CALM' && roll < 0.11) this.setRegime('HIGH', 'volatility cluster detected in tape')
    else if (this.regime === 'HIGH') {
      if (roll < 0.30) this.setRegime('CALM', 'vol compression — state tensor normalized')
      else if (roll < 0.36) this.setRegime('CRISIS', 'systemic stress cascade (ambient)')
    } else if (this.regime === 'CRISIS' && roll < 0.55) this.setRegime('HIGH', 'crisis energy decaying')
  }

  setRegime(r: Regime, cause: string) {
    if (this.regime === r) return
    this.regime = r
    this.onRegimeChange?.(r, cause)
  }

  injectCrash(severity: number, durationMs: number): CrashState {
    const now = Date.now()
    this.crash = {
      active: true,
      severity: Math.max(1, Math.min(10, severity)),
      startedAt: now,
      endsAt: now + durationMs,
      vacuumUntil: now + 750, // liquidity vacuum phase: volume dries, ranges explode
      recoverUntil: now + durationMs + 18_000,
    }
    this.nextRegimeShift = this.crash.recoverUntil + 30_000
    this.setRegime('CRISIS', `liquidity crash injected (severity ${this.crash.severity}/10)`)
    return this.crash
  }

  resetFeed() {
    this.crash = { active: false, severity: 0, startedAt: 0, endsAt: 0, vacuumUntil: 0, recoverUntil: 0 }
    this.regime = 'CALM'
    this.nextRegimeShift = Date.now() + 40_000
    for (const def of INSTRUMENTS) {
      const s = this.insts.get(def.sym)!
      s.price = def.base
      s.anchor = def.base
      s.cluster = 1
      s.tape = []
      s.driftBias = 0
    }
    this.onRegimeChange?.('CALM', 'feed purged & re-anchored to session VWAP base')
  }

  // --- core step -------------------------------------------------------------
  private step(now: number) {
    this.tickCount++
    if (this.crash.active && now > this.crash.endsAt) {
      this.crash.active = false
      this.onRegimeChange?.('HIGH', 'crash injection exhausted — entering recovery decay')
    }
    this.maybeShiftRegime(now)

    const ticks: Tick[] = []
    const books: Book[] = []
    const tape: Record<string, TapeItem[]> = {}
    for (const [, s] of this.insts) {
      ticks.push(this.evolve(s, now))
      books.push(this.buildBook(s, now))
      tape[s.def.sym] = s.tape
    }
    this.onStep?.(ticks, books, tape)
  }

  private evolve(s: InstState, now: number): Tick {
    const def = s.def
    const vm = this.volMult(now)
    const dt = 0.1
    const open = s.price

    let ret = gauss() * def.vol * vm * Math.sqrt(dt)
    if (this.crash.active) {
      ret -= 0.00038 * this.crash.severity * (now < this.crash.vacuumUntil ? 1.5 : 1)
    } else if (now < this.crash.recoverUntil) {
      ret += 0.00006 // slight mean-reversion during recovery
    }

    const jumpP = this.crash.active ? 0.07 : this.regime === 'CRISIS' ? 0.045 : this.regime === 'HIGH' ? 0.006 : 0.0005
    if (Math.random() < jumpP) {
      const sign = this.crash.active || this.regime === 'CRISIS' ? (Math.random() < 0.78 ? -1 : 1) : Math.random() < 0.5 ? -1 : 1
      ret += sign * Math.abs(gauss()) * def.vol * vm * 2.4
    }

    // session-anchor gravity: soft VWAP-like pull prevents unbounded
    // multi-crash drift; suppressed while a crash cascade is live
    const grav = 0.0022 * Math.log(s.anchor / open)
    ret += this.crash.active ? grav * 0.12 : grav

    const price = Math.max(roundToTick(open * (1 + ret), def.tickSize), def.tickSize)
    const move = Math.abs(price - open)
    const range = Math.max(move, def.tickSize * (0.55 + Math.random() * 0.9) * Math.max(1, vm * 0.55))
    const high = roundToTick(Math.max(open, price) + Math.random() * range * 0.25, def.tickSize)
    const low = roundToTick(Math.min(open, price) - Math.random() * range * 0.25, def.tickSize)

    // volume: regime multiplier + clustering (AR(1)) + lognormal noise; vacuum dries it up
    let volReg = this.regime === 'CRISIS' ? 8.5 : this.regime === 'HIGH' ? 2.1 : 1
    if (this.crash.active) volReg = now < this.crash.vacuumUntil ? 0.1 : 12 + this.crash.severity * 2.6
    else if (now < this.crash.recoverUntil) volReg = 1 + 5 * Math.max(0, (this.crash.recoverUntil - now) / 18_000)
    s.cluster = s.cluster * 0.88 + (0.55 + Math.random() * 0.9) * 0.12
    const volume = Math.max(1, Math.round(def.baseVolume * volReg * s.cluster * Math.exp(gauss() * 0.32)))

    s.price = price
    s.tape.unshift({ t: now, price, size: Math.max(1, Math.round(volume / 9)), side: price >= open ? 'B' : 'S' })
    if (s.tape.length > 8) s.tape.length = 8

    return { sym: def.sym, t: now, price, open, volume, high, low }
  }

  private buildBook(s: InstState, now: number): Book {
    const def = s.def
    const c = this.crash
    let spreadTicks: number
    if (c.active) spreadTicks = Math.round(4 + c.severity * 0.9 + Math.random() * 3)
    else if (now < c.recoverUntil) spreadTicks = Math.round(3 + Math.random() * 2)
    else spreadTicks = this.regime === 'CRISIS' ? Math.round(6 + Math.random() * 6) : this.regime === 'HIGH' ? Math.round(2 + Math.random() * 2) : Math.random() < 0.32 ? 2 : 1

    const half = (spreadTicks * def.tickSize) / 2
    const mid = s.price

    let bidTouch = 1, askTouch = 1
    if (c.active) {
      bidTouch = now < c.vacuumUntil ? 0.05 : 0.2
      askTouch = now < c.vacuumUntil ? 3.4 : 2.6
    } else if (this.regime === 'CRISIS') { bidTouch = 0.55; askTouch = 1.5 }
    else if (this.regime === 'HIGH') { bidTouch = 0.85; askTouch = 1.15 }

    const sizeBase = def.bookBase * (c.active ? 1.9 : this.regime === 'CRISIS' ? 1.55 : this.regime === 'HIGH' ? 1.15 : 1)
    const levels = 12
    const decay = 0.155
    const bids: BookLevel[] = []
    const asks: BookLevel[] = []
    for (let i = 0; i < levels; i++) {
      const bp = roundToTick(mid - half - i * def.tickSize, def.tickSize)
      const ap = roundToTick(mid + half + i * def.tickSize, def.tickSize)
      let bs = sizeBase * Math.exp(-decay * i) * (0.45 + Math.random() * 1.15) * (bidTouch + i * 0.06)
      let as = sizeBase * Math.exp(-decay * i) * (0.45 + Math.random() * 1.15) * (askTouch + i * 0.015)
      if (Math.random() < 0.022) bs *= 5 + Math.random() * 10 // hidden block order
      if (Math.random() < 0.022) as *= 5 + Math.random() * 10
      bids.push({ price: bp, size: Math.max(1, Math.round(bs)) })
      asks.push({ price: ap, size: Math.max(1, Math.round(as)) })
    }

    const b5 = bids.slice(0, 5).reduce((a, l) => a + l.size, 0)
    const a5 = asks.slice(0, 5).reduce((a, l) => a + l.size, 0)
    const book: Book = {
      sym: def.sym, ts: now, mid: round2(mid), bids, asks,
      spread: round2(asks[0].price - bids[0].price),
      spreadTicks,
      imbalance: round2((b5 - a5) / (b5 + a5 + 1e-9)),
    }
    s.book = book
    return book
  }

  snapshotState() {
    return {
      regime: this.regime,
      crash: this.crash,
      tickCount: this.tickCount,
      uptimeMs: Date.now() - this.startedAt,
      instruments: INSTRUMENTS.map((d) => ({ sym: d.sym, name: d.name, kind: d.kind, last: this.insts.get(d.sym)!.price })),
    }
  }
}

function c_recoverGuard(c: CrashState): number {
  return c.recoverUntil
}
