import { NextResponse } from 'next/server'
import { desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { storeOrderItems, storeOrders } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { getShopDetails } from '@/lib/shop'
import { normalisePhone } from '@/lib/messaging'
import { placeOrderResponse, type PlaceOrderInput } from '@/lib/orders'
import type { PublicOrder } from '@/lib/types'

// Public order intake: the storefront checkout posts here.
// No session is required, which is exactly why lib/orders re-checks that every
// requested product is published before anything is written.

export async function POST(request: Request) {
  let body: PlaceOrderInput
  try {
    body = (await request.json()) as PlaceOrderInput
  } catch {
    return Response.json({ error: 'The order could not be read. Please try again.' }, { status: 400 })
  }
  return placeOrderResponse(body)
}

/**
 * The last ten digits of a phone number, which is how two spellings of the same
 * Indian mobile are compared. Returns a short string when there is nothing to
 * compare, so a blank can never match a blank.
 */
function lastTenDigits(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/[^\d]/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

/**
 * The leftmost positions of a number that could still be the one being searched
 * for, used to narrow the read before comparing in the application.
 */
function compareKey(value: string): string {
  return value.replace(/[^\d]/g, '').slice(-10)
}

/**
 * The customer's own orders, found by the mobile number they gave.
 *
 * There are no customer logins on this website — a customer buying a ₹350 pair
 * of earrings will not create an account, and asking them to would lose the
 * sale. So "My orders" proves identity the way the shop already does on the
 * phone: with the number on the bill.
 *
 * What that means for safety, stated plainly because it matters:
 *
 *   `919876543210`, `+91 98765 43210` and `09876543210` are the same customer
 *   spelled differently, so the match is made on the last ten digits rather than
 *   the raw string — otherwise a customer who typed a country code once and not
 *   the next time would see an empty page and assume their order was lost.
 *
 *   The response is deliberately narrow. It carries the customer's own orders
 *   and the shop's details — never an address, an email, a public token, or
 *   another customer's order. Knowing a number is enough to see the orders
 *   placed with that number, which is exactly what the shop would read out to
 *   whoever called.
 */
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get('phone')?.trim() ?? ''
    if (!raw) return NextResponse.json({ error: 'Enter the mobile number you ordered with.' }, { status: 400 })

    const shop = await getShopDetails()
    const phone = lastTenDigits(raw)
    const shape = { shop: { name: shop.name, phone: shop.phone } }

    // A number too short to be an Indian mobile cannot match anything, so it is
    // answered as "none found" rather than with a validation lecture — the
    // customer's next move is the same either way. normalisePhone is still run
    // so a clearly impossible number (a landline, or a digit short) is rejected
    // before any read happens.
    if (phone.length < 10 || !normalisePhone(raw)) {
      return NextResponse.json({ orders: [], ...shape }, { headers: { 'Cache-Control': 'no-store' } })
    }

    /*
     * Match in the application, not in SQL.
     *
     * `customerPhone` is saved exactly as the customer typed it, because that is
     * what the shopkeeper reads back to them on the phone. Rather than migrate
     * the column — which would rewrite the phone on every past order — recent
     * orders are read and compared, so all three spellings above find the same
     * order while the stored text stays readable. The window is bounded so this
     * stays a small read.
     */
    const recent = await db.select().from(storeOrders).orderBy(desc(storeOrders.createdAt)).limit(400)
    const matched = recent.filter((order) => compareKey(order.customerPhone) === phone).slice(0, 20)

    if (matched.length === 0) {
      return NextResponse.json({ orders: [], ...shape }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const numbers = matched.map((order) => order.orderNumber)
    const lines = await db
      .select()
      .from(storeOrderItems)
      .where(inArray(storeOrderItems.orderNumber, numbers))
      .orderBy(storeOrderItems.id)

    const byOrder = new Map<string, typeof lines>()
    for (const line of lines) {
      const bucket = byOrder.get(line.orderNumber)
      if (bucket) bucket.push(line)
      else byOrder.set(line.orderNumber, [line])
    }

    const orders: PublicOrder[] = matched.map((order) => ({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status as PublicOrder['status'],
      paymentStatus: order.paymentStatus as PublicOrder['paymentStatus'],
      fulfilment: order.fulfilment,
      totalAmount: order.totalAmount,
      itemCount: order.itemCount,
      createdAt: order.createdAt.toISOString(),
      shop: { name: shop.name, phone: shop.phone, address: shop.address },
      lines: (byOrder.get(order.orderNumber) ?? []).map((line) => ({
        id: line.id,
        itemCode: line.itemCode,
        itemName: line.itemName,
        category: line.category,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
      })),
    }))

    return NextResponse.json({ orders, ...shape }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[v0] Failed to look up orders by phone:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'The shop is temporarily unavailable.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not look up your orders.' }, { status: 500 })
  }
}
