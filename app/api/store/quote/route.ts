import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItems } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { currentBasketOffer } from '@/lib/offers-data'
import { MAX_ORDER_LINES, MAX_LINE_QUANTITY, sellingPrice } from '@/lib/store'

// What a basket is actually worth today.
//
// The cart needs to show a discount before the customer commits, but the cart
// lives in the browser and the offer rules live in the database. So the browser
// asks this endpoint rather than working the discount out for itself.
//
// That direction matters. A discount calculated in the browser is a discount the
// customer can edit — open the dev tools, change the number, and the cart claims
// ₹5,000 off. Here the browser sends only which pieces and how many, exactly as
// it does when placing the order, and the server prices it.
//
// The response is a quote, not a promise: placing the order re-runs the same
// rule server-side and stores the result, so the amount shown here and the
// amount charged can never drift apart.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { items?: unknown }
    const items = Array.isArray(body.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json({ subtotal: 0, discountAmount: 0, offerTitle: null, total: 0 })
    }
    if (items.length > MAX_ORDER_LINES) {
      return NextResponse.json({ error: 'That is more items than a single order can hold.' }, { status: 400 })
    }

    // The client sends codes and quantities only. Prices are never accepted from
    // the browser — they are read from the catalogue, so a tampered payload can
    // change what is being bought but not what it costs.
    const codes = [
      ...new Set(
        items
          .map((line) => Number((line as { code?: unknown }).code))
          .filter((code) => Number.isInteger(code) && code > 0),
      ),
    ]
    if (codes.length === 0) {
      return NextResponse.json({ subtotal: 0, discountAmount: 0, offerTitle: null, total: 0 })
    }

    const found = await db
      .select({
        code: inventoryItems.code,
        price: inventoryItems.price,
        storePrice: inventoryItems.storePrice,
      })
      .from(inventoryItems)
      .where(and(inArray(inventoryItems.code, codes), eq(inventoryItems.published, true)))

    const byCode = new Map(found.map((item) => [item.code, item]))
    const quantities = new Map<number, number>()
    for (const line of items) {
      const code = Number((line as { code?: unknown }).code)
      if (!byCode.has(code)) continue
      const requested = Math.floor(Number((line as { quantity?: unknown }).quantity))
      if (!Number.isFinite(requested) || requested <= 0) continue
      quantities.set(code, Math.min((quantities.get(code) ?? 0) + requested, MAX_LINE_QUANTITY))
    }

    let subtotal = 0
    for (const [code, quantity] of quantities) {
      subtotal += sellingPrice(byCode.get(code)!) * quantity
    }

    const offer = await currentBasketOffer(subtotal)
    const discountAmount = offer?.amount ?? 0

    return NextResponse.json({
      subtotal,
      discountAmount,
      offerTitle: offer?.title ?? null,
      total: Math.max(0, subtotal - discountAmount),
    })
  } catch (error) {
    console.error('[store/quote] Failed to price the basket:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the shop. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not work out the basket total.' }, { status: 500 })
  }
}
