import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// KRUPP CAPITAL // AI Orchestrator — asynchronous Reason/Act commentary loop.
// One terse desk-grade line per call, driven by live engine telemetry.
//
// RESILIENCE (r3): the upstream LLM endpoint rate-limits under load (429).
// The route keeps an in-memory cooldown — once a 429 (or repeated failure) is
// seen, further calls short-circuit to a LOCAL heuristic composer that turns
// the live telemetry into varied, plausible desk one-liners. The client also
// backs off exponentially, so the desk never stalls and the log never fills
// with identical "degraded" lines.

type Telemetry = {
  mode?: 'trade'
  context?: string
  score?: number; regime?: string; hawkes?: number; toxZ?: number
  viscosity?: number; jerkZ?: number; entropy?: number
  lock?: boolean; scale?: boolean; kill?: boolean
  vix?: number; contangoPct?: number; pcRatio?: number
}

const COOLDOWN_MS = 90_000
let llmBlockedUntil = 0
let consecFails = 0

function n(v: unknown, d = 0): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}

/** local Reason/Act composer — telemetry-driven variety when the LLM is dark */
function heuristicLine(m: Telemetry): string {
  const score = n(m.score, 30)
  const hawkes = n(m.hawkes)
  const tox = n(m.toxZ)
  const jerk = n(m.jerkZ)
  const ent = n(m.entropy)
  const vix = n(m.vix, 14)
  const cont = n(m.contangoPct)
  const lines: string[] = []

  if (score >= 75) lines.push(`Composite ${score.toFixed(0)} — cutting gross exposure, interceptors may escalate to KILL.`)
  else if (score >= 50) lines.push(`Composite ${score.toFixed(0)} elevated — tightening quote widths, passive only.`)
  else lines.push(`Composite ${score.toFixed(0)} benign — normal clip sizes, depth-aware passive quotes holding.`)

  if (hawkes > 150) lines.push(`Hawkes λ ${hawkes.toFixed(0)} — order-flow contagion brewing, widening quoted spreads 12.5%.`)
  else lines.push(`Hawkes λ ${hawkes.toFixed(0)} within tolerance — branching ratio nominal.`)

  if (tox > 0.5) lines.push(`Toxicity z ${tox.toFixed(2)} — adverse-selection guard active on the bid side.`)
  if (jerk > 2) lines.push(`ABE jerk z ${jerk.toFixed(1)}σ — shock regularizer engaged, shrinking clips to 0.4x.`)
  if (ent > 0.85) lines.push(`Shannon H ${ent.toFixed(2)} — return disorder elevated, reducing resting size.`)
  if (vix > 22) lines.push(`VIX ${vix.toFixed(1)} — vol complex bid, hedging flows expected into the close.`)
  if (cont < -5) lines.push(`Term structure ${cont.toFixed(1)}% — backwardation signal, carry harvest window shut.`)
  else if (cont > 5) lines.push(`Contango ${cont.toFixed(1)}% — carry harvest window open on the front month.`)
  if (m.kill) lines.push('KILL interceptor engaged — new tickets suspended until volatility normalizes.')
  else if (m.lock) lines.push('LOCK interceptor engaged — mean-reversion tickets gated at pre-trade.')

  if (lines.length === 0) lines.push('All channels nominal — orchestrator holding the book.')
  return lines[Math.floor(Math.random() * lines.length)]
}

export async function POST(req: NextRequest) {
  let m: Telemetry = {}
  try {
    m = (await req.json()) as Telemetry
  } catch {
    m = {}
  }

  // --- rate-limit cooldown: serve the heuristic core without hitting the LLM
  if (Date.now() < llmBlockedUntil && m.mode !== 'trade') {
    return NextResponse.json({ ok: true, degraded: true, line: heuristicLine(m).slice(0, 180) })
  }

  try {
    const zai = await ZAI.create()

    // --- trade-note mode: agent-core explains a desk event (fill/block/flatten) ---
    if (m.mode === 'trade') {
      const ctx = String(m.context ?? '').slice(0, 400)
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: 'You are a terse institutional HFT execution agent. Output exactly one sentence (max 140 chars), trader tone, no preamble, no emoji.' },
          { role: 'user', content: [
            'Explain this desk event in one sentence — rationale, risk framing or next intent.',
            `Event: ${ctx}`,
          ].join('\n') },
        ],
        thinking: { type: 'disabled' },
      })
      const line = completion.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') ?? ''
      if (!line) throw new Error('empty completion')
      consecFails = 0
      return NextResponse.json({ ok: true, line: line.slice(0, 180) })
    }

    const prompt = [
      'You are the risk-orchestration core of an elite HFT desk terminal (KRUPP CAPITAL).',
      'Given live telemetry, output ONE single sentence (max 120 chars), trader tone, no preamble, no emoji.',
      'Reference concrete numbers where possible. Focus: positioning guidance, toxicity, term-structure, interceptors.',
      '',
      `Composite risk score: ${n(m.score)}/100 (regime ${m.regime ?? 'n/a'})`,
      `Hawkes intensity λ: ${n(m.hawkes)}, toxicity z: ${m.toxZ ?? 'n/a'}`,
      `Fluid viscosity: ${n(m.viscosity)}, jerk z: ${n(m.jerkZ)}`,
      `Shannon entropy: ${n(m.entropy)}`,
      `Interceptors LOCK=${m.lock} SCALE=${m.scale} KILL=${m.kill}`,
      `VIX: ${n(m.vix)}, VIX3M/VIX contango: ${n(m.contangoPct)}%, P/C: ${n(m.pcRatio)}`,
    ].join('\n')

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are a terse institutional HFT risk orchestrator. Output exactly one sentence.' },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    })
    const line = completion.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') ?? ''
    if (!line) throw new Error('empty completion')
    consecFails = 0
    return NextResponse.json({ ok: true, line: line.slice(0, 180) })
  } catch {
    consecFails++
    // trip the cooldown on repeat failures (covers 429 storms + outages);
    // a single transient failure still returns the heuristic line this cycle.
    if (consecFails >= 2) llmBlockedUntil = Date.now() + COOLDOWN_MS
    return NextResponse.json({ ok: true, degraded: true, line: heuristicLine(m).slice(0, 180) })
  }
}
