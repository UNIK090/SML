import { NextResponse } from 'next/server'
import { and, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { businessDate, businessMonth, monthRange, validBusinessMonth } from '@/lib/business-time'
import type { DailyRow, MonthlyReport, ReportSlice, WeekdayStat } from '@/lib/types'

/**
 * Daily income report for one calendar month, with the breakdowns the Reports
 * screen visualises.
 *
 * Empty days are returned as zero instead of being omitted, so the graph shows
 * the fresh 0 balance at the start of a day and never confuses "no sales" with
 * missing data — the shopkeeper audits this against the invoice ledger.
 *
 * Everything here is derived from saved invoices. Nothing is estimated, and a
 * breakdown with no data comes back as an empty array rather than a row of
 * zeroes, so a chart can hide itself instead of drawing an empty ring.
 */

/** Sunday-first labels, matching `Date.getDay()` and the Indian trading week. */
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Turns grouped rows into slices carrying their share of the period. */
function toSlices(
  rows: { label: string; total: string | number; count: number }[],
  periodTotal: number,
): ReportSlice[] {
  return rows
    .map((row) => {
      const total = Number(row.total) || 0
      return {
        label: row.label,
        total,
        count: Number(row.count) || 0,
        share: periodTotal > 0 ? (total / periodTotal) * 100 : 0,
      }
    })
    .filter((slice) => slice.total > 0)
    .sort((a, b) => b.total - a.total)
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const requested = new URL(request.url).searchParams.get('month')
    const month = requested && validBusinessMonth(requested) ? requested : businessMonth()
    const range = monthRange(month)
    if (!range) return NextResponse.json({ error: 'Choose a valid month.' }, { status: 400 })

    // The same month a year earlier, so the month can be judged against itself
    // rather than against nothing.
    const previousYearMonth = `${Number(month.slice(0, 4)) - 1}-${month.slice(5)}`
    const previousRange = monthRange(previousYearMonth)

    const inMonth = and(
      gte(billingTransactions.businessDay, range.from),
      lte(billingTransactions.businessDay, range.to),
    )

    const [dayRows, categoryRows, paymentRows, invoiceStats, previousYearRows] = await Promise.all([
      db
        .select({
          businessDay: billingTransactions.businessDay,
          total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(billingTransactions)
        .where(inMonth)
        .groupBy(billingTransactions.businessDay)
        .orderBy(billingTransactions.businessDay),

      // By category, so the shop can see which kind of piece actually earns —
      // chains outselling rings is stock planning, not trivia.
      db
        .select({
          label: billingTransactions.category,
          total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(billingTransactions)
        .where(inMonth)
        .groupBy(billingTransactions.category),

      // Paid vs unpaid is the number a shopkeeper chases at month end.
      db
        .select({
          label: billingTransactions.paymentStatus,
          total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(billingTransactions)
        .where(inMonth)
        .groupBy(billingTransactions.paymentStatus),

      db
        .select({ highest: sql<string>`coalesce(max(${billingTransactions.totalAmount}), 0)` })
        .from(billingTransactions)
        .where(inMonth),

      previousRange
        ? db
            .select({ total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)` })
            .from(billingTransactions)
            .where(
              and(
                gte(billingTransactions.businessDay, previousRange.from),
                lte(billingTransactions.businessDay, previousRange.to),
              ),
            )
        : Promise.resolve([{ total: '0' }]),
    ])

    const byDate = new Map(
      dayRows.map((row) => [String(row.businessDay), { total: Number(row.total), count: Number(row.count) }]),
    )

    const days: DailyRow[] = Array.from({ length: range.days }, (_, index) => {
      const businessDay = `${month}-${String(index + 1).padStart(2, '0')}`
      const values = byDate.get(businessDay) ?? { total: 0, count: 0 }
      return { businessDay, ...values }
    })

    const total = days.reduce((sum, row) => sum + row.total, 0)
    const count = days.reduce((sum, row) => sum + row.count, 0)
    const activeDays = days.filter((day) => day.count > 0).length
    const bestDay = days.reduce(
      (best, row) => (row.total > best.total ? row : best),
      days[0] ?? { businessDay: range.from, total: 0, count: 0 },
    )

    // ---------------------------------------------------------------------
    // Weekday pattern
    //
    // Averaged per weekday over the month, because one strong Saturday is noise
    // while a consistently strong Saturday is a fact worth stocking for.
    // ---------------------------------------------------------------------
    const weekdays: WeekdayStat[] = WEEKDAY_LABELS.map((label, weekday) => ({
      weekday,
      label,
      total: 0,
      count: 0,
      average: 0,
    }))

    for (const day of days) {
      if (day.count === 0) continue
      // Parsed as UTC noon so the local timezone can never shift the weekday.
      const weekday = new Date(`${day.businessDay}T12:00:00Z`).getUTCDay()
      weekdays[weekday].total += day.total
      weekdays[weekday].count += day.count
    }

    for (const bucket of weekdays) {
      // Averaged over the days that actually traded, not over every occurrence
      // of that weekday — a closed Monday is not evidence that Mondays are weak.
      const traded = days.filter(
        (day) => day.count > 0 && new Date(`${day.businessDay}T12:00:00Z`).getUTCDay() === bucket.weekday,
      ).length
      bucket.average = traded > 0 ? bucket.total / traded : 0
    }

    const previousYearTotal = Number(previousYearRows[0]?.total) || 0

    const body: MonthlyReport = {
      month,
      from: range.from,
      to: range.to,
      currentBusinessDay: businessDate(),
      total,
      count,
      average: activeDays > 0 ? total / activeDays : 0,
      bestDay,
      days,
      averageActiveDay: activeDays > 0 ? total / activeDays : 0,
      averageInvoice: count > 0 ? total / count : 0,
      highestInvoice: Number(invoiceStats[0]?.highest) || 0,
      categories: toSlices(categoryRows, total),
      payments: toSlices(paymentRows, total),
      weekdays,
      previousYearTotal,
      // A percentage against zero has no meaning, so it is withheld rather than
      // rendered as an enormous or infinite number.
      yearChangePct: previousYearTotal > 0 ? ((total - previousYearTotal) / previousYearTotal) * 100 : null,
      activeDays,
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('[reports] Failed to load monthly report:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the monthly report.' }, { status: 500 })
  }
}
