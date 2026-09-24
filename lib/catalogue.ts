import { asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItemImages, inventoryItems, invoiceItems, shopLogo, storeOrderItems, storeOrders } from '@/lib/db/schema'
import { getShopDetails } from '@/lib/shop'
import { sellingPrice } from '@/lib/store'
import type { PriceBand, StoreCatalogue, StoreCategory, StoreProduct } from '@/lib/types'

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

/**
 * How many extra gallery photos each item has, keyed by item id.
 *
 * Counted in one grouped query rather than per product, so a catalogue of a
 * hundred pieces is still two round trips. Only items that actually have extra
 * photos appear in the map, so the common case returns nothing.
 */
export async function galleryCounts(itemIds: number[]): Promise<Map<number, number>> {
  if (itemIds.length === 0) return new Map()
  const rows = await db
    .select({ itemId: inventoryItemImages.itemId, count: sql<number>`count(*)`.as('count') })
    .from(inventoryItemImages)
    .where(inArray(inventoryItemImages.itemId, itemIds))
    .groupBy(inventoryItemImages.itemId)

  const counts = new Map<number, number>()
  for (const row of rows) counts.set(row.itemId, Number(row.count) || 0)
  return counts
}

/** Narrows a catalogue row to what a customer is allowed to see. */
export function toStoreProduct(row: ProductRow, galleryCount = 0): StoreProduct {
  const original = Number(row.price) || 0
  const hasPrimary = Boolean(row.imageMimeType && row.imageByteSize)
  return {
    code: row.code,
    name: row.name,
    category: row.category,
    collection: row.collection?.trim() || row.category,
    description: row.description,
    badge: row.badge,
    price: sellingPrice(row),
    originalPrice: Number.isFinite(original) ? original : 0,
    image: hasPrimary,
    imageVersion: row.updatedAt.toISOString(),
    // The cover counts as one photo, but only when there is one to show.
    imageCount: hasPrimary ? galleryCount + 1 : galleryCount,
  }
}

/** Every published piece, featured first, newest edits next. */
export async function listPublishedProducts(): Promise<StoreProduct[]> {
  const rows = await db
    .select(productFields)
    .from(inventoryItems)
    .where(eq(inventoryItems.published, true))
    .orderBy(asc(inventoryItems.featured), desc(inventoryItems.updatedAt))

  const counts = await galleryCounts(rows.map((row) => row.id))
  return rows.map((row) => toStoreProduct(row, counts.get(row.id) ?? 0))
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
  const [shop, products, sold, [brand]] = await Promise.all([
    getShopDetails(),
    listPublishedProducts(),
    // Best sellers are ranked from real sales. A shop that has not sold online
    // yet simply gets no rail rather than a rail of invented "best sellers".
    soldQuantities().catch(() => new Map<number, number>()),
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

  const bestSellers = rankBestSellers(products, sold)

  return {
    shop,
    products,
    collections,
    categories: [...new Set(products.map((product) => product.category))].sort(),
    categoryRails: buildCategoryRails(products),
    bestSellers,
    // Only the codes the shelf actually shows are sent, so the public payload
    // never leaks how much of anything else the shop has moved.
    soldCounts: Object.fromEntries(bestSellers.map((product) => [product.code, sold.get(product.code) ?? 0])),
    priceBands: buildPriceBands(products),
    updatedAt: latestAssetVersion(products, brand?.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// Storefront shortcuts, all derived from the shop's own catalogue
//
// Every one is built from real rows. Nothing is padded out to fill a band: a
// shop with two pieces produces two category tiles, not six empty ones. That is
// deliberate — an empty shelf makes a small shop look closed, while a short,
// full shelf makes it look curated.
// ---------------------------------------------------------------------------

/**
 * The category rail — the kinds of piece the shop actually stocks.
 *
 * Each tile carries the code of a real photo so it shows jewellery rather than
 * a generic icon, and categories are ranked by how much the shop has of them.
 */
export function buildCategoryRails(products: StoreProduct[]): StoreCategory[] {
  const grouped = new Map<string, StoreProduct[]>()
  for (const product of products) {
    const key = product.category.trim()
    if (!key) continue
    const bucket = grouped.get(key)
    if (bucket) bucket.push(product)
    else grouped.set(key, [product])
  }

  return [...grouped.entries()]
    .map(([name, list]) => {
      const cheapest = list.reduce((best, entry) => (entry.price < best.price ? entry : best), list[0])
      const withImage = list.find((entry) => entry.image)
      return {
        name,
        count: list.length,
        from: Math.min(...list.map((entry) => entry.price)),
        imageCode: (withImage ?? cheapest).code,
      }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * The best-seller rail, in the order a counter would show it.
 *
 * Only pieces that genuinely sold are included, so the heading is never a lie.
 * A brand-new shop gets no rail at all, which is the honest outcome; the
 * fallback that keeps the row full lives in the page, not here.
 */
export function rankBestSellers(products: StoreProduct[], sold: Map<number, number>, limit = 8): StoreProduct[] {
  return products
    .filter((product) => (sold.get(product.code) ?? 0) > 0)
    .sort((a, b) => (sold.get(b.code) ?? 0) - (sold.get(a.code) ?? 0) || a.code - b.code)
    .slice(0, limit)
}

/**
 * "Shop in budget" bands, priced for a one-gram / panchaloha / silver shop.
 *
 * Deliberately low bands — an affordable counter sells in the hundreds and low
 * thousands, not the tens of thousands a bridal gold site would use. A band
 * with nothing in it is dropped, so no shortcut sends a customer to an empty
 * grid.
 */
export function buildPriceBands(products: StoreProduct[], edges: number[] = [500, 1000, 2000, 3000]): PriceBand[] {
  if (products.length === 0) return []

  const bounds = [0, ...edges]
  const bands: PriceBand[] = []

  for (let index = 0; index < bounds.length; index += 1) {
    const from = bounds[index]
    const isLast = index === bounds.length - 1
    const to = isLast ? Number.POSITIVE_INFINITY : bounds[index + 1]
    const count = products.filter((product) => product.price >= from && product.price < to).length
    if (count === 0) continue

    bands.push({
      label: isLast ? `Above ${inr(bounds[bounds.length - 1])}` : `Under ${inr(to)}`,
      from,
      to,
      count,
    })
  }

  return bands
}

/** A plain rupee label, so the band names match what the cards show. */
function inr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`
}