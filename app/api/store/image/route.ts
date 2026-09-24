import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItemImages, inventoryItems } from '@/lib/db/schema'
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
//
// A product may have several photos. `n` selects which one:
//   n omitted or 0  → the item's primary photo (inventory_items.image_*)
//   n = 1, 2, 3 …   → the gallery shot at that position, in display order
//
// Numbering the gallery from 1 keeps "no n" and "n=0" meaning the same thing —
// the cover photo — which is what every existing caller already assumes.

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = Number(url.searchParams.get('code') ?? url.searchParams.get('id'))
    if (!Number.isInteger(code) || code <= 0) return new NextResponse(null, { status: 400 })

    const position = Math.max(0, Math.trunc(Number(url.searchParams.get('n') ?? '0')) || 0)

    // Item + publish gate — always verified first so unpublished rows never leak.
    const [item] = await db
      .select({
        id: inventoryItems.id,
        published: inventoryItems.published,
        data: inventoryItems.imageData,
        mime: inventoryItems.imageMimeType,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.code, code))

    if (!item?.published) return new NextResponse(null, { status: 404 })

    // The cover photo, straight from the catalogue row.
    let bytes: Buffer | null = null
    let mime: string | null = null

    if (position === 0) {
      if (!item.data || !item.mime) return new NextResponse(null, { status: 404 })
      bytes = Buffer.from(item.data, 'base64')
      mime = item.mime
    } else {
      // The position is 1-based here, so the nth gallery row is offset by one.
      const rows = await db
        .select({ data: inventoryItemImages.data, mime: inventoryItemImages.mimeType })
        .from(inventoryItemImages)
        .where(eq(inventoryItemImages.itemId, item.id))
        .orderBy(asc(inventoryItemImages.displayOrder), asc(inventoryItemImages.id))

      const row = rows[position - 1]
      if (!row) return new NextResponse(null, { status: 404 })
      bytes = Buffer.from(row.data, 'base64')
      mime = row.mime
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': mime,
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
