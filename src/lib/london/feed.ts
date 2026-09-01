// ============================================================================
// KRUPP CAPITAL // LIVE FEED SINK (non-reactive, mutated at stream rate)
// High-frequency payloads live here; the zustand store only holds cheap
// snapshots + revision counters to keep React reconciliation minimal.
// ============================================================================

import type { Book, CboeSnapshot, EngineState, IvSurface, TapeItem, Tick } from './types'
import { RingBuffer } from './buffers'

export const feed = {
  books: new Map<string, Book>(),
  tapes: new Map<string, TapeItem[]>(),
  lastTick: new Map<string, Tick>(),
  cdelta: new Map<string, number>(), // cumulative signed delta from tape
  tapeT: new Map<string, number>(), // watermark ts to dedupe sliding tape
  micro: new Map<string, { spread: RingBuffer; depth: RingBuffer }>(), // per-sym micro-history
  cboe: null as CboeSnapshot | null,
  iv: null as IvSurface | null,
  engine: null as EngineState | null,
}

export function bumpCdelta(sym: string, tape: TapeItem[]) {
  let acc = feed.cdelta.get(sym) ?? 0
  let lastT = feed.tapeT.get(sym) ?? 0
  for (const t of tape) {
    if (t.t > lastT) {
      acc += (t.side === 'B' ? 1 : -1) * t.size
      if (t.t > lastT) lastT = t.t
    }
  }
  feed.cdelta.set(sym, acc)
  feed.tapeT.set(sym, lastT)
}

export function resetFeed() {
  feed.books.clear()
  feed.tapes.clear()
  feed.lastTick.clear()
  feed.cdelta.clear()
  feed.tapeT.clear()
  feed.micro.clear()
}
