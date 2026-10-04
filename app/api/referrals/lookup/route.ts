import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { normaliseCustomerPhone } from '@/lib/customers'
import { getRewardSettings } from '@/lib/rewards'

// "Does the customer at the counter have reward points?"
//
// Called from billing when a mobile number is entered. It answers with the
// customer's name, referral number and balance — enough for the staff member to
// confirm they have the right person and to tell them what their points are
// worth before deciding whether to redeem.
//
// This endpoint deliberately does NOT create a customer. Billing does that when
// the invoice is actually saved, so merely typing a number into a bill that is
// then abandoned does not mint a referral number for a customer who never
// existed. A lookup must be free of side effects.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const raw = new URL(request.url).searchParams.get('phone') ?? ''
    const phone = normaliseCustomerPhone(raw)

    // An unreadable number is simply "no customer", not an error. The counter
    // should not see a failure message because someone is still typing.
    if (!phone) return NextResponse.json({ found: false })

    const [customer] = await db.select().from(customers).where(eq(customers.phone, phone))
    if (!customer) return NextResponse.json({ found: false })

    const settings = await getRewardSettings()

    return NextResponse.json({
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        referralCode: customer.referralCode,
        rewardPoints: customer.rewardPoints,
        active: customer.active,
      },
      redemptionValuePerPoint: settings.redemptionValuePerPoint,
      minimumPointsToRedeem: settings.minimumPointsToRedeem,
      maximumPointsPerBill: settings.maximumPointsPerBill,
    })
  } catch (error) {
    console.error('[referrals] Failed to look up reward points:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not look up reward points.' }, { status: 500 })
  }
}