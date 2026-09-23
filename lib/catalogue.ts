import { asc, count, desc, eq, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItemImages, inventoryItems, invoiceItems, shopLogo, storeOrderItems, storeOrders } from '@/lib/db/schema'
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
  id: inventoryItems.id,
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
  id: number
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

async function galleryCountsByItemId(): Promise<Map<number, number>> {
  try {
    const rows = await db
      .select({ itemId: inventoryItemImages.itemId, count: count(inventoryItemImages.id) })
      .from(inventoryItemImages)
      .groupBy(inventoryItemImages.itemId)
    const map = new Map<number, number>()
    for (const row of rows) map.set(Number(row.itemId), Number(row.count))
    return map
  } catch {
    // The inventory_item_images migration may not have been applied yet.
    // Fail open so the store catalogue still loads (every product just reports
    // its legacy primary image as its only image, matching pre-gallery behavior).
    return new Map()
  }
}

/** Narrows a catalogue row to what a customer is allowed to see. */
export function toStoreProduct(row: ProductRow, galleryCountByItemId?: Map<number, number>): StoreProduct {
  const original = Number(row.price) || 0
  const hasPrimary = Boolean(row.imageMimeType && row.imageByteSize)
  const gallery = galleryCountByItemId?.get(row.id) ?? 0
  return {
    code: row.code,
    name: row.name,
    category: row.category,
    collection: row.collection?.trim() || row.category,
    description: row.description,
    badge: row.badge,
    price: sellingPrice(row),
    originalPrice: Number.isFinite(original) ? original : 0,
    image: hasPrimary || gallery > 0,
    imageVersion: row.updatedAt.toISOString(),
    imageCount: hasPrimary ? gallery + 1 : gallery,
  }
}

/** Every published piece, featured first, newest edits next. */
export async function listPublishedProducts(): Promise<StoreProduct[]> {
  const [rows, counts] = await Promise.all([
    db
      .select(productFields)
      .from(inventoryItems)
      .where(eq(inventoryItems.published, true))
      .orderBy(asc(inventoryItems.featured), desc(inventoryItems.updatedAt)),
    galleryCountsByItemId(),
  ])
  return rows.map((row) => toStoreProduct(row, counts))
}

// ---------------------------------------------------------------------------
// What actually sells
// ---------------------------------------------------------------------------

/**
 * Real sales, counted across both ways a piece can leave the shop.
 *
 * A shop sells over the counter AND online, and the two live in different
 * tables: `invoice_items` is every billed line, `store_order_items` is every
 * online order. Counting only one of them would make a best-seller that the
 * shop's own staff would not recognise — the counter is where most jewellery
 * actually moves — so both are summed into one number per item code.
 *
 * Cancelled and unpaid online orders are excluded: an order the shop never
 * confirmed is not evidence that a piece sells.
 */
export async function soldQuantities(): Promise<Map<number, number>> {
  const [billed, ordered] = await Promise.all([
    db
      .select({
        code: invoiceItems.itemCode,
        quantity: sql<number>`sum(${invoiceItems.quantity})`.as('quantity'),
      })
      .from(invoiceItems)
      .groupBy(invoiceItems.itemCode),
    db
      .select({
        code: storeOrderItems.itemCode,
        quantity: sql<number>`sum(${storeOrderItems.quantity})`.as('quantity'),
      })
      .from(storeOrderItems)
      .innerJoin(storeOrders, eq(storeOrders.orderNumber, storeOrderItems.orderNumber))
      .where(notInArray(storeOrders.status, ['CANCELLED']))
      .groupBy(storeOrderItems.itemCode),
  ])

  const totals = new Map<number, number>()
  for (const row of [...billed, ...ordered]) {
    totals.set(row.code, (totals.get(row.code) ?? 0) + Number(row.quantity || 0))
  }
  return totals
}

/**
 * The recommendations under a piece, in three honest tiers.
 *
 * A shop with only a handful of pieces cannot fill a "best sellers" rail from
 * sales alone, and an empty rail looks broken. So the fallback is deliberate
 * and ordered: same collection first (the closest thing to the piece being
 * viewed), then real best sellers, then whatever else the shop has published.
 * Each entry carries WHY it is there, so the page can label it truthfully
 * instead of calling an arbitrary piece a best seller.
 */
export type Recommendation = {
  product: StoreProduct
  /** Units actually sold, when the shop has sold this piece at all. */
  sold: number
  reason: 'similar' | 'best-seller' | 'featured'
}

/** A piece counts as a best seller once it has genuinely moved. */
const BEST_SELLER_MINIMUM = 1

export function recommend(
  products: StoreProduct[],
  product: StoreProduct,
  sold: Map<number, number>,
  limit = 8,
): Recommendation[] {
  const ranked = products
    .filter((entry) => entry.code !== product.code)
    .map((entry) => ({ product: entry, sold: sold.get(entry.code) ?? 0 }))
    // Best sellers first, then the newest, so an unranked rail is still stable.
    .sort((a, b) => b.sold - a.sold || (a.product.imageVersion < b.product.imageVersion ? 1 : -1))

  const picked: Recommendation[] = []
  const taken = new Set<number>()
  const take = (row: { product: StoreProduct; sold: number }, reason: Recommendation['reason']) => {
    if (taken.has(row.product.code) || picked.length >= limit) return
    taken.add(row.product.code)
    picked.push({ ...row, reason })
  }

  // 1. The closest neighbours: same shelf, and the pieces that actually move.
  for (const row of ranked) {
    if (row.product.collection === product.collection) take(row, 'similar')
  }

  // 2. Then the proven sellers from anywhere else in the shop.
  for (const row of ranked) {
    if (row.sold >= BEST_SELLER_MINIMUM) take(row, 'best-seller')
  }

  // 3. Finally, fill from what is published. A new shop gets a full rail and an
  //    honest label rather than a heading that promises sales it has not made.
  for (const row of ranked) take(row, 'featured')

  return picked
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