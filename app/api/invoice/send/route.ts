import { NextResponse } from 'next/server'
import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingTransactions, invoiceItems, invoiceSends } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getShopDetails } from '@/lib/shop'
import { buildMessage, isAutoSendEnabled, normalisePhone, sendInvoice, type Channel } from '@/lib/messaging'

/** Send history for an invoice, newest first — lets a bill be re-sent knowingly. */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const invoiceNumber = new URL(request.url).searchParams.get('invoiceNumber')
    if (!invoiceNumber) return NextResponse.json({ error: 'An invoice number is required.' }, { status: 400 })

    const history = await db.select().from(invoiceSends).where(eq(invoiceSends.invoiceNumber, invoiceNumber)).orderBy(desc(invoiceSends.createdAt))
    return NextResponse.json({ history, autoSend: isAutoSendEnabled() })
  } catch (error) {
    console.error('[v0] Failed to load send history:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the send history.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json()
    const invoiceNumber = typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : ''
    const channel: Channel = body.channel === 'sms' ? 'sms' : 'whatsapp'

    if (!invoiceNumber) return NextResponse.json({ error: 'An invoice number is required.' }, { status: 400 })

    const [invoice] = await db.select().from(billingTransactions).where(eq(billingTransactions.invoiceNumber, invoiceNumber))
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

    // The phone supplied on the form wins, so a corrected number can be used;
    // otherwise fall back to the number saved on the bill.
    const rawPhone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : (invoice.customerPhone ?? '')
    const phone = normalisePhone(rawPhone)
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 })
    }

    const lines = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceNumber, invoiceNumber)).orderBy(asc(invoiceItems.id))
    const message = buildMessage({
      invoiceNumber,
      customerName: invoice.customerName,
      shop: await getShopDetails(),
      total: invoice.totalAmount,
      lines: lines.map((line) => ({ itemName: line.itemName, quantity: line.quantity, lineTotal: line.lineTotal })),
      discount: invoice.discount,
      paymentStatus: invoice.paymentStatus,
      businessDay: String(invoice.businessDay),
      publicUrl: null,
    })

    const result = await sendInvoice({ phone, channel, message })

    // Record the attempt either way, so a failure is visible and retryable.
    const [record] = await db.insert(invoiceSends).values({
      invoiceNumber,
      channel,
      provider: result.provider,
      phone,
      status: result.status,
      response: result.detail ?? null,
    }).returning()

    // Remember a corrected number on the invoice for next time.
    if (phone !== invoice.customerPhone) {
      await db.update(billingTransactions).set({ customerPhone: phone }).where(eq(billingTransactions.invoiceNumber, invoiceNumber))
    }

    return NextResponse.json(
      { status: result.status, provider: result.provider, link: result.link ?? null, detail: result.detail ?? null, delivered: result.delivered, record, message },
      { status: result.status === 'FAILED' ? 502 : 200 },
    )
  } catch (error) {
    console.error('[v0] Failed to send invoice:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not send the invoice.' }, { status: 500 })
  }
}
