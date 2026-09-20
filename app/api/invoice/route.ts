import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions, invoiceItems } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'

// Returns one invoice with its full list of line items, for the printed bill.
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const invoiceNumber = new URL(request.url).searchParams.get('invoiceNumber')
    if (!invoiceNumber) return NextResponse.json({ error: 'An invoice number is required.' }, { status: 400 })

    // Header and lines have the same lookup key, so fetch them together.
    const [[header], lines] = await Promise.all([
      db.select().from(billingTransactions).where(eq(billingTransactions.invoiceNumber, invoiceNumber)),
      db.select().from(invoiceItems).where(eq(invoiceItems.invoiceNumber, invoiceNumber)).orderBy(asc(invoiceItems.id)),
    ])
    if (!header) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    return NextResponse.json({ ...header, lines })
  } catch (error) {
    console.error('[v0] Failed to load invoice:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the invoice.' }, { status: 500 })
  }
}
