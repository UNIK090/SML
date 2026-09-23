import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inventoryItemImages, inventoryItems } from '@/lib/db/schema'

const MAX_IMAGE_BYTES = 700 * 1024

function validId(value: string | null) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Confirm the bytes are a browser-displayable image, not a renamed file. */
function detectImage(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  return null
}

/**
 * List all images for an item.
 *
 * Order of the response array is the intended display order:
 *  - index 0  -> the legacy primary image (from inventory_items.image_* columns)
 *  - index 1+ -> gallery rows from inventory_item_images in display_order ASC.
 *
 * Clients can use this list to render an upload manager or to know the IDs for
 * delete / reorder calls.
 */
async function listImages(itemId: number) {
  const [[item], galleryMaybe] = await Promise.all([
    db
      .select({
        mime: inventoryItems.imageMimeType,
        size: inventoryItems.imageByteSize,
        updatedAt: inventoryItems.updatedAt,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId)),
    (async () => {
      try {
        return await db
          .select({
            id: inventoryItemImages.id,
            displayOrder: inventoryItemImages.displayOrder,
            mimeType: inventoryItemImages.mimeType,
            byteSize: inventoryItemImages.byteSize,
            createdAt: inventoryItemImages.createdAt,
          })
          .from(inventoryItemImages)
          .where(eq(inventoryItemImages.itemId, itemId))
          .orderBy(asc(inventoryItemImages.displayOrder), asc(inventoryItemImages.id))
      } catch {
        return [] as Array<{ id: number; displayOrder: number; mimeType: string; byteSize: number; createdAt: Date }>
      }
    })(),
  ])

  if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })

  const images = []
  if (item.mime && item.size) {
    images.push({
      id: 'primary' as const,
      displayOrder: 0,
      byteSize: Number(item.size),
      mimeType: item.mime,
      version: item.updatedAt.toISOString(),
    })
  }
  for (const row of galleryMaybe) {
    images.push({
      id: row.id,
      displayOrder: row.displayOrder + 1,
      byteSize: row.byteSize,
      mimeType: row.mimeType,
      version: row.createdAt.toISOString(),
    })
  }

  return NextResponse.json({ images })
}

/**
 * Serve the bytes for one image of an item, selected by `index` query parameter.
 *
 * `index=0` serves the legacy primary image (inventory_items.image_*).
 * `index=N` serves gallery row N (after display_order ASC).
 * If the index is out of range, returns 404.
 */
async function serveImage(itemId: number, index: number) {
  if (index === 0) {
    const [item] = await db
      .select({ data: inventoryItems.imageData, mime: inventoryItems.imageMimeType })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId))
    if (!item?.data || !item.mime) return new NextResponse(null, { status: 404 })
    const bytes = Buffer.from(item.data, 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': item.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, max-age=300' },
    })
  }

  let rows: Array<{ id: number; data: string; mime: string }> = []
  try {
    rows = await db
      .select({ id: inventoryItemImages.id, data: inventoryItemImages.data, mime: inventoryItemImages.mimeType })
      .from(inventoryItemImages)
      .where(eq(inventoryItemImages.itemId, itemId))
      .orderBy(asc(inventoryItemImages.displayOrder), asc(inventoryItemImages.id))
  } catch {
    // Migration not applied — there are no gallery frames available.
    rows = []
  }
  const row = rows[index - 1]
  if (!row) return new NextResponse(null, { status: 404 })
  const bytes = Buffer.from(row.data, 'base64')
  return new NextResponse(new Uint8Array(bytes), {
    headers: { 'Content-Type': row.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, max-age=300' },
  })
}

async function appendGalleryImage(itemId: number, request: Request): Promise<NextResponse> {
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 })
  const file = (await request.formData()).get('image')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'That image is empty.' }, { status: 400 })
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `That image is ${Math.round(file.size / 1024)} KB. Please use one under ${MAX_IMAGE_BYTES / 1024} KB.` }, { status: 413 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = detectImage(bytes)
  if (!mime) return NextResponse.json({ error: 'Use a PNG, JPEG, GIF, or WebP image.' }, { status: 415 })

  const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, itemId))
  if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })

  // Guard against the missing migration table so the server never throws 500.
  try {
    await db.select({ id: inventoryItemImages.id }).from(inventoryItemImages).limit(0)
  } catch {
    return NextResponse.json({
      error:
        'Gallery upload not available yet. The multi-image migration has not been applied to your database. Run supabase/migrations/0002_item_image_gallery.sql or upload as the first (hero) image via setPrimary.',
    }, { status: 422 })
  }

  // Determine a displayOrder that places the new image at the end of the gallery.
  const existing = await db
    .select({ displayOrder: inventoryItemImages.displayOrder })
    .from(inventoryItemImages)
    .where(eq(inventoryItemImages.itemId, itemId))
    .orderBy(asc(inventoryItemImages.displayOrder))
  const nextOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.displayOrder)) + 1 : 0

  const data = Buffer.from(bytes).toString('base64')
  const [inserted] = await db
    .insert(inventoryItemImages)
    .values({ itemId, displayOrder: nextOrder, mimeType: mime, data, byteSize: bytes.length })
    .returning({ id: inventoryItemImages.id, createdAt: inventoryItemImages.createdAt })

  await db.update(inventoryItems).set({ updatedAt: new Date() }).where(eq(inventoryItems.id, itemId))

  return NextResponse.json({
    success: true,
    image: { id: inserted.id, displayOrder: nextOrder + 1, byteSize: bytes.length, mimeType: mime, version: inserted.createdAt.toISOString() },
  })
}

async function galleryTableExists(): Promise<boolean> {
  try {
    await db.select({ id: inventoryItemImages.id }).from(inventoryItemImages).limit(0)
    return true
  } catch {
    return false
  }
}

/**
 * Remove a single image.
 *
 * `id=primary` clears the legacy primary image columns on inventory_items.
 * Numeric `id=<galleryId>` deletes that gallery row.
 */
async function deleteOneImage(itemId: number, imageId: string) {
  if (imageId === 'primary') {
    const [item] = await db
      .update(inventoryItems)
      .set({ imageData: null, imageMimeType: null, imageByteSize: null, updatedAt: new Date() })
      .where(eq(inventoryItems.id, itemId))
      .returning({ id: inventoryItems.id })
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  }
  const galleryId = Number(imageId)
  if (!Number.isInteger(galleryId) || galleryId <= 0) return NextResponse.json({ error: 'Invalid image id.' }, { status: 400 })
  if (!(await galleryTableExists())) {
    return NextResponse.json(
      { error: 'Multi-image migration has not been applied yet; only the primary image can be removed.' },
      { status: 422 },
    )
  }
  const [deleted] = await db
    .delete(inventoryItemImages)
    .where(eq(inventoryItemImages.id, galleryId))
    .returning({ id: inventoryItemImages.id })
  if (!deleted) return NextResponse.json({ error: 'Image not found.' }, { status: 404 })
  await db.update(inventoryItems).set({ updatedAt: new Date() }).where(eq(inventoryItems.id, itemId))
  return NextResponse.json({ success: true })
}

/**
 * Reorder the gallery by providing a new ordering of ids.
 *
 * Body: { order: [galleryImageId, galleryImageId, ...] }
 *
 * The legacy primary image always stays at index 0. The `order` array should
 * contain only gallery image ids (numbers), not the "primary" string.
 */
async function reorderImages(itemId: number, body: Record<string, unknown>) {
  const order = body.order
  if (!Array.isArray(order) || !order.every((n) => Number.isInteger(n) && n > 0)) {
    return NextResponse.json({ error: 'Supply an array of numeric image ids in the new order.' }, { status: 400 })
  }
  if (!(await galleryTableExists())) {
    return NextResponse.json(
      { error: 'Multi-image migration has not been applied yet; reordering is not available.' },
      { status: 422 },
    )
  }
  // Verify all ids belong to this item.
  const rows = await db
    .select({ id: inventoryItemImages.id })
    .from(inventoryItemImages)
    .where(eq(inventoryItemImages.itemId, itemId))
  const existingIds = new Set(rows.map((r) => r.id))
  for (const id of order) {
    if (!existingIds.has(id)) return NextResponse.json({ error: `Image id ${id} does not belong to this item.` }, { status: 400 })
  }
  if (order.length !== existingIds.size) {
    return NextResponse.json({ error: `Order list must contain all ${existingIds.size} gallery image ids.` }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < order.length; i++) {
      await tx.update(inventoryItemImages).set({ displayOrder: i }).where(eq(inventoryItemImages.id, order[i]))
    }
    await tx.update(inventoryItems).set({ updatedAt: new Date() }).where(eq(inventoryItems.id, itemId))
  })

  return NextResponse.json({ success: true })
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const url = new URL(request.url)
    const id = validId(url.searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })

    const action = url.searchParams.get('action') ?? 'bytes'
    if (action === 'list') return listImages(id)

    // Default: serve bytes. Optional ?index=N selects which image.
    const index = Number(url.searchParams.get('index') ?? '0')
    if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: 'Invalid image index.' }, { status: 400 })
    return serveImage(id, index)
  } catch (error) {
    console.error('[items/image] Failed to load product image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the product image.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Save the catalogue item before uploading an image.' }, { status: 400 })

    // For backward compat: if `setPrimary=1` is in the query, behave like the
    // original endpoint and overwrite the legacy primary image.
    const setPrimary = new URL(request.url).searchParams.get('setPrimary') === '1'
    if (setPrimary) return uploadLegacyPrimary(id, request)

    return appendGalleryImage(id, request)
  } catch (error) {
    console.error('[items/image] Failed to save product image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not save the product image.' }, { status: 500 })
  }
}

async function uploadLegacyPrimary(itemId: number, request: Request) {
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 })
  const file = (await request.formData()).get('image')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'That image is empty.' }, { status: 400 })
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `That image is ${Math.round(file.size / 1024)} KB. Please use one under ${MAX_IMAGE_BYTES / 1024} KB.` }, { status: 413 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = detectImage(bytes)
  if (!mime) return NextResponse.json({ error: 'Use a PNG, JPEG, GIF, or WebP image.' }, { status: 415 })
  const [item] = await db
    .update(inventoryItems)
    .set({ imageData: Buffer.from(bytes).toString('base64'), imageMimeType: mime, imageByteSize: bytes.length, updatedAt: new Date() })
    .where(eq(inventoryItems.id, itemId))
    .returning({ id: inventoryItems.id, updatedAt: inventoryItems.updatedAt })
  if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })
  return NextResponse.json({ success: true, image: true, imageVersion: item.updatedAt.toISOString() })
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const url = new URL(request.url)
    const id = validId(url.searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })

    const imageId = url.searchParams.get('imageId') ?? 'primary'
    return deleteOneImage(id, imageId)
  } catch (error) {
    console.error('[items/image] Failed to remove product image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not remove the product image.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })
    const body = (await request.json()) as Record<string, unknown>
    return reorderImages(id, body)
  } catch (error) {
    console.error('[items/image] Failed to reorder images:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not reorder the images.' }, { status: 500 })
  }
}
