import { NextResponse } from 'next/server'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItems, shopLogo } from '@/lib/db/schema'
import { isConnectionError } from '@/lib/db/errors'
import { getShopDetails } from '@/lib/shop'
import { sellingPrice } from '@/lib/store'
import type { StoreCatalogue, StoreProduct } from '@/lib/types'

// The public storefront catalogue. No session is required — this is what
// customers see — but it is filtered hard so nothing private can leak:
//
//   * only items with published = true
//   * image bytes are never serialised, only a flag that an image exists
//   * costs and barcodes are not part of the response shape at all
//
// Caching is revalidated in the background (see lib/use-api), so a price change
// in the admin Store screen appears on the website without a redeploy.

const productFields = {
  code: inventoryItems.code,
  name: inventoryItems.name,
  category: inventoryItems.category,
  collection: inventoryItems.collection,
  description: inventoryItems.description,
  badge: inventoryItems.badge,
  price: inventoryItems.price,
  storePrice: inventoryItems.storePrice,
  imageMimeType: inventoryItems.imageMimeType,
  imageByteSize: inventoryItems.imageByteSize,
  featured: inventoryItems.featured,
  updatedAt: inventoryItems.updatedAt,
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [shop, rows, [brand]] = await Promise.all([
      getShopDetails(),
      db
        .select(productFields)
        .from(inventoryItems)
        .where(eq(inventoryItems.published, true))
        .orderBy(asc(inventoryItems.featured), desc(inventoryItems.updatedAt)),
      db.select({ updatedAt: shopLogo.updatedAt }).from(shopLogo).where(eq(shopLogo.id, 1)),
    ])

    const products: StoreProduct[] = rows.map((row) => ({
      code: row.code,
      name: row.name,
      category: row.category,
      collection: row.collection?.trim() || row.category,
      description: row.description,
      badge: row.badge,
      price: sellingPrice(row),
      image: Boolean(row.imageMimeType && row.imageByteSize),
      imageVersion: row.updatedAt.toISOString(),
    }))

    const grouped = new Map<string, StoreProduct[]>()
    for (const product of products) {
      const bucket = grouped.get(product.collection)
      if (bucket) bucket.push(product)
      else grouped.set(product.collection, [product])
    }

    const collections = [...grouped.entries()]
      .map(([name, list]) => ({
        name,
        count: list.length,
        from: Math.min(...list.map((product) => product.price)),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    const latestUpdate = products.reduce(
      (newest, product) => (product.imageVersion > newest ? product.imageVersion : newest),
      brand?.updatedAt?.toISOString() ?? '1',
    )

    const body: StoreCatalogue = {
      shop,
      products,
      collections,
      categories: [...new Set(products.map((product) => product.category))].sort(),
      updatedAt: latestUpdate,
    }

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
