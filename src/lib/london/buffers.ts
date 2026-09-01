// ============================================================================
// KRUPP CAPITAL // FLOAT32 RING BUFFERS
// Pre-allocated typed arrays — zero garbage during streaming (no V8 GC
// micro-stutters). Canvases iterate via .at(i) in rAF loops.
// ============================================================================

export class RingBuffer {
  readonly data: Float32Array
  private w = 0
  filled = 0

  constructor(readonly cap: number) {
    this.data = new Float32Array(cap)
  }

  push(v: number) {
    this.data[this.w] = v
    this.w = (this.w + 1) % this.cap
    if (this.filled < this.cap) this.filled++
  }

  /** ordered read: at(0) = oldest, at(filled-1) = newest */
  at(i: number): number {
    const start = this.filled < this.cap ? 0 : this.w
    return this.data[(start + i) % this.cap]
  }

  last(): number {
    if (this.filled === 0) return NaN
    return this.at(this.filled - 1)
  }

  clear() {
    this.w = 0
    this.filled = 0
  }
}

const C = 900 // 90s @ 10Hz
export const buffers = {
  price: new RingBuffer(C),
  volume: new RingBuffer(C),
  range: new RingBuffer(C),
  hawkes: new RingBuffer(C),
  viscosity: new RingBuffer(C),
  jerk: new RingBuffer(C),
  entropy: new RingBuffer(C),
  score: new RingBuffer(C),
  toxz: new RingBuffer(C),
  // round 8 — tri-instrument pulse strip (NQ/SPY ride the same 90s window)
  nq: new RingBuffer(C),
  spy: new RingBuffer(C),
}

/** min/max over the filled window of a ring buffer (NaN-safe when empty) */
export function windowRange(r: RingBuffer): { lo: number; hi: number } {
  const n = r.filled
  if (n === 0) return { lo: NaN, hi: NaN }
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < n; i++) { const v = r.at(i); if (v < lo) lo = v; if (v > hi) hi = v }
  return { lo, hi }
}

export function clearBuffers() {
  for (const k of Object.keys(buffers) as Array<keyof typeof buffers>) buffers[k].clear()
}
