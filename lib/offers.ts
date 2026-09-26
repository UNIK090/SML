// Festival offers: the rules, kept free of database imports.
//
// An offer is an advertisement, not a price change. It never rewrites a
// catalogue price — the shop still controls that on the Store screen — it just
// tells the customer what is running this festival. Splitting the rules out here
// means the storefront page, the public payload and the admin screen all agree
// on the same three questions:
//
//   1. Is this offer still running?      -> offerState
//   2. What does it say it saves?        -> savingsLabel
//   3. How long is left to act on it?    -> daysLeft
//
// Dates are plain calendar days ("2026-10-20") compared as strings, the way
// Postgres `date` values already arrive. Comparing whole days rather than
// timestamps is what makes an offer run for its entire last day instead of
// stopping at an hour that depends on where the server happens to be running.

import type { Offer, OfferAccent, OfferDiscountType, PublicOffer } from '@/lib/types'

/** Percent must be 1–100; a flat amount must be positive. */
export const MAX_OFFER_PERCENT = 100

/**
 * The card colours an offer can take, in the order the picker shows them.
 *
 * Red leads because it is what a festival offer looks like in this trade — the
 * banner this section is modelled on is red. The others are there for shops that
 * find red too loud against their own branding.
 */
export const OFFER_ACCENTS: { value: OfferAccent; label: string }[] = [
  { value: 'red', label: 'Festive red' },
  { value: 'maroon', label: 'Deep maroon' },
  { value: 'gold', label: 'Gold' },
  { value: 'green', label: 'Green' },
]

/**
 * Narrows an arbitrary stored value to a colour the cards can actually render.
 *
 * Defensive because the value comes from a database column that a migration set
 * before the choice existed: an unrecognised accent falls back to red rather
 * than producing a card with no background.
 */
export function offerAccent(value: string | null | undefined): OfferAccent {
  return value === 'gold' || value === 'green' || value === 'maroon' || value === 'red' ? value : 'red'
}

export type OfferState = 'ACTIVE' | 'UPCOMING' | 'EXPIRED'

/**
 * Where an offer sits relative to the shop's business day.
 *
 * The comparison is inclusive at both ends: an offer that starts today is live
 * this morning, and one that ends today is live until the desk closes.
 */
export function offerState(offer: { startsOn: string; endsOn: string }, businessDay: string): OfferState {
  if (businessDay < offer.startsOn) return 'UPCOMING'
  if (businessDay > offer.endsOn) return 'EXPIRED'
  return 'ACTIVE'
}

/** True only when the shop has switched the offer on AND its dates cover today. */
export function isOfferLive(offer: Offer, businessDay: string): boolean {
  return offer.active && offerState(offer, businessDay) === 'ACTIVE'
}

/**
 * Whole days between two calendar days, inclusive of nothing — a plain
 * difference. Both values are "YYYY-MM-DD", so parsing as UTC midnight avoids
 * the daylight-saving drift a local-time parse would introduce.
 */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.round((end - start) / 86_400_000)
}

/**
 * Days left to act on an offer, counting today.
 *
 * The number the customer reads ("3 days left") has to include the day they are
 * standing in, or the last day of a sale would say "0 days left" while the
 * offer is still running. Returns null for an offer that is not live, because
 * "days left" is meaningless for one that has not started or has finished.
 */
export function offerDaysLeft(offer: { startsOn: string; endsOn: string }, businessDay: string): number | null {
  if (offerState(offer, businessDay) !== 'ACTIVE') return null
  return Math.max(0, daysBetween(businessDay, offer.endsOn))
}

/** "10% off" or "₹200 off" — the one-line saving, for a badge or a sentence. */
export function savingsLabel(discountType: OfferDiscountType | string, discountValue: number): string {
  if (!Number.isFinite(discountValue) || discountValue <= 0) return ''
  if (discountType === 'flat') return `₹${discountValue.toLocaleString('en-IN')} off`
  const percent = Math.round(discountValue * 100) / 100
  return `${percent.toLocaleString('en-IN')}% off`
}

/**
 * Narrows a stored offer for the public storefront.
 *
 * Defensive by design: an offer whose dates are unreadable, or whose value is
 * nonsense, is dropped rather than rendered as a broken banner. A customer
 * seeing "NaN% off" is worse than seeing no banner at all.
 */
export function toPublicOffer(offer: Offer, businessDay: string): PublicOffer | null {
  const value = Number(offer.discountValue)
  const label = savingsLabel(offer.discountType, value)
  if (!offer.title.trim() || !label) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(offer.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(offer.endsOn)) return null
  if (offer.endsOn < offer.startsOn) return null

  return {
    id: offer.id,
    title: offer.title.trim(),
    description: offer.description?.trim() || null,
    code: offer.code?.trim() || null,
    discountType: offer.discountType,
    discountValue: value,
    savingsLabel: label,
    accent: offerAccent(offer.accent),
    startsOn: offer.startsOn,
    endsOn: offer.endsOn,
    state: offerState(offer, businessDay),
    daysLeft: offerDaysLeft(offer, businessDay),
    // Carried through only when the shop actually uploaded artwork, so the
    // storefront never requests an image endpoint for a photo that is not there.
    hasBanner: offer.hasBanner,
    bannerVersion: offer.hasBanner ? (offer.bannerVersion ?? null) : null,
  }
}

/**
 * The single offer the storefront leads with.
 *
 * Only one banner is shown at a time, so a live offer always beats one that has
 * not started yet — advertising a sale that is over is a promise the shop
 * cannot keep, and two banners side by side read as noise. Among equally live
 * offers the latest to end wins, so the most urgent one is the one on screen.
 */
export function pickFeaturedOffer(offers: PublicOffer[]): PublicOffer | null {
  const live = offers.filter((offer) => offer.state === 'ACTIVE')
  if (live.length > 0) {
    return live.reduce((best, offer) => (offer.endsOn > best.endsOn ? offer : best), live[0])
  }
  const upcoming = offers.filter((offer) => offer.state === 'UPCOMING')
  if (upcoming.length > 0) {
    return upcoming.reduce((soonest, offer) => (offer.startsOn < soonest.startsOn ? offer : soonest), upcoming[0])
  }
  return null
}

/** Human date for an offer, e.g. "20 Oct 2026". Read-only, so no timezone shift. */
export function offerDate(value: string): string {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return value
  }
}

/**
 * The URL of an offer's banner artwork.
 *
 * `v` is the moment the photo was replaced. It is what lets the image endpoint
 * cache the bytes immutably for a year while a fresh upload still shows up
 * immediately: replacing the photo changes the URL, so the old cached copy is
 * simply never asked for again.
 */
export function offerBannerUrl(id: number, version: string | null): string {
  const base = `/api/offers/image?id=${encodeURIComponent(String(id))}`
  return version ? `${base}&v=${encodeURIComponent(version)}` : base
}