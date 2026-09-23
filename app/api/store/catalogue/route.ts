import { NextResponse } from 'next/server'
import { loadCatalogue } from '@/lib/catalogue'
import { isConnectionError } from '@/lib/db/errors'

// The public storefront catalogue. No session is required — this is what
// customers see — but it is filtered hard so nothing private can leak:
//
//   * only items with published = true
//   * image bytes are never serialised, only a flag that an image exists
//   * costs and barcodes are not part of the response shape at all
//
// The read rules live in lib/catalogue, which the single-product page endpoint
// shares, so a piece can never be leaked by one route and hidden by the other.
//
// Caching is revalidated in the background (see lib/use-api), so a price change
// in the admin Store screen appears on the website without a redeploy.

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const body = await loadCatalogue()

    return NextResponse.json(body, {
      // Private, short-lived: the storefront always revalidates on focus, so a
      // freshly published item shows up immediately without stampeding the API.
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('[v0] Failed to load the storefront catalogue:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'The store is temporarily unavailable. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load the store catalogue.' }, { status: 500 })
  }
}
