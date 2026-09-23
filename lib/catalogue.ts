import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItems, shopLogo } from '@/lib/db/schema'
import { getShopDetails } from '@/lib/shop'
import { sellingPrice } from '@/lib/store'
import type { StoreCatalogue, StoreProduct } from '@/lib/types'

// The public storefront's read rules, in one place.
//
// Two routes serve the website — the grid (app/api/store/catalogue) and a single
// product page (app/api/store/product) — and both must apply exactly the same
// boundary: only `published = true` rows, no costs, no barcodes, and image bytes
// represented by a flag rather than serialised. Keeping the projection and the
// grouping here means a single product can never be exposed by a route that
// forgot one of those rules.

export const productFields = {
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

type ProductRow = {
  code: number
  name: string
  category: string
  collection: string | null
  description: string | null
  badge: string | null
  price: string
  storePrice: string | null
  imageMimeType: string | null
  imageByteSize: number | null
  updatedAt: Date
}

/** Narrows a catalogue row to what a customer is allowed to see. */
export function toStoreProduct(row: ProductRow): StoreProduct {
  return {
    code: row.code,
    name: row.name,
    category: row.category,
    collection: row.collection?.trim() || row.category,
    description: row.description,
    badge: row.badge,
    price: sellingPrice(row),
    image: Boolean(row.imageMimeType && row.imageByteSize),
    imageVersion: row.updatedAt.toISOString(),
  }
}

/** Every published piece, featured first, newest edits next. */
export async function listPublishedProducts(): Promise<StoreProduct[]> {
  const rows = await db
    .select(productFields)
    .from(inventoryItems)
    .where(eq(inventoryItems.published, true))
    .orderBy(asc(inventoryItems.featured), desc(inventoryItems.updatedAt))
  return rows.map(toStoreProduct)
}

/** Pieces that sit in the same collection, for the "you may also like" rail. */
export function sameCollection(products: StoreProduct[], product: StoreProduct, limit = 4): StoreProduct[] {
  return products
    .filter((entry) => entry.code !== product.code && entry.collection === product.collection)
    .slice(0, limit)
}

/**
 * The brand's last-updated stamp.
 *
 * The storefront caches product images for a year, so the page needs one value
 * that changes whenever anything visual changes. It is deliberately the newest
 * of "product edited" and "logo replaced" — a single number the client can use
 * as a cache-buster instead of tracking each asset separately.
 */
export function latestAssetVersion(products: StoreProduct[], brandUpdatedAt: Date | null | undefined): string {
  const productVersion = products.reduce((newest, product) => (product.imageVersion > newest ? product.imageVersion : newest), '1')
  const brandVersion = brandUpdatedAt?.toISOString() ?? '1'
  return productVersion > brandVersion ? productVersion : brandVersion
}

/** The full storefront payload: shop details, products, collections, categories. */
export async function loadCatalogue(): Promise<StoreCatalogue> {
  const [shop, products, [brand]] = await Promise.all([
    getShopDetails(),
    listPublishedProducts(),
    db.select({ updatedAt: shopLogo.updatedAt }).from(shopLogo).where(eq(shopLogo.id, 1)),
  ])

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

  return {
    shop,
    products,
    collections,
    categories: [...new Set(products.map((product) => product.category))].sort(),
    updatedAt: latestAssetVersion(products, brand?.updatedAt),
  }
}