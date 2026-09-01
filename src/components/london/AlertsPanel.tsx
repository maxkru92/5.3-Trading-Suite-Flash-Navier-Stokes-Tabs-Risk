'use client'

// ============================================================================
// KRUPP CAPITAL // DESK ALERTS — THRESHOLD SENTINELS (round 8)
// Compact hardware rows: per-rule LED (trip flash), kind + op + inline
// threshold stepper, live scalar readout, ARM toggle, trip counter.
// Rules persist desk-local (localStorage) and hydrate post-mount (SSR-safe).
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Bell, BellRing, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useKrupp } from '@/lib/london/store'
import {
  ALERT_META, addAlert, armAll, alertValues, removeAlert, resetTrips, updateAlert,
  type AlertKind, type AlertOp, type AlertRule,
} from '@/lib/london/alerts'
import { K, Led, Panel } from './shared'
import { KT } from '@/lib/theme';

/** hex #rrggbb + alpha -> canvas-safe rgba() string */
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const KINDS = Object.keys(ALERT_META) as AlertKind[]

function fmtVal(kind: AlertKind, v: number): string {
  const meta = ALERT_META[kind]
  if (!Number.isFinite(v)) return '———'
  return v.toFixed(meta.step < 0.1 ? 3 : 1)
}

function AlertRow({ rule }: { rule: AlertRule }) {
  const meta = ALERT_META[rule.kind]
  const [val, setVal] = useState(String(rule.threshold))
  useEffect(() => { setVal(String(rule.threshold)) }, [rule.threshold])
  const tripped = rule.lastTripped > 0 && Date.now() - rule.lastTripped < 6000
  const ago = rule.lastTripped > 0 ? Math.max(0, Math.round((Date.now() - rule.lastTripped) / 1000)) : null

  const commit = () => {
    const n = Number(val)
    if (Number.isFinite(n) && n !== rule.threshold) updateAlert(rule.id, { threshold: n })
    else setVal(String(rule.threshold))
  }

  return (
    <div
      className={`alert-row flex items-center gap-1.5 rounded-sm border px-1.5 py-1 ${tripped ? 'alert-row-tripped' : ''}`}
      style={{ borderColor: rule.armed ? hexA(KT('up'), 0.18) : hexA(KT('textMuted'), 0.2) }}
      data-testid={`alert-row-${rule.kind}`}
    >
      <Led color={tripped ? 'red' : rule.armed ? 'green' : 'dim'} className={tripped ? 'alert-led-trip' : ''} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1 text-[9px]">
          <b className="font-bold text-secondary-foreground truncate" title={meta.hint}>{meta.label}</b>
          <button
            type="button"
            className="alert-op-btn shrink-0"
            onClick={() => updateAlert(rule.id, { op: (rule.op === '>' ? '<' : '>') as AlertOp })}
            aria-label={`Toggle comparison operator (currently ${rule.op === '>' ? 'above' : 'below'})`}
            title={`Fires when value is ${rule.op === '>' ? 'ABOVE' : 'BELOW'} the threshold — click to flip`}
          >
            {rule.op}
          </button>
          <input
            className="alert-th-input w-12 shrink-0"
            value={val}
            inputMode="decimal"
            aria-label={`${meta.label} threshold`}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        </div>
        <div className="flex items-center gap-2 text-[8px] text-muted-foreground tabular-nums">
          <span>LIVE <span className="text-[#00e5ff]">{fmtVal(rule.kind, alertValues[rule.kind])}</span>{meta.unit && <span className="opacity-70">{meta.unit}</span>}</span>
          <span>TRIPS <span style={{ color: rule.tripCount > 0 ? K.orange : undefined }} className={rule.tripCount > 0 ? 'font-bold' : ''}>{rule.tripCount}</span></span>
          {ago !== null && <span className={tripped ? 'text-[#ff1133] font-bold' : ''}>{ago < 3 ? 'JUST NOW' : `${ago}s ago`}</span>}
        </div>
      </div>
      <button
        type="button"
        className={`alert-arm-btn shrink-0 ${rule.armed ? 'alert-arm-on' : ''}`}
        onClick={() => updateAlert(rule.id, { armed: !rule.armed })}
        aria-pressed={rule.armed}
        aria-label={`${rule.armed ? 'Disarm' : 'Arm'} ${meta.label} sentinel`}
        title={rule.armed ? 'ARMED — click to disarm' : 'DISARMED — click to arm'}
      >
        {rule.armed ? 'ARMED' : 'OFF'}
      </button>
      <button
        type="button"
        className="alert-x-btn shrink-0"
        onClick={() => removeAlert(rule.id)}
        aria-label={`Delete ${meta.label} sentinel`}
        title="Delete sentinel"
      >
        <Trash2 size={10} aria-hidden />
      </button>
    </div>
  )
}

export function AlertsPanel() {
  const alerts = useKrupp((s) => s.alerts)
  const alertsRev = useKrupp((s) => s.alertsRev)
  const [addOpen, setAddOpen] = useState(false)
  const [nKind, setNKind] = useState<AlertKind>('score')
  const [nOp, setNOp] = useState<AlertOp>('>')
  const [nVal, setNVal] = useState('75')

  const totalTrips = useMemo(() => alerts.reduce((a, r) => a + r.tripCount, 0), [alerts, alertsRev])
  const armedCount = alerts.filter((r) => r.armed).length

  // keep LIVE readouts ticking (alertValues is a plain module object)
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => (t + 1) % 1000), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Panel
      title="DESK ALERTS"
      accent={totalTrips > 0 ? 'orange' : 'dim'}
      right={
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="alert-tool-btn"
            onClick={() => armAll(true)}
            title="Arm all sentinels"
            aria-label="Arm all sentinels"
          >
            <BellRing size={10} aria-hidden />
          </button>
          <button
            type="button"
            className="alert-tool-btn"
            onClick={() => armAll(false)}
            title="Disarm all sentinels"
            aria-label="Disarm all sentinels"
          >
            <Bell size={10} aria-hidden />
          </button>
          <button
            type="button"
            className="alert-tool-btn"
            onClick={() => resetTrips()}
            title="Reset trip counters"
            aria-label="Reset trip counters"
          >
            <RotateCcw size={10} aria-hidden />
          </button>
          <button
            type="button"
            className={`alert-tool-btn ${addOpen ? 'alert-tool-on' : ''}`}
            onClick={() => setAddOpen((o) => !o)}
            title="Add sentinel"
            aria-label="Add sentinel"
            aria-expanded={addOpen}
          >
            <Plus size={10} aria-hidden />
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        {alerts.length === 0 && (
          <div className="text-[9px] text-muted-foreground border border-dashed border-gridline rounded-sm px-2 py-2 text-center">
            NO SENTINELS — HIT <Plus size={9} className="inline" aria-hidden /> TO STATION A THRESHOLD WATCH
          </div>
        )}
        {alerts.map((r) => <AlertRow key={r.id} rule={r} />)}

        {addOpen && (
          <div className="alert-add-row flex items-center gap-1.5 rounded-sm border border-kaccent-strong/30 px-1.5 py-1">
            <select
              className="alert-select flex-1 min-w-0"
              value={nKind}
              aria-label="Sentinel metric"
              onChange={(e) => {
                const k = e.target.value as AlertKind
                setNKind(k)
                setNVal(String(ALERT_META[k].lo + (ALERT_META[k].hi - ALERT_META[k].lo) * 0.6))
              }}
            >
              {KINDS.map((k) => <option key={k} value={k}>{ALERT_META[k].label}</option>)}
            </select>
            <button
              type="button"
              className="alert-op-btn shrink-0"
              onClick={() => setNOp((o) => (o === '>' ? '<' : '>'))}
              aria-label="Comparison operator"
              title="Fires when value is above/below the threshold"
            >
              {nOp}
            </button>
            <input
              className="alert-th-input w-16 shrink-0"
              value={nVal}
              inputMode="decimal"
              aria-label="New sentinel threshold"
              onChange={(e) => setNVal(e.target.value)}
            />
            <button
              type="button"
              className="alert-tool-btn alert-tool-on shrink-0"
              onClick={() => {
                if (addAlert(nKind, nOp, Number(nVal))) { setAddOpen(false) }
              }}
              aria-label="Station sentinel"
              title="Station sentinel"
            >
              <Plus size={10} aria-hidden />
            </button>
          </div>
        )}

        <div className="mt-0.5 flex items-center justify-between text-[8px] tracking-[0.14em] text-muted-foreground tabular-nums">
          <span className="truncate">45S CD · DESK-LOCAL</span>
          <span className="shrink-0" style={{ color: armedCount > 0 ? K.green : KT('textFaint') }} title="Armed / total sentinels · lifetime trips">
            {armedCount}/{alerts.length} · ⚠{totalTrips}
          </span>
        </div>
      </div>
    </Panel>
  )
}
