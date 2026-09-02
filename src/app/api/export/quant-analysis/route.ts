import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildExportPayload } from '@/lib/export/aggregator'
import { formatCsv, formatCsvFilename, formatHtml, formatHtmlFilename } from '@/lib/export/formatters'
import type { CboeSnapshot, Fill, RiskMetrics, VolSnap } from '@/lib/london/types'
import type { LiquidityState, MarketState } from '@/lib/krupp/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface LiveSnapshot {
  cboe?: CboeSnapshot | null
  fills?: Fill[]
  optTickets?: Array<{id:string;ts:number;sym:string;optKind:'CALL'|'PUT';strike:number;expiry:string;qty:number;entryPx:number;entryIV:number;status:'OPEN'|'CLOSED';closePx?:number;pnl?:number}>
  volHistory?: VolSnap[]
  metrics?: Partial<RiskMetrics>
  liquidity?: Partial<LiquidityState>
  marketState?: Partial<MarketState>
  regime?: string
}

function parseTables(raw: string|null): string[] {
  if (!raw) return ['liquidity','volatility','risk_metrics','ledger','options_desk','vol_history','market_state']
  return raw.split(',').map(s=>s.trim()).filter(Boolean)
}
