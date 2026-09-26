import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { festivalOffers } from '@/lib/db/schema'
import { checkOfferBanner, prepareOfferBanner } from '@/lib/offer-banner'

// Banner artwork for a festival offer.
//
// The admin offers screen uploads here; the public landing page reads here. One
// route serves both, and the publish gate is what keeps them apart safely:
//
//   * a session-protected caller may read an offer's banner whatever its state,
//     so the shop can preview artwork before the festival starts
//   * everybody else may read it only when the offer is switched on and today
//     falls inside its dates
//
// That second rule is the one that matters. Without it, anyone holding an offer
// id could keep downloading the photo of a Diwali banner in March, and a
// scheduled offer would be visible on a URL before the shop announced it.
//
// The bytes are cached immutably because the URL carries `v` (the moment the
// photo was replaced), so an upload appears at once without giving up caching.

function validId(value: string | null) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(request: Request) {
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return new NextResponse(null, { status: 400 })

    // Reading is allowed for the admin (preview) or the public (live offer).
    // `requireAdmin` returns null when the caller IS an admin.
    const isAdmin = (await requireAdmin()) === null

    const [offer] = await db
      .select({
        data: festivalOffers.bannerData,
        mime: festivalOffers.bannerMimeType,
        active: festivalOffers.active,
        startsOn: festivalOffers.startsOn,
        endsOn: festivalOffers.endsOn,
      })
      .from(festivalOffers)
      .where(eq(festivalOffers.id, id))

    if (!offer?.data || !offer.mime) return new NextResponse(null, { status: 404 })

    if (!isAdmin) {
      // The public sees the artwork only while the offer is genuinely running.
      const state = checkOfferBanner(offer)
      if (state !== 'ACTIVE') return new NextResponse(null, { status: 404 })
    }

    const bytes = Buffer.from(offer.data, 'base64')
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': offer.mime,
        'Content-Length': String(bytes.length),
        // Immutable: the URL carries the version, so a replacement is a new URL.
        // A short private cache for the admin preview avoids that being stale.
        'Cache-Control': isAdmin ? 'private, max-age=300' : 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[offers/image] Failed to load offer banner:', error)
    if (isConnectionError(error)) return new NextResponse(null, { status: 503 })
    return new NextResponse(null, { status: 500 })
  }
}

/** Uploads or replaces the banner. Accepts multipart/form-data with `image`. */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Save the offer before uploading a banner.' }, { status: 400 })

    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Upload the banner as an image file.' }, { status: 400 })
    }

    const file = (await request.formData()).get('image')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a banner image to upload.' }, { status: 400 })

    const prepared = await prepareOfferBanner(file)
    if ('error' in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 })

    const now = new Date()
    const [offer] = await db
      .update(festivalOffers)
      .set({
        bannerMimeType: prepared.image.mime,
        bannerData: prepared.image.base64,
        bannerByteSize: prepared.image.byteSize,
        bannerUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(festivalOffers.id, id))
      .returning({ id: festivalOffers.id, bannerUpdatedAt: festivalOffers.bannerUpdatedAt })

    if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })

    return NextResponse.json({
      success: true,
      hasBanner: true,
      bannerVersion: offer.bannerUpdatedAt?.toISOString() ?? now.toISOString(),
    })
  } catch (error) {
    console.error('[offers/image] Failed to save offer banner:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the banner image.' }, { status: 500 })
  }
}

/** Removes the banner, leaving the offer itself untouched. */
export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = validId(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Invalid offer.' }, { status: 400 })

    const [offer] = await db
      .update(festivalOffers)
      .set({
        bannerMimeType: null,
        bannerData: null,
        bannerByteSize: null,
        bannerUpdatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(festivalOffers.id, id))
      .returning({ id: festivalOffers.id })

    if (!offer) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[offers/image] Failed to remove offer banner:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not remove the banner image.' }, { status: 500 })
  }
}