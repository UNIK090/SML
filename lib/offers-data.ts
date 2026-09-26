// Offer reads and writes.
//
// Kept separate from lib/offers (which holds the pure rules) so the storefront
// never imports the database driver, and the admin API never re-implements the
// business day.

import { and, desc, gte, lte, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { festivalOffers } from '@/lib/db/schema'
import { businessDate } from '@/lib/business-time'
import { offerAccent, pickFeaturedOffer, toPublicOffer } from '@/lib/offers'
import type { Offer, OfferDiscountType, PublicOffer } from '@/lib/types'

type OfferRow = {
  id: number
  title: string
  description: string | null
  code: string | null
  discountType: string
  discountValue: string
  startsOn: string
  endsOn: string
  active: boolean
  accent: string
  showInSection: boolean
  bannerMimeType: string | null
  bannerByteSize: number | null
  bannerUpdatedAt: Date | null
}

/** Postgres `date` columns come back as strings; normalise the row shape. */
function toOffer(row: OfferRow): Offer {
  // A banner counts only when both halves of the stored image are present — a
  // mime type with no bytes would otherwise advertise a photo that cannot load.
  const hasBanner = Boolean(row.bannerMimeType && row.bannerByteSize)
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    code: row.code,
    discountType: (row.discountType === 'flat' ? 'flat' : 'percent') as OfferDiscountType,
    discountValue: row.discountValue,
    startsOn: typeof row.startsOn === 'string' ? row.startsOn : String(row.startsOn),
    endsOn: typeof row.endsOn === 'string' ? row.endsOn : String(row.endsOn),
    active: row.active,
    accent: offerAccent(row.accent),
    showInSection: row.showInSection,
    hasBanner,
    bannerVersion: hasBanner && row.bannerUpdatedAt ? row.bannerUpdatedAt.toISOString() : null,
  }
}

/** Every offer, newest first — what the admin Offers screen lists. */
export async function listOffers(): Promise<Offer[]> {
  const rows = await db.select().from(festivalOffers).orderBy(desc(festivalOffers.startsOn), desc(festivalOffers.id))
  return rows.map(toOffer)
}

/**
 * Every offer the storefront should show, best first.
 *
 * One read serves the whole page: the leading banner takes the first entry and
 * the Offers section takes the rest, so the storefront never queries twice for
 * the same rows. The date window is narrowed in SQL — only offers that could
 * possibly be live are read — and the business day is applied here, the one
 * place that knows what "today" means for this shop.
 *
 * Ordering is deliberate: the offer with the furthest end date comes first,
 * because that is the longest-running promise and the one worth leading with.
 */
export async function loadStorefrontOffers(): Promise<PublicOffer[]> {
  const today = businessDate()
  try {
    const rows = await db
      .select()
      .from(festivalOffers)
      .where(and(eq(festivalOffers.active, true), lte(festivalOffers.startsOn, today), gte(festivalOffers.endsOn, today)))
      .orderBy(desc(festivalOffers.endsOn), desc(festivalOffers.id))

    return rows
      .map(toOffer)
      .map((offer) => toPublicOffer(offer, today))
      .filter((offer): offer is PublicOffer => offer !== null)
  } catch (error) {
    // An offer is decoration on the storefront; a broken offer table must never
    // take the shop's catalogue down with it.
    console.error('[offers] Could not load storefront offers:', error)
    return []
  }
}

/**
 * The single offer the banner leads with, or null.
 *
 * Kept as its own function because the shared product page shows only the
 * banner — it has no grid of offers — and should not have to know that the
 * section exists.
 */
export async function loadFeaturedOffer(): Promise<PublicOffer | null> {
  return pickFeaturedOffer(await loadStorefrontOffers())
}

/**
 * The offers that belong in the Offers section.
 *
 * The shop can take a small announcement out of the card grid with
 * `showInSection`, so this filters rather than returning every live offer. The
 * offers that are not chosen are still returned by `loadStorefrontOffers` so the
 * banner can pick them up.
 */
export async function loadSectionOffers(): Promise<PublicOffer[]> {
  const today = businessDate()
  try {
    const rows = await db
      .select()
      .from(festivalOffers)
      .where(and(eq(festivalOffers.active, true), lte(festivalOffers.startsOn, today), gte(festivalOffers.endsOn, today)))
      .orderBy(desc(festivalOffers.endsOn), desc(festivalOffers.id))

    return rows
      .map(toOffer)
      .filter((offer) => offer.showInSection)
      .map((offer) => toPublicOffer(offer, today))
      .filter((offer): offer is PublicOffer => offer !== null)
  } catch (error) {
    console.error('[offers] Could not load the offer section:', error)
    return []
  }
}