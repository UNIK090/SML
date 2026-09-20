import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { businessDate, businessMonth, monthRange } from '@/lib/business-time'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const from = params.get('from')
    const to = params.get('to')
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 8) || 8, 1), 100)

    // The dashboard changes day at 12:00 AM India time, independent of the
    // Vercel/database server's timezone.
    const today = businessDate()
    const currentMonth = monthRange(businessMonth())!
    const rangeFrom = from && DATE.test(from) ? from : currentMonth.from
    const rangeTo = to && DATE.test(to) ? to : currentMonth.to

    // The default range is the live business month. Explicit API callers can
    // still supply their own inclusive date boundaries.
    const rangeWhere = and(gte(billingTransactions.businessDay, rangeFrom), lte(billingTransactions.businessDay, rangeTo))
    // Independent aggregates run in parallel, so dashboard latency is roughly
    // the slowest query rather than the sum of every query.
    const [[todayStats], [allStats], [rangeStats], [pending], recent, daily] = await Promise.all([
      db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions).where(eq(billingTransactions.businessDay, today)),
      db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions),
      db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions).where(rangeWhere),
      db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions).where(eq(billingTransactions.paymentStatus, 'PENDING')),
      db.select().from(billingTransactions).orderBy(desc(billingTransactions.createdAt)).limit(limit),
      db
        .select({ businessDay: billingTransactions.businessDay, total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` })
        .from(billingTransactions)
        .where(rangeWhere)
        .groupBy(billingTransactions.businessDay)
        .orderBy(desc(billingTransactions.businessDay))
        .limit(60),
    ])

    return NextResponse.json({
      today,
      todayTotal: Number(todayStats?.total ?? 0),
      todayCount: Number(todayStats?.count ?? 0),
      allTotal: Number(allStats?.total ?? 0),
      allCount: Number(allStats?.count ?? 0),
      rangeTotal: Number(rangeStats?.total ?? 0),
      rangeCount: Number(rangeStats?.count ?? 0),
      pendingTotal: Number(pending?.total ?? 0),
      pendingCount: Number(pending?.count ?? 0),
      recent,
      daily: daily.map((row) => ({ businessDay: row.businessDay, total: Number(row.total), count: Number(row.count) })),
    })
  } catch (error) {
    console.error('[v0] Failed to load dashboard:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the dashboard.' }, { status: 500 })
  }
}
