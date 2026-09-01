'use client';
/**
 * KRUPP CAPITAL // POST-MORTEM DIGEST (round 10)
 *
 * The end-of-session brief: one dialog that aggregates the whole workspace —
 * colourline + layout state, engine/regime/crisis telemetry, the SQLite
 * execution-ledger aggregates (fills, volume, blocked tickets, desk sessions,
 * realized replay, open position) and the session journal (notes + latest
 * entry) — into a copyable terminal-style report for the post-mortem review.
 *
 * Opened from EVERY surface: G hotkey (desks AND the LONDON EDGE landing),
 * the ⌘K workspace palette REPORTING group, the London terminal's own
 * palette (REPORTING group), the footer legend chip and the compact
 * breadcrumb-rail trigger — same wiring contract as the journal (J).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Check, ClipboardList, Copy, FileDown, NotebookPen, RefreshCw, TriangleAlert,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useKrupp as useWorkspace, useRevision } from '@/lib/krupp/store';
import { useKrupp as useLondon } from '@/lib/london/store';
import { KT } from '@/lib/theme';
import { ms } from '@/lib/krupp/engine';
import { infra } from '@/lib/krupp/infraservice';
import { fN } from '@/lib/krupp/format';
import { THEMES, useTheme } from '@/lib/theme';
import { TABS } from './tabs';

/* ------------------------------------------------------------------ types */

interface LedgerSession {
  startTs: number;
  endTs: number;
  fills: number;
  blocked: number;
  volume: number;
  realized: number;
  pos: { sym: string; qty: number; avgPx: number } | null;
}
interface LedgerReply {
  ok: boolean;
  session?: {
    realized: number;
    optRealized: number;
    optFees: number;
    blocks: number;
    volume: number;
    total: number;
    pos: { sym: string; qty: number; avgPx: number } | null;
    sessions: LedgerSession[];
  };
}
interface JournalReply {
  ok: boolean;
  total: number;
  mineTotal: number;
  entries?: Array<{ id: string; ts: number; desk: number; deskLabel: string; regime: string; score: number; text: string; mine: boolean }>;
}
interface DigestData {
  ledger: LedgerReply['session'] | null;
  journal: { total: number; mineTotal: number; latest: JournalReply['entries'] | null } | null;
  fetchedAt: number;
}

const emptyData: DigestData = { ledger: null, journal: null, fetchedAt: 0 };

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function utc(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;
}

const usd = (v: number): string => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/** section row — label / dotted leader / value (tabular, theme-resolved tone) */
function Row({ label, value, tone, title, mono = true }: {
  label: string; value: React.ReactNode; tone?: string; title?: string; mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 leading-relaxed" title={title}>
      <span className="shrink-0 font-mono text-[9px] tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className="mb-[3px] min-w-3 flex-1 border-b border-dotted border-kborder2/70" aria-hidden />
      <span
        className={`shrink-0 text-[10.5px] font-bold tabular-nums ${mono ? 'font-mono' : ''} truncate max-w-[60%] text-right`}
        style={{ color: tone ?? KT('text') }}
      >
        {value}
      </span>
    </div>
  );
}

function Section({ icon, title, right, children }: {
  icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-kborder bg-kbg-deep p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <span className="font-mono text-[9px] font-bold tracking-[0.22em] text-secondary-foreground">{title}</span>
        {right && <span className="ml-auto font-mono text-[8.5px] tracking-[0.12em] text-muted-foreground">{right}</span>}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function WorkspaceDigest({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useRevision(); // live engine tick + crisis state while the dialog is open
  const activeTab = useWorkspace((s) => s.activeTab);
  const favs = useWorkspace((s) => s.favs);
  const presets = useWorkspace((s) => s.presets);
  const sfxOn = useWorkspace((s) => s.sfxOn);
  const clientId = useWorkspace((s) => s.clientId);
  const theme = useTheme((s) => s.theme);
  const regime = useLondon((s) => s.metrics.regime);
  const score = useLondon((s) => s.metrics.score);

  const [data, setData] = useState<DigestData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; warn: boolean } | null>(null);

  const tab = TABS[activeTab] ?? TABS[0];

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [lr, jr] = await Promise.all([
        fetch('/api/ledger?limit=1', { cache: 'no-store' }).then((r) => r.json() as Promise<LedgerReply>).catch(() => null),
        fetch(`/api/journal?limit=5&mine=${encodeURIComponent(clientId())}`, { cache: 'no-store' })
          .then((r) => r.json() as Promise<JournalReply>).catch(() => null),
      ]);
      setData({
        ledger: lr?.ok ? (lr.session ?? null) : null,
        journal: jr?.ok
          ? { total: jr.total, mineTotal: jr.mineTotal, latest: jr.entries ?? null }
          : null,
        fetchedAt: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }, []); // clientId() is a stable store method

  // fresh aggregate on every open — the digest always reports the live DB
  useEffect(() => {
    if (open) {
      void refresh();
      setStatus(null);
    }
  }, [open, refresh]);

  /* ---------------------------------------------------------- text report */
  const buildReport = (): string => {
    const L = data.ledger;
    const J = data.journal;
    const sess = L?.sessions ?? [];
    const best = sess.length ? Math.max(...sess.map((s) => s.realized)) : null;
    const worst = sess.length ? Math.min(...sess.map((s) => s.realized)) : null;
    const pin = favs.length ? favs.map((i) => String(i).padStart(2, '0')).join(' · ') : '—';
    const pos = L?.pos;
    const latest = J?.latest?.[0];
    const lines = [
      'KRUPP CAPITAL // POST-MORTEM DIGEST',
      `GENERATED ${new Date().toISOString().slice(0, 19).replace('T', ' ')}Z · COLOURLINE ${THEMES[theme].name}`,
      '',
      '[WORKSPACE]',
      `  ACTIVE TAB      ${String(activeTab).padStart(2, '0')} ${tab.label}`,
      `  PINNED DESKS    ${favs.length ? `${favs.length} (${pin})` : '0'}`,
      `  LAYOUT PRESETS  ${Object.keys(presets).length}`,
      `  DESK AUDIO      ${sfxOn ? 'ON' : 'OFF'}`,
      `  ENGINE TICK     #${fN(ms.tickCount, 0)} · ${fN(infra.tps.length ? infra.tps.last() : 0, 0)} tps`,
      `  LONDON REGIME   ${String(regime ?? '—').toUpperCase()} · SCORE ${(score ?? 0).toFixed(1)}`,
      `  CRISIS STATE    ${ms.crisis.active ? `ACTIVE (cycle #${ms.crisis.count})` : `IDLE · ${ms.crisis.count} cycle(s) this boot`}`,
      '',
      '[EXECUTION LEDGER — SQLITE]',
      `  PERSISTED ROWS  ${L ? fN(L.total, 0) : '—'} (futures + options)`,
      `  SESSION VOLUME  ${L ? `${fN(L.volume, 0)} lots` : '—'}`,
      `  BLOCKED TICKETS ${L ? fN(L.blocks, 0) : '—'}`,
      `  DESK SESSIONS   ${sess.length}${best != null ? ` · BEST ${usd(best ?? 0)} · WORST ${usd(worst ?? 0)}` : ''}`,
      `  OPEN POSITION   ${pos ? `${pos.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(pos.qty)}× ${pos.sym} @ ${pos.avgPx.toFixed(2)}` : 'FLAT'}`,
      `  REALIZED REPLAY ${L ? `${usd(L.realized)} FUT · ${usd(L.optRealized)} OPT · FEES $${L.optFees.toFixed(2)}` : '—'}`,
      '',
      '[SESSION JOURNAL]',
      `  NOTES           ${J ? `${J.total} total · ${J.mineTotal} mine` : '—'}`,
      `  LATEST          ${latest ? `"${latest.text.slice(0, 80)}${latest.text.length > 80 ? '…' : ''}" (${utc(latest.ts)} · desk ${String(latest.desk).padStart(2, '0')})` : '—'}`,
      '',
      'ALL FEEDS SIMULATED IN-SANDBOX · KRUPP CAPITAL MK-III · G → DIGEST ANYWHERE',
    ];
    return lines.join('\n');
  };

  const copyReport = async () => {
    const text = buildReport();
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ msg: 'DIGEST COPIED TO CLIPBOARD', warn: false });
      return;
    } catch { /* async API denied (permissions / insecure context) — legacy path below */ }
    // deprecated-but-universally-supported fallback: hidden textarea +
    // execCommand('copy') — works where the async Clipboard API is blocked
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      setStatus(
        ok
          ? { msg: 'DIGEST COPIED TO CLIPBOARD', warn: false }
          : { msg: 'COPY BLOCKED BY THE BROWSER — USE EXPORT .TXT', warn: true },
      );
    } catch {
      setStatus({ msg: 'COPY BLOCKED BY THE BROWSER — USE EXPORT .TXT', warn: true });
    }
  };

  const downloadReport = () => {
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = URL.createObjectURL(new Blob([buildReport()], { type: 'text/plain;charset=utf-8' }));
    a.download = `krupp-digest-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus({ msg: 'DIGEST EXPORTED — krupp-digest-*.txt', warn: false });
  };

  /* --------------------------------------------------------------- derive */
  const L = data.ledger;
  const J = data.journal;
  const sess = L?.sessions ?? [];
  const best = sess.length ? Math.max(...sess.map((s) => s.realized)) : null;
  const worst = sess.length ? Math.min(...sess.map((s) => s.realized)) : null;
  const latest = J?.latest?.[0] ?? null;
  const regimeTone = regime === 'CRISIS' ? KT('down') : regime === 'HIGH' ? KT('warn') : KT('accent');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-kheader border-kborder2 max-h-[85vh] overflow-y-auto krupp-scroll sm:max-w-lg"
        aria-describedby={undefined}
        /* G is a true TOGGLE — keep focus on <body> so a second G reaches the
         * Shell hotkey handler (same contract as P presets / J journal) */
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-mono text-[12px] tracking-[0.22em] text-secondary-foreground flex items-center gap-2">
            <ClipboardList size={13} style={{ color: KT('accent') }} aria-hidden />
            POST-MORTEM DIGEST
          </DialogTitle>
          <DialogDescription className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            END-OF-SESSION BRIEF · WORKSPACE + LEDGER + JOURNAL IN ONE REPORT · LIVE FROM SQLITE
          </DialogDescription>
        </DialogHeader>

        {/* ---- actions ---- */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded border border-kborder2 bg-kpanel px-2 py-1.5 font-mono text-[9.5px] font-bold tracking-[0.14em] text-muted-foreground transition-colors hover:border-kaccent/70 hover:text-foreground disabled:opacity-40"
            title="Re-read the ledger + journal aggregates"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} aria-hidden />
            {loading ? 'READING…' : 'REFRESH'}
          </button>
          <button
            onClick={() => void copyReport()}
            className="flex items-center gap-1.5 rounded border border-kborder2 bg-kpanel px-2 py-1.5 font-mono text-[9.5px] font-bold tracking-[0.14em] text-foreground transition-colors hover:border-kaccent/70"
            title="Copy the digest as a terminal-style text report"
          >
            <Copy size={11} aria-hidden />
            COPY AS TEXT
          </button>
          <button
            onClick={downloadReport}
            className="ml-auto flex items-center gap-1.5 rounded border border-kborder2 bg-kpanel px-2 py-1.5 font-mono text-[9.5px] font-bold tracking-[0.14em] text-foreground transition-colors hover:border-kaccent/70"
            title="Download the digest as a .txt audit artefact"
          >
            <FileDown size={11} aria-hidden />
            EXPORT .TXT
          </button>
        </div>
        {status && (
          <div
            role="status"
            className={`flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.14em] ${status.warn ? 'text-amber-400' : ''}`}
            style={status.warn ? undefined : { color: KT('accent') }}
          >
            {status.warn ? <TriangleAlert size={10} aria-hidden /> : <Check size={10} aria-hidden />}
            {status.msg}
          </div>
        )}

        {/* ---- workspace snapshot ---- */}
        <Section
          icon={<ClipboardList size={11} style={{ color: KT('accent') }} aria-hidden />}
          title="WORKSPACE SNAPSHOT"
          right={`${utc(data.fetchedAt || Date.now())} · ${THEMES[theme].name}`}
        >
          <Row label="ACTIVE TAB" value={`${String(activeTab).padStart(2, '0')} ${tab.label}`} />
          <Row
            label="PINNED DESKS"
            value={favs.length ? `${favs.length} (${favs.map((i) => String(i).padStart(2, '0')).join(' · ')})` : '0'}
            tone={favs.length ? KT('warn') : undefined}
          />
          <Row label="LAYOUT PRESETS" value={String(Object.keys(presets).length)} />
          <Row label="DESK AUDIO" value={sfxOn ? 'ON' : 'OFF'} tone={sfxOn ? KT('accent') : KT('textFaint')} />
          <Row label="ENGINE" value={`TICK #${fN(ms.tickCount, 0)} · ${fN(infra.tps.length ? infra.tps.last() : 0, 0)} tps`} />
          <Row
            label="LONDON REGIME"
            value={`${String(regime ?? '—').toUpperCase()} · SCORE ${(score ?? 0).toFixed(1)}`}
            tone={regimeTone}
          />
          <Row
            label="CRISIS STATE"
            value={ms.crisis.active ? `ACTIVE · CYCLE #${ms.crisis.count}` : `IDLE · ${ms.crisis.count} CYCLE(S) THIS BOOT`}
            tone={ms.crisis.active ? KT('down') : KT('textFaint')}
          />
        </Section>

        {/* ---- execution ledger ---- */}
        <Section
          icon={<FileDown size={11} style={{ color: KT('accent') }} aria-hidden />}
          title="EXECUTION LEDGER — SQLITE"
          right={loading ? 'READING…' : L ? `${fN(L.total, 0)} ROWS` : 'UNAVAILABLE'}
        >
          {!L && !loading && (
            <div className="py-2 text-center font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
              LEDGER SERVICE UNREACHABLE — DESK TELEMETRY ONLY
            </div>
          )}
          {L && (
            <>
              <Row label="SESSION VOLUME" value={`${fN(L.volume, 0)} LOTS`} />
              <Row label="BLOCKED TICKETS" value={fN(L.blocks, 0)} tone={L.blocks > 0 ? KT('warn') : KT('textFaint')} />
              <Row
                label="DESK SESSIONS"
                value={sess.length ? `${sess.length} · BEST ${usd(best ?? 0)} · WORST ${usd(worst ?? 0)}` : '0'}
                tone={best != null && best >= 0 ? KT('up') : KT('down')}
                title={sess.map((s, i) => `#${sess.length - i} ${utc(s.startTs)} → ${utc(s.endTs)} · ${s.fills}f · ${usd(s.realized)}`).join('\n')}
              />
              <Row
                label="OPEN POSITION"
                value={L.pos ? `${L.pos.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(L.pos.qty)}× ${L.pos.sym} @ ${L.pos.avgPx.toFixed(2)}` : 'FLAT'}
                tone={L.pos ? (L.pos.qty > 0 ? KT('up') : KT('down')) : KT('textFaint')}
              />
              <Row
                label="REALIZED REPLAY"
                value={`${usd(L.realized)} FUT · ${usd(L.optRealized)} OPT · FEES $${L.optFees.toFixed(2)}`}
                tone={L.realized + L.optRealized >= 0 ? KT('up') : KT('down')}
              />
            </>
          )}
        </Section>

        {/* ---- session journal ---- */}
        <Section
          icon={<NotebookPen size={11} style={{ color: KT('accent') }} aria-hidden />}
          title="SESSION JOURNAL"
          right={J ? `${J.total} TOTAL · ${J.mineTotal} MINE` : 'UNAVAILABLE'}
        >
          {!J && !loading && (
            <div className="py-2 text-center font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
              JOURNAL SERVICE UNREACHABLE
            </div>
          )}
          {J && J.total === 0 && (
            <div className="py-2 text-center font-mono text-[9px] tracking-[0.18em] text-muted-foreground">
              NO NOTES LOGGED — PRESS J TO START THE LOGBOOK
            </div>
          )}
          {J && latest && (
            <div className="rounded-sm border border-kinset bg-kpanel/60 px-2 py-1.5">
              <div className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.1em] text-muted-foreground">
                <span className="rounded-sm border border-kborder2 bg-kheader px-1 py-px font-bold text-foreground/90">
                  {String(latest.desk).padStart(2, '0')}
                </span>
                <span className="truncate">{(latest.deskLabel || 'LONDON EDGE').toUpperCase()}</span>
                <span className="ml-auto shrink-0 tabular-nums">{utc(latest.ts)} · {timeAgo(latest.ts)}</span>
              </div>
              <div className="mt-1 line-clamp-2 font-mono text-[10px] leading-relaxed text-foreground/90">
                “{latest.text}”
              </div>
            </div>
          )}
        </Section>

        <div className="text-[7.5px] font-mono tracking-[0.14em] text-muted-foreground">
          KRUPP CAPITAL // POST-MORTEM DIGEST · G HOTKEY ANYWHERE · ⌘K REPORTING GROUP · AGGREGATES RE-READ ON EVERY OPEN
        </div>
      </DialogContent>
    </Dialog>
  );
}
