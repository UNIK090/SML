import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { inventoryItems } from '@/lib/db/schema'

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
    if (file.size === 0) return NextResponse.json({ error: 'That image is empty.' }, { status: 400 })
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `That image is ${Math.round(file.size / 1024)} KB. Please use one under ${MAX_IMAGE_BYTES / 1024} KB.` }, { status: 413 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = detectImage(bytes)
    if (!mime) return NextResponse.json({ error: 'Use a PNG, JPEG, GIF, or WebP image.' }, { status: 415 })
    const [item] = await db
      .update(inventoryItems)
      .set({ imageData: Buffer.from(bytes).toString('base64'), imageMimeType: mime, imageByteSize: bytes.length, updatedAt: new Date() })
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

    const [item] = await db
      .update(inventoryItems)
      .set({ imageData: null, imageMimeType: null, imageByteSize: null, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning({ id: inventoryItems.id })
    if (!item) return NextResponse.json({ error: 'Catalogue item not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[items/image] Failed to remove product image:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not remove the product image.' }, { status: 500 })
  }
}
