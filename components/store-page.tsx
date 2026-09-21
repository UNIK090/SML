'use client'

// ===========================================================================
// The shop window: landing animation + the online store, in one page.
//
// Structure, top to bottom:
//   1. Hero          — masked headline lines, drifting gem, live stat strip
//   2. Marquee       — a gold ribbon of assurances
//   3. Collections   — the shop's own collections, with counts and prices
//   4. Store         — filters + animated product grid, basket in the header
//   5. Boutique      — visit / call / WhatsApp
//   6. Footer        — hours, address, and the discreet admin door
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
  Sparkles,
  Store as StoreIcon,
  Truck,
  X,
} from 'lucide-react'
import { CartProvider, useCart } from '@/components/store/cart'
import CartDrawer, { type PlacedOrder } from '@/components/store/cart-drawer'
import OrderSuccess from '@/components/store/order-success'
import ProductCard from '@/components/store/product-card'
import { useRevealOnScroll } from '@/components/store/reveal'
import { useApi } from '@/lib/use-api'
import { rupees, telLink, whatsappLink } from '@/lib/store'
import type { Shop, StoreCatalogue } from '@/lib/types'

const HERO_LINES = ['Jewellery that', 'carries your', 'story forward.']

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
  const [menuOpen, setMenuOpen] = useState(false)

  const shop = data?.shop ?? null
  const products = data?.products ?? []

  const findProduct = useCallback((code: number) => products.find((product) => product.code === code), [products])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      if (collection !== 'All' && product.collection !== collection) return false
      if (!term) return true
      return (
        product.name.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term) ||
        product.collection.toLowerCase().includes(term) ||
        String(product.code).includes(term)
      )
    })
  }, [products, collection, query])

  const priceFrom = products.length > 0 ? Math.min(...products.map((product) => product.price)) : 0
  const categoryCount = new Set(products.map((product) => product.category)).size
  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(
    shop?.whatsapp ?? shop?.phone,
    `Hello ${shop?.name ?? ''}, I would like to know more about your collection.`,
  )

  const jumpTo = (id: string, filter?: string) => {
    if (filter) setCollection(filter)
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="sf-canvas min-h-screen">
      {/* ------------------------------- Header ------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-night/72 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-7">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {data?.shop ? (
              <img
                src={`/api/brand?kind=logo&v=${encodeURIComponent(data.updatedAt)}`}
                alt=""
                className="size-10 shrink-0 rounded-2xl border-white/12 bg-white/5 object-contain p-1"
                onError={(event) => {
                  // A shop without a logo falls back to the mark, not a broken icon.
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-champagne to-[oklch(0.68_0.12_72)] text-ink shadow-lg">
              <Sparkles className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-[0.1em] text-white uppercase">
                {shop?.name ?? 'Sri Maha Laxmi Jewellers'}
              </span>
              <span className="block truncate text-[10px] tracking-[0.16em] text-champagne/70 uppercase">Fine jewellery</span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Sections">
            {[
              { label: 'Collections', id: 'collections' },
              { label: 'Shop', id: 'store' },
              { label: 'Boutique', id: 'boutique' },
              { label: 'Track order', id: 'track' },
            ].map((item) =>
              item.id === 'track' ? (
                <Link key={item.id} href="/track" className="rounded-full px-3.5 py-2 text-xs font-medium text-white/65 transition hover:bg-white/8 hover:text-white">
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.id}
                  onClick={() => jumpTo(item.id)}
                  className="rounded-full px-3.5 py-2 text-xs font-medium text-white/65 transition hover:bg-white/8 hover:text-white"
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            <span className="hidden items-center gap-2 rounded-full border-white/10 px-3 py-1.5 text-[10px] tracking-wide text-white/55 xl:flex">
              <span className="sf-live-dot" /> Store updated live
            </span>

            {call && (
              <a href={call} aria-label="Call the shop" className="sf-btn sf-btn-ghost hidden size-9 sm:flex">
                <Phone className="size-3.5" />
              </a>
            )}

            <button
              onClick={() => setBasketOpen(true)}
              className="sf-btn sf-btn-gold relative h-9 px-3.5 text-xs"
              aria-label={`Open basket, ${cart.count} items`}
            >
              <ShoppingBag className="size-3.5" />
              <span className="hidden sm:inline">Basket</span>
              {cart.ready && cart.count > 0 && (
                <span className="tnum absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-champagne ring-2 ring-night">
                  {cart.count}
                </span>
              )}
            </button>

            <button
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Menu"
              className="sf-btn sf-btn-ghost size-9 lg:hidden"
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="animate-rise-in border-t border-white/8 px-4 py-3 lg:hidden" aria-label="Sections">
            {[
              { label: 'Collections', id: 'collections' },
              { label: 'Shop the collection', id: 'store' },
              { label: 'Visit the boutique', id: 'boutique' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => jumpTo(item.id)}
                className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/75 transition hover:bg-white/8 hover:text-white"
              >
                {item.label}
              </button>
            ))}
            <Link href="/track" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-white/75 transition hover:bg-white/8 hover:text-white">
              Track an order
            </Link>
          </nav>
        )}
      </header>

      {/* -------------------------------- Hero -------------------------------- */}
      <section className="sf-hero relative overflow-hidden px-4 pt-14 pb-20 sm:px-7 sm:pt-20 lg:pt-24">
        <video className="sf-hero-video" autoPlay loop muted playsInline preload="metadata" aria-hidden="true">
          <source src="/media/jewellery-hero.mp4" type="video/mp4" />
        </video>
        <div className="sf-hero-tint" aria-hidden="true" />

        <div className="relative z-10 mx-auto grid w-full max-w-[1400px] items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            {/*
              While the catalogue is still loading, say nothing rather than
              "0 categories" — a number that is briefly and visibly wrong is
              worse than no number at all.
            */}
            <p className="sf-fade-up inline-flex items-center gap-2 rounded-full border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.2em] text-champagne uppercase">
              <BadgeCheck className="size-3.5" />
              {data ? `BIS hallmarked · ${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}` : 'BIS hallmarked gold & diamonds'}
            </p>

            <h1 className="mt-6 text-[2.6rem] leading-[1.06] font-semibold tracking-tight text-white sm:text-[3.4rem] lg:text-[4rem]">
              {HERO_LINES.map((line, index) => (
                <span key={line} className="sf-line-mask">
                  <span className="sf-line" style={{ animationDelay: `${160 + index * 130}ms` }}>
                    {index === 2 ? <span className="sf-gold-text">{line}</span> : line}
                  </span>
                </span>
              ))}
            </h1>

            <p className="sf-fade-up mt-6 max-w-xl text-sm leading-7 text-white/60 sm:text-base" style={{ animationDelay: '620ms' }}>
              {shop?.tagline ??
                'Hand-picked gold, diamond and temple jewellery — every piece hallmarked, every price shown plainly, and every order confirmed by a call from the shop.'}
            </p>

            <div className="sf-fade-up mt-8 flex-wrap items-center gap-3" style={{ animationDelay: '740ms' }}>
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
            <dl className="sf-fade-up mt-10 grid max-w-lg grid-cols-3 gap-3" style={{ animationDelay: '860ms' }}>
              {[
                { value: data ? String(products.length) : '—', label: products.length === 1 ? 'piece available' : 'pieces available' },
                { value: data ? String(data.collections.length) : '—', label: 'collections' },
                { value: data && products.length > 0 ? rupees(priceFrom) : '—', label: 'starting at' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border-white/10 bg-white/[0.035] px-4 py-3">
                  <dt className="tnum text-lg font-semibold text-white">{stat.value}</dt>
                  <dd className="mt-0.5 text-[10px] tracking-[0.1em] text-white/45 uppercase">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* A static faceted gem keeps the hero balanced without motion. */}
          <div className="relative mx-auto flex aspect-square w-full max-w-[26rem] items-center justify-center">
            <span className="sf-gem-ring" aria-hidden />
            <span className="sf-gem-ring-2" aria-hidden />
            <span className="sf-orbit-dot absolute" aria-hidden style={{ left: '50%' }} />
            <div className="sf-gem w-[58%]">
              <div className="sf-gem-core" />
            </div>

            <span className="absolute -bottom-2 left-0 rounded-2xl border-white/10 bg-ink/70 px-4 py-2.5 backdrop-blur sm:left-4">
              <span className="block text-[10px] tracking-[0.16em] text-champagne/80 uppercase">Since 1985</span>
              <span className="block text-xs text-white/70">Family-run, Nagaram</span>
            </span>
          </div>
        </div>
      </section>

      {/* ------------------------------ Marquee ------------------------------ */}
      <div className="overflow-hidden border-y border-white/8 bg-white/[0.02] py-3.5">
        <div className="sf-marquee gap-10">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 gap-10 pr-10" aria-hidden={copy === 1}>
              {[
                { icon: ShieldCheck, text: 'BIS hallmarked gold & diamonds' },
                { icon: Truck, text: 'Free insured delivery above ₹5,000' },
                { icon: Clock3, text: 'Order confirmed by phone within hours' },
                { icon: Gem, text: 'Lifetime polishing & resizing' },
                { icon: Package, text: 'Gift packing on request' },
              ].map((item) => (
                <span key={item.text} className="flex shrink-0 items-center gap-2.5 text-[11px] tracking-[0.16em] text-white/50 uppercase">
                  <item.icon className="size-3.5 text-champagne/80" />
                  {item.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------- Collections ---------------------------- */}
      <section id="collections" className="scroll-mt-24 px-4 py-20 sm:px-7">
        <div className="mx-auto w-full max-w-[1400px]">
          <header className="mb-10 flex-wrap items-end justify-between gap-5" data-reveal="up">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold tracking-[0.24em] text-champagne/80 uppercase">The collections</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Choose a mood, not a catalogue.</h2>
              <p className="mt-3 text-sm leading-7 text-white/55">
                Every shelf below is a group the shop maintains from its own billing desk — so what you see here is what is actually in
                the counter today.
              </p>
            </div>
            <button onClick={() => jumpTo('store')} className="sf-btn sf-btn-ghost h-10 px-5 text-xs">
              See everything <ArrowRight className="size-3.5" />
            </button>
          </header>

          {isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-3xl border-white/8 bg-white/[0.03]" />
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-3xl border-red-400/25 bg-red-500/8 px-5 py-4 text-sm text-red-200">
              {error} — the collection could not be loaded. Please refresh in a moment.
            </p>
          )}

          {!isLoading && !error && data && data.collections.length === 0 && (
            <div className="rounded-3xl border-white/10 bg-white/[0.03] px-6 py-12 text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-white/5 text-champagne/80">
                <Gem className="size-6" strokeWidth={1.4} />
              </span>
              <p className="text-sm font-medium text-white">The store is being prepared</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-white/50">
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
                    className="sf-card sf-card-sheen group relative overflow-hidden p-6 text-left"
                  >
                    <span className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-champagne/10 blur-2xl transition group-hover:bg-champagne/20" />
                    <span className="relative flex items-center justify-between">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-white/6 text-champagne">
                        <Gem className="size-5" strokeWidth={1.4} />
                      </span>
                      <span className="text-[10px] tracking-[0.16em] text-white/40 uppercase">{entry.count} pieces</span>
                    </span>
                    <span className="relative mt-6 block text-xl font-semibold text-white">{entry.name}</span>
                    <span className="relative mt-1.5 block text-xs text-white/50">
                      From {rupees(entry.from)}
                      {preview ? ` · e.g. ${preview.name}` : ''}
                    </span>
                    <span className="relative mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-champagne">
                      Browse <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------- Store ------------------------------- */}
      <section id="store" className="scroll-mt-24 border-t border-white/8 px-4 py-20 sm:px-7">
        <div className="mx-auto w-full max-w-[1400px]">
          <header className="mb-8 flex-wrap items-end justify-between gap-5" data-reveal="up">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold tracking-[0.24em] text-champagne/80 uppercase">Shop the collection</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Every piece, in one place.
              </h2>
            </div>
            <p className="text-xs text-white/45">
              {visible.length} of {products.length} shown
              {collection !== 'All' && ` in ${collection}`}
            </p>
          </header>

          {/* Filters */}
          <div className="mb-8 flex-col gap-4" data-reveal="up">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-champagne/70" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, category, or code — e.g. necklace, gold, 101"
                className="h-14 w-full rounded-2xl border-white/12 bg-white/[0.04] pr-4 pl-11 text-sm text-white transition placeholder:text-white/30 focus:border-champagne/60"
              />
            </label>

            {data && data.collections.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {['All', ...data.collections.map((entry) => entry.name)].map((name) => (
                  <button
                    key={name}
                    onClick={() => setCollection(name)}
                    data-active={collection === name}
                    className="sf-chip"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isLoading && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="animate-pulse overflow-hidden rounded-3xl border-white/8 bg-white/[0.03]">
                  <div className="aspect-[4/5] bg-white/[0.04]" />
                  <div className="space-y-2 p-4">
                    <div className="h-3 w-16 rounded bg-white/8" />
                    <div className="h-4 w-32 rounded bg-white/8" />
                    <div className="h-6 w-20 rounded bg-white/8" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && products.length > 0 && visible.length === 0 && (
            <div className="rounded-3xl border-white/10 bg-white/[0.03] px-6 py-14 text-center">
              <p className="text-sm font-medium text-white">Nothing matches that search</p>
              <p className="mt-2 text-xs text-white/50">Try a different word, or clear the filters to see the whole collection.</p>
              <button
                onClick={() => {
                  setQuery('')
                  setCollection('All')
                }}
                className="sf-btn sf-btn-ghost mt-5 h-10 px-5 text-xs"
              >
                Clear filters
              </button>
            </div>
          )}

          {visible.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((product, index) => (
                <ProductCard key={product.code} product={product} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------ Boutique ------------------------------ */}
      <section id="boutique" className="scroll-mt-24 border-t border-white/8 px-4 py-20 sm:px-7">
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="sf-card p-7 sm:p-9" data-reveal="left">
            <p className="text-[10px] font-semibold tracking-[0.24em] text-champagne/80 uppercase">Visit the boutique</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {shop?.name ?? 'Sri Maha Laxmi Jewellers'}
            </h2>
            <p className="mt-4 flex items-start gap-3 text-sm leading-7 text-white/60">
              <MapPin className="mt-1 size-4 shrink-0 text-champagne/80" />
              {shop?.address ?? 'Visit us at the shop — address will appear here once the profile is filled in.'}
            </p>

            <div className="mt-7 flex-wrap gap-3">
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
              <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-white/50 uppercase">
                <Clock3 className="size-3.5 text-champagne/80" /> Shop hours
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">{shop?.storeHours ?? 'Call the shop for today’s timings.'}</p>
              <p className="mt-4 border-t border-white/8 pt-4 text-xs leading-6 text-white/45">
                Orders placed online are confirmed by phone. Nothing is charged on the website — payment is settled at the shop or on
                delivery, whichever you prefer.
              </p>
            </div>

            <div className="sf-card p-7" data-reveal="right" data-reveal-delay={120}>
              <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-white/50 uppercase">
                <ShieldCheck className="size-3.5 text-champagne/80" /> Buying with confidence
              </p>
              <ul className="mt-3 flex-col gap-2.5 text-xs leading-6 text-white/60">
                <li>· Hallmarked purity on every gold piece</li>
                <li>· Lifetime polishing and resizing</li>
                <li>· Exchange within 30 days with the bill</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------- Footer ------------------------------- */}
      <footer className="border-t border-white/8 px-4 py-10 sm:px-7">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.12em] text-white uppercase">{shop?.name ?? 'Sri Maha Laxmi Jewellers'}</p>
            <p className="mt-1.5 text-xs text-white/45">
              {shop?.phone ? `${shop.phone} · ` : ''}
              {shop?.email ?? 'Reach us on WhatsApp or call for anything at all.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-white/45">
            <button onClick={() => jumpTo('store')} className="transition hover:text-white">
              Shop
            </button>
            <button onClick={() => jumpTo('boutique')} className="transition hover:text-white">
              Boutique
            </button>
            <Link href="/track" className="transition hover:text-white">
              Track order
            </Link>
            <Link href="/admin-login" className="inline-flex items-center gap-1.5 transition hover:text-champagne">
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
