import { NextResponse } from 'next/server'
import { and, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, referralTransactions } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'

// The referral history: every transaction, filterable and paged.
//
// Kept separate from /api/referrals because it answers a different question. That
// route summarises customers ("who refers best?"); this one lists events ("what
// happened, when, and who entered it?"). They share the table and nothing else.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const params = new URL(request.url).searchParams
    const query = (params.get('q') ?? '').trim()
    const status = (params.get('status') ?? '').trim().toUpperCase()
    const from = (params.get('from') ?? '').trim()
    const to = (params.get('to') ?? '').trim()
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 50), 1), 200)
    const offset = Math.max(Number(params.get('offset') ?? 0), 0)

    const conditions: SQL[] = []
    if (status === 'CREDITED' || status === 'REVERSED') {
      conditions.push(eq(referralTransactions.status, status))
    }
    // Dates are plain calendar days, compared inclusively at both ends so
    // "1 Oct to 1 Oct" returns that day rather than an empty range.
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      conditions.push(gte(referralTransactions.createdAt, new Date(`${from}T00:00:00`)))
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      conditions.push(lte(referralTransactions.createdAt, new Date(`${to}T23:59:59.999`)))
    }
    if (query) {
      const like = `%${query}%`
      conditions.push(
        or(
          ilike(referralTransactions.referralCode, like),
          ilike(referralTransactions.referredCustomerName, like),
          ilike(referralTransactions.invoiceNumber, like),
          ilike(customers.name, like),
          ilike(customers.phone, like),
        ) as SQL,
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    // The referrer's name is joined in rather than stored on the transaction, so
    // a customer who corrects their name sees it corrected everywhere — while the
    // referred customer's name stays as typed, because that is a record of what
    // happened at the counter, not a live customer record.
    const rows = await db
      .select({
        id: referralTransactions.id,
        referralCode: referralTransactions.referralCode,
        referrerCustomerId: referralTransactions.referrerCustomerId,
        referrerName: customers.name,
        referrerPhone: customers.phone,
        referredCustomerName: referralTransactions.referredCustomerName,
        referredCustomerPhone: referralTransactions.referredCustomerPhone,
        invoiceNumber: referralTransactions.invoiceNumber,
        billAmount: referralTransactions.billAmount,
        pointsEarned: referralTransactions.pointsEarned,
        status: referralTransactions.status,
        purchaseDate: referralTransactions.purchaseDate,
        notes: referralTransactions.notes,
        createdBy: referralTransactions.createdBy,
        reversedBy: referralTransactions.reversedBy,
        reversalReason: referralTransactions.reversalReason,
        reversedAt: referralTransactions.reversedAt,
        createdAt: referralTransactions.createdAt,
      })
      .from(referralTransactions)
      .leftJoin(customers, eq(customers.id, referralTransactions.referrerCustomerId))
      .where(where)
      .orderBy(desc(referralTransactions.createdAt), desc(referralTransactions.id))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({ rows, limit, offset, hasMore: rows.length === limit })
  } catch (error) {
    console.error('[referrals] Failed to load referral history:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the referral history.' }, { status: 500 })
  }
}