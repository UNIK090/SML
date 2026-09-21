import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { storeOrderItems, storeOrders } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { getShopDetails } from '@/lib/shop'
import type { PublicOrder } from '@/lib/types'

// Public order tracking for the customer.
//
// The order number alone is NOT enough to read an order — it is short and
// guessable. The `t` query parameter must match the order's secret public
// token, which only the customer who placed the order ever receives.

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const orderNumber = params.get('orderNumber')?.trim() ?? ''
    const token = params.get('t')?.trim() ?? ''
    if (!orderNumber || !token) return NextResponse.json({ error: 'This order link is incomplete.' }, { status: 400 })

    const [order] = await db.select().from(storeOrders).where(eq(storeOrders.orderNumber, orderNumber))
    if (!order || order.publicToken !== token) {
      return NextResponse.json({ error: 'We could not find that order. Check the link or contact the shop.' }, { status: 404 })
    }

    const [lines, shop] = await Promise.all([
      db.select().from(storeOrderItems).where(eq(storeOrderItems.orderNumber, orderNumber)).orderBy(asc(storeOrderItems.id)),
      getShopDetails(),
    ])

    const body: PublicOrder = {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status as PublicOrder['status'],
      paymentStatus: order.paymentStatus as PublicOrder['paymentStatus'],
      fulfilment: order.fulfilment,
      totalAmount: order.totalAmount,
      itemCount: order.itemCount,
      createdAt: order.createdAt.toISOString(),
      shop: { name: shop.name, phone: shop.phone, address: shop.address },
      lines: lines.map((line) => ({
        id: line.id,
        itemCode: line.itemCode,
        itemName: line.itemName,
        category: line.category,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
      })),
    }

    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[v0] Failed to load public order:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'The shop is temporarily unavailable.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load that order.' }, { status: 500 })
  }
}
