import { after, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { billingTransactions, inventoryItems, invoiceBillPhotos, invoiceItemPhotos, invoiceItems, invoiceSends } from '@/lib/db/schema'
import { isConnectionError, isUniqueViolation } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { getSessionIdentity } from '@/lib/db/session-identity'
import { inArray } from 'drizzle-orm'
import { buildMessage, buildSmsMessage, canAutoSendInvoices, canAutoSendSmsInvoices, getInvoiceDeliveryStatus, getSmsDeliveryStatus, normalisePhone, sendInvoice, type Channel } from '@/lib/messaging'
import { findOrCreateCustomer } from '@/lib/customers'
import { buildRedemptionMessage, getRewardSettings, redeemPoints } from '@/lib/rewards'
import { deliverRewardMessage } from '@/lib/reward-notifications'
import { getShopDetails } from '@/lib/shop'
import { randomBytes } from 'node:crypto'
import { publicInvoiceUrl } from '@/lib/public-url'
import { businessDate } from '@/lib/business-time'
import { detectImage, MAX_IMAGE_BYTES } from '@/lib/item-images'

type IncomingLine = { code: unknown; quantity: unknown; billedPrice: unknown; customerPhoto?: unknown }

type CustomerPhoto = { data: string; mime: string; byteSize: number }

const MAX_CUSTOMER_PHOTOS_PER_INVOICE = 8

/**
 * Validates the single whole-bill photo.
 *
 * It is the same byte-level check the per-line photos used: a browser-declared
 * MIME type can be forged, so the actual bytes are sniffed before anything is
 * stored. Returns `null` for "no photo", which is the normal case.
 */
function parseBillPhoto(value: unknown): { photo: CustomerPhoto | null } | { error: string } {
  if (value === undefined || value === null) return { photo: null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Upload a valid bill photo.' }

  const data = (value as { data?: unknown }).data
  if (typeof data !== 'string' || !data) return { error: 'Upload a valid bill photo.' }
  if (data.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) {
    return { error: `The bill photo must be under ${MAX_IMAGE_BYTES / 1024} KB.` }
  }
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    return { error: 'Upload a PNG, JPEG, GIF, or WebP bill photo.' }
  }

  const bytes = Buffer.from(data, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || Buffer.from(bytes).toString('base64') !== data) {
    return { error: `The bill photo must be a valid image under ${MAX_IMAGE_BYTES / 1024} KB.` }
  }
  const mime = detectImage(bytes)
  if (!mime) return { error: 'Upload a PNG, JPEG, GIF, or WebP bill photo.' }

  return { photo: { data, mime, byteSize: bytes.length } }
}

/**
 * Customer photos arrive with the rest of the bill as base64 JSON. Validate
 * their actual bytes here — browser MIME types and file extensions can both be
 * forged, and these images must stay safe to render later in the admin desk.
 */
function parseCustomerPhoto(value: unknown): { photo: CustomerPhoto | null } | { error: string } {
  if (value === undefined || value === null) return { photo: null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Upload a valid customer item photo.' }

  const data = (value as { data?: unknown }).data
  if (typeof data !== 'string' || !data) return { error: 'Upload a valid customer item photo.' }
  // Base64 expands raw bytes by roughly one third. Check the string before
  // decoding, then verify the final byte length below.
  if (data.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) {
    return { error: `Each customer item photo must be under ${MAX_IMAGE_BYTES / 1024} KB.` }
  }
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    return { error: 'Upload a PNG, JPEG, GIF, or WebP customer item photo.' }
  }

  const bytes = Buffer.from(data, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || Buffer.from(bytes).toString('base64') !== data) {
    return { error: `Each customer item photo must be a valid image under ${MAX_IMAGE_BYTES / 1024} KB.` }
  }
  const mime = detectImage(bytes)
  if (!mime) return { error: 'Upload a PNG, JPEG, GIF, or WebP customer item photo.' }

  return { photo: { data, mime, byteSize: bytes.length } }
}

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
    // Who is billing. Recorded against a points redemption, so spending a
    // customer's balance is always attributable to a person.
    const actor = await getSessionIdentity()
    const discount = Number(body.discount ?? 0)
    if (!Number.isFinite(discount) || discount < 0) {
      return NextResponse.json({ error: 'Enter a valid discount.' }, { status: 400 })
    }

    // Validate every line before touching the database, so a bad row cannot
    // leave a half-written invoice behind.
    const parsed: { code: number; quantity: number; billedPrice: number; customerPhoto: CustomerPhoto | null }[] = []
    for (const line of rawLines) {
      const customerPhoto = parseCustomerPhoto(line.customerPhoto)
      if ('error' in customerPhoto) return NextResponse.json({ error: customerPhoto.error }, { status: 400 })
      parsed.push({
        code: Number(line.code),
        quantity: Number(line.quantity),
        billedPrice: Number(line.billedPrice),
        customerPhoto: customerPhoto.photo,
      })
    }
    if (parsed.filter((line) => line.customerPhoto).length > MAX_CUSTOMER_PHOTOS_PER_INVOICE) {
      return NextResponse.json({ error: `A bill can include up to ${MAX_CUSTOMER_PHOTOS_PER_INVOICE} customer item photos.` }, { status: 400 })
    }
    for (const line of parsed) {
      if (!Number.isInteger(line.code) || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.billedPrice) || line.billedPrice <= 0) {
        return NextResponse.json({ error: 'Enter a valid item code, quantity, and customer price for every item.' }, { status: 400 })
      }
    }

    // The whole-bill photo is validated here, before any write, so an invalid
    // image can never leave a half-written invoice behind.
    const billPhoto = parseBillPhoto(body.billPhoto)
    if ('error' in billPhoto) return NextResponse.json({ error: billPhoto.error }, { status: 400 })

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

    //
    // Reward points, if the customer is spending any.
    //
    // Resolved BEFORE the invoice is written, so a bad request is refused while
    // nothing has been committed. The points are not deducted here — the deduction
    // happens inside the transaction below, alongside the invoice, so the two
    // cannot come apart. Deducting first and saving afterwards would burn a
    // customer's points on a bill that failed to save.
    //
    const pointsToRedeem = Math.trunc(Number(body.redeemPoints ?? 0))
    if (!Number.isFinite(pointsToRedeem) || pointsToRedeem < 0) {
      return NextResponse.json({ error: 'Enter a valid number of reward points to redeem.' }, { status: 400 })
    }

    // The customer record, found or created from the phone on this bill. This is
    // also the moment a first-time customer receives their referral number.
    let customerId: number | null = null
    let rewardDiscount = 0
    if (customerName && customerPhone) {
      const resolved = await findOrCreateCustomer({ name: customerName, phone: customerPhone })
      // A phone that cannot be a real mobile is not a reason to refuse the bill —
      // a walk-in sale matters more than a reward. It simply earns nothing.
      if (!('error' in resolved)) customerId = resolved.customer.id
    }
    if (pointsToRedeem > 0 && customerId === null) {
      return NextResponse.json(
        { error: 'A valid customer name and mobile number are needed before points can be redeemed.' },
        { status: 400 },
      )
    }

    const settings = await getRewardSettings()
    if (pointsToRedeem > 0) {
      if (settings.minimumPointsToRedeem > 0 && pointsToRedeem < settings.minimumPointsToRedeem) {
        return NextResponse.json({ error: `At least ${settings.minimumPointsToRedeem} points must be redeemed.` }, { status: 400 })
      }
      if (settings.maximumPointsPerBill > 0 && pointsToRedeem > settings.maximumPointsPerBill) {
        return NextResponse.json({ error: `At most ${settings.maximumPointsPerBill} points can be redeemed on one bill.` }, { status: 400 })
      }
      rewardDiscount = Math.round(pointsToRedeem * settings.redemptionValuePerPoint)
      if (rewardDiscount > subtotal - discount) {
        return NextResponse.json(
          { error: `Those points are worth ${rewardDiscount}, which is more than the bill after discount.` },
          { status: 400 },
        )
      }
    }

    // The reward discount is folded into the bill's own discount column, so the
    // printed total, the reports and the day's takings all agree without any of
    // them having to know that rewards exist.
    const totalDiscount = discount + rewardDiscount
    const total = subtotal - totalDiscount
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
        customerId,
        discount: totalDiscount.toFixed(2),
        publicToken,
      }).returning()

      //
      // Spend the points, in the same transaction as the invoice.
      //
      // If this fails the whole invoice rolls back, which is the correct outcome:
      // a bill that took points it could not record would leave a customer short
      // with nothing to show for it. The engine also refuses to go negative, so
      // a stale balance in the browser cannot overdraw the account.
      //
      let redeemed: { discountValue: number; balanceAfter: number } | null = null
      if (pointsToRedeem > 0 && customerId !== null) {
        const result = await redeemPoints(tx, {
          customerId,
          points: pointsToRedeem,
          invoiceNumber,
          createdBy: actor,
        })
        if ('error' in result) throw new Error(result.error)
        redeemed = { discountValue: result.discountValue, balanceAfter: result.balanceAfter }
      }

      const lines = await tx.insert(invoiceItems).values(lineRows.map((row) => ({ ...row, invoiceNumber }))).returning()
      const photos = lines.flatMap((line, index) => {
        const photo = parsed[index]?.customerPhoto
        return photo
          ? [{ invoiceItemId: line.id, mimeType: photo.mime, data: photo.data, byteSize: photo.byteSize }]
          : []
      })
      if (photos.length > 0) await tx.insert(invoiceItemPhotos).values(photos)

      // The whole-bill reference photo, one per invoice, attached to the header.
      if (billPhoto.photo) {
        await tx.insert(invoiceBillPhotos).values({
          invoiceNumber,
          mimeType: billPhoto.photo.mime,
          data: billPhoto.photo.data,
          byteSize: billPhoto.photo.byteSize,
        })
      }

      return { header, lines, redeemed }
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

    //
    // The redemption message, prepared but NOT sent.
    //
    // The shop's delivery provider decides whether anything leaves automatically,
    // and the wording is returned either way so the counter can read it out or
    // send it by hand. Preparing it here — rather than inside the send helper —
    // means the message always reflects the balance the transaction actually
    // produced, never a value recomputed later from a changed world.
    //
    let rewardMessage: string | undefined
    let rewardDelivery: Awaited<ReturnType<typeof deliverRewardMessage>> | undefined
    if (transaction.redeemed && customerName) {
      rewardMessage = buildRedemptionMessage(
        customerName,
        pointsToRedeem,
        transaction.redeemed.discountValue,
        transaction.redeemed.balanceAfter,
      )
      //
      // Sent the same way the invoice is: with the link-based provider this does
      // not send anything, it returns the WhatsApp URL for the counter to open.
      // The customer's phone is the one on this bill, which is where the points
      // belong — the person standing there redeeming them.
      //
      rewardDelivery = await deliverRewardMessage({
        phone: customerPhone,
        message: rewardMessage,
        kind: 'POINTS_REDEEMED',
        invoiceNumber,
        customerName,
      })
    }

    return NextResponse.json(
      {
        ...transaction.header,
        lines: transaction.lines,
        subtotal,
        sendStatus,
        sendDetail,
        reward: transaction.redeemed
          ? {
              pointsRedeemed: pointsToRedeem,
              discount: transaction.redeemed.discountValue,
              balanceAfter: transaction.redeemed.balanceAfter,
              message: rewardMessage,
              delivery: rewardDelivery,
            }
          : undefined,
      },
      { status: 201 },
    )
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
