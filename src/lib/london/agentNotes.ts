// ============================================================================
// KRUPP CAPITAL // AGENT CORE TRADE NOTES
// Throttled LLM reason/act one-liners explaining notable desk events
// (liquidations, LOCK blocks, option context tickets). Isolated module so
// both the futures ledger and the options desk can call it without an
// import cycle (execution.ts ⇄ optionsDesk.ts).
// ============================================================================

import { useKrupp } from './store'

const NOTE_COOLDOWN_MS = 20000

function rid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` }

let lastNoteAt = 0

/** fire a throttled agent note — LLM explains the desk event in one line */
export function requestTradeNote(context: string, fallback: string) {
  const now = Date.now()
  if (now - lastNoteAt < NOTE_COOLDOWN_MS) return
  lastNoteAt = now
  fetch('/api/agent/commentary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'trade', context }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((j) => {
      const line = String(j?.line ?? fallback).slice(0, 160)
      useKrupp.getState().setLastAgentNote(line)
      useKrupp.getState().pushLog({
        id: rid(), ts: Date.now(), source: 'AGENT', level: 'info',
        message: `[AGENT] Trade note: ${line}`,
      })
    })
    .catch(() => {
      useKrupp.getState().setLastAgentNote(fallback)
      useKrupp.getState().pushLog({
        id: rid(), ts: Date.now(), source: 'AGENT', level: 'info',
        message: `[AGENT] Trade note: ${fallback}`,
      })
    })
}
