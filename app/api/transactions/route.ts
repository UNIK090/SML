import { after, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { billingTransactions, inventoryItems, invoiceItems, invoiceSends } from '@/lib/db/schema'
import { isConnectionError, isUniqueViolation } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inArray } from 'drizzle-orm'
import { buildMessage, buildSmsMessage, canAutoSendInvoices, canAutoSendSmsInvoices, getInvoiceDeliveryStatus, getSmsDeliveryStatus, normalisePhone, sendInvoice, type Channel } from '@/lib/messaging'
import { getShopDetails } from '@/lib/shop'
import { randomBytes } from 'node:crypto'
import { publicInvoiceUrl } from '@/lib/public-url'
import { businessDate } from '@/lib/business-time'

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
    // Date every invoice in the shop's local business timezone. Relying on a
    // database default would split late-night India sales into the next/previous
    // UTC day and make the daily total reset at the wrong time.
    const businessDay = businessDate()
    // This token is deliberately separate from the human-readable invoice
    // number, so the customer-facing QR receipt cannot be guessed.
    const publicToken = randomBytes(18).toString('base64url')

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
        businessDay,
        customerName,
        customerPhone,
        discount: discount.toFixed(2),
        publicToken,
      }).returning()

      const lines = await tx.insert(invoiceItems).values(lineRows.map((row) => ({ ...row, invoiceNumber }))).returning()
      return { header, lines }
    })

    // Invoice saves should feel immediate. Direct WhatsApp/SMS providers run
    // after the response so the counter is never blocked by a network call.
    // Each attempt is retained in invoice_sends for delivery auditing.
    let sendStatus: string | undefined
    let sendDetail: string | undefined
    const phone = customerPhone ? normalisePhone(customerPhone) : null
    const whatsappDelivery = getInvoiceDeliveryStatus()
    const smsDelivery = getSmsDeliveryStatus()
    const jobs: { channel: Channel; provider: string }[] = []
    const blocked: string[] = []
    if (phone && canAutoSendInvoices()) jobs.push({ channel: 'whatsapp', provider: whatsappDelivery.provider })
    else if (phone && whatsappDelivery.autoSendEnabled) blocked.push(whatsappDelivery.detail)
    if (phone && canAutoSendSmsInvoices()) jobs.push({ channel: 'sms', provider: smsDelivery.provider })
    else if (phone && smsDelivery.autoSendEnabled) blocked.push(smsDelivery.detail)

    if (phone && jobs.length > 0) {
      sendStatus = 'SCHEDULED'
      const channels = jobs.map((job) => job.channel === 'sms' ? 'SMS' : 'WhatsApp').join(' and ')
      sendDetail = `${channels} delivery is being sent in the background.`
      const receiptUrl = publicInvoiceUrl(request, publicToken)
      after(async () => {
        try {
          const invoiceMessage = {
            invoiceNumber,
            customerName,
            shop: await getShopDetails(),
            total: total.toFixed(2),
            lines: transaction.lines.map((line) => ({ itemName: line.itemName, quantity: line.quantity, lineTotal: line.lineTotal })),
            discount: discount.toFixed(2),
            paymentStatus,
            businessDay: String(transaction.header.businessDay),
            publicUrl: receiptUrl,
          }
          await Promise.all(jobs.map(async (job) => {
            try {
              const message = job.channel === 'sms' ? buildSmsMessage(invoiceMessage) : buildMessage(invoiceMessage)
              const sent = await sendInvoice({ phone, channel: job.channel, message })
              await db.insert(invoiceSends).values({ invoiceNumber, channel: job.channel, provider: sent.provider, phone, status: sent.status, response: sent.detail ?? null })
            } catch (error) {
              console.error(`[invoice] Automatic ${job.channel} send failed:`, error)
              await db.insert(invoiceSends).values({
                invoiceNumber, channel: job.channel, provider: job.provider, phone,
                status: 'FAILED', response: error instanceof Error ? error.message : 'Automatic delivery failed.',
              }).catch(() => undefined)
            }
          }))
        } catch (error) {
          console.error('[invoice] Automatic delivery preparation failed:', error)
          await Promise.all(jobs.map((job) => db.insert(invoiceSends).values({
            invoiceNumber, channel: job.channel, provider: job.provider, phone,
            status: 'FAILED', response: error instanceof Error ? error.message : 'Automatic delivery preparation failed.',
          }).catch(() => undefined)))
        }
      })
    } else if (phone && blocked.length > 0) {
      sendStatus = 'FAILED'
      sendDetail = blocked.join(' ')
    }

    return NextResponse.json({ ...transaction.header, lines: transaction.lines, subtotal, sendStatus, sendDetail }, { status: 201 })
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
