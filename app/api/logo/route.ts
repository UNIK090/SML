import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { shopLogo } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'

const LOGO_ID = 1
const MAX_BYTES = 400 * 1024 // 400 KB

type ImageKind = { mime: string; extension: string }

/**
 * Identifies an image from its magic bytes rather than trusting the browser's
 * declared type or the file extension, either of which can be spoofed.
 * Only formats every browser can display are accepted.
 */
function detectImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime: 'image/png', extension: 'png' }
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' }
  }
  // GIF: "GIF87a" or "GIF89a"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return { mime: 'image/gif', extension: 'gif' }
  }
  // WEBP: "RIFF" .... "WEBP"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', extension: 'webp' }
  }
  return null
}

/** Serves the stored logo, or 404 when none has been uploaded. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const [row] = await db.select().from(shopLogo).where(eq(shopLogo.id, LOGO_ID))
    if (!row || !row.data || !row.mimeType) return NextResponse.json({ exists: false })

    const buffer = Buffer.from(row.data, 'base64')
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': row.mimeType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    console.error('[v0] Failed to load logo:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the logo.' }, { status: 500 })
  }
}

/** Replaces the logo. Accepts multipart/form-data with a single `logo` file. */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Upload the logo as a file.' }, { status: 400 })
    }

    const form = await request.formData()
    const file = form.get('logo')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a logo image to upload.' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `That image is ${Math.round(file.size / 1024)} KB. Please use one under ${MAX_BYTES / 1024} KB.` },
        { status: 413 },
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = detectImage(bytes)
    if (!kind) {
      return NextResponse.json({ error: 'That file is not a PNG, JPEG, GIF, or WebP image.' }, { status: 415 })
    }

    const data = Buffer.from(bytes).toString('base64')
    await db
      .insert(shopLogo)
      .values({ id: LOGO_ID, mimeType: kind.mime, data, byteSize: bytes.length })
      .onConflictDoUpdate({
        target: shopLogo.id,
        set: { mimeType: kind.mime, data, byteSize: bytes.length, updatedAt: new Date() },
      })

    return NextResponse.json({ success: true, mimeType: kind.mime, byteSize: bytes.length })
  } catch (error) {
    console.error('[v0] Failed to save logo:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the logo.' }, { status: 500 })
  }
}

/** Removes the logo. */
export async function DELETE() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    await db.delete(shopLogo).where(eq(shopLogo.id, LOGO_ID))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Failed to remove logo:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not remove the logo.' }, { status: 500 })
  }
}
