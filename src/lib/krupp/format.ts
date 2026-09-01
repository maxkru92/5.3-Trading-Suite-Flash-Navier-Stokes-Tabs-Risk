/**
 * KRUPP CAPITAL — Fixed-width formatting kernel.
 * All numerics route through here for strict monospace stability.
 */

export function fN(v: number, d = 2): string {
  if (!isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fSign(v: number, d = 2): string {
  if (!isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fPct(v: number, d = 2): string {
  if (!isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
}

export function fBps(v: number, d = 1): string {
  if (!isFinite(v)) return '—';
  return fSign(v, d) + 'bps';
}

export function fCompact(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e12) return s + (a / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
  return s + a.toFixed(0);
}

export function fPx(v: number, dec: number): string {
  if (!isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fVolPts(v: number): string {
  return isFinite(v) ? v.toFixed(2) : '—';
}

export function fClock(t: number, utc = true): string {
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, '0');
  const base = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  return utc ? base + ' UTC' : base;
}

export function fCountdown(msLeft: number): string {
  if (!isFinite(msLeft) || msLeft < 0) return '00:00';
  const s = Math.floor(msLeft / 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(Math.floor(s / 60))}:${p(s % 60)}`;
}

/** text tone class for a signed number */
export function toneNum(v: number, flat = 'text-zinc-400'): string {
  if (!isFinite(v) || v === 0) return flat;
  return v > 0 ? 'text-emerald-400' : 'text-rose-400';
}

export function fAgo(t: number, now: number): string {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm';
}
