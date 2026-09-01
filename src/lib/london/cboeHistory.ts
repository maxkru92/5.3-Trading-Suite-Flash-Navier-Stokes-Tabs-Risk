// ============================================================================
// KRUPP CAPITAL // CBOE HISTORY BUFFERS (client-side rolling history)
// ============================================================================

import { RingBuffer } from './buffers'

export const cboeHistory = {
  vix: new RingBuffer(120), // 120 samples @ 3s = 6 min
  pc: new RingBuffer(120),
}
