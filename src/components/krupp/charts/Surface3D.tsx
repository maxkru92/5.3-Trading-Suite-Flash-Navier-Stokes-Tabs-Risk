'use client';
/**
 * KRUPP CAPITAL — 2.5D Implied Volatility Surface (mesh projection on canvas)
 */
import { Canvas } from './Canvas';
import { KT } from '@/lib/theme';

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

export interface Surface3DProps {
  /** z[iy][ix] — rows = yLabels (expiries), cols = xLabels (strikes) */
  z: () => number[][] | null;
  xLabels: () => string[];
  yLabels: () => string[];
  height?: string;
  className?: string;
}

function volColor(t: number): string {
  // teal → amber → crimson
  const stops: Array<[number, number, number]> = [
    [13, 148, 136],
    [251, 191, 36],
    [244, 63, 94],
  ];
  let a: number[];
  let b: number[];
  let f: number;
  if (t < 0.5) {
    a = stops[0];
    b = stops[1];
    f = t / 0.5;
  } else {
    a = stops[1];
    b = stops[2];
    f = (t - 0.5) / 0.5;
  }
  const r = a.map((x, i) => Math.round(x + (b[i] - x) * f));
  return `rgb(${r[0]},${r[1]},${r[2]})`;
}

const MONO = '9px ui-monospace, SFMono-Regular, Menlo, monospace';

export function Surface3D({ z, xLabels, yLabels, height = 'h-80', className = '' }: Surface3DProps) {
  return (
    <Canvas
      className={`w-full ${height} ${className}`}
      fps={15}
      draw={(ctx, w, h) => {
        const grid = z();
        const xl = xLabels();
        const yl = yLabels();
        if (!grid || grid.length === 0 || grid[0].length === 0) {
          ctx.fillStyle = KT('axisFaint');
          ctx.font = MONO;
          ctx.fillText('BUILDING VOL SURFACE…', 10, h / 2);
          return;
        }
        const ny = grid.length;
        const nx = grid[0].length;
        let min = Infinity;
        let max = -Infinity;
        for (let iy = 0; iy < ny; iy++) {
          for (let ix = 0; ix < nx; ix++) {
            const v = grid[iy][ix];
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        if (!isFinite(min) || !isFinite(max)) return;
        if (max - min < 1e-9) max = min + 1e-9;

        const proj = (ix: number, iy: number, v: number): [number, number] => {
          const u = ix / (nx - 1) - 0.5;
          const w2 = iy / (ny - 1) - 0.5;
          const hn = (v - min) / (max - min);
          const sx = w * 0.44 + (u - w2) * w * 0.4;
          const sy = h * 0.6 + (u + w2) * h * 0.17 - hn * h * 0.33;
          return [sx, sy];
        };

        /* quads, painter's algorithm: far rows first */
        for (let iy = 0; iy < ny - 1; iy++) {
          for (let ix = 0; ix < nx - 1; ix++) {
            const v00 = grid[iy][ix];
            const v10 = grid[iy][ix + 1];
            const v01 = grid[iy + 1][ix];
            const v11 = grid[iy + 1][ix + 1];
            const p00 = proj(ix, iy, v00);
            const p10 = proj(ix + 1, iy, v10);
            const p11 = proj(ix + 1, iy + 1, v11);
            const p01 = proj(ix, iy + 1, v01);
            const avg = (v00 + v10 + v01 + v11) / 4;
            ctx.fillStyle = volColor((avg - min) / (max - min));
            ctx.globalAlpha = 0.92;
            ctx.beginPath();
            ctx.moveTo(p00[0], p00[1]);
            ctx.lineTo(p10[0], p10[1]);
            ctx.lineTo(p11[0], p11[1]);
            ctx.lineTo(p01[0], p01[1]);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = hexA(KT('bgDeep'), 0.45);
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }

        /* axis labels */
        ctx.font = MONO;
        ctx.fillStyle = KT('zinc');
        ctx.textAlign = 'center';
        const stepX = Math.ceil(nx / 8);
        for (let ix = 0; ix < nx; ix += stepX) {
          const p = proj(ix, ny - 1, min);
          ctx.fillText(xl[ix] ?? '', p[0], Math.min(h - 2, p[1] + 12));
        }
        ctx.textAlign = 'left';
        const stepY = Math.ceil(ny / 6);
        for (let iy = 0; iy < ny; iy += stepY) {
          const p = proj(nx - 1, iy, grid[iy][nx - 1]);
          ctx.fillText(yl[iy] ?? '', Math.min(w - 34, p[0] + 6), p[1]);
        }
        ctx.textAlign = 'left';

        /* legend bar */
        const lx = w - 14;
        for (let yy = 0; yy < 80; yy++) {
          ctx.fillStyle = volColor(1 - yy / 80);
          ctx.fillRect(lx, 8 + yy, 8, 1);
        }
        ctx.fillStyle = KT('zinc');
        ctx.fillText(max.toFixed(0), lx - 4, 14);
        ctx.fillText(min.toFixed(0), lx - 4, 92);
      }}
    />
  );
}
