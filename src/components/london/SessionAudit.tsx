'use client'

// ============================================================================
// KRUPP CAPITAL // SESSION AUDIT — PERSISTED RISK EVENT LEDGER (SQLite)
// Reads /api/events (Prisma RiskEvent). 10s poll + manual refresh.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Archive, FileDown, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadRiskReport } from '@/lib/london/report'
import { PrintReportButton } from './PrintReport'
import { K, Led, Panel, fmt } from './shared'
import { KT } from '@/lib/theme';

interface Ev {
  id: string
  type: string
  severity: 'info' | 'warn' | 'crit'
  source: string
  message: string
  createdAt: string
}

interface Stats {
  total: number
  crit: number
  byType: Record<string, number>
}

const sevColor: Record<string, string> = {
  info: K.green,
  warn: K.orange,
  crit: K.red,
}

export function SessionAudit() {
  const [events, setEvents] = useState<Ev[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/events?limit=40', { cache: 'no-store' })
      const j = await res.json()
      if (j?.ok) {
        setEvents(j.events)
        setStats(j.stats)
        setErr(false)
      } else setErr(true)
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 10000)
    return () => clearInterval(id)
  }, [load])

  // event-rate histogram — per-minute severity buckets across the loaded window
  const buckets = useMemo(() => {
    if (events.length === 0) return []
    const times = events.map((e) => new Date(e.createdAt).getTime()).sort((a, b) => a - b)
    const t0 = times[0]
    const t1 = Date.now()
    const nBuckets = 24
    const span = Math.max(t1 - t0, 60_000)
    const width = span / nBuckets
    const out = Array.from({ length: nBuckets }, () => ({ info: 0, warn: 0, crit: 0 }))
    for (const e of events) {
      const b = Math.min(nBuckets - 1, Math.max(0, Math.floor((new Date(e.createdAt).getTime() - t0) / width)))
      out[b][e.severity]++
    }
    return out
  }, [events])
  const maxBucket = Math.max(1, ...buckets.map((b) => b.info + b.warn + b.crit))

  return (
    <Panel
      title="SESSION AUDIT"
      sub="PERSISTED RISK EVENTS · SQLITE/PRISMA · 10s POLL"
      accent={err ? 'orange' : 'dim'}
      right={
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost" size="sm"
            className="h-6 px-1.5 text-[7.5px] tracking-[0.16em] font-bold text-muted-foreground hover:text-cyan-300 hover:bg-cyan-950/30"
            onClick={() => {
              setExporting(true)
              void downloadRiskReport().finally(() => setExporting(false))
            }}
            disabled={exporting}
            aria-label="Export risk report (Markdown)"
            title="Export full risk-desk report (Markdown) — kernel, CBOE, IV/GEX, ledger, audit"
            type="button"
          >
            <FileDown size={11} className={exporting ? 'animate-pulse' : ''} aria-hidden />
            {exporting ? 'BUILDING…' : 'EXPORT'}
          </Button>
          <PrintReportButton
            className="h-6 px-1.5 inline-flex items-center gap-1 text-[7.5px] tracking-[0.16em] font-bold text-muted-foreground hover:text-cyan-300 hover:bg-cyan-950/30"
          />
          {/* r11 — raw audit-trail CSV (server-side stream, all persisted rows) */}
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-cyan-300"
            onClick={() => {
              const a = document.createElement('a')
              a.href = '/api/events?format=csv'
              a.download = ''
              document.body.appendChild(a)
              a.click()
              a.remove()
            }}
            aria-label="Export audit trail as CSV"
            title="Export the persisted risk-event audit trail as CSV (all rows)"
            type="button"
          >
            <Archive size={12} aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-green-400" onClick={() => void load()} aria-label="Refresh audit ledger" type="button">
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
          </Button>
        </div>
      }
      bodyClass="p-2 flex flex-col gap-1.5 min-h-0"
    >
      {/* stats strip */}
      <div className="flex flex-wrap items-center gap-2 text-[9px] tabular-nums">
        <span className="flex items-center gap-1.5 border border-gridline bg-kbg-deep rounded-sm px-2 py-0.5">
          <Archive size={10} className="text-muted-foreground" aria-hidden />
          LEDGER <span style={{ color: K.cyan }}>{stats ? stats.total : '—'}</span>
        </span>
        <span className="border border-gridline bg-kbg-deep rounded-sm px-2 py-0.5">
          CRIT <span style={{ color: K.red }}>{stats ? stats.crit : '—'}</span>
        </span>
        {stats &&
          Object.entries(stats.byType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([t, c]) => (
              <span key={t} className="text-muted-foreground">
                {t} <span style={{ color: K.green }}>{c}</span>
              </span>
            ))}
      </div>

      {/* event-rate strip — severity mix per bucket over the poll window */}
      <div className="flex items-end gap-[2px] h-7 px-px" aria-hidden>
        {buckets.length === 0
          ? <span className="text-[8px] text-muted-foreground tracking-[0.2em]">EVENT RATE · AWAITING DATA…</span>
          : buckets.map((b, i) => {
            const tot = b.info + b.warn + b.crit
            return (
              <div key={i} className="flex-1 min-w-[3px] h-full flex flex-col justify-end gap-px audit-bucket" title={`${tot} event(s) in bucket ${i}`}>
                {b.crit > 0 && <div style={{ height: `${(b.crit / maxBucket) * 100}%`, background: K.red, boxShadow: `0 0 4px ${K.red}88` }} />}
                {b.warn > 0 && <div style={{ height: `${(b.warn / maxBucket) * 100}%`, background: K.orange, opacity: 0.85 }} />}
                {b.info > 0 && <div style={{ height: `${(b.info / maxBucket) * 100}%`, background: K.green, opacity: 0.5 }} />}
                {tot === 0 && <div className="h-px bg-kinset" />}
              </div>
            )
          })}
      </div>
      {buckets.length > 0 && (
        <div className="flex justify-between text-[7px] tracking-[0.16em] text-muted-foreground tabular-nums -mt-1">
          <span className="flex items-center gap-1"><Activity size={8} aria-hidden /> RATE · {fmt.time(events[events.length - 1]?.createdAt ?? Date.now())} → NOW</span>
          <span className="flex items-center gap-2">
            <span style={{ color: K.red }}>■ CRIT</span>
            <span style={{ color: K.orange }}>■ WARN</span>
            <span style={{ color: K.green }}>■ INFO</span>
          </span>
        </div>
      )}

      <div className="overflow-x-auto overflow-y-auto krupp-scroll flex-1 min-h-[140px] max-h-[320px] xl:max-h-none border border-gridline rounded-sm bg-kbg-deep" aria-label="Persisted risk events" aria-live="off">
        <table className="w-full text-[9px] tabular-nums border-collapse font-mono table-fixed">
          <thead className="sticky top-0 z-10">
            <tr className="bg-kpanel2 text-muted-foreground tracking-[0.12em]">
              <th className="py-1 px-1.5 text-left font-medium w-[64px]">TIME</th>
              <th className="py-1 px-1 text-left font-medium w-[92px]">TYPE</th>
              <th className="py-1 px-1 text-left font-medium w-[64px]">SEV</th>
              <th className="py-1 px-1.5 text-left font-medium">MESSAGE</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && !err && (
              <tr><td colSpan={4} className="text-center py-5 text-muted-foreground text-[10px] tracking-[0.2em]">LEDGER EMPTY — EVENTS PERSIST ON REGIME/AUTH/CRASH TRANSITIONS</td></tr>
            )}
            {err && (
              <tr><td colSpan={4} className="text-center py-5 text-orange-300/80 text-[10px] tracking-[0.2em]">LEDGER OFFLINE — RETRYING…</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-kinset">
                <td className="py-[3px] px-1.5 text-muted-foreground">{fmt.time(e.createdAt)}</td>
                <td className="py-[3px] px-1 font-bold" style={{ color: K.cyan }}>{e.type}</td>
                <td className="py-[3px] px-1">
                  <span className="inline-flex items-center gap-1">
                    <Led color={e.severity === 'crit' ? 'red' : e.severity === 'warn' ? 'orange' : 'green'} />
                    <span style={{ color: sevColor[e.severity] }}>{e.severity.toUpperCase()}</span>
                  </span>
                </td>
                <td className="py-[3px] px-1.5 text-[#b8c9c0] truncate" title={e.message}>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
