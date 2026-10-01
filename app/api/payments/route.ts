import { NextResponse } from 'next/server'
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions, dailyEarnings, invoiceBillPhotos, invoiceItemPhotos, invoiceItems, invoiceSends } from '@/lib/db/schema'
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

    // Attach the whole-bill photo to each row that has one.
    //
    // One extra read for the whole page rather than a join on every row: the
    // Payments table is a settlement list, and most bills have no photo, so a
    // second indexed lookup by invoice number is cheaper and keeps `rows` shaped
    // exactly as it was before.
    const invoiceNumbers = rows.map((row) => row.invoiceNumber)
    const billPhotos = invoiceNumbers.length > 0
      ? await db
        .select({ id: invoiceBillPhotos.id, invoiceNumber: invoiceBillPhotos.invoiceNumber, byteSize: invoiceBillPhotos.byteSize })
        .from(invoiceBillPhotos)
        .where(inArray(invoiceBillPhotos.invoiceNumber, invoiceNumbers))
      : []
    const photoByInvoice = new Map(billPhotos.map((photo) => [photo.invoiceNumber, { id: photo.id, byteSize: photo.byteSize }]))

    return NextResponse.json({
      rows: rows.map((row) => ({ ...row, billPhoto: photoByInvoice.get(row.invoiceNumber) ?? null })),
      total,
      page,
      perPage,
      pages: Math.max(1, Math.ceil(total / perPage)),
    })
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
 * Deletes transactions, at two levels of blast radius.
 *
 *   · An `invoiceNumber` in the body removes exactly one bill — the invoice
 *     header, its line items, its private customer photos, and its send audit
 *     rows. This is the everyday correction: a bill keyed in by mistake.
 *
 *   · The exact `CLEAR_TRANSACTIONS` confirmation removes the whole ledger
 *     while preserving the catalogue, shop profile, and branding.
 *
 * The narrow case is deliberately checked FIRST so a body carrying both fields
 * can never widen into a full wipe. The daily totals are recomputed from what is
 * left rather than blindly decremented, so a day that still has bills keeps the
 * right figure and a day with none is removed outright.
 */
export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json().catch(() => null)
    const invoiceNumber = typeof body?.invoiceNumber === 'string' ? body.invoiceNumber.trim() : ''

    if (invoiceNumber) {
      const removed = await db.transaction(async (tx) => {
        const [header] = await tx.select().from(billingTransactions).where(eq(billingTransactions.invoiceNumber, invoiceNumber))
        if (!header) return null

        const lines = await tx.select({ id: invoiceItems.id }).from(invoiceItems).where(eq(invoiceItems.invoiceNumber, invoiceNumber))
        const lineIds = lines.map((line) => line.id)
        // Customer photos hang off the line items, so they must go first.
        if (lineIds.length > 0) await tx.delete(invoiceItemPhotos).where(inArray(invoiceItemPhotos.invoiceItemId, lineIds))
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceNumber, invoiceNumber))
        await tx.delete(invoiceSends).where(eq(invoiceSends.invoiceNumber, invoiceNumber))
        await tx.delete(billingTransactions).where(eq(billingTransactions.invoiceNumber, invoiceNumber))

        // Rebuild this business day's total from the invoices that remain, so the
        // daily figure stays a fact rather than a running guess.
        const [remaining] = await tx
          .select({ count: sql<number>`count(*)`, total: sql<string>`coalesce(sum(${billingTransactions.totalAmount}), 0)` })
          .from(billingTransactions)
          .where(eq(billingTransactions.businessDay, header.businessDay))
        const count = Number(remaining?.count ?? 0)
        await tx.delete(dailyEarnings).where(eq(dailyEarnings.businessDay, header.businessDay))
        if (count > 0) {
          await tx.insert(dailyEarnings).values({
            businessDay: header.businessDay,
            totalAmount: Number(remaining?.total ?? 0).toFixed(2),
            transactionCount: count,
            closedAt: new Date(),
          })
        }
        return header
      })

      if (!removed) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
      return NextResponse.json({ success: true, deleted: 1, invoiceNumber })
    }

    if (body?.confirmation !== 'CLEAR_TRANSACTIONS') {
      return NextResponse.json({ error: 'Transaction clearing was not confirmed.' }, { status: 400 })
    }

    const cleared = await db.transaction(async (tx) => {
      const [count] = await tx.select({ count: sql<number>`count(*)` }).from(billingTransactions)
      // Delete dependent records first so this stays valid if foreign keys are
      // added by a future database migration.
      await tx.delete(invoiceItemPhotos)
      await tx.delete(invoiceSends)
      await tx.delete(invoiceItems)
      await tx.delete(billingTransactions)
      await tx.delete(dailyEarnings)
      return Number(count?.count ?? 0)
    })
    return NextResponse.json({ success: true, cleared })
  } catch (error) {
    console.error('[v0] Failed to delete transactions:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not delete the transaction.' }, { status: 500 })
  }
}
