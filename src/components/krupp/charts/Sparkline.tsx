'use client';
/**
 * KRUPP CAPITAL — Sparkline (inline canvas, no React re-render)
 */
import { Canvas } from './Canvas';
import type { DataSource } from './LineChart';
import { Ring } from '@/lib/krupp/ring';
import { KT } from '@/lib/theme';

function srcAt(src: DataSource, i: number): number {
  return src instanceof Ring ? src.at(i) : (src as ArrayLike<number>)[i];
}

export interface SparklineProps {
  data: () => DataSource | null;
  color?: string;
  className?: string;
  fill?: boolean;
}

export function Sparkline({ data, color = KT('upDeep'), className = 'h-8 w-full', fill = true }: SparklineProps) {
  return (
    <Canvas
      className={className}
      fps={20}
      draw={(ctx, w, h) => {
        const d = data();
        if (!d || d.length < 2) return;
        const n = d.length;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < n; i++) {
          const v = srcAt(d, i);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (!isFinite(lo) || !isFinite(hi)) return;
        if (hi - lo < 1e-9) hi = lo + 1e-9;
        const X = (i: number): number => (i / (n - 1)) * (w - 2) + 1;
        const Y = (v: number): number => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
        if (fill) {
          ctx.beginPath();
          ctx.moveTo(X(0), h);
          for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(srcAt(d, i)));
          ctx.lineTo(X(n - 1), h);
          ctx.closePath();
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = X(i);
          const y = Y(srcAt(d, i));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }}
    />
  );
}
