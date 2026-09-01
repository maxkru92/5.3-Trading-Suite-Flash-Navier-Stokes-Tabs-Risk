'use client';
/**
 * KRUPP CAPITAL — Base Canvas
 * DPR-aware, ResizeObserver-driven, rAF loop with fps throttle.
 * `draw` closures stay fresh via ref without restarting the loop.
 */
import { useEffect, useRef } from 'react';

export interface CanvasProps {
  className?: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
  fps?: number;
}

export function Canvas({ className = '', draw, fps = 30 }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    let last = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const ro = new ResizeObserver(() => {
      const nw = cv.clientWidth;
      const nh = cv.clientHeight;
      if (nw !== w || nh !== h) {
        w = nw;
        h = nh;
        cv.width = Math.max(1, Math.round(w * dpr));
        cv.height = Math.max(1, Math.round(h * dpr));
      }
    });
    ro.observe(cv);

    const loop = (t: number): void => {
      raf = requestAnimationFrame(loop);
      if (t - last < 950 / fps) return;
      last = t;
      if (w < 4 || h < 4) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h, t);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
