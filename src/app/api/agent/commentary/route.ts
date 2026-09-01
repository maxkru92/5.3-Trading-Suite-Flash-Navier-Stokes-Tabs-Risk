import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// KRUPP CAPITAL // AI Orchestrator — asynchronous Reason/Act commentary loop.
// One terse desk-grade line per call, driven by live engine telemetry.

export async function POST(req: NextRequest) {
  try {
    const m = await req.json()
    const zai = await ZAI.create()

    // --- trade-note mode: agent-core explains a desk event (fill/block/flatten) ---
    if (m?.mode === 'trade') {
      const ctx = String(m?.context ?? '').slice(0, 400)
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
      return NextResponse.json({ ok: true, line: line.slice(0, 180) })
    }

    const prompt = [
      'You are the risk-orchestration core of an elite HFT desk terminal (KRUPP CAPITAL).',
      'Given live telemetry, output ONE single sentence (max 120 chars), trader tone, no preamble, no emoji.',
      'Reference concrete numbers where possible. Focus: positioning guidance, toxicity, term-structure, interceptors.',
      '',
      `Composite risk score: ${m.score}/100 (regime ${m.regime})`,
      `Hawkes intensity λ: ${m.hawkes}, toxicity z: ${m.toxZ ?? 'n/a'}`,
      `Fluid viscosity: ${m.viscosity}, jerk z: ${m.jerkZ}`,
      `Shannon entropy: ${m.entropy}`,
      `Interceptors LOCK=${m.lock} SCALE=${m.scale} KILL=${m.kill}`,
      `VIX: ${m.vix}, VIX3M/VIX contango: ${m.contangoPct}%, P/C: ${m.pcRatio}`,
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
    return NextResponse.json({ ok: true, line: line.slice(0, 180) })
  } catch {
    return NextResponse.json({ ok: false, line: 'orchestrator cycle degraded — heuristic core answering' }, { status: 200 })
  }
}
