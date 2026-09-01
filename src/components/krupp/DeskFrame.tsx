'use client';
/**
 * KRUPP CAPITAL — Desk scaffolding + sub-tab routing.
 * Sub-tab state lives in the global store → switching never clears
 * background calculations or streaming workers.
 */
import type { ReactNode } from 'react';
import { useKrupp, useSubTab } from '@/lib/krupp/store';
import { KT } from '@/lib/theme';

export type Accent = 'cyan' | 'amber' | 'emerald' | 'rose' | 'violet' | 'teal' | 'orange';

const ACCENT_ACTIVE: Record<Accent, string> = {
  cyan: 'border-kaccent/70 text-kaccent-soft bg-kaccent/10',
  amber: 'border-amber-400/70 text-amber-300 bg-amber-400/10',
  emerald: 'border-emerald-400/70 text-emerald-300 bg-emerald-400/10',
  rose: 'border-rose-400/70 text-rose-300 bg-rose-400/10',
  violet: 'border-violet-400/70 text-violet-300 bg-violet-400/10',
  teal: 'border-teal-400/70 text-teal-300 bg-teal-400/10',
  orange: 'border-orange-400/70 text-orange-300 bg-orange-400/10',
};

export function DeskFrame({
  deskId,
  title,
  code,
  subtabs,
  accent = 'cyan',
  right,
  children,
}: {
  deskId: number;
  title: string;
  code: string;
  subtabs?: string[];
  accent?: Accent;
  right?: ReactNode;
  children: ReactNode;
}) {
  const sub = useSubTab(deskId);
  const setSub = useKrupp((s) => s.setSubTab);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="font-mono text-base font-bold tracking-wide text-zinc-100 md:text-lg">{title}</h1>
          <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            {'DESK '}{String(deskId + 1).padStart(2, '0')}{' // '}{code}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {right}
          {subtabs && subtabs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {subtabs.map((s, i) => (
                <button
                  key={s}
                  onClick={() => setSub(deskId, i)}
                  className={`rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    sub === i ? ACCENT_ACTIVE[accent] : 'border-kborder2 text-zinc-500 hover:border-kborder4 hover:text-zinc-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function SubPane({ active, index, children }: { active: number; index: number; children: ReactNode }) {
  if (active !== index) return null;
  return <div className="flex flex-col gap-3">{children}</div>;
}
