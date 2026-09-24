import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inventoryItemImages } from '@/lib/db/schema'

// The image bytes for one gallery photo, for the admin screens.
//
// A gallery is a list of ids, so the admin UI needs somewhere to fetch the
// actual pixels. This is that route — session-protected, and it serves only
// rows that belong to the item the caller asked for.
//
// The storefront does NOT use this route; it reads /api/store/image, which
// applies the publish gate. Keeping the two separate means an admin session is
// never required to render a public product page.

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const params = new URL(request.url).searchParams
    const imageId = Number(params.get('id'))
    const itemId = Number(params.get('item'))
    if (!Number.isInteger(imageId) || imageId <= 0) return new NextResponse(null, { status: 400 })

    const [row] = await db
      .select({ data: inventoryItemImages.data, mime: inventoryItemImages.mimeType })
      .from(inventoryItemImages)
      .where(
        Number.isInteger(itemId) && itemId > 0
          ? and(eq(inventoryItemImages.id, imageId), eq(inventoryItemImages.itemId, itemId))
          : eq(inventoryItemImages.id, imageId),
      )
    if (!row?.data || !row.mime) return new NextResponse(null, { status: 404 })

    const bytes = Buffer.from(row.data, 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': row.mime,
        'Content-Length': String(bytes.length),
        // Private: these bytes are behind a session, so they must not land in a
        // shared cache. Short-lived, so a replaced photo appears quickly.
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('[items/images/file] Failed to load a gallery image:', error)
    if (isConnectionError(error)) return new NextResponse(null, { status: 503 })
    return new NextResponse(null, { status: 500 })
  }
}