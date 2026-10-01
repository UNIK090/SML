import { NextResponse } from 'next/server'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions, invoiceBillPhotos, invoiceItemPhotos, invoiceItems } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'

// Returns one invoice with its full list of line items, for the printed bill.
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const invoiceNumber = new URL(request.url).searchParams.get('invoiceNumber')
    if (!invoiceNumber) return NextResponse.json({ error: 'An invoice number is required.' }, { status: 400 })

    // Header and lines have the same lookup key, so fetch them together. The
    // whole-bill photo is fetched alongside as it hangs off the header.
    const [[header], lines, [billPhoto]] = await Promise.all([
      db.select().from(billingTransactions).where(eq(billingTransactions.invoiceNumber, invoiceNumber)),
      db.select().from(invoiceItems).where(eq(invoiceItems.invoiceNumber, invoiceNumber)).orderBy(asc(invoiceItems.id)),
      db
        .select({ id: invoiceBillPhotos.id, byteSize: invoiceBillPhotos.byteSize })
        .from(invoiceBillPhotos)
        .where(eq(invoiceBillPhotos.invoiceNumber, invoiceNumber)),
    ])
    if (!header) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    const lineIds = lines.map((line) => line.id)
    const photos = lineIds.length > 0
      ? await db
        .select({ id: invoiceItemPhotos.id, invoiceItemId: invoiceItemPhotos.invoiceItemId, byteSize: invoiceItemPhotos.byteSize })
        .from(invoiceItemPhotos)
        .where(inArray(invoiceItemPhotos.invoiceItemId, lineIds))
      : []
    const photoByLine = new Map(photos.map((photo) => [photo.invoiceItemId, { id: photo.id, byteSize: photo.byteSize }]))
    return NextResponse.json({
      ...header,
      billPhoto: billPhoto ?? null,
      lines: lines.map((line) => ({ ...line, customerPhoto: photoByLine.get(line.id) ?? null })),
    })
  } catch (error) {
    console.error('[v0] Failed to load invoice:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the invoice.' }, { status: 500 })
  }
}
