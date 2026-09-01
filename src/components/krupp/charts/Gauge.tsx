'use client';
/**
 * KRUPP CAPITAL — Half-dial gauge (toxicity, entropy, health scores)
 */
import { Canvas } from './Canvas';
import { KT } from '@/lib/theme';

export interface GaugeZone {
  from: number;
  to: number;
  color: string;
}

export interface GaugeProps {
  value: () => number;
  min?: number;
  max?: number;
  label?: string;
  fmtV?: (v: number) => string;
  className?: string;
  zones?: GaugeZone[];
}

export function Gauge({
  value,
  min = 0,
  max = 100,
  label = '',
  fmtV = (v) => v.toFixed(1),
  className = 'h-24 w-full',
  zones = [],
}: GaugeProps) {
  return (
    <Canvas
      className={className}
      fps={15}
      draw={(ctx, w, h) => {
        const cx = w / 2;
        const cy = h - 10;
        const R = Math.min(w / 2 - 8, h - 18);
        const v = Math.min(max, Math.max(min, value()));
        const frac = (v - min) / (max - min || 1);
        const A = Math.PI * (1 - frac);

        const arc = (a0: number, a1: number, r: number, color: string, lw: number): void => {
          ctx.strokeStyle = color;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.arc(cx, cy, r, a0, a1);
          ctx.stroke();
        };

        if (zones.length > 0) {
          for (const z of zones) {
            const f0 = (Math.min(max, Math.max(min, z.from)) - min) / (max - min || 1);
            const f1 = (Math.min(max, Math.max(min, z.to)) - min) / (max - min || 1);
            arc(Math.PI * (1 - f1), Math.PI * (1 - f0), R - 6, z.color, 5);
          }
        } else {
          arc(Math.PI, 2 * Math.PI, R - 6, KT('grid'), 5);
        }

        /* needle */
        ctx.strokeStyle = KT('text');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(A) * (R - 10), cy + Math.sin(A) * (R - 10));
        ctx.stroke();
        ctx.fillStyle = KT('text');
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = KT('textDim');
        ctx.fillText(fmtV(v), cx, cy - R * 0.35);
        if (label) {
          ctx.fillStyle = KT('axisFaint');
          ctx.fillText(label.toUpperCase(), cx, cy - R * 0.35 + 12);
        }
        ctx.textAlign = 'left';
      }}
    />
  );
}
