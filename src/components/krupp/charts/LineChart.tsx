'use client';
/**
 * KRUPP CAPITAL — Multi-series Line/Area chart (zero-allocation draw path).
 * Reads Ring buffers / Float32Array directly in the rAF loop.
 */
import { Canvas } from './Canvas';
import { Ring } from '@/lib/krupp/ring';
import { KT } from '@/lib/theme';

export type DataSource = Ring | readonly number[] | Float32Array;

function srcLen(src: DataSource): number {
  return src.length;
}
function srcAt(src: DataSource, i: number): number {
  return src instanceof Ring ? src.at(i) : (src as ArrayLike<number>)[i];
}

export interface LineSeries {
  label: string;
  color: string;
  data: () => DataSource | null;
  width?: number;
  dash?: [number, number];
}

export interface ShadeSpec {
  a: () => DataSource | null;
  b: () => DataSource | null;
  color: string;
}

export interface HLine {
  y: number | (() => number);
  color: string;
  label?: string;
  dash?: [number, number];
}

export interface Marker {
  /** index from newest (0 = latest) */
  pos: number;
  label: string;
  color: string;
}

export interface LineChartProps {
  series: LineSeries[];
  shade?: ShadeSpec;
  hlines?: HLine[];
  markers?: () => Marker[] | null;
  height?: string;
  className?: string;
  zeroLine?: boolean;
  yPad?: number;
  fmtV?: (v: number) => string;
}

const MONO = '9px ui-monospace, SFMono-Regular, Menlo, monospace';

export function LineChart({
  series,
  shade,
  hlines,
  markers,
  height = 'h-56',
  className = '',
  zeroLine = false,
  yPad = 0.1,
  fmtV = (v) => v.toFixed(2),
}: LineChartProps) {
  return (
    <Canvas
      className={`w-full ${height} ${className}`}
      fps={30}
      draw={(ctx, w, h) => {
        const plotR = w - 48;
        const srcs: Array<{ s: LineSeries; d: DataSource }> = [];
        for (const s of series) {
          const d = s.data();
          if (d && srcLen(d) > 1) srcs.push({ s, d });
        }
        let shadeA: DataSource | null = null;
        let shadeB: DataSource | null = null;
        if (shade) {
          shadeA = shade.a();
          shadeB = shade.b();
        }

        if (srcs.length === 0 && !shadeA) {
          ctx.fillStyle = KT('axisFaint');
          ctx.font = MONO;
          ctx.fillText('AWAITING TICK STREAM…', 10, h / 2);
          return;
        }

        let lo = Infinity;
        let hi = -Infinity;
        const scan = (d: DataSource): void => {
          const n = srcLen(d);
          for (let i = 0; i < n; i++) {
            const v = srcAt(d, i);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        };
        for (const x of srcs) scan(x.d);
        if (shadeA && shadeB) { scan(shadeA); scan(shadeB); }
        if (hlines) {
          for (const hl of hlines) {
            const v = typeof hl.y === 'function' ? hl.y() : hl.y;
            if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
          }
        }
        if (!isFinite(lo) || !isFinite(hi)) return;
        if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
        const pad = (hi - lo) * yPad;
        lo -= pad;
        hi += pad;

        const Y = (v: number): number => h - 14 - ((v - lo) / (hi - lo)) * (h - 26);
        const X = (i: number, n: number): number => (n <= 1 ? plotR : 2 + (i / (n - 1)) * (plotR - 4));

        /* grid */
        ctx.strokeStyle = KT('grid');
        ctx.lineWidth = 1;
        ctx.fillStyle = KT('axisFaint');
        ctx.font = MONO;
        ctx.textAlign = 'left';
        for (let g = 0; g <= 4; g++) {
          const v = lo + ((hi - lo) * g) / 4;
          const y = Y(v);
          ctx.beginPath();
          ctx.moveTo(2, y);
          ctx.lineTo(plotR, y);
          ctx.stroke();
          ctx.fillText(fmtV(v), plotR + 4, y + 3);
        }

        /* zero line */
        if (zeroLine && lo < 0 && hi > 0) {
          const y = Y(0);
          ctx.strokeStyle = KT('border4');
          ctx.beginPath();
          ctx.moveTo(2, y);
          ctx.lineTo(plotR, y);
          ctx.stroke();
        }

        /* shaded band between two series */
        if (shade && shadeA && shadeB && srcLen(shadeA) > 1 && srcLen(shadeB) > 1) {
          const nA = srcLen(shadeA);
          const nB = srcLen(shadeB);
          ctx.beginPath();
          for (let i = 0; i < nA; i++) {
            const x = X(i, nA);
            const y = Y(srcAt(shadeA, i));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          for (let i = nB - 1; i >= 0; i--) {
            ctx.lineTo(X(i, nB), Y(srcAt(shadeB, i)));
          }
          ctx.closePath();
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = shade.color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        /* hlines */
        if (hlines) {
          for (const hl of hlines) {
            const v = typeof hl.y === 'function' ? hl.y() : hl.y;
            if (!isFinite(v) || v < lo || v > hi) continue;
            const y = Y(v);
            ctx.strokeStyle = hl.color;
            ctx.setLineDash(hl.dash ?? [4, 3]);
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

        /* series */
        for (const { s, d } of srcs) {
          const n = srcLen(d);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width ?? 1.4;
          if (s.dash) ctx.setLineDash(s.dash);
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const x = X(i, n);
            const y = Y(srcAt(d, i));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        /* markers */
        if (markers) {
          const mk = markers();
          if (mk) {
            ctx.font = MONO;
            for (const m of mk) {
              const n = srcs.length > 0 ? srcLen(srcs[0].d) : 0;
              const i = n - 1 - m.pos;
              if (i < 0 || n === 0) continue;
              const x = X(i, n);
              ctx.fillStyle = m.color;
              ctx.beginPath();
              ctx.moveTo(x, 10);
              ctx.lineTo(x - 4, 3);
              ctx.lineTo(x + 4, 3);
              ctx.closePath();
              ctx.fill();
              ctx.fillText(m.label, Math.min(x + 5, plotR - 70), 12);
            }
          }
        }

        /* legend + last values */
        ctx.textAlign = 'left';
        let lx = 6;
        for (const { s, d } of srcs) {
          const n = srcLen(d);
          const lastV = srcAt(d, n - 1);
          ctx.fillStyle = s.color;
          ctx.fillRect(lx, 4, 7, 7);
          ctx.fillStyle = KT('textDim');
          const txt = `${s.label} ${fmtV(lastV)}`;
          ctx.fillText(txt, lx + 10, 11);
          lx += 16 + ctx.measureText(txt).width;
          if (lx > plotR - 60) break;
        }
      }}
    />
  );
}
