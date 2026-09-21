import { NextResponse } from 'next/server'
import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItems, orderNotifications, storeOrderItems, storeOrders } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { businessDate } from '@/lib/business-time'
import { publish } from '@/lib/realtime'
import { clampQuantity, deliveryFeeFor, MAX_ORDER_LINES, requiresAddress, sellingPrice } from '@/lib/store'

// ---------------------------------------------------------------------------
// Order intake comes from two places and both must behave identically:
//
//   POST /api/store/orders              the public storefront (Phase B)
//   POST /api/orders  (admin session)   the admin taking a phone/WhatsApp order
//
// So the shared work lives here and each route is a thin wrapper that differs
// only in how it authenticates.
// ---------------------------------------------------------------------------

type IncomingLine = { code: unknown; quantity: unknown }

export type PlaceOrderInput = {
  customerName: unknown
  customerPhone: unknown
  customerEmail?: unknown
  fulfilment?: unknown
  addressLine?: unknown
  city?: unknown
  pincode?: unknown
  notes?: unknown
  items: IncomingLine[]
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/** A short, readable reference: SML-8K2Q4. */
function makeOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5)
  const noise = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')
  return `SML-${stamp}${noise}`
}

function cleanPhone(value: string): string {
  return value.replace(/[^\d+]/g, '')
}

export async function placeOrder(input: PlaceOrderInput) {
  const customerName = text(input.customerName, 120)
  const customerPhoneRaw = text(input.customerPhone, 40)
  const customerEmail = text(input.customerEmail, 160)
  const fulfilment = input.fulfilment === 'DELIVERY' ? 'DELIVERY' : 'PICKUP'
  const addressLine = text(input.addressLine, 240)
  const city = text(input.city, 80)
  const pincode = text(input.pincode, 12)
  const notes = text(input.notes, 500)

  if (!customerName) return { error: 'Please enter your name.', status: 400 }
  if (!customerPhoneRaw) return { error: 'A mobile number is required so the shop can confirm your order.', status: 400 }
  const customerPhone = cleanPhone(customerPhoneRaw)
  if (customerPhone.replace(/\D/g, '').length < 10) return { error: 'That mobile number looks too short.', status: 400 }
  if (requiresAddress(fulfilment) && !addressLine) return { error: 'A delivery address is required for home delivery.', status: 400 }

  if (!Array.isArray(input.items) || input.items.length === 0) return { error: 'Your basket is empty.', status: 400 }
  if (input.items.length > MAX_ORDER_LINES) return { error: `A single order can hold up to ${MAX_ORDER_LINES} different items.`, status: 400 }

  // Merge duplicate codes first, so adding the same piece twice in the store is
  // accumulated rather than rejected by the per-line quantity cap.
  const requested = new Map<number, number>()
  for (const line of input.items) {
    const code = Number(line.code)
    if (!Number.isInteger(code) || code <= 0) return { error: 'One of the basket items is not a valid product.', status: 400 }
    const quantity = clampQuantity(line.quantity)
    requested.set(code, Math.min((requested.get(code) ?? 0) + quantity, 20))
  }

  const codes = [...requested.keys()]
  // The published filter is the security boundary: an unpublished catalogue row
  // can never be ordered, even if its code is guessed or sent by hand.
  const found = await db
    .select({
      code: inventoryItems.code,
      name: inventoryItems.name,
      category: inventoryItems.category,
      price: inventoryItems.price,
      storePrice: inventoryItems.storePrice,
      published: inventoryItems.published,
    })
    .from(inventoryItems)
    .where(and(inArray(inventoryItems.code, codes), eq(inventoryItems.published, true)))

  const byCode = new Map(found.map((item) => [item.code, item]))
  const unavailable = codes.filter((code) => !byCode.has(code))
  if (unavailable.length > 0) {
    return {
      error: `Some pieces are no longer available online (${unavailable.slice(0, 3).join(', ')}). Please refresh the store and try again.`,
      status: 409,
    }
  }

  const lineRows = codes.map((code) => {
    const item = byCode.get(code)!
    const unitPrice = sellingPrice(item)
    const quantity = requested.get(code)!
    return {
      itemCode: item.code,
      itemName: item.name,
      category: item.category,
      unitPrice: unitPrice.toFixed(2),
      quantity,
      lineTotal: (unitPrice * quantity).toFixed(2),
    }
  })

  const subtotal = lineRows.reduce((sum, row) => sum + Number(row.lineTotal), 0)
  const deliveryFee = deliveryFeeFor(subtotal, fulfilment)
  const total = subtotal + deliveryFee
  const itemCount = lineRows.reduce((sum, row) => sum + row.quantity, 0)

  const orderNumber = makeOrderNumber()
  const publicToken = randomBytes(18).toString('base64url')
  const eventId = randomUUID()
  const businessDay = businessDate()

  const summary = `${itemCount} ${itemCount === 1 ? 'piece' : 'pieces'} · ₹${total.toFixed(0)}`

  // The order, its lines and its notification are written in one transaction.
  // That is what makes the alert dependable: if the customer sees a confirmed
  // order, the notification row exists and will be replayed to any admin device.
  const order = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(storeOrders)
      .values({
        orderNumber,
        publicToken,
        customerName,
        customerPhone,
        customerEmail,
        fulfilment,
        addressLine,
        city,
        pincode,
        notes,
        itemCount,
        subtotal: subtotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        totalAmount: total.toFixed(2),
        businessDay,
      })
      .returning()

    const lines = await tx.insert(storeOrderItems).values(lineRows.map((row) => ({ ...row, orderNumber }))).returning()

    await tx.insert(orderNotifications).values({
      eventId,
      type: 'ORDER_PLACED',
      orderNumber,
      title: `New online order · ${summary}`,
      body: `${customerName} (${customerPhone}) placed ${orderNumber}. ${fulfilment === 'DELIVERY' ? 'Home delivery' : 'Store pickup'}.`,
      audience: 'admin',
    })

    return { header, lines }
  })

  // Push to every open admin browser right now. This only reaches listeners on
  // the same instance — the notification row plus the client's resume cursor is
  // what guarantees delivery across instances and reconnects.
  publish({
    event: 'order',
    id: eventId,
    data: {
      eventId,
      type: 'ORDER_PLACED',
      orderNumber,
      title: `New online order · ${summary}`,
      body: `${customerName} (${customerPhone}) · ${fulfilment === 'DELIVERY' ? 'Home delivery' : 'Store pickup'}`,
      audience: 'admin',
      createdAt: new Date().toISOString(),
    },
  })

  return { order: { ...order.header, lines: order.lines }, publicToken, orderNumber, eventId, subtotal, deliveryFee, total }
}

/** Wraps placeOrder in the error handling both routes share. */
export async function placeOrderResponse(input: PlaceOrderInput) {
  try {
    const result = await placeOrder(input)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[v0] Failed to place order:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the shop. Please try again in a moment.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not place the order. Please try again.' }, { status: 500 })
  }
}
