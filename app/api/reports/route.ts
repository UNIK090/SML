import { NextResponse } from 'next/server'
import { and, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { businessDate, businessMonth, monthRange, validBusinessMonth } from '@/lib/business-time'

/**
 * Daily income report for one calendar month. Empty days are returned as zero
 * instead of being omitted, so the graph clearly shows the fresh 0 balance at
 * the start of a day and does not confuse "no sales" with missing data.
 */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const requested = new URL(request.url).searchParams.get('month')
    const month = requested && validBusinessMonth(requested) ? requested : businessMonth()
    const range = monthRange(month)
    if (!range) return NextResponse.json({ error: 'Choose a valid month.' }, { status: 400 })

    const rows = await db
      .select({
        businessDay: billingTransactions.businessDay,
        total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(billingTransactions)
      .where(and(gte(billingTransactions.businessDay, range.from), lte(billingTransactions.businessDay, range.to)))
      .groupBy(billingTransactions.businessDay)
      .orderBy(billingTransactions.businessDay)

    const byDate = new Map(rows.map((row) => [String(row.businessDay), { total: Number(row.total), count: Number(row.count) }]))
    const days = Array.from({ length: range.days }, (_, index) => {
      const businessDay = `${month}-${String(index + 1).padStart(2, '0')}`
      const values = byDate.get(businessDay) ?? { total: 0, count: 0 }
      return { businessDay, ...values }
    })
    const total = days.reduce((sum, row) => sum + row.total, 0)
    const count = days.reduce((sum, row) => sum + row.count, 0)
    const bestDay = days.reduce((best, row) => row.total > best.total ? row : best, days[0] ?? { businessDay: range.from, total: 0, count: 0 })

    return NextResponse.json({
      month,
      from: range.from,
      to: range.to,
      currentBusinessDay: businessDate(),
      total,
      count,
      average: count > 0 ? total / Math.max(days.filter((day) => day.count > 0).length, 1) : 0,
      bestDay,
      days,
    })
  } catch (error) {
    console.error('[reports] Failed to load monthly report:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the monthly report.' }, { status: 500 })
  }
}
