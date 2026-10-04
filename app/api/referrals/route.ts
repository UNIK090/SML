import { NextResponse } from 'next/server'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, referralTransactions, rewardLedger } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getRewardSettings } from '@/lib/rewards'

// The Referral Program screen: the summary cards and the customer table.
//
// One request serves the whole page. The cards and the table are the same data
// seen two ways — a summary is just the table totalled — so fetching them
// separately would mean two round trips that could disagree with each other
// between one render and the next.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const params = new URL(request.url).searchParams
    const query = (params.get('q') ?? '').trim()
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 100), 1), 500)

    // Search matches name, phone or referral number, because the staff member may
    // have any one of the three in front of them — a card, a bill, or the customer
    // standing at the counter.
    const like = `%${query}%`
    const where = query
      ? or(
        ilike(customers.name, like),
        ilike(customers.phone, like),
        ilike(customers.phoneDisplay, like),
        ilike(customers.referralCode, like),
      )
      : undefined

    // Per-customer referral totals, computed in SQL rather than by loading every
    // transaction into memory. Only CREDITED rows count towards sales: a reversed
    // referral did not result in a sale the shop kept.
    const rows = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        phoneDisplay: customers.phoneDisplay,
        referralCode: customers.referralCode,
        rewardPoints: customers.rewardPoints,
        totalReferralPointsEarned: customers.totalReferralPointsEarned,
        totalPointsRedeemed: customers.totalPointsRedeemed,
        flaggedForReview: customers.flaggedForReview,
        active: customers.active,
        createdAt: customers.createdAt,
        successfulReferrals: sql<number>`(
          SELECT count(*)::int FROM ${referralTransactions} rt
          WHERE rt.referrer_customer_id = ${customers.id} AND rt.status = 'CREDITED'
        )`,
        referralSales: sql<number>`(
          SELECT coalesce(sum(rt.bill_amount), 0)::float FROM ${referralTransactions} rt
          WHERE rt.referrer_customer_id = ${customers.id} AND rt.status = 'CREDITED'
        )`,
        lastReferralAt: sql<string | null>`(
          SELECT max(rt.created_at)::text FROM ${referralTransactions} rt
          WHERE rt.referrer_customer_id = ${customers.id}
        )`,
      })
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(limit)

    // Shop-wide totals for the summary cards. Reversed referrals are excluded
    // from sales and from points issued, because those points were taken back.
    const [totals] = await db
      .select({
        totalReferralCustomers: sql<number>`count(*)::int`,
        pointsOutstanding: sql<number>`coalesce(sum(${customers.rewardPoints}), 0)::int`,
      })
      .from(customers)

    const [referralTotals] = await db
      .select({
        successfulReferrals: sql<number>`count(*)::int`,
        pointsIssued: sql<number>`coalesce(sum(${referralTransactions.pointsEarned}), 0)::int`,
        referralSales: sql<number>`coalesce(sum(${referralTransactions.billAmount}), 0)::float`,
      })
      .from(referralTransactions)
      .where(eq(referralTransactions.status, 'CREDITED'))

    const [redeemed] = await db
      .select({ pointsRedeemed: sql<number>`coalesce(sum(abs(${rewardLedger.points})), 0)::int` })
      .from(rewardLedger)
      .where(eq(rewardLedger.type, 'REDEEMED'))

    return NextResponse.json({
      settings: await getRewardSettings(),
      summary: {
        totalReferralCustomers: totals?.totalReferralCustomers ?? 0,
        successfulReferrals: referralTotals?.successfulReferrals ?? 0,
        pointsIssued: referralTotals?.pointsIssued ?? 0,
        pointsRedeemed: redeemed?.pointsRedeemed ?? 0,
        pointsOutstanding: totals?.pointsOutstanding ?? 0,
        referralSales: referralTotals?.referralSales ?? 0,
      },
      customers: rows,
    })
  } catch (error) {
    console.error('[referrals] Failed to load the referral program:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the referral program.' }, { status: 500 })
  }
}