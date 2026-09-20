import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions, dailyEarnings, invoiceItems, invoiceSends } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Paginated bill list with a status filter, for the Payments section. */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    const from = params.get('from')
    const to = params.get('to')
    const search = params.get('q')?.trim()
    const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
    const perPage = Math.min(Math.max(Number(params.get('perPage') ?? 20) || 20, 5), 100)

    const conditions: SQL[] = []
    if (status === 'PAID' || status === 'PENDING') conditions.push(eq(billingTransactions.paymentStatus, status))
    if (from && DATE.test(from)) conditions.push(gte(billingTransactions.businessDay, from))
    if (to && DATE.test(to)) conditions.push(lte(billingTransactions.businessDay, to))
    if (search) {
      const pattern = `%${search}%`
      conditions.push(
        sql`(${billingTransactions.invoiceNumber} ilike ${pattern} or coalesce(${billingTransactions.customerName}, '') ilike ${pattern} or coalesce(${billingTransactions.customerPhone}, '') ilike ${pattern} or ${billingTransactions.itemName} ilike ${pattern})`,
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [[countRow], rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(billingTransactions).where(where),
      db
        .select()
        .from(billingTransactions)
        .where(where)
        .orderBy(desc(billingTransactions.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
    ])
    const total = Number(countRow?.count ?? 0)

    return NextResponse.json({ rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) })
  } catch (error) {
    console.error('[v0] Failed to load payments:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the payments list.' }, { status: 500 })
  }
}

/** Marks a bill paid or pending. This is the settlement action on the Payments screen. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json()
    const invoiceNumber = typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : ''
    const status = body.paymentStatus === 'PENDING' ? 'PENDING' : body.paymentStatus === 'PAID' ? 'PAID' : null

    if (!invoiceNumber) return NextResponse.json({ error: 'An invoice number is required.' }, { status: 400 })
    if (!status) return NextResponse.json({ error: 'Payment status must be PAID or PENDING.' }, { status: 400 })

    const [updated] = await db
      .update(billingTransactions)
      .set({ paymentStatus: status })
      .where(eq(billingTransactions.invoiceNumber, invoiceNumber))
      .returning()

    if (!updated) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[v0] Failed to update payment status:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not update the payment status.' }, { status: 500 })
  }
}

/**
 * Permanently removes the transaction ledger while preserving the catalogue,
 * shop profile, and branding. The exact confirmation value makes accidental
 * calls from a normal navigation request impossible.
 */
export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json().catch(() => null)
    if (body?.confirmation !== 'CLEAR_TRANSACTIONS') {
      return NextResponse.json({ error: 'Transaction clearing was not confirmed.' }, { status: 400 })
    }

    const cleared = await db.transaction(async (tx) => {
      const [count] = await tx.select({ count: sql<number>`count(*)` }).from(billingTransactions)
      // Delete dependent records first so this stays valid if foreign keys are
      // added by a future database migration.
      await tx.delete(invoiceSends)
      await tx.delete(invoiceItems)
      await tx.delete(billingTransactions)
      await tx.delete(dailyEarnings)
      return Number(count?.count ?? 0)
    })
    return NextResponse.json({ success: true, cleared })
  } catch (error) {
    console.error('[v0] Failed to clear transactions:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not clear transactions.' }, { status: 500 })
  }
}
