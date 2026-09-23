'use client'

// ===========================================================================
// A piece on its own page, at /product/<code>.
//
// This is the page a shared link opens. It exists because a piece is what gets
// sent — to a mother, a husband, a group — and a shared link should show that
// piece rather than a grid the recipient has to search inside.
//
// Does the three things a recipient needs, in order:
//
//   1. See the piece at a size worth looking at, with the price in the clear.
//   2. Ask the shop about it, on WhatsApp or by phone, without leaving the page.
//   3. Order it, or browse on — the recommendation rail underneath carries the
//      similar pieces and the shop's real best sellers, ranked from actual sales.
//
// The route is public. The endpoint behind it checks `published`, so a piece the
// shop has withdrawn says so plainly instead of 404-ing.
// ===========================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Flame,
  Gem,
  Package,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react'
import ShareMenu, { WhatsAppMark } from '@/components/store/share-menu'
import { useApi } from '@/lib/use-api'
import { rupees, telLink, whatsappLink } from '@/lib/store'
import type { ProductRecommendation, StoreProductLink } from '@/lib/types'
import ProductImageSlider from '@/components/store/product-image-slider'

export default function ProductPage({ code }: { code: number }) {
  const { data, isLoading, error } = useApi<StoreProductLink>(`/api/store/product?code=${code}`)
  const [added, setAdded] = useState(false)

  const product = data?.product ?? null
  const shop = data?.shop ?? null
  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(
    shop?.whatsapp ?? shop?.phone,
    `Hello ${shop?.name ?? ''}, I saw ${product?.name ?? 'a piece'} on your website (item #${code}) and would like to know more.`,
  )

  // Ordering from here puts the piece in the basket and opens the drawer, which
  // is the same path the grid uses — one checkout, not two.
  const order = useCallback(() => {
    if (!product) return
    setAdded(true)
    window.dispatchEvent(
      new CustomEvent('sml:open-basket', { detail: { code: product.code, fulfilment: 'PICKUP' } }),
    )
    window.setTimeout(() => setAdded(false), 2600)
  }, [product])

  useEffect(() => {
    if (product) document.title = `${product.name} · ${shop?.name ?? 'Jewellery'}`
  }, [product, shop?.name])

  if (isLoading) {
    return (
      <main className="sf-canvas min-h-screen px-4 py-16 sm:px-7">
        <div className="mx-auto grid w-full max-w-[1100px] items-start gap-8 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)] lg:gap-12">
          <div className="aspect-square animate-pulse rounded-xl border border-line bg-white" />
          <div className="space-y-4">
            <div className="h-3 w-24 animate-pulse rounded bg-cream-soft" />
            <div className="h-8 w-2/3 animate-pulse rounded bg-cream-soft" />
            <div className="h-6 w-32 animate-pulse rounded bg-cream-soft" />
            <div className="h-24 w-full animate-pulse rounded bg-cream-soft" />
          </div>
        </div>
      </main>
    )
  }

  // A link to a piece the shop has withdrawn, or to a code that never existed.
  if (error || !product) {
    return (
      <main className="sf-canvas flex min-h-screen items-center justify-center px-5 py-16">
        <div className="sf-card w-full max-w-md p-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-gold-deep)' }}>
            <Gem className="size-6" strokeWidth={1.4} />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">This piece is not on the website</h1>
          <p className="mt-2 text-sm leading-6">
            {error ?? 'Item'} It may have been sold or taken off the website. Everything the shop has published is still in the
            store.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/#store" className="sf-btn sf-btn-gold h-11 w-full text-sm">
              Browse the collection <ArrowRight className="size-4" />
            </Link>
            <Link href="/" className="sf-btn sf-btn-ghost h-11 w-full text-sm">
              <ArrowLeft className="size-4" /> Back to the shop
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="sf-canvas min-h-screen pb-16">
      {/* A thin maroon bar keeps the piece's page recognisably the same shop. */}
      <div className="sf-topbar px-4 py-2 text-[11px] sm:px-7">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4">
          <Link href="/" className="truncate font-semibold tracking-[0.1em] uppercase transition hover:text-white">
            {shop?.name ?? 'Jewellery'}
          </Link>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/#store" className="transition hover:text-white">
              All pieces
            </Link>
            <Link href="/track" className="transition hover:text-white">
              Track an order
            </Link>
          </div>
        </div>
      </div>

      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-3.5 sm:px-7">
          <Link href="/" className="sf-btn sf-btn-ghost h-9 px-3.5 text-xs">
            <ArrowLeft className="size-3.5" /> Back to the shop
          </Link>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--sf-muted)' }}>
            <BadgeCheck className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Shared piece · #{product.code}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-7">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)] lg:gap-12">
          {/* ------------------------------ The piece ------------------------------ */}
          <div>
            {/*
              Kept to a square rather than a tall portrait. A 4:5 card pushed
              the price, the buy button and the shop's details far enough down
              the page that a customer on a phone had to scroll to find them,
              and a small piece of jewellery in a large frame reads as less
              valuable, not more.
            */}
            <div className="sf-card mx-auto w-full max-w-[26rem] overflow-hidden lg:max-w-none">
              <div className="sf-card-media relative aspect-square">
                <ProductImageSlider
                  product={product}
                  className="size-full"
                  overlay={
                    product.badge ? (
                      <span
                        className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-white uppercase pointer-events-none"
                        style={{ background: 'var(--sf-maroon)' }}
                      >
                        {product.badge}
                      </span>
                    ) : undefined
                  }
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ShareMenu
                product={product}
                shopName={shop?.name}
                whatsapp={shop?.whatsapp ?? shop?.phone}
                label="Share this piece"
                className=""
                buttonClassName="sf-btn sf-btn-ghost h-10 px-4 text-xs"
                icon={<WhatsAppMark />}
              />
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-10 px-4 text-xs">
                  Ask the shop
                </a>
              )}
            </div>

            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {[
                { icon: ShieldCheck, text: 'The shop confirms every order by phone' },
                { icon: Truck, text: 'Delivery arranged by the shop' },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-xs leading-5">
                  <item.icon className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          {/* ------------------------------ The order ------------------------------ */}
          <div className="lg:pt-2">
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'var(--sf-gold-deep)' }}>
              {product.collection}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2.1rem]">{product.name}</h1>

            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              <div>
                <div className="flex items-baseline gap-3">
                  <p className="tnum text-2xl font-semibold" style={{ color: 'var(--sf-maroon)' }}>
                    {rupees(product.price)}
                  </p>
                  {product.originalPrice > product.price && (
                    <>
                      <p className="tnum text-base line-through decoration-1 decoration-dashed" style={{ color: 'var(--sf-muted)' }}>
                        {rupees(product.originalPrice)}
                      </p>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                        style={{ background: 'var(--sf-gold-deep)', color: '#fff' }}
                      >
                        -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                      </span>
                    </>
                  )}
                </div>
                {product.originalPrice > product.price && (
                  <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--sf-gold-deep)' }}>
                    You save {rupees(product.originalPrice - product.price)}
                  </p>
                )}
              </div>
              <p className="text-[11px] ml-auto" style={{ color: 'var(--sf-muted)' }}>
                Item #{product.code} · {product.category}
              </p>
            </div>

            {product.description && <p className="mt-4 text-sm leading-7">{product.description}</p>}

            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={order} className="sf-btn sf-btn-gold h-12 w-full text-sm">
                {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}
                {added ? 'Added to basket' : 'Order this piece'}
              </button>
            </div>

            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                { icon: Package, text: 'Gift packing on request' },
                { icon: Check, text: 'No payment taken on the website' },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-xs leading-5">
                  <item.icon className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
                  {item.text}
                </li>
              ))}
            </ul>

            {/* The shop, so a recipient of a shared link can reach a human. */}
            <div className="sf-card mt-6 p-5">
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--sf-heading)' }}>
                {shop?.name ?? 'The shop'}
              </p>
              {shop?.address && <p className="mt-2 text-xs leading-6">{shop.address}</p>}
              {shop?.storeHours && <p className="mt-1 text-xs leading-6">{shop.storeHours}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {call && (
                  <a href={call} className="sf-btn sf-btn-ghost h-9 px-4 text-xs">
                    <Phone className="size-3.5" /> {shop?.phone}
                  </a>
                )}
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-9 px-4 text-xs">
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* -------------------------- Recommendations -------------------------- */}
        <RecommendationRail recommendations={data?.related ?? []} hasSalesData={data?.hasSalesData ?? false} />
      </main>
    </div>
  )
}

/**
 * The rail under a piece: what is similar, and what the shop actually sells.
 *
 * Two rules govern the labelling, and both matter more than the layout:
 *
 *   1. A piece is never called a best seller unless it genuinely sold. When the
 *      shop is new the rail is still full, but the pieces are labelled as
 *      suggestions — a false "best seller" is a lie the shopkeeper has to answer
 *      for at the counter.
 *   2. The best sellers are shown as a group in their own band, above the rest,
 *      because that is the order a customer actually wants: the thing they were
 *      looking at, then the thing everybody else bought, then everything else.
 *
 * It is a horizontal scroll on a phone, where a two-column grid would either
 * truncate the names or produce a card too small to judge a piece by, and a
 * four-across grid from tablet up.
 */
function RecommendationRail({
  recommendations,
  hasSalesData,
}: {
  recommendations: ProductRecommendation[]
  hasSalesData: boolean
}) {
  if (recommendations.length === 0) return null

  const bestSellers = recommendations.filter((entry) => entry.reason === 'best-seller')
  const suggestions = recommendations.filter((entry) => entry.reason !== 'best-seller')

  return (
    <section className="mt-14 border-t border-line pt-10" aria-label="More pieces to consider">
      {bestSellers.length > 0 && (
        <div>
          <RailHeading
            icon={<Flame className="size-3.5" />}
            title="Most sold at this shop"
            hint="Ranked from real sales, over the counter and online."
          />
          <Rail entries={bestSellers} className="mt-5" />
        </div>
      )}

      <div className={bestSellers.length > 0 ? 'mt-10' : ''}>
        <RailHeading
          icon={hasSalesData ? <Sparkles className="size-3.5" /> : <Gem className="size-3.5" />}
          title={hasSalesData ? 'You may also like' : 'More from this shop'}
          hint={
            hasSalesData
              ? 'Similar pieces from the same shelf.'
              : 'The shop has not recorded sales online yet, so these are suggestions rather than best sellers.'
          }
        />
        <Rail entries={suggestions} className="mt-5" />
      </div>
    </section>
  )
}

function RailHeading({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="sf-eyebrow">
          {icon}
          {title}
        </p>
        <p className="mt-2 text-xs leading-5" style={{ color: 'var(--sf-muted)' }}>
          {hint}
        </p>
      </div>
      <Link href="/#store" className="text-xs font-semibold transition hover:underline" style={{ color: 'var(--sf-maroon)' }}>
        See everything <ArrowRight className="inline size-3" />
      </Link>
    </header>
  )
}

function Rail({ entries, className = '' }: { entries: ProductRecommendation[]; className?: string }) {
  if (entries.length === 0) return null
  return (
    <ul
      className={`-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 ${className}`}
    >
      {entries.map((entry) => (
        <li key={entry.product.code} className="w-[9.5rem] shrink-0 snap-start sm:w-auto">
          <RecommendationCard entry={entry} />
        </li>
      ))}
    </ul>
  )
}

function RecommendationCard({ entry }: { entry: ProductRecommendation }) {
  const { product, sold, reason } = entry
  const hasDiscount = product.originalPrice > product.price
  const discountPct = hasDiscount
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0

  return (
    <Link
      href={`/product/${encodeURIComponent(String(product.code))}`}
      className="sf-card sf-card-sheen group flex h-full flex-col overflow-hidden"
    >
      <span className="sf-card-media relative block aspect-square overflow-hidden">
        <ProductImageSlider
          product={product}
          className="size-full"
          overlay={
            <>
              {reason === 'best-seller' && (
                <span
                  className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] uppercase pointer-events-none"
                  style={{ background: 'var(--sf-maroon)', color: '#fff' }}
                >
                  <Flame className="size-2.5" />
                  {sold > 1 ? `${sold} sold` : 'Popular'}
                </span>
              )}
              {hasDiscount && (
                <span
                  className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold pointer-events-none"
                  style={{ background: 'var(--sf-gold-deep)', color: '#fff' }}
                >
                  -{discountPct}%
                </span>
              )}
            </>
          }
        />
      </span>

      <span className="flex flex-1 flex-col p-3">
        <span className="text-[9px] font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--sf-gold-deep)' }}>
          {product.collection}
        </span>
        <span className="mt-1 line-clamp-2 text-xs leading-5 font-medium" style={{ color: 'var(--sf-heading)' }}>
          {product.name}
        </span>
        <span className="tnum mt-auto pt-2">
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold" style={{ color: 'var(--sf-maroon)' }}>
              {rupees(product.price)}
            </span>
            {hasDiscount && (
              <span className="text-[10px] line-through decoration-1 decoration-dashed" style={{ color: 'var(--sf-muted)' }}>
                {rupees(product.originalPrice)}
              </span>
            )}
          </span>
        </span>
      </span>
    </Link>
  )
}
