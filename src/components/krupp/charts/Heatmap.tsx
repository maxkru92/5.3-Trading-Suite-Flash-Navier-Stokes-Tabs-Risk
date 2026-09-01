'use client';
/**
 * KRUPP CAPITAL — Matrix heatmap with hover tooltip (correlations, density).
 */
import { useState } from 'react';
import { Canvas } from './Canvas';
import { KT } from '@/lib/theme';

export interface HeatmapProps {
  rows: () => string[];
  cols: () => string[];
  values: () => number[][] | null;
  height?: string;
  className?: string;
  scale?: 'diverging' | 'heat' | 'mono';
  fmt?: (v: number) => string;
}

const GUTTER_L = 58;
const GUTTER_T = 20;

function heatColor(t: number): string {
  // dark navy → amber → crimson
  const c1 = [16, 24, 40];
  const c2 = [217, 119, 6];
  const c3 = [225, 29, 72];
  const r = t < 0.5
    ? c1.map((a, i) => Math.round(a + (c2[i] - a) * (t / 0.5)))
    : c2.map((a, i) => Math.round(a + (c3[i] - a) * ((t - 0.5) / 0.5)));
  return `rgb(${r[0]},${r[1]},${r[2]})`;
}

export function Heatmap({
  rows,
  cols,
  values,
  height = 'h-72',
  className = '',
  scale = 'diverging',
  fmt = (v) => v.toFixed(2),
}: HeatmapProps) {
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);

  return (
    <div className={`relative ${className}`}>
      <Canvas
        className={`w-full ${height}`}
        fps={20}
        draw={(ctx, w, h) => {
          const rs = rows();
          const cs = cols();
          const vals = values();
          if (!vals || rs.length === 0 || cs.length === 0) {
            ctx.fillStyle = KT('axisFaint');
            ctx.font = '9px ui-monospace, monospace';
            ctx.fillText('AWAITING TICK STREAM…', 10, h / 2);
            return;
          }
          const cw = (w - GUTTER_L - 6) / cs.length;
          const ch = (h - GUTTER_T - 6) / rs.length;
          ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
          /* labels */
          ctx.fillStyle = KT('zinc');
          ctx.textAlign = 'center';
          for (let c = 0; c < cs.length; c++) {
            ctx.fillText(cs[c], GUTTER_L + c * cw + cw / 2, 13);
          }
          ctx.textAlign = 'right';
          for (let r = 0; r < rs.length; r++) {
            ctx.fillText(rs[r], GUTTER_L - 5, GUTTER_T + r * ch + ch / 2 + 3);
          }
          /* cells */
          ctx.textAlign = 'center';
          for (let r = 0; r < rs.length; r++) {
            for (let c = 0; c < cs.length; c++) {
              const v = vals[r]?.[c] ?? 0;
              let fill: string;
              if (scale === 'diverging') {
                const a = Math.min(0.92, 0.08 + Math.abs(v));
                fill = v >= 0 ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`;
              } else if (scale === 'heat') {
                fill = heatColor(Math.min(1, Math.max(0, v)));
              } else {
                fill = `rgba(45,212,191,${Math.min(0.9, 0.06 + Math.abs(v))})`;
              }
              ctx.fillStyle = fill;
              ctx.fillRect(GUTTER_L + c * cw + 1, GUTTER_T + r * ch + 1, cw - 2, ch - 2);
              if (cw > 30 && ch > 16) {
                ctx.fillStyle = KT('bgDeep');
                ctx.fillText(fmt(v), GUTTER_L + c * cw + cw / 2, GUTTER_T + r * ch + ch / 2 + 3);
              }
            }
          }
          ctx.textAlign = 'left';
        }}
      />
      <div
        className="absolute inset-0"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rs = rows();
          const cs = cols();
          const vals = values();
          const mx = e.clientX - rect.left - GUTTER_L;
          const my = e.clientY - rect.top - GUTTER_T;
          const cw = (rect.width - GUTTER_L - 6) / Math.max(1, cs.length);
          const ch = (rect.height - GUTTER_T - 6) / Math.max(1, rs.length);
          const c = Math.floor(mx / cw);
          const r = Math.floor(my / ch);
          if (vals && r >= 0 && c >= 0 && r < rs.length && c < cs.length) {
            setTip({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              label: `${rs[r]} × ${cs[c]} = ${fmt(vals[r]?.[c] ?? 0)}`,
            });
          } else setTip(null);
        }}
        onMouseLeave={() => setTip(null)}
      />
      {tip && (
        <div
          className="pointer-events-none absolute z-50 whitespace-nowrap rounded border border-kborder4 bg-kpanel2 px-2 py-1 font-mono text-[10px] text-zinc-200 shadow-lg"
          style={{ left: tip.x + 10, top: tip.y - 24 }}
        >
          {tip.label}
        </div>
      )}
    </div>
  );
}
