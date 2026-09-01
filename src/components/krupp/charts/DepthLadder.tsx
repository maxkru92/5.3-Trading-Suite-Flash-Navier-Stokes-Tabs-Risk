'use client';
/**
 * KRUPP CAPITAL — L2/L3 vertical depth ladder.
 * Direct-DOM updates via rAF (no React re-render, zero GC churn).
 */
import { useEffect, useRef } from 'react';
import { getBook } from '@/lib/krupp/engine';
import { getInst } from '@/lib/krupp/engine';
import { fPx, fCompact } from '@/lib/krupp/format';
import { KT } from '@/lib/theme';

export interface DepthLadderProps {
  symbol: string;
  rows?: number;
  className?: string;
}

export function DepthLadder({ symbol, rows = 8, className = '' }: DepthLadderProps) {
  const bidRefs = useRef<Array<HTMLDivElement | null>>([]);
  const askRefs = useRef<Array<HTMLDivElement | null>>([]);
  const spreadRef = useRef<HTMLSpanElement | null>(null);
  const n = Math.min(rows, 8);

  useEffect(() => {
    let alive = true;
    let lastSeq = -1;
    const loop = (): void => {
      if (!alive) return;
      requestAnimationFrame(loop);
      const st = getInst(symbol);
      const b = getBook(symbol);
      if (!b || !st) return;
      const dec = st.def.dec;
      let maxSize = 1;
      for (let i = 0; i < n; i++) {
        if (b.bidSz[i] > maxSize) maxSize = b.bidSz[i];
        if (b.askSz[i] > maxSize) maxSize = b.askSz[i];
      }
      const flash = b.seq !== lastSeq;
      lastSeq = b.seq;
      if (spreadRef.current) {
        spreadRef.current.textContent = `${fPx(st.ask - st.bid, dec)} (${st.spreadBps.toFixed(1)}bps)`;
      }
      for (let i = 0; i < n; i++) {
        const bEl = bidRefs.current[i];
        const aEl = askRefs.current[i];
        if (bEl) {
          const sz = b.bidSz[i];
          const intensity = 0.1 + 0.55 * (sz / maxSize);
          bEl.textContent = `${fPx(b.bidPx[i], dec)}  ${fCompact(sz)}`;
          bEl.style.background = flash ? `rgba(16,185,129,${Math.min(0.75, intensity + 0.25)})` : `rgba(16,185,129,${intensity * 0.5})`;
        }
        if (aEl) {
          const sz = b.askSz[i];
          const intensity = 0.1 + 0.55 * (sz / maxSize);
          aEl.textContent = `${fPx(b.askPx[i], dec)}  ${fCompact(sz)}`;
          aEl.style.background = flash ? `rgba(244,63,94,${Math.min(0.75, intensity + 0.25)})` : `rgba(244,63,94,${intensity * 0.5})`;
        }
      }
    };
    const raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [symbol, n]);

  return (
    <div className={`flex flex-col font-mono text-[11px] leading-[1.35] ${className}`}>
      <div className="mb-1 flex justify-between text-[9px] uppercase tracking-wider text-zinc-500">
        <span>ASK PX / SZ</span>
        <span>LVL</span>
      </div>
      {Array.from({ length: n }, (_, i) => n - 1 - i).map((i) => (
        <div
          key={`a${i}`}
          ref={(el) => {
            askRefs.current[i] = el;
          }}
          className="flex justify-between rounded-sm px-1.5 py-[1px] text-rose-300"
        >
          <span>—</span>
        </div>
      ))}
      <div className="my-1 flex items-center justify-between border-y border-kborder4 px-1.5 py-[2px] text-[10px] text-zinc-400">
        <span>SPREAD</span>
        <span ref={spreadRef}>—</span>
      </div>
      {Array.from({ length: n }, (_, i) => i).map((i) => (
        <div
          key={`b${i}`}
          ref={(el) => {
            bidRefs.current[i] = el;
          }}
          className="flex justify-between rounded-sm px-1.5 py-[1px] text-emerald-300"
        >
          <span>—</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-zinc-500">
        <span>BID PX / SZ</span>
        <span>LVL</span>
      </div>
    </div>
  );
}
