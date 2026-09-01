'use client';
/**
 * KRUPP CAPITAL // SESSION JOURNAL (round 9)
 *
 * The desk-side logbook: timestamped trader notes pinned to desk context —
 * active tab, London-desk regime (CALM/HIGH/CRISIS) and composite score at
 * write time. Entries persist in SQLite via /api/journal, keyed to a stable
 * per-browser clientId, and are CSV-exportable for the post-mortem workflow.
 *
 * Opened from EVERY surface: J hotkey (desks AND the LONDON EDGE landing),
 * the ⌘K workspace palette, the London terminal's own palette (WORKSPACE
 * group), the footer legend chip and the compact breadcrumb-rail trigger.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileDown, NotebookPen, RotateCcw, SendHorizontal, TriangleAlert, User } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useKrupp as useWorkspace } from '@/lib/krupp/store';
import { useKrupp as useLondon } from '@/lib/london/store';
import { KT } from '@/lib/theme';
import { TABS } from './tabs';

const MAX_TEXT = 400;
const MINE_KEY = 'krupp-journal-mine'; // persisted scope: 'all' | 'mine'

interface JournalRow {
  id: string;
  ts: number;
  desk: number;
  deskLabel: string;
  regime: string;
  score: number;
  text: string;
  mine: boolean;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function clock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** regime chip tone — CALM accent, HIGH warn, CRISIS down (theme-resolved) */
function regimeTone(regime: string): { c: string; bg: string } {
  if (regime === 'CRISIS') return { c: KT('down'), bg: `${KT('down')}14` };
  if (regime === 'HIGH') return { c: KT('warn'), bg: `${KT('warn')}14` };
  return { c: KT('accent'), bg: `${KT('accent')}14` };
}

export function WorkspaceJournal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const activeTab = useWorkspace((s) => s.activeTab);
  const clientId = useWorkspace((s) => s.clientId);
  const regime = useLondon((s) => s.metrics.regime);
  const score = useLondon((s) => s.metrics.score);

  const [text, setText] = useState('');
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [mineTotal, setMineTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ msg: string; warn: boolean } | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(MINE_KEY) === 'mine';
    } catch {
      return false;
    }
  });
  const listRef = useRef<HTMLDivElement>(null);

  const tabLabel = TABS[activeTab]?.label ?? `TAB ${activeTab}`;

  const refresh = useCallback(async (scope: boolean) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '80', mine: clientId() });
      if (scope) q.set('only', 'mine');
      const res = await fetch(`/api/journal?${q.toString()}`, { cache: 'no-store' });
      const j = await res.json();
      if (j?.ok) {
        setRows(j.entries as JournalRow[]);
        setTotal(j.total as number);
        setMineTotal((j.mineTotal as number) ?? 0);
      }
    } catch { /* journal service unavailable — keep the desk running */ } finally {
      setLoading(false);
    }
  }, []); // clientId() is a stable store method

  // load on every open — the journal is shared with other tabs/profiles
  useEffect(() => {
    if (open) {
      void refresh(onlyMine);
      setStatus(null);
      setArmedDelete(null);
    }
  }, [open, onlyMine, refresh]);

  const flipScope = (mine: boolean) => {
    setOnlyMine(mine);
    try {
      window.localStorage.setItem(MINE_KEY, mine ? 'mine' : 'all');
    } catch { /* storage unavailable */ }
  };

  const post = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId(),
          desk: activeTab,
          deskLabel: tabLabel,
          regime: String(regime ?? ''),
          score: Number(score ?? 0),
          text: body,
        }),
      });
      const j = await res.json();
      if (j?.ok) {
        setText('');
        setStatus({ msg: 'NOTE LOGGED TO THE SESSION JOURNAL', warn: false });
        await refresh(onlyMine);
        requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
      } else {
        setStatus({ msg: String(j?.error ?? 'LOG FAILED').toUpperCase(), warn: true });
      }
    } catch {
      setStatus({ msg: 'JOURNAL SERVICE UNREACHABLE', warn: true });
    } finally {
      setSending(false);
    }
  };

  const del = async (id: string) => {
    if (armedDelete !== id) {
      setArmedDelete(id);
      return;
    }
    setArmedDelete(null);
    try {
      const res = await fetch(`/api/journal?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await res.json();
      if (j?.ok) {
        const wasMine = rows.find((x) => x.id === id)?.mine ?? false;
        setRows((r) => r.filter((x) => x.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        if (wasMine) setMineTotal((m) => Math.max(0, m - 1));
        setStatus({ msg: 'NOTE STRUCK FROM THE JOURNAL', warn: false });
      }
    } catch { /* keep the desk running */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-kheader border-kborder2 max-h-[85vh] overflow-y-auto krupp-scroll sm:max-w-lg"
        aria-describedby={undefined}
        /* J is a true TOGGLE — same focus contract as the presets dialog (P):
         * keep focus on <body> so a second J reaches the Shell hotkey handler */
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-mono text-[12px] tracking-[0.22em] text-secondary-foreground flex items-center gap-2">
            <NotebookPen size={13} style={{ color: KT('accent') }} aria-hidden />
            SESSION JOURNAL
          </DialogTitle>
          <DialogDescription className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            DESK-SIDE LOGBOOK · EVERY NOTE STAMPS THE ACTIVE TAB, REGIME &amp; COMPOSITE SCORE · PERSISTED IN SQLITE
          </DialogDescription>
        </DialogHeader>

        {/* ---- compose ---- */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[8px] tracking-[0.2em] text-muted-foreground">
            <span>LOG AN OBSERVATION — ON {tabLabel.toUpperCase()}</span>
            <span className="font-mono text-[8px] text-muted-foreground/70">{text.length}/{MAX_TEXT}</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void post();
              }
            }}
            placeholder="e.g. ES bid depth thinned 40% into the window — widening quotes, watching the flip level…"
            rows={3}
            aria-label="Journal note"
            spellCheck={false}
            className="w-full resize-none rounded-sm border border-kborder2 bg-input/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-kaccent/70"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            {/* context stamps previewed live — what the row will remember */}
            <span className="font-mono text-[8.5px] tracking-[0.1em] text-muted-foreground">
              STAMPS: {String(activeTab).padStart(2, '0')} {tabLabel.toUpperCase()} · {String(regime ?? '—').toUpperCase()} · SCORE {Number(score ?? 0).toFixed(1)}
            </span>
            <button
              onClick={() => void post()}
              disabled={!text.trim() || sending}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded border border-kborder2 bg-kpanel px-2.5 py-1.5 font-mono text-[9.5px] font-bold tracking-[0.14em] text-foreground transition-colors hover:border-kaccent/70 disabled:opacity-40"
            >
              <SendHorizontal size={11} aria-hidden />
              {sending ? 'LOGGING…' : 'LOG NOTE'}
            </button>
            <button
              onClick={() => {
                const a = document.createElement('a');
                const q = new URLSearchParams({ format: 'csv', mine: clientId() });
                if (onlyMine) q.set('only', 'mine');
                a.href = `/api/journal?${q.toString()}`;
                a.download = '';
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
              title={onlyMine ? 'Export MY journal rows as CSV' : 'Export the full journal as CSV'}
              aria-label="Export journal CSV"
              className="flex shrink-0 items-center rounded border border-kborder2 bg-kpanel p-1.5 text-muted-foreground transition-colors hover:border-kaccent/70 hover:text-foreground"
            >
              <FileDown size={12} aria-hidden />
            </button>
          </div>
          {status && (
            <div
              role="status"
              className={`mt-1.5 flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.14em] ${status.warn ? 'text-amber-400' : ''}`}
              style={status.warn ? undefined : { color: KT('accent') }}
            >
              {status.warn ? <TriangleAlert size={10} aria-hidden /> : <Check size={10} aria-hidden />}
              {status.msg}
            </div>
          )}
        </div>

        {/* ---- entries ---- */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[8px] tracking-[0.2em] text-muted-foreground">
            <span>LOGGED NOTES — NEWEST FIRST</span>
            {/* scope selector — ALL rows vs this profile's own notes (persisted) */}
            <div className="flex items-center gap-1.5">
              <div
                role="radiogroup"
                aria-label="Journal scope"
                className="flex items-center overflow-hidden rounded-sm border border-kborder2"
              >
                {([
                  { k: false, label: 'ALL' },
                  { k: true, label: 'MINE' },
                ] as const).map(({ k, label }) => {
                  const active = onlyMine === k;
                  return (
                    <button
                      key={label}
                      role="radio"
                      aria-checked={active}
                      onClick={() => flipScope(k)}
                      title={k ? `Show only this profile's notes (${mineTotal})` : 'Show all profiles\u2019 notes'}
                      className={`flex items-center gap-1 px-1.5 py-px font-mono text-[8px] font-bold tracking-[0.16em] transition-colors ${
                        active ? 'bg-kaccent/15' : 'bg-transparent text-muted-foreground hover:text-foreground'
                      }`}
                      style={active ? { color: KT('accent') } : undefined}
                    >
                      {k && <User size={8} aria-hidden />}
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="font-mono text-[8px] tabular-nums text-muted-foreground/70">
                {onlyMine ? `${rows.length}/${mineTotal} MINE · ${total} TOTAL` : `${total} TOTAL · ${mineTotal} MINE`}
              </span>
            </div>
          </div>
          <div ref={listRef} className="krupp-scroll flex max-h-64 flex-col gap-1 overflow-y-auto pr-0.5">
            {loading && rows.length === 0 && (
              <div className="py-3 text-center font-mono text-[9px] tracking-[0.2em] text-muted-foreground">
                READING THE LOGBOOK…
              </div>
            )}
            {!loading && rows.length === 0 && (
              <div className="py-3 text-center font-mono text-[9px] leading-relaxed text-muted-foreground/70">
                JOURNAL EMPTY — LOG YOUR FIRST OBSERVATION ABOVE.
                <br />
                NOTES SURVIVE RELOADS AND FEED THE POST-MORTEM REVIEW.
              </div>
            )}
            {rows.map((r) => {
              const tone = regimeTone(r.regime);
              const deleting = armedDelete === r.id;
              return (
                <div
                  key={r.id}
                  className={`rounded-sm border px-2 py-1.5 transition-colors ${
                    deleting
                      ? 'border-rose-500/70 bg-rose-950/30'
                      : r.mine
                        ? 'bg-kpanel/60 hover:border-kborder4'
                        : 'border-kinset bg-kpanel/60 hover:border-kborder4'
                  }`}
                  style={
                    !deleting && r.mine
                      ? { borderColor: `${KT('accent')}45`, boxShadow: `inset 2px 0 0 ${KT('accent')}55` }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.1em] text-muted-foreground">
                    <span className="shrink-0 rounded-sm border border-kborder2 bg-kheader px-1 py-px font-bold text-foreground/90" title={r.deskLabel || 'Landing terminal'}>
                      {String(r.desk).padStart(2, '0')}
                    </span>
                    <span className="truncate">{(r.deskLabel || 'LONDON EDGE').toUpperCase()}</span>
                    {r.mine && (
                      <span
                        className="shrink-0 rounded-sm px-1 py-px font-bold tracking-[0.1em]"
                        style={{ color: KT('accent'), background: `${KT('accent')}14` }}
                        title="Logged from this profile"
                      >
                        MINE
                      </span>
                    )}
                    <span
                      className="shrink-0 rounded-sm px-1 py-px font-bold"
                      style={{ color: tone.c, background: tone.bg }}
                    >
                      {(r.regime || '—').toUpperCase()}
                    </span>
                    <span className="shrink-0 tabular-nums">Σ{r.score.toFixed(1)}</span>
                    <span className="ml-auto shrink-0 tabular-nums" title={new Date(r.ts).toISOString()}>
                      {clock(r.ts)}Z · {timeAgo(r.ts)}
                    </span>
                    <button
                      onClick={() => void del(r.id)}
                      onBlur={() => setArmedDelete((d) => (d === r.id ? null : d))}
                      aria-label={deleting ? 'Confirm delete note' : 'Delete note'}
                      title={deleting ? 'CONFIRM DELETE' : 'Strike this note'}
                      className={`flex shrink-0 items-center rounded-sm border px-1 py-px font-bold transition-colors ${
                        deleting
                          ? 'border-rose-500/80 bg-rose-950/50 text-rose-300'
                          : 'border-transparent text-muted-foreground hover:border-rose-500/40 hover:text-rose-300'
                      }`}
                    >
                      {deleting ? <TriangleAlert size={9} aria-hidden /> : <RotateCcw size={9} className="rotate-180" aria-hidden />}
                    </button>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed text-foreground/90">
                    {r.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[7.5px] tracking-[0.14em] text-muted-foreground font-mono">
          KRUPP CAPITAL // SESSION JOURNAL · /API/JOURNAL (SQLITE) · J HOTKEY ANYWHERE · ⌘⏎ TO LOG · ⌘K WORKSPACE GROUP · SCOPE PERSISTS
        </div>
      </DialogContent>
    </Dialog>
  );
}
