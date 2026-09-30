import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { invoiceItemPhotos } from '@/lib/db/schema'

// Private bytes for a reference photo a customer shared while an item was
// billed. Public receipt pages never call this endpoint.
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 400 })

    const [photo] = await db
      .select({ data: invoiceItemPhotos.data, mime: invoiceItemPhotos.mimeType })
      .from(invoiceItemPhotos)
      .where(eq(invoiceItemPhotos.id, id))
    if (!photo?.data || !photo.mime) return new NextResponse(null, { status: 404 })

    const bytes = Buffer.from(photo.data, 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': photo.mime,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('[invoice/photo] Failed to load customer item photo:', error)
    if (isConnectionError(error)) return new NextResponse(null, { status: 503 })
    return new NextResponse(null, { status: 500 })
  }
}
