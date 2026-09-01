import { NextResponse } from 'next/server'
import { createHmac, randomUUID } from 'crypto'

// KRUPP CAPITAL // desk-minted demo L3 credential.
// NOTE: real Firebase Bearer tokens must be issued from the user's own Google
// Firebase project (Console -> Project settings -> Service accounts, or a
// Firebase Auth ID token). This endpoint mints a locally-signed credential so
// the full Level-3 authenticated pipeline can be exercised end-to-end.

const SECRET = process.env.KRUPP_DEMO_SECRET ?? 'krupp-capital-l3-desk-secret-2.4.1'

export async function POST() {
  const jti = randomUUID()
  const iat = Date.now()
  const exp = iat + 24 * 3600 * 1000
  const body = Buffer.from(JSON.stringify({ iss: 'krupp-capital-desk', sub: 'L3-RISK-DESK', jti, iat, exp, scope: 'l3-equities:stream l3-futures:stream cboe:read' })).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(`KRUPP-DEMO-L3.${body}`).digest('base64url')
  const token = `KRUPP-DEMO-L3.${body}.${sig}`
  return NextResponse.json({ ok: true, token, expiresInMs: exp - iat, note: 'Desk demo credential — authorizes the L3 parity bridge. Supply your own Firebase ID token to probe the live London Strategic Edge origin.' })
}
