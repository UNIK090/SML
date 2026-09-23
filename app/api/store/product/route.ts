import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItemImages, inventoryItems } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { latestAssetVersion, listPublishedProducts, productFields, recommend, soldQuantities, toStoreProduct } from '@/lib/catalogue'
import { getShopDetails } from '@/lib/shop'
import type { StoreProductLink } from '@/lib/types'
import { count } from 'drizzle-orm'

// The public payload behind a shared product link: `/product/1042`.
//
// A customer shares one piece, not the whole shop, so the shared page must load
// without dragging in the full catalogue. It still returns the shop details (the
// page is a landing page for someone who has never seen the store) and the
// recommendation rail underneath, so the recipient has somewhere to go next.
//
// Same security boundary as the grid: the row must exist AND be published. An
// unpublished code returns 404 rather than an empty product.

/** How many pieces the rail under the product offers. */
const RECOMMENDATION_LIMIT = 8

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const code = Number(new URL(request.url).searchParams.get('code'))
    if (!Number.isInteger(code) || code <= 0) {
      return NextResponse.json({ error: 'That product code is not valid.' }, { status: 400 })
    }

    const [row] = await db
      .select(productFields)
      .from(inventoryItems)
      .where(and(eq(inventoryItems.code, code), eq(inventoryItems.published, true)))

    if (!row) {
      return NextResponse.json({ error: 'This piece is no longer available on the website.' }, { status: 404 })
    }

    // The recommendations are ranked from real sales, so the count is fetched
    // alongside the catalogue rather than derived from anything on the client.
    const [shop, products, sold, galleryRowsMaybe] = await Promise.all([
      getShopDetails(),
      listPublishedProducts(),
      soldQuantities(),
      (async () => {
        try {
          return await db
            .select({ itemId: inventoryItemImages.itemId, count: count(inventoryItemImages.id) })
            .from(inventoryItemImages)
            .groupBy(inventoryItemImages.itemId)
        } catch {
          return [] as Array<{ itemId: number; count: number }>
        }
      })(),
    ])
    const galleryCounts = new Map<number, number>()
    for (const r of galleryRowsMaybe) galleryCounts.set(Number(r.itemId), Number(r.count))
    const product = toStoreProduct(row, galleryCounts)
    const related = recommend(products, product, sold, RECOMMENDATION_LIMIT)

    const body: StoreProductLink = {
      shop,
      product,
      related,
      hasSalesData: related.some((entry) => entry.sold > 0),
      updatedAt: latestAssetVersion(products, null),
    }

    return NextResponse.json(body, {
      // Prices and availability are edited from the admin desk, so this is kept
      // as short-lived as the catalogue response rather than cached on a CDN.
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('[store/product] Failed to load the shared product:', error)
    if (isConnectionError(error)) {
      return NextResponse.json({ error: 'The store is temporarily unavailable. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load this piece.' }, { status: 500 })
  }
}