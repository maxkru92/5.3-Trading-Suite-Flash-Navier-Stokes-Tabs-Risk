'use client';
/**
 * KRUPP CAPITAL // LAYOUT PRESETS — NAMED WORKSPACE SNAPSHOTS
 *
 * Save / load / rename / duplicate / delete named snapshots of the workspace
 * layout (active tab, per-desk sub-tabs, instrument selections, pinned desks).
 * Snapshots live in 'krupp-presets' — a separate storage key the layout
 * factory reset never touches. Opened via the ⌘K workspace palette, the P
 * hotkey (desks AND the LONDON EDGE landing), the compact rail trigger, or
 * the landing terminal's own command palette (WORKSPACE group).
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bookmark, Check, Copy, Pencil, RotateCcw, Save, Star, TriangleAlert, X } from 'lucide-react';
import { useKrupp, type PresetSaveResult } from '@/lib/krupp/store';
import { KT } from '@/lib/theme';
import { TABS } from './tabs';

const MAX_NAME = 24;

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const STATUS_TONE: Record<PresetSaveResult, { msg: string; warn: boolean }> = {
  ok: { msg: 'SNAPSHOT SAVED', warn: false },
  'overwrite-ok': { msg: 'SNAPSHOT OVERWRITTEN', warn: false },
  'overwrite-needed': { msg: 'NAME EXISTS — PRESS AGAIN TO OVERWRITE', warn: true },
  full: { msg: 'PRESET STORE FULL (12 SLOTS) — DELETE ONE FIRST', warn: true },
  invalid: { msg: 'NAME REQUIRED (MAX 24 CHARS)', warn: true },
};

export function WorkspacePresets({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const presets = useKrupp((s) => s.presets);
  const activeTab = useKrupp((s) => s.activeTab);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<PresetSaveResult | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [rowMsg, setRowMsg] = useState<{ msg: string; warn: boolean } | null>(null);

  const entries = Object.entries(presets).sort(([, a], [, b]) => b.savedAt - a.savedAt);
  const activeName = TABS[activeTab]?.label ?? `TAB ${activeTab}`;
  const overwriteArmed = status === 'overwrite-needed';

  const doSave = () => {
    const res = useKrupp.getState().savePreset(name, overwriteArmed);
    setStatus(res);
    if (res === 'ok' || res === 'overwrite-ok') setName('');
  };

  const handleClose = (v: boolean) => {
    setStatus(null);
    setArmedDelete(null);
    setRenaming(null);
    setRowMsg(null);
    if (!v) setName('');
    onOpenChange(v);
  };

  const commitRename = () => {
    if (!renaming) return;
    const res = useKrupp.getState().renamePreset(renaming, renameVal);
    if (res === 'ok') {
      setRowMsg({ msg: `RENAMED → ${renameVal.trim().toUpperCase()}`, warn: false });
      setRenaming(null);
    } else if (res === 'exists') {
      setRowMsg({ msg: 'NAME ALREADY IN USE', warn: true });
    } else {
      setRowMsg({ msg: 'NAME REQUIRED (MAX 24 CHARS)', warn: true });
    }
  };

  const doDuplicate = (pname: string) => {
    const res = useKrupp.getState().duplicatePreset(pname);
    if (res === 'ok') {
      const dupName = Object.keys(useKrupp.getState().presets).find(
        (k) => k !== pname && (k === `${pname} COPY` || k.startsWith(`${pname.slice(0, 20)} #`)),
      );
      setRowMsg({ msg: `DUPLICATED → ${dupName ?? pname + ' COPY'}`, warn: false });
    } else if (res === 'full') {
      setRowMsg({ msg: 'PRESET STORE FULL (12 SLOTS) — DELETE ONE FIRST', warn: true });
    } else {
      setRowMsg({ msg: 'SNAPSHOT NOT FOUND', warn: true });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="bg-kheader border-kborder2 max-h-[85vh] overflow-y-auto krupp-scroll sm:max-w-lg"
        aria-describedby={undefined}
        /* P is a true TOGGLE: keep focus on <body> when the dialog opens so a
         * second P reaches the Shell hotkey handler instead of being swallowed
         * by the name-input guard (matches the ⌘K palette toggle symmetry) */
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="font-mono text-[12px] tracking-[0.22em] text-secondary-foreground flex items-center gap-2">
            <Bookmark size={13} style={{ color: KT('accent') }} aria-hidden />
            LAYOUT PRESETS
          </DialogTitle>
          <DialogDescription className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            NAMED WORKSPACE SNAPSHOTS · ACTIVE TAB + SUB-TABS + SELECTIONS + PINS · SURVIVE THE FACTORY RESET
          </DialogDescription>
        </DialogHeader>

        {/* ---- save current layout ---- */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2">
          <div className="text-[8px] tracking-[0.2em] text-muted-foreground mb-1.5 flex items-center justify-between gap-2">
            <span>SNAPSHOT THE CURRENT LAYOUT</span>
            <span className="font-mono text-[8px] text-muted-foreground/70">{entries.length}/12 SLOTS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value.slice(0, MAX_NAME)); setStatus(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') doSave(); }}
              placeholder={`e.g. LONDON MORNING BOOK — on ${activeName}`}
              maxLength={MAX_NAME}
              spellCheck={false}
              aria-label="Preset name"
              className="h-7 min-w-0 flex-1 rounded-sm border border-kborder2 bg-input/60 px-2 font-mono text-[10.5px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-kaccent/70"
            />
            <button
              onClick={doSave}
              disabled={entries.length >= 12 && !overwriteArmed}
              className={`flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[9.5px] font-bold tracking-[0.14em] transition-colors disabled:opacity-40 ${
                overwriteArmed
                  ? 'border-amber-400/80 bg-amber-950/50 text-amber-200'
                  : 'border-kborder2 bg-kpanel text-foreground hover:border-kaccent/70 hover:text-foreground'
              }`}
            >
              {overwriteArmed ? <TriangleAlert size={11} aria-hidden /> : <Save size={11} aria-hidden />}
              {overwriteArmed ? 'CONFIRM OVERWRITE' : 'SNAPSHOT'}
            </button>
          </div>
          <div className="mt-1.5 truncate font-mono text-[8.5px] tracking-[0.1em] text-muted-foreground/80">
            CAPTURES: TAB {String(activeTab).padStart(2, '0')} ({activeName}) · CURRENT SUB-TABS · SELECTIONS · ★ PINS
          </div>
          {status && (
            <div
              role="status"
              className={`mt-1.5 flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.14em] ${STATUS_TONE[status].warn ? 'text-amber-400' : ''}`}
              style={STATUS_TONE[status].warn ? undefined : { color: KT('accent') }}
            >
              {STATUS_TONE[status].warn ? <TriangleAlert size={10} aria-hidden /> : <Check size={10} aria-hidden />}
              {STATUS_TONE[status].msg}
            </div>
          )}
        </div>

        {/* ---- saved presets ---- */}
        <div className="border border-kborder bg-kbg-deep rounded-sm p-2">
          <div className="text-[8px] tracking-[0.2em] text-muted-foreground mb-1.5">SAVED LAYOUTS — CLICK LOAD TO RESTORE</div>
          {entries.length === 0 ? (
            <div className="text-[9px] text-muted-foreground/70 font-mono py-1">
              NO SAVED LAYOUTS YET — NAME THE CURRENT WORKSPACE ABOVE AND SNAPSHOT IT.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {entries.map(([pname, snap]) => {
                const tabLabel = TABS[snap.activeTab]?.label ?? `TAB ${snap.activeTab}`;
                const deleting = armedDelete === pname;
                const editing = renaming === pname;
                return (
                  <div
                    key={pname}
                    className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 transition-colors ${
                      deleting
                        ? 'border-rose-500/70 bg-rose-950/30'
                        : editing
                          ? 'border-kaccent/60 bg-kaccent/5'
                          : 'border-kinset bg-kpanel/60 hover:border-kborder4'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <input
                          value={renameVal}
                          autoFocus
                          onChange={(e) => setRenameVal(e.target.value.slice(0, MAX_NAME))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          maxLength={MAX_NAME}
                          spellCheck={false}
                          aria-label={`Rename preset ${pname}`}
                          className="h-6 w-full min-w-0 rounded-sm border border-kaccent/50 bg-input/60 px-1.5 font-mono text-[10.5px] font-bold text-foreground outline-none focus:border-kaccent"
                        />
                      ) : (
                        <div className="truncate font-mono text-[10.5px] font-bold tracking-[0.06em] text-foreground" title={pname}>
                          {pname}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.08em] text-muted-foreground">
                        <span className="truncate">{tabLabel}</span>
                        {snap.favs.length > 0 && (
                          <span className="flex items-center gap-0.5 shrink-0 text-amber-300/90">
                            <Star size={7} fill="currentColor" aria-hidden />
                            {snap.favs.length}
                          </span>
                        )}
                        <span className="shrink-0">· {timeAgo(snap.savedAt)}</span>
                      </div>
                    </div>
                    {editing ? (
                      <>
                        <button
                          onClick={commitRename}
                          aria-label="Commit rename"
                          title="Commit rename (Enter)"
                          className="flex shrink-0 items-center rounded border border-kaccent/50 bg-kaccent/10 p-1 transition-colors hover:border-kaccent"
                          style={{ color: KT('accent') }}
                        >
                          <Check size={11} aria-hidden />
                        </button>
                        <button
                          onClick={() => setRenaming(null)}
                          aria-label="Cancel rename"
                          title="Cancel (Esc)"
                          className="flex shrink-0 items-center rounded border border-transparent p-1 text-muted-foreground transition-colors hover:border-rose-500/40 hover:text-rose-300"
                        >
                          <X size={11} aria-hidden />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setRenaming(pname); setRenameVal(pname); setRowMsg(null); }}
                          aria-label={`Rename preset ${pname}`}
                          title="Rename snapshot"
                          className="flex shrink-0 items-center rounded border border-transparent p-1 text-muted-foreground transition-colors hover:border-kaccent/50 hover:text-foreground"
                        >
                          <Pencil size={10} aria-hidden />
                        </button>
                        <button
                          onClick={() => doDuplicate(pname)}
                          aria-label={`Duplicate preset ${pname}`}
                          title="Duplicate snapshot"
                          className="flex shrink-0 items-center rounded border border-transparent p-1 text-muted-foreground transition-colors hover:border-kaccent/50 hover:text-foreground"
                        >
                          <Copy size={10} aria-hidden />
                        </button>
                        <button
                          onClick={() => {
                            if (useKrupp.getState().applyPreset(pname)) handleClose(false);
                          }}
                          title={`Restore "${pname}" — jumps to ${tabLabel}`}
                          className="flex shrink-0 items-center gap-1 rounded border border-kaccent/40 bg-kaccent/10 px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] transition-colors hover:border-kaccent/80"
                          style={{ color: KT('accent') }}
                        >
                          LOAD
                        </button>
                        <button
                          onClick={() => {
                            if (!deleting) { setArmedDelete(pname); return; }
                            useKrupp.getState().deletePreset(pname);
                            setArmedDelete(null);
                          }}
                          onBlur={() => setArmedDelete((d) => (d === pname ? null : d))}
                          aria-label={deleting ? `Confirm delete preset ${pname}` : `Delete preset ${pname}`}
                          title={deleting ? 'CONFIRM DELETE' : 'Delete snapshot'}
                          className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-1 font-mono text-[9px] font-bold tracking-[0.14em] transition-colors ${
                            deleting
                              ? 'border-rose-500/80 bg-rose-950/50 text-rose-300'
                              : 'border-transparent text-muted-foreground hover:border-rose-500/40 hover:text-rose-300'
                          }`}
                        >
                          {deleting ? <TriangleAlert size={10} aria-hidden /> : <RotateCcw size={10} className="rotate-180" aria-hidden />}
                          {deleting ? 'SURE?' : 'DEL'}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {rowMsg && (
            <div
              role="status"
              className={`mt-1.5 flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.14em] ${rowMsg.warn ? 'text-amber-400' : ''}`}
              style={rowMsg.warn ? undefined : { color: KT('accent') }}
            >
              {rowMsg.warn ? <TriangleAlert size={10} aria-hidden /> : <Check size={10} aria-hidden />}
              {rowMsg.msg}
            </div>
          )}
        </div>

        <div className="text-[7.5px] tracking-[0.14em] text-muted-foreground font-mono">
          KRUPP CAPITAL // LAYOUT PRESETS · STORED LOCALLY ('krupp-presets') · P HOTKEY ANYWHERE · ⌘K WORKSPACE GROUP
        </div>
      </DialogContent>
    </Dialog>
  );
}
