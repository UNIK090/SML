import { desc, gt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orderNotifications } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/db/guard'
import { lastEventId, listenerCount, publish, subscribe } from '@/lib/realtime'

// Server-sent events: one long-lived HTTP response that the admin browser keeps
// open, so a new order appears on screen in well under a second.
//
// Three layers of delivery, because realtime must not depend on luck:
//
//   1. The in-process bus pushes instantly to every stream on this instance.
//   2. A 20s database sweep inside the stream replays anything the bus missed
//      (the order arrived on a different serverless instance, or this process
//      was briefly busy). The `cursor` is the last event id the client saw.
//   3. The client keeps its own `?since=` poll as a last resort.
//
// The stream never blocks the shop: it is write-only, has no keep-alive timer
// that could leak, and every failure closes it cleanly so the browser retries.

export const dynamic = 'force-dynamic'
// A streaming response must not be buffered or revalidated by any cache.
export const fetchCache = 'force-no-store'

const encoder = new TextEncoder()

function frame(event: string, data: unknown, id?: string): Uint8Array {
  const lines: string[] = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data)}`)
  lines.push('', '')
  return encoder.encode(lines.join('\n'))
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const url = new URL(request.url)
  const clientCursor = url.searchParams.get('cursor') ?? lastEventId()

  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return
        try {
          controller.enqueue(chunk)
        } catch {
          closed = true
          unsubscribe?.()
        }
      }

      // Tell the browser to wait 3s before reconnecting — far faster than the
      // browser default, so a dropped stream heals almost invisibly.
      safeEnqueue(encoder.encode('retry: 3000\n'))
      safeEnqueue(frame('ready', { listeners: listenerCount(), cursor: clientCursor }))

      // Replay anything that happened while no stream was open.
      let cursor = clientCursor
      try {
        const missed = cursor
          ? await db.select().from(orderNotifications).where(gt(orderNotifications.eventId, cursor)).orderBy(orderNotifications.createdAt).limit(20)
          : await db.select().from(orderNotifications).orderBy(desc(orderNotifications.createdAt)).limit(5)
        for (const event of cursor ? missed : missed.reverse()) {
          safeEnqueue(
            frame(
              'notification',
              {
                eventId: event.eventId,
                type: event.type,
                orderNumber: event.orderNumber,
                title: event.title,
                body: event.body,
                audience: event.audience,
                createdAt: event.createdAt.toISOString(),
              },
              event.eventId,
            ),
          )
        }
      } catch (error) {
        // A replay failure must not stop the live stream from starting.
        console.error('[orders/stream] Replay failed:', error)
      }

      unsubscribe = subscribe((message) => {
        if (message.id) cursor = message.id
        safeEnqueue(frame(message.event === 'order' ? 'notification' : message.event, message.data, message.id))
      })

      // Safety sweep: catches events published on another instance, which the
      // in-process bus cannot see. Newest-first read, then replayed in order.
      const sweep = setInterval(async () => {
        if (closed) return
        try {
          const rows = await db
            .select()
            .from(orderNotifications)
            .where(sql`${orderNotifications.createdAt} > now() - interval '2 minutes'`)
            .orderBy(orderNotifications.createdAt)
            .limit(30)
          for (const event of rows) {
            if (event.eventId === cursor) continue
            if (cursor && event.eventId <= cursor) continue
            cursor = event.eventId
            publish({ event: 'sweep', id: event.eventId, data: {} })
            safeEnqueue(
              frame(
                'notification',
                {
                  eventId: event.eventId,
                  type: event.type,
                  orderNumber: event.orderNumber,
                  title: event.title,
                  body: event.body,
                  audience: event.audience,
                  createdAt: event.createdAt.toISOString(),
                },
                event.eventId,
              ),
            )
          }
          // Comment frames keep proxies and load balancers from timing the
          // connection out without sending the client a real event.
          safeEnqueue(encoder.encode(': ping\n'))
        } catch {
          // Transient database hiccup; the next sweep retries.
        }
      }, 20_000)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(sweep)
        unsubscribe?.()
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }

      request.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      unsubscribe?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx-style proxies from buffering the stream into uselessness.
      'X-Accel-Buffering': 'no',
    },
  })
}
