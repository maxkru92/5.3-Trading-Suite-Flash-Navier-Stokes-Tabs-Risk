'use client';
/**
 * KRUPP CAPITAL — Shared UI kit (terminal-grade primitives)
 */
import type { ReactNode } from 'react';
import { KT } from '@/lib/theme';

/* ---------------- Panel ---------------- */
export function Panel({
  title,
  right,
  className = '',
  bodyClass = '',
  children,
}: {
  title?: ReactNode;
  right?: ReactNode;
  className?: string;
  bodyClass?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col rounded-md border border-kborder bg-kpanel/90 shadow-[0_0_0_1px_rgba(0,0,0,0.3)] ${className}`}>
      {(title !== undefined || right !== undefined) && (
        <header className="flex items-center justify-between gap-2 border-b border-kborder3 px-3 py-1.5">
          <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{title}</h3>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={`flex-1 p-3 ${bodyClass}`}>{children}</div>
    </section>
  );
}

/* ---------------- Badge ---------------- */
type Tone = 'zinc' | 'emerald' | 'rose' | 'amber' | 'cyan' | 'violet';
const TONE_CLS: Record<Tone, string> = {
  zinc: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
  emerald: 'border-emerald-700/60 bg-emerald-900/30 text-emerald-300',
  rose: 'border-rose-700/60 bg-rose-900/30 text-rose-300',
  amber: 'border-amber-700/60 bg-amber-900/30 text-amber-300',
  cyan: 'border-kaccent-deep/60 bg-kaccent-deep/30 text-kaccent-soft',
  violet: 'border-violet-700/60 bg-violet-900/30 text-violet-300',
};

export function Badge({
  tone = 'zinc',
  pulse = false,
  className = '',
  children,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider ${TONE_CLS[tone]} ${pulse ? 'animate-pulse' : ''} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------------- Stat ---------------- */
export function Stat({
  label,
  value,
  sub,
  tone = 'text-zinc-100',
  className = '',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`rounded border border-kborder bg-kpanel px-3 py-2 ${className}`}>
      <div className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`font-mono text-lg font-semibold leading-tight ${tone}`}>{value}</div>
      {sub !== undefined && <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

/* ---------------- FlashAlert ---------------- */
export function FlashAlert({
  active,
  tone = 'rose',
  title,
  children,
  className = '',
}: {
  active: boolean;
  tone?: Tone;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded border px-3 py-2 font-mono text-[11px] ${active ? `${TONE_CLS[tone]} animate-pulse` : 'border-kborder bg-kpanel/60 text-zinc-500'} ${className}`}
    >
      <div className="font-semibold tracking-wider">{title}</div>
      {children && <div className="mt-1 text-[10px] leading-snug opacity-90">{children}</div>}
    </div>
  );
}

/* ---------------- Section label ---------------- */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 ${className}`}>
      {children}
    </div>
  );
}

/* ---------------- Monospace table ---------------- */
export function Tbl({
  head,
  children,
  maxH = 'max-h-80',
}: {
  head: string[];
  children: ReactNode;
  maxH?: string;
}) {
  return (
    <div className={`overflow-auto rounded border border-kborder ${maxH} krupp-scroll`}>
      <table className="w-full border-collapse font-mono text-[11px]">
        <thead className="sticky top-0 z-10 bg-kpanel">
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-kborder px-2 py-1 text-left text-[9.5px] font-semibold uppercase tracking-wider text-zinc-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={`border-b border-kinset hover:bg-kpanel2 ${className}`}>{children}</tr>;
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-2 py-[3px] ${className}`}>{children}</td>;
}

/* ---------------- number color helper ---------------- */
export function clsNum(v: number, flat = 'text-zinc-400'): string {
  if (!isFinite(v) || Math.abs(v) < 1e-9) return flat;
  return v > 0 ? 'text-emerald-400' : 'text-rose-400';
}
