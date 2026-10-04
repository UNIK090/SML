import { NextResponse } from 'next/server'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getSessionIdentity } from '@/lib/db/session-identity'
import { creditReferral, previewReferral } from '@/lib/rewards'
import { deliverRewardMessage } from '@/lib/reward-notifications'

// Crediting a referral, and previewing one before it is saved.
//
// Both live here because they must agree. The preview is what the staff member
// reads before pressing confirm; if it were calculated anywhere else it could
// drift from what actually gets saved, and a dialog that promises 90 points while
// the record stores 60 is worse than showing no number at all.
//
// The POST body carries no points value. The client may display an estimate, but
// the amount credited is computed here from the shop's stored rule — a
// client-supplied figure would let anyone award themselves a fortune.

export const dynamic = 'force-dynamic'

/** Read-only: what would this referral earn? Powers the confirm dialog. */
export async function PUT(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as Record<string, unknown>
    const result = await previewReferral({ referralCode: body.referralCode, billAmount: body.billAmount })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[referrals] Failed to preview a referral:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not work out the points.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as Record<string, unknown>
    // Who did it. Recorded on the transaction and every ledger row, so a credit
    // can always be traced back to a person rather than to "the system".
    const actor = await getSessionIdentity()

    const result = await creditReferral({
      referralCode: body.referralCode,
      referredCustomerName: body.referredCustomerName,
      referredCustomerPhone: body.referredCustomerPhone,
      invoiceNumber: body.invoiceNumber,
      billAmount: body.billAmount,
      purchaseDate: body.purchaseDate,
      notes: body.notes,
      createdBy: actor,
    })

    if ('error' in result) {
      // 409 for a duplicate invoice: the request was well-formed, the state just
      // does not allow it. That distinction matters to the client, which shows a
      // different message for "fix your input" than for "already done".
      const message = result.error ?? 'Could not save the referral.'
      const status = message.includes('already earned') ? 409 : 400
      return NextResponse.json({ error: message }, { status })
    }

    //
    // Tell the customer, AFTER the points are safely saved.
    //
    // The order matters. The credit is already committed at this point, so a
    // message that fails to send cannot undo it — a customer on a bad line still
    // earns their points, and the shopkeeper is told plainly that the message did
    // not go so they can pass it on by hand.
    //
    const delivery = await deliverRewardMessage({
      phone: result.referrer.phone,
      message: result.notification,
      kind: 'REFERRAL_EARNED',
      invoiceNumber: result.referral.invoiceNumber,
      customerName: result.referrer.name,
    })

    return NextResponse.json({ ...result, delivery }, { status: 201 })
  } catch (error) {
    console.error('[referrals] Failed to credit a referral:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the referral.' }, { status: 500 })
  }
}