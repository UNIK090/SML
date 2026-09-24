import { NextResponse } from 'next/server'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inventoryItemImages, inventoryItems } from '@/lib/db/schema'
import { MAX_GALLERY_IMAGES, prepareImage } from '@/lib/item-images'

// The extra photos attached to one catalogue item.
//
// Separate from /api/items/image (the single primary photo) because the two
// have different shapes: the primary is a fixed slot, the gallery is an ordered
// list the shop can add to, reorder and prune. Both are admin-only — the public
// site never reads this route; it goes through /api/store/image.
//
// Bytes are never returned here. A grid of base64 images would be megabytes of
// JSON, so this route returns ids and order only, and the browser fetches the
// actual pixels from the image endpoint.

function validId(value: string | null) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** The ids of the gallery rows for an item, ascending by position. */
async function galleryIds(itemId: number) {
  const rows = await db
    .select({ id: inventoryItemImages.id })
    .from(inventoryItemImages)
    .where(eq(inventoryItemImages.itemId, itemId))
    .orderBy(asc(inventoryItemImages.displayOrder), asc(inventoryItemImages.id))
  return rows.map((row) => row.id)
}

/** GET ?id=<item db id> — the ordered gallery for one item. */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })

    const [item] = await db
      .select({ id: inventoryItems.id, updatedAt: inventoryItems.updatedAt })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })

    const rows = await db
      .select({ id: inventoryItemImages.id, displayOrder: inventoryItemImages.displayOrder, byteSize: inventoryItemImages.byteSize })
      .from(inventoryItemImages)
      .where(eq(inventoryItemImages.itemId, id))
      .orderBy(asc(inventoryItemImages.displayOrder), asc(inventoryItemImages.id))

    // `version` lets the browser bust its image cache after any change, the
    // same trick the primary image uses with the item's updatedAt.
    return NextResponse.json({
      images: rows.map((row) => ({ id: row.id, byteSize: row.byteSize })),
      version: item.updatedAt.toISOString(),
      limit: MAX_GALLERY_IMAGES,
    })
  } catch (error) {
    console.error('[items/images] Failed to load the gallery:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the product gallery.' }, { status: 500 })
  }
}

/** POST ?id=<item db id> — append one image to the gallery. */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Save the catalogue item before adding photos.' }, { status: 400 })

    const [item] = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })

    const existing = await galleryIds(id)
    if (existing.length >= MAX_GALLERY_IMAGES) {
      return NextResponse.json(
        { error: `This item already has the maximum of ${MAX_GALLERY_IMAGES} extra photos. Remove one to add another.` },
        { status: 409 },
      )
    }

    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 })
    }
    const file = (await request.formData()).get('image')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 })

    const prepared = await prepareImage(file)
    if ('error' in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 })

    // New shots go to the end of the gallery, so the shop's chosen order is
    // never disturbed by a later upload.
    const [row] = await db
      .insert(inventoryItemImages)
      .values({
        itemId: id,
        displayOrder: existing.length,
        mimeType: prepared.image.mime,
        data: prepared.image.base64,
        byteSize: prepared.image.byteSize,
      })
      .returning({ id: inventoryItemImages.id })

    // Touch the item so the storefront's cache-buster changes and customers
    // see the new photo without a hard refresh.
    const [stamped] = await db
      .update(inventoryItems)
      .set({ updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning({ updatedAt: inventoryItems.updatedAt })

    return NextResponse.json({ success: true, id: row.id, version: stamped.updatedAt.toISOString() }, { status: 201 })
  } catch (error) {
    console.error('[items/images] Failed to add a gallery image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not add the photo.' }, { status: 500 })
  }
}

/**
 * PATCH — reorder the gallery.
 *
 * Body: { id: <item db id>, order: [<image id>, …] }
 *
 * The whole order is sent rather than a pair of swaps, because the browser
 * already knows the list it is showing and sending it whole makes the result
 * unambiguous: whatever the shopkeeper sees after a drag is what gets stored.
 * Ids belonging to another item are ignored, so a tampered payload cannot
 * reshuffle a different item's gallery.
 */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as { id?: number; order?: unknown }
    const id = validId(String(body.id ?? ''))
    if (!id) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })
    if (!Array.isArray(body.order)) return NextResponse.json({ error: 'Send the new photo order.' }, { status: 400 })

    const owned = new Set(await galleryIds(id))
    const wanted = body.order
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && owned.has(value))

    if (wanted.length !== owned.size) {
      return NextResponse.json({ error: 'That order does not match the photos on this item.' }, { status: 400 })
    }

    // Rewrite every row's position. Doing it in one statement keeps the gallery
    // from ever being briefly half-ordered if two requests overlap.
    if (wanted.length > 0) {
      const values = sql.join(
        wanted.map((imageId, position) => sql`(${imageId}::int, ${position}::int)`),
        sql`, `,
      )
      await db.execute(sql`
        UPDATE ${inventoryItemImages} AS g
        SET display_order = v.position
        FROM (VALUES ${values}) AS v(image_id, position)
        WHERE g.id = v.image_id AND g.item_id = ${id}
      `)
    }

    const [stamped] = await db
      .update(inventoryItems)
      .set({ updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning({ updatedAt: inventoryItems.updatedAt })

    return NextResponse.json({ success: true, version: stamped.updatedAt.toISOString() })
  } catch (error) {
    console.error('[items/images] Failed to reorder the gallery:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not save the photo order.' }, { status: 500 })
  }
}

/** DELETE ?id=<image id> — remove one gallery image. */
export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid photo.' }, { status: 400 })

    const [row] = await db
      .delete(inventoryItemImages)
      .where(eq(inventoryItemImages.id, id))
      .returning({ itemId: inventoryItemImages.itemId })
    if (!row) return NextResponse.json({ error: 'That photo is already gone.' }, { status: 404 })

    // Close the gap left in the order so positions stay 0..n-1 and the next
    // upload does not land past the end.
    const remaining = await galleryIds(row.itemId)
    if (remaining.length > 0) {
      const values = sql.join(
        remaining.map((imageId, position) => sql`(${imageId}::int, ${position}::int)`),
        sql`, `,
      )
      await db.execute(sql`
        UPDATE ${inventoryItemImages} AS g
        SET display_order = v.position
        FROM (VALUES ${values}) AS v(image_id, position)
        WHERE g.id = v.image_id AND g.item_id = ${row.itemId}
      `)
    }

    const [stamped] = await db
      .update(inventoryItems)
      .set({ updatedAt: new Date() })
      .where(eq(inventoryItems.id, row.itemId))
      .returning({ updatedAt: inventoryItems.updatedAt })

    return NextResponse.json({ success: true, version: stamped.updatedAt.toISOString() })
  } catch (error) {
    console.error('[items/images] Failed to remove a gallery image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not remove the photo.' }, { status: 500 })
  }
}