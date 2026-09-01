'use client'

// ============================================================================
// COLUMN 2 // CARD 2 — LIVE L3 ORDER BOOK LADDER
// Deep queue blocks mapped from London Strategic Edge; asks crimson / bids
// neon-green; 100ms cadence in L3, 600ms REST-poll cadence in fallback.
// ============================================================================

import { memo, useEffect, useMemo, useRef } from 'react'
import { Layers } from 'lucide-react'
import { feed } from '@/lib/london/feed'
import { useKrupp } from '@/lib/london/store'
import { INSTRUMENT_META, type BookLevel } from '@/lib/london/types'
import { K, Panel, Spark, fmt } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const LEVELS_SHOWN = 9

const Row = memo(function Row({ level, side, max, tickSize }: { level: BookLevel; side: 'bid' | 'ask'; max: number; tickSize: number }) {
  const w = Math.min(100, (level.size / (max || 1)) * 100)
  return (
    <div className="relative flex items-center h-[15px] sm:h-[16px] text-[10px] tabular-nums overflow-hidden rounded-[1px]">
      <div
        className={`absolute inset-y-0 ${side === 'ask' ? 'book-bar-ask right-0' : 'book-bar-bid left-0'}`}
        style={{ width: `${w}%` }}
        aria-hidden
      />
      {side === 'ask' ? (
        <>
          <span className="relative z-10 w-14 sm:w-16 text-right pr-1" style={{ color: K.red }}>{fmt.price(level.price)}</span>
          <span className="relative z-10 flex-1 text-left px-1 text-red-200/80">{level.size}</span>
          <span className="relative z-10 w-9 sm:w-10 text-right text-red-300/50 hidden sm:inline">{(level.size / 100).toFixed(1)}L</span>
        </>
      ) : (
        <>
          <span className="relative z-10 w-9 sm:w-10 text-left text-green-300/50 pl-0.5 hidden sm:inline">{(level.size / 100).toFixed(1)}L</span>
          <span className="relative z-10 flex-1 text-right px-1 text-green-200/80">{level.size}</span>
          <span className="relative z-10 w-14 sm:w-16 text-right pr-0.5" style={{ color: K.green }}>{fmt.price(level.price)}</span>
        </>
      )}
    </div>
  )
})

function ImbalanceMeter({ v }: { v: number }) {
  const pct = ((v + 1) / 2) * 100
  return (
    <div className="h-1.5 w-20 sm:w-24 bg-kpanel2 border border-gridline rounded-sm relative overflow-hidden" title={`Book imbalance ${(v * 100).toFixed(1)}%`} aria-label={`Book imbalance ${(v * 100).toFixed(1)}%`}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-gridline" aria-hidden />
      <div
        className="absolute inset-y-0 transition-all duration-150"
        style={v >= 0
          ? { left: '50%', width: `${pct - 50}%`, background: K.green, boxShadow: `0 0 6px ${K.green}` }
          : { right: '50%', width: `${50 - pct}%`, background: K.red, boxShadow: `0 0 6px ${K.red}` }}
        aria-hidden
      />
    </div>
  )
}

export function OrderBookLadder() {
  const selected = useKrupp((s) => s.selectedSym)
  const select = useKrupp((s) => s.selectSym)
  const bookRev = useKrupp((s) => s.bookRev) // rev trigger — book read from feed sink
  const mode = useKrupp((s) => s.auth?.mode ?? 'FALLBACK')
  const book = feed.books.get(selected)
  const tape = feed.tapes.get(selected) ?? []
  const last = feed.lastTick.get(selected)

  // mid-price tick flash: direct DOM animation toggle (zero re-render, HFT style)
  const midRef = useRef<HTMLSpanElement>(null)
  const prevMid = useRef<number | null>(null)
  useEffect(() => {
    const el = midRef.current
    const mid = book?.mid
    if (!el || mid == null) return
    const prev = prevMid.current
    prevMid.current = mid
    if (prev != null && mid !== prev) {
      const cls = mid > prev ? 'tick-up' : 'tick-dn'
      el.classList.remove('tick-up', 'tick-dn')
      void el.offsetWidth // force reflow to restart one-shot animation
      el.classList.add(cls)
    }
  }, [bookRev, book])

  // microstructure: microprice + cumulative delta
  const micro = useMemo(() => {
    const b = book?.bids[0]
    const a = book?.asks[0]
    if (!b || !a || b.size + a.size === 0) return NaN
    return (b.price * a.size + a.price * b.size) / (b.size + a.size)
  }, [book, bookRev])
  const cdelta = feed.cdelta.get(selected) ?? 0
  const microHist = feed.micro.get(selected)

  const [bids, asks, max] = useMemo(() => {
    const b = book?.bids.slice(0, LEVELS_SHOWN) ?? []
    const a = book?.asks.slice(0, LEVELS_SHOWN) ?? []
    const m = Math.max(1, ...b.map((l) => l.size), ...a.map((l) => l.size))
    return [b, a, m]
  }, [book, bookRev])

  const meta = INSTRUMENT_META.find((i) => i.sym === selected)!
  const l3 = mode !== 'FALLBACK'

  return (
    <Panel
      title="LIVE L3 ORDER BOOK LADDER"
      sub={l3 ? '100MS STREAM' : 'L1/L2 REST · 600MS POLL'}
      accent={l3 ? 'green' : 'orange'}
      right={<Layers size={12} className="shrink-0" style={{ color: l3 ? K.green : K.orange }} aria-hidden />}
      bodyClass="p-2 flex flex-col gap-1.5"
    >
      {/* instrument tabs */}
      <div className="flex items-center gap-1" role="tablist" aria-label="Instrument">
        {INSTRUMENT_META.map((i) => (
          <button
            key={i.sym}
            role="tab"
            aria-selected={selected === i.sym}
            onClick={() => select(i.sym)}
            className="px-2 py-0.5 text-[9px] font-bold tracking-[0.18em] border rounded-sm transition-colors"
            style={selected === i.sym
              ? { color: K.green, borderColor: hexA(KT('up'), 0.6), background: hexA(KT('up'), 0.08) }
              : { color: KT('textMuted'), borderColor: KT('grid'), background: 'transparent' }}
          >
            {i.sym}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[9px] tabular-nums">
          <span className="text-muted-foreground hidden sm:inline">{meta.name}</span>
          <span
            ref={midRef}
            className="px-1 rounded-[1px] font-bold"
            style={{ color: K.text }}
          >
            {fmt.price(book?.mid ?? last?.price)}
          </span>
          <span className="text-muted-foreground">SPR <span style={{ color: K.cyan }}>{book ? book.spread.toFixed(2) : '—'}</span></span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ImbalanceMeter v={book?.imbalance ?? 0} />
        <span className="text-[8px] tracking-[0.14em] text-muted-foreground">
          IMB {(100 * (book?.imbalance ?? 0)).toFixed(1)}% · {book ? `${book.spreadTicks}t` : '—'}
        </span>
        <span className="ml-auto flex items-center gap-2.5 text-[8px] tracking-[0.1em] tabular-nums">
          <span className="text-muted-foreground hidden md:inline">MICRO <span style={{ color: K.cyan }}>{isFinite(micro) ? fmt.price(micro) : '—'}</span></span>
          <span className="text-muted-foreground">CΔ <span style={{ color: cdelta >= 0 ? K.green : K.red }}>{cdelta >= 0 ? '+' : ''}{fmt.int(cdelta)}</span></span>
          <span className="hidden lg:flex items-center gap-1" title="Spread in ticks — trailing micro-history">
            <span className="text-muted-foreground">SPRΔ</span>
            <span className="w-[52px] inline-block">{microHist && <Spark buffer={microHist.spread} color={K.cyan} height={13} />}</span>
          </span>
          <span className="hidden lg:flex items-center gap-1" title="Quoted depth (levels) — trailing micro-history">
            <span className="text-muted-foreground">DPΔ</span>
            <span className="w-[52px] inline-block">{microHist && <Spark buffer={microHist.depth} color={K.green} height={13} />}</span>
          </span>
          <span style={{ color: l3 ? K.green : K.orange }}>DEPTH {bids.length}×{asks.length}</span>
        </span>
      </div>

      {/* ladder */}
      <div className="min-h-0" aria-label="Depth ladder" aria-live="off">
        <div className="flex justify-between text-[8px] tracking-[0.2em] text-muted-foreground px-0.5 mb-0.5">
          <span>ASK SIZE</span><span style={{ color: K.red }}>ASK QUEUE</span>
        </div>
        <div className="flex flex-col-reverse gap-[1.5px]">
          {asks.map((l) => <Row key={`a${l.price}`} level={l} side="ask" max={max} tickSize={0.25} />)}
        </div>
        <div className="my-1 border-t border-dashed border-gridline relative">
          <span className="absolute left-1/2 -translate-x-1/2 -top-1.5 text-[7.5px] tracking-[0.3em] px-1 bg-kpanel2 text-muted-foreground">
            MID {(book?.mid ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col gap-[1.5px]">
          {bids.map((l) => <Row key={`b${l.price}`} level={l} side="bid" max={max} tickSize={0.25} />)}
        </div>
        <div className="flex justify-between text-[8px] tracking-[0.2em] text-muted-foreground px-0.5 mt-0.5">
          <span style={{ color: K.green }}>BID QUEUE</span><span>BID SIZE</span>
        </div>
      </div>

      {/* tape */}
      <div className="border-t border-gridline pt-1.5">
        <div className="text-[8px] tracking-[0.24em] text-muted-foreground mb-1">TIME &amp; SALES</div>
        <div className="grid grid-cols-3 text-[9px] tabular-nums gap-x-2">
          {tape.slice(0, 4).map((t, i) => (
            <div key={`${t.t}-${i}`} className={`flex gap-1.5 px-1 rounded-[1px] ${t.side === 'B' ? 'text-green-300' : 'text-red-300'}`}>
              <span className="text-muted-foreground/70">{new Date(t.t).toLocaleTimeString('en-GB', { hour12: false })}</span>
              <span>{fmt.price(t.price)}</span>
              <span className="ml-auto opacity-70">{t.size}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
