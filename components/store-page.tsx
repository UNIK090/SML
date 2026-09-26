'use client'

// ===========================================================================
// The shop window: landing page + the online store, in one page.
//
// Modelled on the familiar Indian jewellery-counter layout — a thin maroon
// utility bar, a clean white header, a short cream banner, round "shop by"
// shortcuts, then a dense grid of white product tiles. Nothing hides behind a
// cinematic dark hero; the customer sees the collection immediately.
//
// Structure, top to bottom:
//   1. Utility bar   — offers / track order / shop owner door
//   2. Header        — logo, plain nav, basket
//   3. Banner        — short cream hero with live shop numbers
//   4. Trust strip   — affordable materials / delivery assurances
//   5. Shop by       — round collection shortcuts
//   6. Collections   — the shop's own collections, with counts and prices
//   7. Store         — search + filters + product grid
//   8. Boutique      — visit / call / WhatsApp
//   9. Footer        — hours, address, admin door
//
// Everything below reads from two sources: the public catalogue endpoint (for
// products and shop details) and the basket context (for what the customer has
// chosen). No admin endpoint is touched from this page.
// ===========================================================================

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Gem,
  MapPin,
  Menu,
  Package,
  Phone,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store as StoreIcon,
  Truck,
  X,
} from 'lucide-react'
import { CartProvider, useCart } from '@/components/store/cart'
import CartDrawer, { type PlacedOrder } from '@/components/store/cart-drawer'
import OrderSuccess from '@/components/store/order-success'
import ProductCard from '@/components/store/product-card'
import {
  BestSellersRail,
  BudgetRail,
  CategoryRail,
  CollectionStories,
  CounterNotice,
  OfferBanner,
  OfferCards,
  OrderSteps,
  PromiseBand,
} from '@/components/store/store-sections'
import { useRevealOnScroll } from '@/components/store/reveal'
import { useApi } from '@/lib/use-api'
import { rupees, telLink, whatsappLink } from '@/lib/store'
import type { PriceBand, Shop, StoreCatalogue } from '@/lib/types'

const HERO_LINES = ['Style that looks', 'like gold, priced', 'for you.']

export default function StorePage() {
  return (
    <CartProvider>
      <ShopWindow />
    </CartProvider>
  )
}

function ShopWindow() {
  const { data, isLoading, error } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 60_000 })
  const cart = useCart()
  useRevealOnScroll()

  const [basketOpen, setBasketOpen] = useState(false)
  const [placed, setPlaced] = useState<PlacedOrder | null>(null)
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('All')
  const [category, setCategory] = useState('All')
  const [band, setBand] = useState<PriceBand | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const shop = data?.shop ?? null
  const products = data?.products ?? []

  const findProduct = useCallback((code: number) => products.find((product) => product.code === code), [products])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      if (collection !== 'All' && product.collection !== collection) return false
      if (category !== 'All' && product.category !== category) return false
      if (band && !(product.price >= band.from && product.price < band.to)) return false
      if (!term) return true
      return (
        product.name.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term) ||
        product.collection.toLowerCase().includes(term) ||
        String(product.code).includes(term)
      )
    })
  }, [products, collection, category, band, query])

  const priceFrom = products.length > 0 ? Math.min(...products.map((product) => product.price)) : 0
  const categoryCount = new Set(products.map((product) => product.category)).size
  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(
    shop?.whatsapp ?? shop?.phone,
    `Hello ${shop?.name ?? ''}, I would like to know more about your collection.`,
  )

  /**
   * The festival offer, when one is running.
   *
   * Nothing is derived here beyond the browse target: the server has already
   * decided whether it is live and how long is left, against the shop's own
   * business day.
   */
  const offer = data?.offer ?? null

  /**
   * The offers that belong on the card board.
   *
   * Served separately from the banner offer because a shop can keep a small
   * announcement out of the card grid, and only one of these is used as the
   * leading strip. Tapping a card opens the full collection filtered to what
   * the shop sells — no offer can link to a shelf that does not exist.
   */
  const offerCards = data?.offers ?? []

  /**
   * The shelf of pieces the page leads with.
   *
   * When the shop has genuinely sold something the rail is its best sellers and
   * says so. Otherwise it shows the newest pieces under a "New at the counter"
   * heading — a full shelf with an honest label, never a false best seller.
   */
  const bestSellers = (data?.bestSellers ?? []).slice(0, 8)
  const hasSalesData = bestSellers.length > 0
  const soldCounts = data?.soldCounts ?? {}
  // Two or more pieces makes a shelf worth showing; a single piece is already
  // the whole catalogue, and repeating it as a row looks like a mistake.
  const shelfProducts = hasSalesData ? bestSellers : products.slice(0, 8)
  const showShelf = products.length >= 2 && shelfProducts.length >= 2

  const jumpTo = (id: string, filter?: string) => {
    if (filter) setCollection(filter)
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** Clears every filter and opens the full grid. */
  const openStore = (patch?: { collection?: string; category?: string; band?: PriceBand | null }) => {
    setQuery('')
    setCollection(patch?.collection ?? 'All')
    setCategory(patch?.category ?? 'All')
    setBand(patch?.band ?? null)
    document.getElementById('store')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="sf-canvas min-h-screen">
      {/* ---------------------------- Utility bar ---------------------------- */}
      <div className="sf-topbar px-4 py-2 text-[11px] sm:px-7">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4">
          <p className="truncate">One-gram gold · Panchaloha · Silver · Beautiful designs at affordable prices</p>
          <div className="hidden shrink-0 items-center gap-5 sm:flex">
            <Link href="/track" className="transition hover:text-white">
              Track order
            </Link>
            {call && (
              <a href={call} className="inline-flex items-center gap-1.5 transition hover:text-white">
                <Phone className="size-3" /> {shop?.phone}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------- Header ------------------------------- */}
      <header className="sf-header sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3.5 sm:px-7">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {data?.shop ? (
              <img
                src={`/api/brand?kind=logo&v=${encodeURIComponent(data.updatedAt)}`}
                alt=""
                className="size-11 shrink-0 rounded-lg border border-line bg-cream object-contain p-1"
                onError={(event) => {
                  // A shop without a logo falls back to the mark, not a broken icon.
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold tracking-[0.08em] text-maroon uppercase sm:text-lg">
                {shop?.name ?? 'Sri Maha Laxmi Jewellers'}
              </span>
              <span className="block truncate text-[10px] tracking-[0.22em] uppercase" style={{ color: 'var(--sf-muted)' }}>
                Affordable jewellery
              </span>
            </span>
          </Link>

            <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Sections">
            {[
              { label: 'Collections', id: 'collections' },
              // Offers is placed second: during a festival it is the reason most
              // customers came, and it is the section that changes fastest.
              { label: 'Offers', id: 'offers' },
              { label: 'Shop', id: 'store' },
              { label: 'Boutique', id: 'boutique' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => jumpTo(item.id)}
                className="rounded-md px-3.5 py-2 text-sm font-medium transition hover:bg-cream hover:text-maroon"
                style={{ color: 'var(--sf-heading)' }}
              >
                {item.label}
              </button>
            ))}
            <Link
              href="/track"
              className="rounded-md px-3.5 py-2 text-sm font-medium transition hover:bg-cream hover:text-maroon"
              style={{ color: 'var(--sf-heading)' }}
            >
              Track order
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-3">
            <span
              className="hidden items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase xl:flex"
              style={{ color: 'var(--sf-muted)' }}
            >
              <BadgeCheck className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Affordable styles
            </span>

            {call && (
              <a href={call} aria-label="Call the shop" className="sf-btn sf-btn-ghost hidden size-10 sm:flex">
                <Phone className="size-4" />
              </a>
            )}

            <button
              onClick={() => setBasketOpen(true)}
              className="sf-btn sf-btn-gold relative h-10 px-4 text-sm"
              aria-label={`Open basket, ${cart.count} items`}
            >
              <ShoppingBag className="size-4" />
              <span className="hidden sm:inline">Basket</span>
              {cart.ready && cart.count > 0 && (
                <span className="tnum absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-maroon ring-2 ring-white">
                  {cart.count}
                </span>
              )}
            </button>

            <button
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Menu"
              className="sf-btn sf-btn-ghost size-10 lg:hidden"
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="animate-rise-in border-t border-line px-4 py-3 lg:hidden" aria-label="Sections">
            {[
              { label: 'Collections', id: 'collections' },
              { label: 'Offers', id: 'offers' },
              { label: 'Shop the collection', id: 'store' },
              { label: 'Visit the boutique', id: 'boutique' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => jumpTo(item.id)}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-cream"
                style={{ color: 'var(--sf-heading)' }}
              >
                {item.label}
              </button>
            ))}
            <Link
              href="/track"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm transition hover:bg-cream"
              style={{ color: 'var(--sf-heading)' }}
            >
              Track an order
            </Link>
          </nav>
        )}
      </header>

      {/* -------------------------------- Banner -------------------------------- */}
      <section className="sf-hero px-4 pt-14 pb-14 sm:px-7 sm:pt-16 sm:pb-16">
        <div className="relative z-10 mx-auto grid w-full max-w-[1400px] items-center gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-12">
          <div className="max-w-2xl">
            {/*
              While the catalogue is still loading, say nothing rather than
              "0 categories" — a number that is briefly and visibly wrong is
              worse than no number at all.
            */}
            <p
              className="sf-fade-up inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase"
              style={{ background: 'var(--sf-maroon)', color: '#fff' }}
            >
              <BadgeCheck className="size-3.5" style={{ color: 'var(--sf-gold-ink)' }} />
              {data ? `Affordable styles · ${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}` : 'One-gram gold · panchaloha · silver'}
            </p>

            <h1 className="mt-6 text-[2.4rem] leading-[1.06] font-semibold tracking-[-0.02em] sm:text-[3.2rem] lg:text-[3.6rem]">
              {HERO_LINES.map((line, index) => (
                <span key={line} className="sf-line-mask">
                  <span className="sf-line" style={{ animationDelay: `${160 + index * 130}ms` }}>
                    {index === 2 ? <span className="sf-gold-text">{line}</span> : line}
                  </span>
                </span>
              ))}
            </h1>

            <p className="sf-fade-up mt-6 max-w-xl text-sm leading-7 sm:text-base" style={{ animationDelay: '520ms' }}>
              {shop?.tagline ??
                'Discover one-gram gold, panchaloha and silver jewellery with the rich look of gold designs at prices that fit your budget.'}
            </p>

            <div className="sf-fade-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '640ms' }}>
              <button onClick={() => jumpTo('store')} className="sf-btn sf-btn-gold h-12 px-6 text-sm">
                Explore the collection <ArrowRight className="size-4" />
              </button>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-12 px-6 text-sm">
                  Ask on WhatsApp
                </a>
              )}
            </div>

            {/* Live stats — these are the shop's real numbers, not decoration. */}
            <dl className="sf-fade-up mt-9 grid max-w-lg grid-cols-3 gap-3" style={{ animationDelay: '760ms' }}>
              {[
                { value: data ? String(products.length) : '—', label: products.length === 1 ? 'piece available' : 'pieces available' },
                { value: data ? String(data.collections.length) : '—', label: 'collections' },
                { value: data && products.length > 0 ? rupees(priceFrom) : '—', label: 'starting at' },
              ].map((stat) => (
                <div key={stat.label} className="sf-stat px-4 py-3">
                  <dt className="tnum text-lg font-semibold" style={{ color: 'var(--sf-heading)' }}>
                    {stat.value}
                  </dt>
                  <dd className="mt-0.5 text-[10px] tracking-[0.1em] uppercase" style={{ color: 'var(--sf-muted)' }}>
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="sf-hero-video-card" data-reveal="right">
            <video className="sf-hero-video" autoPlay loop muted playsInline preload="metadata" aria-label="Jewellery collection video">
              <source src="/media/BG.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      {/* --------------------------- Festival offer --------------------------- */}
      {offer && <OfferBanner offer={offer} onShop={() => openStore()} />}

      {/* ---------------------------- Offer board ---------------------------- */}
      <OfferCards offers={offerCards} onSelect={() => openStore()} />

      {/* ------------------------------ Trust strip ------------------------------ */}
      <div className="sf-trust-strip px-4 py-4 sm:px-7">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-center gap-x-8 gap-y-3 lg:justify-between">
          {[
            { icon: Gem, text: 'One-gram gold, panchaloha & silver' },
            { icon: ShieldCheck, text: 'Gold-look designs at easy prices' },
            { icon: Clock3, text: 'Order confirmation within hours' },
            { icon: Truck, text: 'Delivery arranged by the shop' },
            { icon: Package, text: 'Gift packing on request' },
          ].map((item) => (
            <span
              key={item.text}
              className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] uppercase"
              style={{ color: 'var(--sf-heading)' }}
            >
              <item.icon className="size-4" style={{ color: 'var(--sf-gold-deep)' }} strokeWidth={1.6} />
              {item.text}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------------------- Shop by type ---------------------------- */}
      {data && data.collections.length > 0 && (
        <section className="px-4 py-14 sm:px-7">
          <div className="mx-auto w-full max-w-[1400px]">
            <header className="mb-8 text-center" data-reveal="up">
              <p className="sf-eyebrow">Shop by</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Find your piece in a tap</h2>
            </header>

            <div className="flex flex-wrap justify-center gap-6 sm:gap-8" data-reveal="up">
              {data.collections.slice(0, 8).map((entry) => {
                const preview = products.find((product) => product.collection === entry.name)
                return (
                  <button key={entry.name} onClick={() => jumpTo('store', entry.name)} className="sf-circle w-24">
                    <span className="sf-circle-ring">
                      {preview?.image ? (
                        <img
                          src={`/api/store/image?id=${preview.code}&v=${encodeURIComponent(preview.imageVersion)}`}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Gem className="size-7" style={{ color: 'var(--sf-gold-deep)' }} strokeWidth={1.3} />
                      )}
                    </span>
                    <span className="text-center text-xs font-medium leading-5" style={{ color: 'var(--sf-heading)' }}>
                      {entry.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* --------------------------- Shop by category --------------------------- */}
      {data && (
        <CategoryRail
          categories={data.categoryRails}
          onSelect={(next) => openStore({ category: next })}
          onViewAll={() => openStore()}
        />
      )}

      {/* ---------------------- Most loved / new arrivals ---------------------- */}
      {data && showShelf && (
        <BestSellersRail
          products={shelfProducts}
          hasSalesData={hasSalesData}
          sold={soldCounts}
          onViewAll={() => openStore()}
        />
      )}

      {/* ---------------------------- Shop in budget ---------------------------- */}
      {data && <BudgetRail bands={data.priceBands} activeBand={band} onSelect={(next) => openStore({ band: next })} />}

      {/* ------------------------- The collection story ------------------------- */}
      {data && (
        <CollectionStories collections={data.collections} onSelect={(name) => openStore({ collection: name })} />
      )}

      {/* ---------------------------- Collections ---------------------------- */}
      <section id="collections" className="sf-band scroll-mt-28 border-t border-line px-4 py-16 sm:px-7">
        <div className="mx-auto w-full max-w-[1400px]">
          <header className="mb-10 flex flex-wrap items-end justify-between gap-5" data-reveal="up">
            <div className="max-w-2xl">
              <p className="sf-eyebrow">The collections</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[2rem]">Find your design, within your budget.</h2>
              <p className="mt-3 text-sm leading-7">
                Explore one-gram gold, panchaloha and silver designs for daily wear, gifting and celebrations. Every shelf is updated
                by the shop, so you see what is available at the counter today.
              </p>
            </div>
            <button onClick={() => jumpTo('store')} className="sf-btn sf-btn-ghost h-10 px-5 text-xs">
              See everything <ArrowRight className="size-3.5" />
            </button>
          </header>

          {isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-xl border border-line bg-white" />
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error} — the collection could not be loaded. Please refresh in a moment.
            </p>
          )}

          {!isLoading && !error && data && data.collections.length === 0 && (
            <div className="rounded-xl border border-line bg-white px-6 py-12 text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-gold-deep)' }}>
                <Gem className="size-6" strokeWidth={1.4} />
              </span>
              <p className="text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
                The store is being prepared
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-6">
                Pieces appear here the moment the shop publishes them. Call or WhatsApp in the meantime and we will show you what is
                in the counter.
              </p>
              {call && (
                <a href={call} className="sf-btn sf-btn-gold mt-6 h-11 px-6 text-sm">
                  <Phone className="size-4" /> Call {shop?.phone}
                </a>
              )}
            </div>
          )}

          {data && data.collections.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.collections.map((entry, index) => {
                const preview = products.find((product) => product.collection === entry.name)
                return (
                  <button
                    key={entry.name}
                    onClick={() => jumpTo('store', entry.name)}
                    data-reveal="up"
                    data-reveal-delay={index * 80}
                    className="sf-card group flex items-center gap-4 p-5 text-left"
                  >
                    <span className="sf-circle-ring" style={{ width: '4rem', height: '4rem', flexShrink: 0 }}>
                      {preview?.image ? (
                        <img
                          src={`/api/store/image?id=${preview.code}&v=${encodeURIComponent(preview.imageVersion)}`}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Gem className="size-6" style={{ color: 'var(--sf-gold-deep)' }} strokeWidth={1.3} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold" style={{ color: 'var(--sf-heading)' }}>
                        {entry.name}
                      </span>
                      <span className="mt-1 block text-xs" style={{ color: 'var(--sf-muted)' }}>
                        {entry.count} pieces · from {rupees(entry.from)}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--sf-maroon)' }}>
                        Browse <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------- Store ------------------------------- */}
      <section id="store" className="scroll-mt-28 border-t border-line px-3 py-12 sm:px-7 sm:py-16">
        <div className="mx-auto w-full max-w-[1400px]">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8" data-reveal="up">
            <div className="max-w-2xl">
              <p className="sf-eyebrow">Shop the collection</p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-[2rem]">Beautiful jewellery at easy prices.</h2>
            </div>
            <p className="text-xs" style={{ color: 'var(--sf-muted)' }}>
              {visible.length} of {products.length} shown
              {collection !== 'All' && ` in ${collection}`}
              {category !== 'All' && ` · ${category}`}
              {band && ` · ${band.label}`}
            </p>
          </header>

          {/* Filters */}
          <div className="mb-6 flex flex-col gap-3" data-reveal="up">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2" style={{ color: 'var(--sf-gold-deep)' }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, category, or code — e.g. one-gram, panchaloha, silver"
                className="h-11 w-full rounded-lg border border-line bg-white pr-3.5 pl-10 text-[13px] transition focus:border-gold"
                style={{ color: 'var(--sf-heading)' }}
              />
            </label>

            {/*
              The collection filter. Each chip carries its own count, so a
              customer can see that a shelf has two pieces in it before tapping
              it and finding an almost-empty grid.
            */}
            {data && data.collections.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setCollection('All')}
                  data-active={collection === 'All'}
                  className="sf-chip"
                >
                  All<span className="sf-chip-count">{products.length}</span>
                </button>

                {data.collections.map((entry) => (
                  <button
                    key={entry.name}
                    onClick={() => setCollection(entry.name)}
                    data-active={collection === entry.name}
                    aria-pressed={collection === entry.name}
                    className="sf-chip"
                  >
                    {entry.name}
                    <span className="sf-chip-count">{entry.count}</span>
                  </button>
                ))}

                {collection !== 'All' && (
                  <button
                    onClick={() => setCollection('All')}
                    className="ml-0.5 text-[11px] transition hover:underline"
                    style={{ color: 'var(--sf-muted)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/*
              Category chips sit under the collection chips. They are a second
              axis — a collection is the shelf the shop arranged, a category is
              the kind of piece — and a customer may want either, or both. Only
              categories the shop stocks are listed, and the row is hidden when
              the shop has just one kind of piece.
            */}
            {data && data.categoryRails.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="mr-1 text-[10px] font-semibold tracking-[0.14em] uppercase"
                  style={{ color: 'var(--sf-muted)' }}
                >
                  Kind
                </span>
                <button onClick={() => setCategory('All')} data-active={category === 'All'} className="sf-chip">
                  All kinds
                </button>

                {data.categoryRails.map((entry) => (
                  <button
                    key={entry.name}
                    onClick={() => setCategory(entry.name)}
                    data-active={category === entry.name}
                    aria-pressed={category === entry.name}
                    className="sf-chip"
                  >
                    {entry.name}
                    <span className="sf-chip-count">{entry.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* The budget filter, shown only once a band is holding it. */}
            {band && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-white"
                  style={{ background: 'var(--sf-maroon)' }}
                >
                  {band.label}
                  <button onClick={() => setBand(null)} aria-label={`Remove the ${band.label} filter`}>
                    ×
                  </button>
                </span>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="animate-pulse overflow-hidden rounded-lg border border-line bg-white">
                  <div className="aspect-square bg-cream-soft" />
                  <div className="space-y-2 p-3">
                    <div className="h-2.5 w-12 rounded bg-cream-soft" />
                    <div className="h-3.5 w-24 rounded bg-cream-soft" />
                    <div className="h-5 w-16 rounded bg-cream-soft" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && products.length > 0 && visible.length === 0 && (
            <div className="rounded-xl border border-line bg-white px-6 py-14 text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
                Nothing matches that search
              </p>
              <p className="mt-2 text-xs">Try a different word, or clear the filters to see the whole collection.</p>
              <button
                onClick={() => {
                  setQuery('')
                  setCollection('All')
                  setCategory('All')
                  setBand(null)
                }}
                className="sf-btn sf-btn-ghost mt-5 h-10 px-5 text-xs"
              >
                Clear filters
              </button>
            </div>
          )}

          {visible.length > 0 && (
            /*
              A denser, Amazon-style grid.

              The tiles were nearly double-height before: a 4:5 photo, then a
              description, a "save" line and two action links stacked inside.
              On a phone that meant roughly one-and-a-half products per screen.

              The grid now steps up the columns much earlier — 2 on the
              smallest phones, 3 on a large phone, then 4, 5 and 6 — because a
              jewellery catalogue is scanned by photo, and more pieces on
              screen is what makes a shop look stocked.
            */
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {visible.map((product, index) => (
                <ProductCard
                  key={product.code}
                  product={product}
                  index={index}
                  whatsapp={shop?.whatsapp ?? shop?.phone}
                  shopName={shop?.name}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* --------------------------- Counter notice --------------------------- */}
      <CounterNotice
        shop={shop as (Shop & { storeHours?: string | null }) | null}
        whatsapp={whatsapp}
        onBrowse={() => openStore()}
      />

      {/* ------------------------------ Boutique ------------------------------ */}
      <section id="boutique" className="sf-band scroll-mt-28 border-t border-line px-4 py-16 sm:px-7">
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="sf-card p-7 sm:p-9" data-reveal="left">
            <p className="sf-eyebrow">Visit the boutique</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {shop?.name ?? 'Sri Maha Laxmi Jewellers'}
            </h2>
            <p className="mt-4 flex items-start gap-3 text-sm leading-7">
              <MapPin className="mt-1 size-4 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
              {shop?.address ?? 'Visit us at the shop — address will appear here once the profile is filled in.'}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              {call && (
                <a href={call} className="sf-btn sf-btn-gold h-11 px-5 text-sm">
                  <Phone className="size-4" /> {shop?.phone}
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
                  WhatsApp us
                </a>
              )}
              <Link href="/track" className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
                <Package className="size-4" /> Track an order
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="sf-card p-7" data-reveal="right">
              <p
                className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] uppercase"
                style={{ color: 'var(--sf-heading)' }}
              >
                <Clock3 className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Shop hours
              </p>
              <p className="mt-3 text-sm leading-6">{shop?.storeHours ?? 'Call the shop for today timings.'}</p>
              <p className="mt-4 border-t border-line pt-4 text-xs leading-6" style={{ color: 'var(--sf-muted)' }}>
                Orders placed online are confirmed by phone. Nothing is charged on the website — payment is settled at the shop or on
                delivery, whichever you prefer.
              </p>
            </div>

            <div className="sf-card p-7" data-reveal="right" data-reveal-delay={120}>
              <p
                className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] uppercase"
                style={{ color: 'var(--sf-heading)' }}
              >
                <ShieldCheck className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Buying with confidence
              </p>
              <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-6">
                <li>· One-gram gold, panchaloha and silver options</li>
                <li>· Prices shown clearly before you order</li>
                <li>· Speak with our team for product care and exchange details</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- How ordering works ---------------------------- */}
      <OrderSteps shop={shop as (Shop & { storeHours?: string | null }) | null} />

      {/* ------------------------------- Promise ------------------------------- */}
      <PromiseBand />

      {/* ------------------------------- Footer ------------------------------- */}
      <footer className="sf-topbar px-4 py-10 sm:px-7">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.12em] text-white uppercase">{shop?.name ?? 'Sri Maha Laxmi Jewellers'}</p>
            <p className="mt-1.5 text-xs text-white/60">
              {shop?.phone ? `${shop.phone} · ` : ''}
              {shop?.email ?? 'Affordable one-gram gold, panchaloha and silver jewellery.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-white/70">
            <button onClick={() => jumpTo('store')} className="transition hover:text-white">
              Shop
            </button>
            <button onClick={() => jumpTo('boutique')} className="transition hover:text-white">
              Boutique
            </button>
            <Link href="/track" className="transition hover:text-white">
              Track order
            </Link>
            <Link href="/admin-login" className="inline-flex items-center gap-1.5 transition hover:text-white">
              <StoreIcon className="size-3.5" /> Shop owner
            </Link>
          </div>
        </div>
      </footer>

      {/* ------------------------------ Overlays ------------------------------ */}
      <CartDrawer
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        shop={shop as (Shop & { whatsapp?: string | null; storeHours?: string | null }) | null}
        findProduct={findProduct}
        onPlaced={(order) => {
          setBasketOpen(false)
          setPlaced(order)
        }}
      />

      {placed && <OrderSuccess order={placed} shop={shop} onClose={() => setPlaced(null)} />}
    </div>
  )
}
