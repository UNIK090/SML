import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItems } from '@/lib/db/schema'
import { getShopDetails } from '@/lib/shop'
import { sellingPrice } from '@/lib/store'
import ProductPage from '@/components/store/product-page'

// The page behind a shared product link: `/product/1042`.
//
// The body is rendered on the client from the public product endpoint, which is
// what applies the `published` check — but the metadata is resolved on the
// server, because that is the part WhatsApp and every other preview scraper
// reads. A shared link therefore arrives with the piece's name, its price and
// its photo already attached, which is the whole point of sharing it.
//
// Metadata deliberately says nothing about an item that is not published: those
// links get a generic title, and the page itself explains that the piece is gone.

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ code: string }> }

/** Reads the code from the URL without trusting it. */
function parseCode(raw: string): number | null {
  const code = Number(raw)
  return Number.isInteger(code) && code > 0 ? code : null
}

async function loadPublished(code: number) {
  const [row] = await db
    .select({
      name: inventoryItems.name,
      category: inventoryItems.category,
      collection: inventoryItems.collection,
      description: inventoryItems.description,
      price: inventoryItems.price,
      storePrice: inventoryItems.storePrice,
      imageMimeType: inventoryItems.imageMimeType,
      imageByteSize: inventoryItems.imageByteSize,
      updatedAt: inventoryItems.updatedAt,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.code, code), eq(inventoryItems.published, true)))
  return row ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: raw } = await params
  const code = parseCode(raw)
  if (!code) return { title: 'Piece not found' }

  try {
    const [item, shop] = await Promise.all([loadPublished(code), getShopDetails()])
    if (!item) {
      return { title: 'This piece is no longer available', description: 'It may have been sold or taken off the website.' }
    }

    const price = sellingPrice(item)
    const title = `${item.name} · ₹${Math.round(price).toLocaleString('en-IN')}`
    const description =
      item.description?.trim() ||
      `${item.name} (item #${code}) from ${shop.name}. See the price, ask the shop, and order online — the shop confirms every order by phone.`

    return {
      title,
      description,
      openGraph: {
        title: `${title} · ${shop.name}`,
        description,
        type: 'website',
        // The public image endpoint refuses unpublished rows, so this URL is
        // safe to hand to a scraper: it 404s rather than leaking anything.
        images: item.imageMimeType && item.imageByteSize
          ? [{ url: `/api/store/image?id=${code}&v=${item.updatedAt.toISOString()}`, alt: item.name }]
          : undefined,
      },
      twitter: {
        card: item.imageMimeType ? 'summary_large_image' : 'summary',
        title,
        description,
      },
    }
  } catch (error) {
    // A database hiccup must not stop the page rendering — the client-side
    // fetch has its own error state for exactly this case.
    console.error('[product] Failed to build metadata:', error)
    return { title: 'View this piece' }
  }
}

export default async function Page({ params }: Props) {
  const { code: raw } = await params
  const code = parseCode(raw)
  if (!code) notFound()
  return <ProductPage code={code} />
}