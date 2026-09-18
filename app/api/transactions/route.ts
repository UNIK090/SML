import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { billingTransactions, inventoryItems, invoiceItems, invoiceSends } from '@/lib/db/schema'
import { isConnectionError, isUniqueViolation } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { asc, inArray } from 'drizzle-orm'
import { buildMessage, isAutoSendEnabled, normalisePhone, sendInvoice } from '@/lib/messaging'
import { getShopDetails } from '@/lib/shop'

type IncomingLine = { code: unknown; quantity: unknown; billedPrice: unknown }

/** Builds a readable invoice number that will not collide across restarts. */
function makeInvoiceNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase()
  const noise = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')
  return `INV-${stamp}${noise}`
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json()

    // Accept either a multi-item `items` array (the cart) or the older
    // single-item shape, so the old form and any saved client keep working.
    const rawLines: IncomingLine[] = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [{ code: body.code, quantity: body.quantity, billedPrice: body.billedPrice }]

    if (rawLines.length > 100) {
      return NextResponse.json({ error: 'A single bill cannot hold more than 100 items.' }, { status: 400 })
    }

    const paymentStatus = body.paymentStatus === 'PENDING' ? 'PENDING' : 'PAID'
    const customerName = typeof body.customerName === 'string' && body.customerName.trim() ? body.customerName.trim().slice(0, 120) : null
    const customerPhone = typeof body.customerPhone === 'string' && body.customerPhone.trim() ? body.customerPhone.trim().slice(0, 40) : null
    const discount = Number(body.discount ?? 0)
    if (!Number.isFinite(discount) || discount < 0) {
      return NextResponse.json({ error: 'Enter a valid discount.' }, { status: 400 })
    }

    // Validate every line before touching the database, so a bad row cannot
    // leave a half-written invoice behind.
    const parsed = rawLines.map((line) => ({
      code: Number(line.code),
      quantity: Number(line.quantity),
      billedPrice: Number(line.billedPrice),
    }))
    for (const line of parsed) {
      if (!Number.isInteger(line.code) || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.billedPrice) || line.billedPrice <= 0) {
        return NextResponse.json({ error: 'Enter a valid item code, quantity, and customer price for every item.' }, { status: 400 })
      }
    }

    const codes = [...new Set(parsed.map((line) => line.code))]
    const found = await db.select().from(inventoryItems).where(inArray(inventoryItems.code, codes))
    const byCode = new Map(found.map((item) => [item.code, item]))

    const missing = codes.filter((code) => !byCode.has(code))
    if (missing.length > 0) {
      return NextResponse.json({ error: `No item found for code ${missing.join(', ')}.` }, { status: 404 })
    }

    const lineRows = parsed.map((line) => {
      const item = byCode.get(line.code)!
      return {
        itemCode: item.code,
        itemName: item.name,
        category: item.category,
        cataloguePrice: item.price,
        unitPrice: line.billedPrice.toFixed(2),
        quantity: line.quantity,
        lineTotal: (line.billedPrice * line.quantity).toFixed(2),
      }
    })

    const subtotal = lineRows.reduce((sum, row) => sum + Number(row.lineTotal), 0)
    if (discount > subtotal) {
      return NextResponse.json({ error: 'The discount cannot be more than the bill subtotal.' }, { status: 400 })
    }
    const total = subtotal - discount
    const first = lineRows[0]
    const invoiceNumber = makeInvoiceNumber()

    // Header and lines must land together or not at all.
    const transaction = await db.transaction(async (tx) => {
      const [header] = await tx.insert(billingTransactions).values({
        invoiceNumber,
        itemCode: first.itemCode,
        itemName: lineRows.length > 1 ? `${first.itemName} +${lineRows.length - 1} more` : first.itemName,
        category: first.category,
        unitPrice: first.unitPrice,
        quantity: first.quantity,
        totalAmount: total.toFixed(2),
        paymentStatus,
        customerName,
        customerPhone,
        discount: discount.toFixed(2),
      }).returning()

      const lines = await tx.insert(invoiceItems).values(lineRows.map((row) => ({ ...row, invoiceNumber }))).returning()
      return { header, lines }
    })

    // Optional auto-send. Only runs when INVOICE_AUTO_SEND=true AND a real
    // provider is configured, so a mistyped number is never messaged silently by
    // the link provider (which cannot send without a human pressing Send anyway).
    let sendStatus: string | undefined
    let sendLink: string | undefined
    let sendDetail: string | undefined
    const phone = customerPhone ? normalisePhone(customerPhone) : null
    if (isAutoSendEnabled() && phone) {
      try {
        const lines = await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceNumber, [invoiceNumber])).orderBy(asc(invoiceItems.id))
        const message = buildMessage({
          invoiceNumber,
          customerName,
          shop: await getShopDetails(),
          total: total.toFixed(2),
          lines: lines.map((line) => ({ itemName: line.itemName, quantity: line.quantity, lineTotal: line.lineTotal })),
          discount: discount.toFixed(2),
          paymentStatus,
          businessDay: new Date().toISOString().slice(0, 10),
          publicUrl: null,
        })
        const sent = await sendInvoice({ phone, channel: 'whatsapp', message })
        sendStatus = sent.status; sendLink = sent.link; sendDetail = sent.detail
        await db.insert(invoiceSends).values({
          invoiceNumber, channel: 'whatsapp', provider: sent.provider, phone,
          status: sent.status, response: sent.detail ?? null,
        })
      } catch (error) {
        // A delivery failure must never fail the bill itself — the sale is already saved.
        console.error('[v0] Auto-send failed:', error)
        sendStatus = 'FAILED'
        sendDetail = error instanceof Error ? error.message : 'Auto-send failed.'
      }
    }

    return NextResponse.json({ ...transaction.header, lines: transaction.lines, subtotal, sendStatus, sendLink, sendDetail }, { status: 201 })
  } catch (error) {
    console.error('[v0] Failed to save transaction:', error)
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'That invoice number was already used. Please try again.' }, { status: 409 })
    }
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the bill.' }, { status: 500 })
  }
}
