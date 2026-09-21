import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItems } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'

// Public product image for the storefront.
//
// The admin image endpoint (app/api/items/image) is session-protected, so the
// public site needs its own route. To make sure it cannot become a way to read
// the private catalogue, it serves bytes only when BOTH are true:
//   1. the catalogue row exists,
//   2. that row is published.
// The response is cached aggressively because the bytes never change for a
// given catalogue item id + `v` (the row's updated-at).

export async function GET(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 400 })

    const [item] = await db
      .select({
        data: inventoryItems.imageData,
        mime: inventoryItems.imageMimeType,
        published: inventoryItems.published,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))

    if (!item?.published || !item.data || !item.mime) return new NextResponse(null, { status: 404 })

    const bytes = Buffer.from(item.data, 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': item.mime,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[store/image] Failed to load product image:', error)
    if (isConnectionError(error)) return new NextResponse(null, { status: 503 })
    return new NextResponse(null, { status: 500 })
  }
}
