'use client'

// ============================================================================
// KRUPP CAPITAL // POLICY PROFILE MANAGER (dialog)
// Save / load / delete named interceptor-threshold profiles. Profiles persist
// to localStorage and load through applyPolicy → worker hot-load.
// ============================================================================

import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileDown, FolderDown, Save, Trash2, Upload } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import { deleteProfile, exportProfiles, getActiveProfileName, importProfiles, saveProfile, type PolicyProfile } from '@/lib/london/policy'
import { K, fmt } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function profRowLabel(policy: { lockChaos: number; scaleVisc: number; killScore: number }): string {
  return `LOCK>${policy.lockChaos.toFixed(3)} · SCALE<${Math.round(policy.scaleVisc * 100)}% · KILL>${policy.killScore.toFixed(1)}`
}

export function PolicyProfiles() {
  const open = useKrupp((s) => s.profilesOpen)
  const setOpen = useKrupp((s) => s.setProfilesOpen)
  const setPolicy = useKrupp((s) => s.setPolicy)
  const current = useKrupp((s) => s.policy)
  const active = useKrupp((s) => s.activeProfile)
  const profiles = useKrupp((s) => s.deskProfiles)
  const refreshProfiles = useKrupp((s) => s.refreshProfiles)

  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // dialog-open is an event, not an effect — refresh the list synchronously
  const handleOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) refreshProfiles()
  }

  const doSave = () => {
    const list = saveProfile(name || `PROFILE-${new Date().toLocaleTimeString('en-GB', { hour12: false })}`, current)
    refreshProfiles()
    useKrupp.getState().setActiveProfile(getActiveProfileName())
    setName('')
    useKrupp.getState().pushLog({
      id: `pol-prof-${Date.now()}`, ts: Date.now(), source: 'RISK', level: 'info',
      message: `Policy profile saved — "${list[0]?.name}" (${profRowLabel(list[0]?.policy ?? current)}).`,
    })
  }

  const doLoad = (p: PolicyProfile) => {
    setPolicy(p.policy, { profile: p.name }) // hot-loads into the worker + persists + logs + sets the pointer
    setOpen(false)
  }

  const doDelete = (p: PolicyProfile) => {
    deleteProfile(p.name) // clears the localStorage pointer if it named the deleted profile
    refreshProfiles()
    useKrupp.getState().setActiveProfile(getActiveProfileName())
    useKrupp.getState().pushLog({
      id: `pol-prof-${Date.now()}`, ts: Date.now(), source: 'RISK', level: 'warn',
      message: `Policy profile deleted — "${p.name}".`,
    })
  }

  // --- desk ⇄ desk portability (JSON round-trip) -----------------------------
  const doExport = () => {
    const json = exportProfiles()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `krupp-policy-profiles_${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    useKrupp.getState().pushLog({
      id: `pol-exp-${Date.now()}`, ts: Date.now(), source: 'RISK', level: 'info',
      message: `Policy profiles exported — ${profiles.length} profile(s) → krupp-policy-profiles_${stamp}.json.`,
    })
  }

  const doImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = importProfiles(String(reader.result ?? ''))
      refreshProfiles()
      useKrupp.getState().pushLog({
        id: `pol-imp-${Date.now()}`, ts: Date.now(), source: 'RISK',
        level: res.added > 0 ? 'info' : 'warn',
        message: res.added > 0
          ? `[RISK] Policy profiles imported — +${res.added} (${res.names.join(', ')})${res.skipped ? ` · ${res.skipped} skipped` : ''}.`
          : `[RISK] Profile import rejected — no valid krupp.policyProfiles payload found.`,
      })
    }
    reader.readAsText(file)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-kheader border-gridline krupp-scroll sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader className="text-left">
          <DialogTitle className="font-mono text-[12px] tracking-[0.22em] text-secondary-foreground flex items-center gap-2">
            <FolderDown size={13} style={{ color: K.cyan }} aria-hidden />
            POLICY PROFILE MANAGER
          </DialogTitle>
          <DialogDescription className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            NAMED INTERCEPTOR THRESHOLD SETS · PERSISTED TO DESK PROFILE
          </DialogDescription>
        </DialogHeader>

        {/* save-current block */}
        <div className="border border-gridline bg-kbg-deep rounded-sm p-2">
          <div className="text-[8px] tracking-[0.18em] text-muted-foreground mb-1.5">
            SAVE CURRENT THRESHOLDS AS
            <span className="ml-2 tabular-nums" style={{ color: K.orange }}>
              LOCK&gt;{current.lockChaos.toFixed(3)} · SCALE&lt;{Math.round(current.scaleVisc * 100)}% · KILL&gt;{current.killScore.toFixed(1)}
            </span>
          </div>
          <div className="flex gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSave() }}
              placeholder="e.g. FOMC-HAWK, PM-SHIFT…"
              maxLength={24}
              className="h-7 bg-kpanel2 border-gridline font-mono text-[11px] uppercase"
              aria-label="Profile name"
            />
            <Button
              type="button" size="sm"
              className="h-7 px-2.5 font-mono text-[9px] tracking-[0.14em] font-bold bg-cyan-950/50 text-cyan-300 border border-cyan-800/50 hover:bg-cyan-900/50"
              onClick={doSave}
            >
              <Save size={11} className="mr-1" aria-hidden /> SAVE
            </Button>
          </div>
        </div>

        {/* profile list */}
        <div className="max-h-56 overflow-y-auto krupp-scroll border border-gridline bg-kbg-deep rounded-sm divide-y divide-[#12121a]">
          {profiles.length === 0 && (
            <div className="py-6 text-center text-[9px] tracking-[0.2em] text-muted-foreground font-mono">
              NO PROFILES SAVED — TUNE SLIDERS, THEN SAVE
            </div>
          )}
          {profiles.map((p) => {
            const isActive = active === p.name
            return (
              <div key={p.name} className="prof-row flex items-center gap-2 px-2 py-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: isActive ? K.cyan : KT('border4'), boxShadow: isActive ? `0 0 6px ${K.cyan}` : undefined }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] font-bold tracking-[0.12em] truncate flex items-center gap-1.5" style={{ color: isActive ? K.cyan : K.text }}>
                    {p.name}
                    {isActive && <span className="text-[7px] tracking-[0.18em] px-1 border rounded-sm" style={{ borderColor: hexA(KT('cyan'), 0.4), color: K.cyan }}>ACTIVE</span>}
                  </div>
                  <div className="text-[7.5px] tracking-[0.1em] text-muted-foreground tabular-nums truncate">
                    {profRowLabel(p.policy)} · {fmt.time(p.ts)}
                  </div>
                </div>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-6 px-1.5 text-[8px] tracking-[0.14em] font-bold text-muted-foreground hover:text-cyan-300 hover:bg-cyan-950/30 shrink-0"
                  onClick={() => doLoad(p)}
                  aria-label={`Load policy profile ${p.name}`}
                >
                  <Upload size={10} className="mr-0.5" aria-hidden /> LOAD
                </Button>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-6 px-1.5 text-[8px] tracking-[0.14em] font-bold text-muted-foreground hover:text-red-300 hover:bg-red-950/30 shrink-0"
                  onClick={() => doDelete(p)}
                  aria-label={`Delete policy profile ${p.name}`}
                >
                  <Trash2 size={10} aria-hidden />
                </Button>
              </div>
            )
          })}
        </div>

        {/* portability footer — JSON round-trip across desks */}
        <div className="flex items-center gap-1.5">
          <Button
            type="button" variant="ghost" size="sm"
            className="h-6 px-2 text-[8px] tracking-[0.16em] font-bold text-muted-foreground hover:text-cyan-300 hover:bg-cyan-950/30 border border-gridline"
            onClick={doExport}
            disabled={profiles.length === 0}
            aria-label="Export all policy profiles as JSON"
          >
            <FileDown size={10} className="mr-1" aria-hidden /> EXPORT JSON
          </Button>
          <Button
            type="button" variant="ghost" size="sm"
            className="h-6 px-2 text-[8px] tracking-[0.16em] font-bold text-muted-foreground hover:text-cyan-300 hover:bg-cyan-950/30 border border-gridline"
            onClick={() => fileRef.current?.click()}
            aria-label="Import policy profiles from JSON file"
          >
            <FolderDown size={10} className="mr-1" aria-hidden /> IMPORT JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doImportFile(f)
              e.target.value = '' // allow re-selecting the same file
            }}
          />
          <span className="ml-auto text-[7px] tracking-[0.14em] text-muted-foreground/70 tabular-nums">
            v1 ENVELOPE · SANITIZED ON IMPORT · NAME-DEDUP
          </span>
        </div>

        <div className="text-[7.5px] tracking-[0.14em] text-muted-foreground font-mono">
          PROFILES ARE DESK-LOCAL (localStorage) · MAX 24 · LOAD HOT-SWAPS THE KERNEL THRESHOLDS
        </div>
      </DialogContent>
    </Dialog>
  )
}
