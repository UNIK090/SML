import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const from = params.get('from')
    const to = params.get('to')
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 8) || 8, 1), 100)

    const today = new Date().toISOString().slice(0, 10)

    // Optional inclusive range filter, so "to" covers the whole end day.
    const rangeConditions: SQL[] = []
    if (from && DATE.test(from)) rangeConditions.push(gte(billingTransactions.businessDay, from))
    if (to && DATE.test(to)) rangeConditions.push(lte(billingTransactions.businessDay, to))
    const rangeWhere = rangeConditions.length > 0 ? and(...rangeConditions) : undefined
    const [todayStats] = await db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions).where(eq(billingTransactions.businessDay, today))
    const [allStats] = await db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions)
    const [rangeStats] = await db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions).where(rangeWhere)
    const [pending] = await db.select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` }).from(billingTransactions).where(eq(billingTransactions.paymentStatus, 'PENDING'))

    const recent = await db.select().from(billingTransactions).orderBy(desc(billingTransactions.createdAt)).limit(limit)

    // Per-day breakdown within the selected range, newest first.
    const daily = await db
      .select({ businessDay: billingTransactions.businessDay, total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`, count: sql<number>`count(*)` })
      .from(billingTransactions)
      .where(rangeWhere)
      .groupBy(billingTransactions.businessDay)
      .orderBy(desc(billingTransactions.businessDay))
      .limit(60)

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
