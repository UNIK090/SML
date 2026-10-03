// Offer reads and writes.
//
// Kept separate from lib/offers (which holds the pure rules) so the storefront
// never imports the database driver, and the admin API never re-implements the
// business day.

import { and, desc, gte, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { festivalOffers } from '@/lib/db/schema'
import { businessDate } from '@/lib/business-time'
import { offerAccent, offerDiscountFor, offerState, pickFeaturedOffer, toPublicOffer } from '@/lib/offers'
import type { Offer, OfferDiscountType, PublicOffer } from '@/lib/types'

type OfferRow = {
  id: number
  title: string
  description: string | null
  code: string | null
  discountType: string
  discountValue: string
  minSpend: string
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
    // A row that predates the threshold column reads back as "0", which is the
    // same thing as "no minimum" — no offer silently stops applying.
    minSpend: row.minSpend ?? '0',
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
 * the same rows. The date window is narrowed in SQL — offers that have already
 * finished are never read — and the business day is applied here, the one place
 * that knows what "today" means for this shop.
 *
 * Offers that have not started yet ARE included. A festival offer is written up
 * days in advance, and a shop that has scheduled Diwali for next week should see
 * it on its own website rather than a blank space — the state (ACTIVE / UPCOMING)
 * is carried through and every surface phrases it honestly ("Starts 20 Oct").
 * Dropping them in SQL would make a scheduled offer invisible until midnight on
 * its start date, which is exactly when the shopkeeper stops being able to check
 * their own work.
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
      .where(and(eq(festivalOffers.active, true), gte(festivalOffers.endsOn, today)))
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
 * The best discount actually available to a basket right now, or null.
 *
 * Read fresh from the database on every order rather than trusting anything the
 * browser sent, because this is the function that decides how much money the
 * shop gives away. A client-side discount would let a customer name their own
 * price.
 *
 * "Best" means the largest rupee saving among the offers that are live today and
 * whose threshold this basket has met. Two festival offers could overlap — a
 * Diwali banner running alongside a clearance — and the customer should get the
 * one that helps them most, not whichever row the database happened to return
 * first.
 *
 * Returns the offer's title alongside the amount so the order can record which
 * offer it honoured. That matters months later: the offer will have expired, and
 * an order that just says "₹500 discount" with no reason attached is impossible
 * to explain to the customer who asks.
 */
export async function liveOfferDiscount(
  subtotal: number,
): Promise<{ amount: number; title: string } | null> {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return null

  const today = businessDate()
  try {
    const rows = await db
      .select()
      .from(festivalOffers)
      .where(and(eq(festivalOffers.active, true), gte(festivalOffers.endsOn, today)))
      .orderBy(desc(festivalOffers.endsOn), desc(festivalOffers.id))

    let best: { amount: number; title: string } | null = null
    for (const row of rows) {
      const offer = toOffer(row)
      // Only an offer that has actually started counts. An UPCOMING one is on
      // the site to build anticipation, and honouring its discount early would
      // give away money the shop had not yet agreed to.
      if (offerState(offer, today) !== 'ACTIVE') continue

      const amount = offerDiscountFor(
        { discountType: offer.discountType, discountValue: Number(offer.discountValue), minSpend: Number(offer.minSpend) },
        subtotal,
      )
      if (amount > 0 && (best === null || amount > best.amount)) {
        best = { amount, title: offer.title }
      }
    }
    return best
  } catch (error) {
    // A discount is a courtesy, not a dependency. If the offer table cannot be
    // read, the order still goes through at full price rather than failing — a
    // shop would far rather sell at the listed price than lose the sale.
    console.error('[offers] Could not work out the live discount:', error)
    return null
  }
}

/**
 * The discount a basket would get right now, for the cart to display.
 *
 * A thin wrapper over `liveOfferDiscount` so the storefront and the order path
 * share one rule. There is deliberately no second implementation on the client:
 * the cart asks the shop what the discount is, it does not decide for itself.
 */
export async function currentBasketOffer(subtotal: number): Promise<{ amount: number; title: string } | null> {
  return liveOfferDiscount(subtotal)
}

/**
 * The offers that belong in the Offers section.
 *
 * The shop can take a small announcement out of the card grid with
 * `showInSection`, so this filters rather than returning every offer. Upcoming
 * offers are kept — the cards say "Starts 20 Oct" — so a shop that has scheduled
 * a festival sees it on its own site before the day arrives. The offers that are
 * not chosen are still returned by `loadStorefrontOffers` so the banner can pick
 * them up.
 */
export async function loadSectionOffers(): Promise<PublicOffer[]> {
  const today = businessDate()
  try {
    const rows = await db
      .select()
      .from(festivalOffers)
      .where(and(eq(festivalOffers.active, true), gte(festivalOffers.endsOn, today)))
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