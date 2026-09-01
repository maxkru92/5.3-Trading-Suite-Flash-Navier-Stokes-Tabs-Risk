'use client';
/**
 * KRUPP CAPITAL // COLOURLINE SWITCH
 * Segmented control flipping the whole suite between the two institutional
 * palettes. The choice is persisted (localStorage) and re-applied pre-paint
 * on boot via the inline <html data-theme> script in layout.tsx.
 *
 *  MK-II NAVY — reference colourline of the 13-desk matrix (default)
 *  HFT MATRIX — phosphor-green colourline of the London Strategic Edge desk
 */
import { Contrast } from 'lucide-react';
import { useTheme, THEME_ORDER, THEMES, type ThemeId } from '@/lib/theme';

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Colourline theme"
      title={`Colourline: ${THEMES[theme].name} — click to switch`}
      className="flex items-center gap-0.5 rounded border border-kborder2 bg-kinset p-0.5"
    >
      {!compact && (
        <span className="ml-1 flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.22em] text-kdim">
          <Contrast size={10} strokeWidth={2.2} className="text-kaccent" />
          <span className="hidden md:inline">COLOURLINE</span>
        </span>
      )}
      {THEME_ORDER.map((t: ThemeId) => {
        const active = t === theme;
        return (
          <button
            key={t}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(t)}
            className={`rounded-sm border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] transition-all ${
              active
                ? 'border-kaccent/70 bg-kaccent/15 text-kaccent-soft shadow-[0_0_10px_var(--glow-accent)]'
                : 'border-transparent text-kdim hover:border-kborder4 hover:text-ktext'
            }`}
          >
            {THEMES[t].name}
          </button>
        );
      })}
    </div>
  );
}
