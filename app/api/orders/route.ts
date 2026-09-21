import { NextResponse } from 'next/server'
import { and, desc, eq, gt, gte, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { storeOrders, storeOrderItems } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { publish } from '@/lib/realtime'
import { placeOrderResponse, type PlaceOrderInput } from '@/lib/orders'
import { ORDER_STATUS_LABELS } from '@/lib/store'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ['NEW', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'] as const
/** Orders that still need the shop's attention. */
const OPEN_STATUSES = ['NEW', 'CONFIRMED', 'READY']

/**
 * The admin orders list.
 *
 * `?since=<epoch ms>` returns only orders placed after that instant, which is
 * what the realtime hook uses as its safety net after a dropped connection or
 * when the deployment runs on more than one serverless instance.
 *
 * `?unseen=<lastSeenIso>` additionally reports how many live orders have never
 * been acknowledged by a device, which drives the notification bell badge.
 */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    const from = params.get('from')
    const to = params.get('to')
    const search = params.get('q')?.trim()
    const since = Number(params.get('since'))
    const unseen = params.get('unseen')
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 60) || 60, 1), 200)

    const conditions: SQL[] = []
    if (status && STATUSES.includes(status as (typeof STATUSES)[number])) conditions.push(eq(storeOrders.status, status))
    if (from && DATE.test(from)) conditions.push(gte(storeOrders.businessDay, from))
    if (to && DATE.test(to)) conditions.push(gte(storeOrders.businessDay, to))
    if (Number.isFinite(since) && since > 0) {
      const cursor = new Date(since)
      // Filter on EITHER clock: the database writes created_at and the client
      // keeps its resume point on the same timeline, but an order edited by an
      // admin is picked up through updated_at as well.
      const fresh = or(gt(storeOrders.createdAt, cursor), gt(storeOrders.updatedAt, cursor))
      if (fresh) conditions.push(fresh)
    }
    if (search) {
      const pattern = `%${search}%`
      const match = or(
        sql`${storeOrders.orderNumber} ilike ${pattern}`,
        sql`${storeOrders.customerName} ilike ${pattern}`,
        sql`${storeOrders.customerPhone} ilike ${pattern}`,
      )
      if (match) conditions.push(match)
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [[countRow], rows, [openRow]] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(storeOrders).where(where),
      db.select().from(storeOrders).where(where).orderBy(desc(storeOrders.createdAt)).limit(limit),
      db
        .select({
          open: sql<number>`count(*)`,
          unseen: sql<number>`count(*) filter (where ${storeOrders.ackedAt} is null)`,
        })
        .from(storeOrders)
        .where(inArray(storeOrders.status, [...OPEN_STATUSES])),
    ])

    // Lines are fetched in one query for the whole page rather than per order.
    const numbers = rows.map((row) => row.orderNumber)
    const lines = numbers.length > 0
      ? await db.select().from(storeOrderItems).where(inArray(storeOrderItems.orderNumber, numbers)).orderBy(storeOrderItems.id)
      : []

    const grouped = new Map<string, typeof lines>()
    for (const line of lines) {
      const bucket = grouped.get(line.orderNumber)
      if (bucket) bucket.push(line)
      else grouped.set(line.orderNumber, [line])
    }

    return NextResponse.json({
      rows: rows.map((row) => ({
        ...row,
        lines: (grouped.get(row.orderNumber) ?? []).map((line) => ({
          id: line.id,
          itemCode: line.itemCode,
          itemName: line.itemName,
          category: line.category,
                   unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
      })),
      total: Number(countRow?.count ?? 0),
      openCount: Number(openRow?.open ?? 0),
      unseenCount: Number(openRow?.unseen ?? 0),
      lastSeen: unseen,
    })
  } catch (error) {
    console.error('[v0] Failed to load orders:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the online orders.' }, { status: 500 })
  }
}

/** Advances an order through its lifecycle, or marks it paid. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json()
    const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : ''
    if (!orderNumber) return NextResponse.json({ error: 'An order number is required.' }, { status: 400 })

    const patch: Partial<{ status: string; paymentStatus: string; updatedAt: Date }> = { updatedAt: new Date() }
    if (typeof body.status === 'string') {
      if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
        return NextResponse.json({ error: 'That is not a valid order status.' }, { status: 400 })
      }
      patch.status = body.status
    }
    if (typeof body.paymentStatus === 'string') {
      if (body.paymentStatus !== 'PAID' && body.paymentStatus !== 'PENDING') {
        return NextResponse.json({ error: 'Payment status must be PAID or PENDING.' }, { status: 400 })
      }
      patch.paymentStatus = body.paymentStatus
    }
    if (!patch.status && !patch.paymentStatus) {
      return NextResponse.json({ error: 'Nothing to update on this order.' }, { status: 400 })
    }

    // Acknowledging an order stamps acked_at once. Any device that has shown
    // the alert will then stop counting it as unseen.
    if (patch.status && !OPEN_STATUSES.includes(patch.status as (typeof OPEN_STATUSES)[number])) {
      patch.paymentStatus = patch.paymentStatus ?? 'PENDING'
    }

    const [updated] = await db.update(storeOrders).set(patch).where(eq(storeOrders.orderNumber, orderNumber)).returning()
    if (!updated) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

    // The customer's tracking page updates from this event too.
    publish({
      event: 'order-updated',
      data: {
        orderNumber,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        label: ORDER_STATUS_LABELS[updated.status] ?? updated.status,
        createdAt: new Date().toISOString(),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[v0] Failed to update order:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 })
  }
}

/**
 * Marks every open order as seen by this device, which clears the bell badge.
 * Called when the admin opens the notification panel.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json().catch(() => ({}))
    // An admin can also take an order over the phone. Same validation and same
    // dispatch as the public storefront, so it reaches every desk identically.
    if (body?.action === 'ack') {
      const acknowledged = await db
        .update(storeOrders)
        .set({ ackedAt: new Date() })
        .where(sql`${storeOrders.ackedAt} is null`)
        .returning({ orderNumber: storeOrders.orderNumber })
      return NextResponse.json({ acknowledged: acknowledged.length })
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    console.error('[v0] Failed to acknowledge orders:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not update the notification state.' }, { status: 500 })
  }
}

/** Creates an order from the billing desk (a customer ordering by phone). */
export async function PUT(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: PlaceOrderInput
  try {
    body = (await request.json()) as PlaceOrderInput
  } catch {
    return NextResponse.json({ error: 'The order could not be read.' }, { status: 400 })
  }
  return placeOrderResponse(body)
}
