import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { invoiceBillPhotos } from '@/lib/db/schema'

// Private bytes for the single photo of every item on a bill, taken at the
// counter. Like the per-line customer photos, this is an admin reference and is
// never called from the customer-facing receipt page.
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) return new NextResponse(null, { status: 400 })

    const [photo] = await db
      .select({ data: invoiceBillPhotos.data, mime: invoiceBillPhotos.mimeType })
      .from(invoiceBillPhotos)
      .where(eq(invoiceBillPhotos.id, id))
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
    console.error('[invoice/bill-photo] Failed to load bill photo:', error)
    if (isConnectionError(error)) return new NextResponse(null, { status: 503 })
    return new NextResponse(null, { status: 500 })
  }
}
