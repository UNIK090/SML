import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inventoryItemImages, inventoryItems } from '@/lib/db/schema'
import { nextDisplayOrder, prepareImage } from '@/lib/item-images'

function validId(value: string | null) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })

    const [item] = await db
      .select({ data: inventoryItems.imageData, mime: inventoryItems.imageMimeType })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
    if (!item?.data || !item.mime) return new NextResponse(null, { status: 404 })
    const bytes = Buffer.from(item.data, 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': item.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, max-age=300' },
    })
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

    if (!request.headers.get('content-type')?.includes('multipart/form-data')) return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 })
    const file = (await request.formData()).get('image')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 })

    const prepared = await prepareImage(file)
    if ('error' in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 })

    const [existing] = await db
      .select({ data: inventoryItems.imageData, mime: inventoryItems.imageMimeType, byteSize: inventoryItems.imageByteSize })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
    if (!existing) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })

    // Replacing the cover photo must not destroy the shot a customer was
    // already looking at, so the outgoing primary is moved to the end of the
    // gallery before the new photo takes its place.
    if (existing.data && existing.mime) {
      const gallery = await db
        .select({ displayOrder: inventoryItemImages.displayOrder })
        .from(inventoryItemImages)
        .where(eq(inventoryItemImages.itemId, id))
      await db.insert(inventoryItemImages).values({
        itemId: id,
        displayOrder: nextDisplayOrder(gallery.map((row) => row.displayOrder)),
        mimeType: existing.mime,
        data: existing.data,
        byteSize: existing.byteSize ?? 0,
      })
    }

    const [item] = await db
      .update(inventoryItems)
      .set({ imageData: prepared.image.base64, imageMimeType: prepared.image.mime, imageByteSize: prepared.image.byteSize, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning({ id: inventoryItems.id, updatedAt: inventoryItems.updatedAt })
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })
    return NextResponse.json({ success: true, image: true, imageVersion: item.updatedAt.toISOString() })
  } catch (error) {
    console.error('[items/image] Failed to save product image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not save the product image.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid catalogue item.' }, { status: 400 })

    // Removing the product photo removes the whole gallery with it. Leaving
    // extra shots behind would show a customer a gallery on a page whose main
    // photo is gone, which reads as a broken listing.
    const [item] = await db
      .update(inventoryItems)
      .set({ imageData: null, imageMimeType: null, imageByteSize: null, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning({ id: inventoryItems.id })
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })

    await db.delete(inventoryItemImages).where(eq(inventoryItemImages.itemId, id))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[items/image] Failed to remove product image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not remove the product image.' }, { status: 500 })
  }
}
