/**
 * KRUPP CAPITAL — Zero-GC Float32Array Ring Buffer
 * Fixed-capacity circular buffer for high-frequency tick series.
 * No allocation on push/read. All hot paths operate in place.
 */
export class Ring {
  readonly buf: Float32Array;
  readonly cap: number;
  private start = 0;
  private count = 0;

  constructor(cap: number) {
    this.cap = Math.max(2, cap | 0);
    this.buf = new Float32Array(this.cap);
  }

  push(v: number): void {
    if (this.count < this.cap) {
      this.buf[(this.start + this.count) % this.cap] = v;
      this.count++;
    } else {
      this.buf[this.start] = v;
      this.start = (this.start + 1) % this.cap;
    }
  }

  get length(): number {
    return this.count;
  }

  /** i = 0 → oldest, length-1 → newest */
  at(i: number): number {
    if (i < 0 || i >= this.count) return NaN;
    return this.buf[(this.start + i) % this.cap];
  }

  /** k = 0 → newest */
  last(k = 0): number {
    return this.at(this.count - 1 - k);
  }

  /** Copy oldest→newest into out (truncating to out.length). Returns copied count. */
  fill(out: Float32Array): number {
    const n = Math.min(this.count, out.length);
    for (let i = 0; i < n; i++) out[i] = this.at(this.count - n + i);
    return n;
  }

  minMax(from = 0): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = Math.max(0, from); i < this.count; i++) {
      const v = this.buf[(this.start + i) % this.cap];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }
}
