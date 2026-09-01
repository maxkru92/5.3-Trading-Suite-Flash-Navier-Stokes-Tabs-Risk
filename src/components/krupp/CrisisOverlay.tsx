'use client';
/**
 * KRUPP CAPITAL — Systemic Crisis Lockdown overlay.
 * Flashing crimson alarm state while the liquidity crash propagates.
 */
import { ms } from '@/lib/krupp/engine';
import { useRevision } from '@/lib/krupp/store';
import { fCountdown } from '@/lib/krupp/format';
import { KT } from '@/lib/theme';

export function CrisisOverlay() {
  useRevision();
  const c = ms.crisis;
  if (!c.active) return null;
  const left = Math.max(0, c.endsAt - Date.now());
  const phaseLabel =
    c.phase === 'SHOCK' ? 'SHOCK PROPAGATION' : c.phase === 'RECOVERY' ? 'STABILIZATION' : 'FULL LOCKDOWN';
  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div className="crisis-flash absolute inset-0" />
      <div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 180px 40px rgba(190,18,60,0.35)' }}
      />
      <div className="absolute left-1/2 top-3 w-[min(680px,92vw)] -translate-x-1/2">
        <div className="crisis-blink rounded border border-rose-500/70 bg-kcrit-deep/95 px-4 py-2 text-center shadow-[0_0_40px_rgba(225,29,72,0.4)]">
          <div className="font-mono text-sm font-black tracking-[0.3em] text-rose-300 md:text-base">
            ⚠ SYSTEMIC CRISIS LOCKDOWN ⚠
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-widest text-rose-400/90">
            {phaseLabel} :: SHOCK PROPAGATED ACROSS ALL 13 DESKS :: AUTO-RECOVERY T-{fCountdown(left)}
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-kcrit-deep">
            <div
              className="h-full bg-rose-500 transition-all duration-200"
              style={{ width: `${Math.round(c.intensity * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
