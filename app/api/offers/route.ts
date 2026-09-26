import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isConnectionError } from '@/lib/db/errors'
import { requireAdmin } from '@/lib/db/guard'
import { festivalOffers } from '@/lib/db/schema'
import { listOffers } from '@/lib/offers-data'
import { offerAccent } from '@/lib/offers'
import type { OfferAccent, OfferDiscountType } from '@/lib/types'

// Festival offers for the storefront, edited from the admin Offers screen.
//
// An offer is an advertisement, not a price change: nothing here rewrites a
// catalogue price. That separation is deliberate — the shop sets prices on the
// Store screen, and a festival banner tells the customer what is running.
//
// Every handler validates before writing, because an offer with a missing date
// or an unreadable value would render as a broken banner. A rejected offer is
// far easier to explain than one that shows "NaN% off" to a customer.

export const dynamic = 'force-dynamic'

/** The dates are calendar days in the shop's timezone; anything else is a bug. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

type OfferInput = {
  title: string
  description: string | null
  code: string | null
  discountType: OfferDiscountType
  discountValue: number
  startsOn: string
  endsOn: string
  active: boolean
  accent: OfferAccent
  showInSection: boolean
}

/**
 * Validates and normalises an offer payload.
 *
 * Returns an error message instead of throwing so each route can answer with a
 * 400 that says what to fix, rather than a generic failure.
 */
function parseOffer(body: Record<string, unknown>): { value: OfferInput } | { error: string } {
  const title = cleanText(body.title, 80)
  if (!title) return { error: 'Give the offer a name — e.g. "Diwali Offer".' }

  const discountType: OfferDiscountType = body.discountType === 'flat' ? 'flat' : 'percent'
  const discountValue = Number(body.discountValue)
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { error: 'Enter the discount value — a percentage or a rupee amount.' }
  }
  if (discountType === 'percent' && discountValue > 100) {
    return { error: 'A percentage discount cannot be more than 100%.' }
  }

  const startsOn = typeof body.startsOn === 'string' ? body.startsOn.trim() : ''
  const endsOn = typeof body.endsOn === 'string' ? body.endsOn.trim() : ''
  if (!DATE_PATTERN.test(startsOn) || !DATE_PATTERN.test(endsOn)) {
    return { error: 'Enter a valid start and end date for the offer.' }
  }
  if (endsOn < startsOn) return { error: 'The offer ends before it starts. Check the dates.' }

  return {
    value: {
      title,
      description: cleanText(body.description, 160),
      code: cleanText(body.code, 24),
      discountType,
      discountValue,
      startsOn,
      endsOn,
      active: body.active !== false,
      // An unknown or missing colour falls back to festive red rather than
      // producing a card with no background.
      accent: offerAccent(typeof body.accent === 'string' ? body.accent : null),
      showInSection: body.showInSection !== false,
    },
  }
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json(await listOffers())
  } catch (error) {
    console.error('[offers] Failed to load offers:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load your offers.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as Record<string, unknown>
    const parsed = parseOffer(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const [row] = await db
      .insert(festivalOffers)
      .values({
        ...parsed.value,
        discountValue: parsed.value.discountValue.toFixed(2),
      })
      .returning()

    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    console.error('[offers] Failed to create an offer:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save the offer.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = Number(body.id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid offer.' }, { status: 400 })

    // A switch-only patch (the active toggle) carries no other fields, so it is
    // handled separately rather than being forced through full validation.
    if (Object.keys(body).length <= 2 && typeof body.active === 'boolean') {
      const [toggled] = await db
        .update(festivalOffers)
        .set({ active: body.active, updatedAt: new Date() })
        .where(eq(festivalOffers.id, id))
        .returning()
      if (!toggled) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
      return NextResponse.json(toggled)
    }

    const parsed = parseOffer(body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const [row] = await db
      .update(festivalOffers)
      .set({
        ...parsed.value,
        discountValue: parsed.value.discountValue.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(festivalOffers.id, id))
      .returning()

    if (!row) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
    return NextResponse.json(row)
  } catch (error) {
    console.error('[offers] Failed to update an offer:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not update the offer.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid offer.' }, { status: 400 })
    const [row] = await db.delete(festivalOffers).where(eq(festivalOffers.id, id)).returning()
    if (!row) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[offers] Failed to delete an offer:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'Could not reach the database. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not delete the offer.' }, { status: 500 })
  }
}