'use client';
/**
 * KRUPP CAPITAL — Vertical bar chart (GEX profiles, OI, flow).
 */
import { Canvas } from './Canvas';
import { KT } from '@/lib/theme';

export interface BarSpec {
  v: number;
  color: string;
  label?: string;
}

export interface BarChartProps {
  bars: () => BarSpec[] | null;
  height?: string;
  className?: string;
  zeroLine?: boolean;
  symmetric?: boolean;
  fmtV?: (v: number) => string;
  hlines?: Array<{ y: number | (() => number); color: string; label?: string }>;
}

const MONO = '9px ui-monospace, SFMono-Regular, Menlo, monospace';

export function BarChart({
  bars,
  height = 'h-48',
  className = '',
  zeroLine = true,
  symmetric = false,
  fmtV = (v) => v.toFixed(1),
  hlines,
}: BarChartProps) {
  return (
    <Canvas
      className={`w-full ${height} ${className}`}
      fps={30}
      draw={(ctx, w, h) => {
        const arr = bars();
        const plotR = w - 48;
        if (!arr || arr.length === 0) {
          ctx.fillStyle = KT('axisFaint');
          ctx.font = MONO;
          ctx.fillText('AWAITING TICK STREAM…', 10, h / 2);
          return;
        }
        let lo = 0;
        let hi = 0;
        if (symmetric) {
          let m = 0;
          for (const b of arr) m = Math.max(m, Math.abs(b.v));
          lo = -m * 1.08;
          hi = m * 1.08;
        } else {
          for (const b of arr) {
            if (b.v < lo) lo = b.v;
            if (b.v > hi) hi = b.v;
          }
          const pad = (hi - lo) * 0.1 || 1;
          lo -= pad;
          hi += pad;
        }
        const Y = (v: number): number => h - 14 - ((v - lo) / (hi - lo)) * (h - 26);

        /* grid */
        ctx.strokeStyle = KT('grid');
        ctx.fillStyle = KT('axisFaint');
        ctx.font = MONO;
        ctx.lineWidth = 1;
        for (let g = 0; g <= 4; g++) {
          const v = lo + ((hi - lo) * g) / 4;
          const y = Y(v);
          ctx.beginPath();
          ctx.moveTo(2, y);
          ctx.lineTo(plotR, y);
          ctx.stroke();
          ctx.fillText(fmtV(v), plotR + 4, y + 3);
        }

        if (zeroLine && lo < 0 && hi > 0) {
          const y = Y(0);
          ctx.strokeStyle = KT('axisFaint');
          ctx.beginPath();
          ctx.moveTo(2, y);
          ctx.lineTo(plotR, y);
          ctx.stroke();
        }

        if (hlines) {
          for (const hl of hlines) {
            const v = typeof hl.y === 'function' ? hl.y() : hl.y;
            if (!isFinite(v) || v < lo || v > hi) continue;
            const y = Y(v);
            ctx.strokeStyle = hl.color;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(2, y);
            ctx.lineTo(plotR, y);
            ctx.stroke();
            ctx.setLineDash([]);
            if (hl.label) {
              ctx.fillStyle = hl.color;
              ctx.fillText(hl.label, 4, y - 3);
            }
          }
        }

        const n = arr.length;
        const bw = Math.max(2, (plotR - 4) / n - 2);
        const labelEvery = n > 26 ? Math.ceil(n / 22) : 1;
        ctx.textAlign = 'center';
        for (let i = 0; i < n; i++) {
          const b = arr[i];
          const x = 2 + (i + 0.5) * ((plotR - 4) / n);
          const y0 = Y(0);
          const y1 = Y(b.v);
          ctx.fillStyle = b.color;
          ctx.fillRect(x - bw / 2, Math.min(y0, y1), bw, Math.max(1, Math.abs(y1 - y0)));
          if (b.label && i % labelEvery === 0) {
            ctx.fillStyle = KT('axisFaint');
            ctx.save();
            ctx.translate(x, h - 3);
            ctx.fillText(b.label, 0, 0);
            ctx.restore();
          }
        }
        ctx.textAlign = 'left';
      }}
    />
  );
}
