// Validation for offer banner artwork.
//
// Reuses the same magic-number check every other upload path uses, so a renamed
// executable cannot enter the database through this route just because it is a
// different feature. Keeping the rules here rather than inline in the route
// means the size cap is one number to change, not a value that can drift
// between two endpoints.

import { detectImage } from '@/lib/item-images'
import { businessDate } from '@/lib/business-time'
import { offerState, type OfferState } from '@/lib/offers'

/**
 * Banners are a wide festival photograph, so they are allowed more room than a
 * product thumbnail — but still capped, because the bytes live in a database
 * row and every visitor to the landing page downloads them.
 */
export const MAX_BANNER_BYTES = 900 * 1024

export type PreparedBanner = { base64: string; mime: string; byteSize: number }

/**
 * Reads an uploaded banner into the shape the database stores, or returns the
 * message to show the shopkeeper.
 */
export async function prepareOfferBanner(file: File): Promise<{ image: PreparedBanner } | { error: string }> {
  if (file.size === 0) return { error: 'That image is empty.' }
  if (file.size > MAX_BANNER_BYTES) {
    return {
      error: `That image is ${Math.round(file.size / 1024)} KB. Please use one under ${MAX_BANNER_BYTES / 1024} KB.`,
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = detectImage(bytes)
  if (!mime) return { error: 'Use a PNG, JPEG, GIF, or WebP image.' }

  return { image: { base64: Buffer.from(bytes).toString('base64'), mime, byteSize: bytes.length } }
}

/**
 * Whether an offer's artwork may be shown publicly.
 *
 * Decided against the shop's business day, never the caller's clock, so the
 * photo of a finished festival cannot be fetched by someone in a timezone that
 * is still a day behind.
 */
export function checkOfferBanner(offer: { active: boolean; startsOn: string; endsOn: string }): OfferState {
  if (!offer.active) return 'EXPIRED'
  return offerState(offer, businessDate())
}