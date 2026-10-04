import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, referralTransactions, rewardLedger } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getSessionIdentity } from '@/lib/db/session-identity'
import { adjustPoints, redeemPointsForCustomer, rewardHistory } from '@/lib/rewards'

// One customer's reward profile: their balance, their referrals, and their ledger.
//
// This is the screen the shopkeeper opens when a customer says "I think I am owed
// some points". It answers with numbers first and then with the list of events
// that produced them, because the list is the part that settles an argument.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid customer.' }, { status: 400 })

    const [customer] = await db.select().from(customers).where(eq(customers.id, id))
    if (!customer) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })

    const [referralStats] = await db
      .select({
        successfulReferrals: sql<number>`count(*)::int`,
        referralValue: sql<number>`coalesce(sum(${referralTransactions.billAmount}), 0)::float`,
      })
      .from(referralTransactions)
      .where(sql`${referralTransactions.referrerCustomerId} = ${id} AND ${referralTransactions.status} = 'CREDITED'`)

    return NextResponse.json({
      customer,
      stats: {
        successfulReferrals: referralStats?.successfulReferrals ?? 0,
        referralValue: referralStats?.referralValue ?? 0,
      },
      history: await rewardHistory(id, 200),
    })
  } catch (error) {
    console.error('[referrals] Failed to load a customer profile:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the customer.' }, { status: 500 })
  }
}

/**
 * The three things staff can do to a balance from this screen.
 *
 * One route with an `action` rather than three endpoints, because all three are
 * "move this customer's points" and they share the same guards and the same
 * shape of answer. The audit identity is taken from the session in every case —
 * never from the body.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as Record<string, unknown>
    const customerId = Number(body.customerId)
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return NextResponse.json({ error: 'Invalid customer.' }, { status: 400 })
    }
    const action = String(body.action ?? '')
    const actor = await getSessionIdentity()

    if (action === 'adjust') {
      const result = await adjustPoints({ customerId, points: Number(body.points), reason: body.reason, createdBy: actor })
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ ...result, message: 'Points adjusted.' })
    }

    if (action === 'redeem') {
      const result = await redeemPointsForCustomer({
        customerId,
        points: Number(body.points),
        invoiceNumber: body.invoiceNumber,
        createdBy: actor,
      })
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ ...result, message: `Redeemed for a ₹${result.discountValue} discount.` })
    }

    if (action === 'set-active') {
      const active = body.active !== false
      const [updated] = await db
        .update(customers)
        .set({ active, updatedAt: new Date() })
        .where(eq(customers.id, customerId))
        .returning()
      if (!updated) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
      return NextResponse.json({ customer: updated, message: active ? 'Account reactivated.' : 'Account deactivated.' })
    }

    if (action === 'clear-flag') {
      const [updated] = await db
        .update(customers)
        .set({ flaggedForReview: false, updatedAt: new Date() })
        .where(eq(customers.id, customerId))
        .returning()
      if (!updated) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
      return NextResponse.json({ customer: updated, message: 'Flag cleared.' })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    console.error('[referrals] Failed to update a customer:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not update the customer.' }, { status: 500 })
  }
}