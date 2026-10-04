import { NextResponse } from 'next/server'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getSessionIdentity } from '@/lib/db/session-identity'
import { reverseReferral } from '@/lib/rewards'

// Reversing a referral — the referred bill was refunded or cancelled.
//
// A reversal never deletes. The original transaction is marked REVERSED and a
// negative ledger entry is written, so the history still shows that the reward
// was given and then taken back. Deleting would erase the evidence, which is the
// one thing an audit needs.
//
// If the points were already spent, the reversal is refused and the customer is
// flagged for the shopkeeper to look at. A negative balance invented by the
// system is a debt nobody can explain or collect.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as Record<string, unknown>
    const referralId = Number(body.referralId)
    if (!Number.isInteger(referralId) || referralId <= 0) {
      return NextResponse.json({ error: 'Invalid referral transaction.' }, { status: 400 })
    }

    const actor = await getSessionIdentity()
    const result = await reverseReferral({ referralId, reason: body.reason, reversedBy: actor })

    if ('error' in result) {
      // A refusal because the points are gone is a state problem, not bad input,
      // so it answers 409 — the client shows it differently from a typo.
      const status = result.error.includes('already been reversed') ? 409 : 400
      return NextResponse.json({ error: result.error, flagged: 'flagged' in result ? result.flagged : undefined }, { status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[referrals] Failed to reverse a referral:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not reverse the referral.' }, { status: 500 })
  }
}