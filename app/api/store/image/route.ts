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
//
// The storefront identifies pieces by their public `code` (catalogue number),
// not the database serial id, so the endpoint accepts `code` by default.

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = Number(url.searchParams.get('code') ?? url.searchParams.get('id'))
    if (!Number.isInteger(code) || code <= 0) return new NextResponse(null, { status: 400 })

    // Item + publish gate — always verified first so unpublished rows never leak.
    const [item] = await db
      .select({
        published: inventoryItems.published,
        data: inventoryItems.imageData,
        mime: inventoryItems.imageMimeType,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.code, code))

    if (!item?.published) return new NextResponse(null, { status: 404 })
    if (!item.data || !item.mime) return new NextResponse(null, { status: 404 })

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
