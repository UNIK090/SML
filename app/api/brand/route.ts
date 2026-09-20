import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { shopLogo } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'

const BRAND_ID = 1
const MAX_BYTES = 400 * 1024
const KINDS = ['logo', 'favicon', 'avatar'] as const
type BrandKind = (typeof KINDS)[number]
type ImageKind = { mime: string }

function kindFrom(value: string | null): BrandKind | null {
  return value && KINDS.includes(value as BrandKind) ? (value as BrandKind) : null
}

/** Validate content from its magic bytes, not an editable file extension. */
function detectImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { mime: 'image/png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg' }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return { mime: 'image/gif' }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mime: 'image/webp' }
  return null
}

function info(row: typeof shopLogo.$inferSelect | undefined) {
  return {
    logo: Boolean(row?.data && row.mimeType),
    favicon: Boolean(row?.faviconData && row.faviconMimeType),
    avatar: Boolean(row?.avatarData && row.avatarMimeType),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  }
}

function asset(row: typeof shopLogo.$inferSelect, kind: BrandKind) {
  if (kind === 'favicon') return row.faviconData && row.faviconMimeType ? { data: row.faviconData, mime: row.faviconMimeType } : null
  if (kind === 'avatar') return row.avatarData && row.avatarMimeType ? { data: row.avatarData, mime: row.avatarMimeType } : null
  return row.data && row.mimeType ? { data: row.data, mime: row.mimeType } : null
}

function valuesFor(kind: BrandKind, value: { data: string | null; mime: string | null; byteSize: number | null }) {
  if (kind === 'favicon') return { faviconData: value.data, faviconMimeType: value.mime, faviconByteSize: value.byteSize }
  if (kind === 'avatar') return { avatarData: value.data, avatarMimeType: value.mime, avatarByteSize: value.byteSize }
  return { data: value.data, mimeType: value.mime, byteSize: value.byteSize }
}

function send(asset: { data: string; mime: string }) {
  const bytes = Buffer.from(asset.data, 'base64')
  return new NextResponse(new Uint8Array(bytes), {
    headers: { 'Content-Type': asset.mime, 'Content-Length': String(bytes.length), 'Cache-Control': 'public, max-age=60' },
  })
}

function defaultFavicon() {
  return new NextResponse(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#172554"/><path fill="#e7b850" d="M32 10 39 24l15 2-11 11 3 15-14-7-14 7 3-15L10 26l15-2z"/></svg>',
    { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' } },
  )
}

/** Public artwork endpoint; the compact asset inventory remains admin-only. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const wantsInfo = url.searchParams.get('info') === '1'
  const kind = kindFrom(url.searchParams.get('kind') ?? 'logo')
  if (!kind) return NextResponse.json({ error: 'Unknown brand asset.' }, { status: 400 })
  if (wantsInfo) {
    const denied = await requireAdmin()
    if (denied) return denied
  }

  try {
    const [row] = await db.select().from(shopLogo).where(eq(shopLogo.id, BRAND_ID))
    if (wantsInfo) return NextResponse.json(info(row))
    if (row) {
      const found = asset(row, kind)
      if (found) return send(found)
      // Until a dedicated browser icon is supplied, the logo is a good fallback.
      if (kind === 'favicon') {
        const logo = asset(row, 'logo')
        if (logo) return send(logo)
      }
    }
    return kind === 'favicon' ? defaultFavicon() : new NextResponse(null, { status: 404 })
  } catch (error) {
    console.error('[brand] Failed to load asset:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not load the brand image.' }, { status: 500 })
  }
}

/** Upload a specific branding image. */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const kind = kindFrom(new URL(request.url).searchParams.get('kind') ?? 'logo')
    if (!kind) return NextResponse.json({ error: 'Unknown brand asset.' }, { status: 400 })
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 })
    const file = (await request.formData()).get('image')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 })
    if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `That image is ${Math.round(file.size / 1024)} KB. Please use one under ${MAX_BYTES / 1024} KB.` }, { status: 413 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const detected = detectImage(bytes)
    if (!detected) return NextResponse.json({ error: 'Use a PNG, JPEG, GIF, or WebP image.' }, { status: 415 })

    const now = new Date()
    const update = valuesFor(kind, { data: Buffer.from(bytes).toString('base64'), mime: detected.mime, byteSize: bytes.length })
    const [saved] = await db
      .insert(shopLogo)
      .values({ id: BRAND_ID, ...update, updatedAt: now })
      .onConflictDoUpdate({ target: shopLogo.id, set: { ...update, updatedAt: now } })
      .returning()
    return NextResponse.json({ success: true, kind, assets: info(saved) })
  } catch (error) {
    console.error('[brand] Failed to save asset:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not save the brand image.' }, { status: 500 })
  }
}

/** Delete one branding image without touching the others. */
export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const kind = kindFrom(new URL(request.url).searchParams.get('kind') ?? 'logo')
    if (!kind) return NextResponse.json({ error: 'Unknown brand asset.' }, { status: 400 })
    const [saved] = await db
      .update(shopLogo)
      .set({ ...valuesFor(kind, { data: null, mime: null, byteSize: null }), updatedAt: new Date() })
      .where(eq(shopLogo.id, BRAND_ID))
      .returning()
    return NextResponse.json({ success: true, assets: info(saved) })
  } catch (error) {
    console.error('[brand] Failed to delete asset:', error)
    if (isConnectionError(error)) return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    return NextResponse.json({ error: 'Could not remove the brand image.' }, { status: 500 })
  }
}
