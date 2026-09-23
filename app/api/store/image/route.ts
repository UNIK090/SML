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
// Query parameter `index=0` serves the legacy primary image; higher indexes
// serve gallery images in display_order ASC.

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const id = Number(url.searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 400 })
    const index = Number(url.searchParams.get('index') ?? '0')
    if (!Number.isInteger(index) || index < 0) return new NextResponse(null, { status: 400 })

    // Item + publish gate — always verified first so unpublished rows never leak.
    const [item] = await db
      .select({ published: inventoryItems.published })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
    if (!item?.published) return new NextResponse(null, { status: 404 })

    if (index === 0) {
      const [primary] = await db
        .select({ data: inventoryItems.imageData, mime: inventoryItems.imageMimeType })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, id))
      if (!primary?.data || !primary.mime) return new NextResponse(null, { status: 404 })
      const bytes = Buffer.from(primary.data, 'base64')
      return new NextResponse(new Uint8Array(bytes), {
        headers: { 'Content-Type': primary.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'public, max-age=31536000, immutable' },
      })
    }

    let gallery: Array<{ id: number; data: string; mime: string }> = []
    try {
      gallery = await db
        .select({ id: inventoryItemImages.id, data: inventoryItemImages.data, mime: inventoryItemImages.mimeType })
        .from(inventoryItemImages)
        .where(eq(inventoryItemImages.itemId, id))
        .orderBy(asc(inventoryItemImages.displayOrder), asc(inventoryItemImages.id))
    } catch {
      // Migration not applied yet — there are no gallery frames.
      gallery = []
    }
    const row = gallery[index - 1]
    if (!row) return new NextResponse(null, { status: 404 })
    const bytes = Buffer.from(row.data, 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': row.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
  } catch (error) {
    console.error('[store/image] Failed to load product image:', error)
    if (isConnectionError(error)) return new NextResponse(null, { status: 503 })
    return new NextResponse(null, { status: 500 })
  }
}
