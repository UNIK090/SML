'use client'

// ===========================================================================
// The chrome every storefront page outside the grid shares: the thin maroon
// utility strip, a compact white header, and the full footer.
//
// Before this existed, only the landing page and a product page had any
// navigation at all — a customer who opened /track, /search or a policy page
// landed on a screen with no way back to the shop except the browser button.
// That is fine for a checkout receipt and wrong for a shop: a customer reading
// a refund policy is deciding whether to trust us, and the answer should not be
// "press Back".
//
// The header here is deliberately shorter than the landing page's. It carries
// the shop's name, the four links customers actually use, a search box and the
// basket — no hero, no collection rails, nothing that competes with the page.
// ===========================================================================

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, Menu, Phone, Search, ShoppingBag, Store as StoreIcon, X } from 'lucide-react'
import { CartProvider, useCart } from '@/components/store/cart'
import { WishlistProvider } from '@/components/store/wishlist'
import CartDrawer, { type PlacedOrder } from '@/components/store/cart-drawer'
import MobileBar, { type MobileTab } from '@/components/store/mobile-bar'
import { SavedDrawer } from '@/components/store/store-extras'
import OrderSuccess from '@/components/store/order-success'
import { useApi } from '@/lib/use-api'
import { telLink } from '@/lib/store'
import { FOOTER_DISCOVER, FOOTER_HELP, FOOTER_QUICK } from '@/lib/pages'
import type { Shop, StoreCatalogue } from '@/lib/types'

/**
 * The links in the header, in the order a customer reaches for them.
 *
 * Fixed rather than derived from the catalogue, because a customer looking for
 * the refund policy does not care which collections exist — but a link to an
 * area the shop has nothing in would be worse than no link, so the ones that
 * depend on stock are checked against the catalogue before they render.
 */
const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/#store' },
  { label: 'Offers', href: '/#offers' },
  { label: 'Track order', href: '/track' },
]

export default function StoreShell({
  title,
  eyebrow,
  lead,
  children,
  /** Where the "back" control goes. Omitted on a page that is a destination. */
  back,
  /** Set when the page supplies its own hero and should not be given a title. */
  bare = false,
}: {
  title: string
  eyebrow?: string
  lead?: ReactNode
  children: ReactNode
  back?: { href: string; label: string }
  bare?: boolean
}) {
  return (
    <CartProvider>
      {/* The saved-pieces context every page's product cards read. The search
          page in particular renders the same `ProductCard` as the storefront,
          so it needs the provider the storefront gives it. */}
      <WishlistProvider>
        <Chrome title={title} eyebrow={eyebrow} lead={lead} back={back} bare={bare}>
          {children}
        </Chrome>
      </WishlistProvider>
    </CartProvider>
  )
}

function Chrome({
  title,
  eyebrow,
  lead,
  children,
  back,
  bare,
}: {
  title: string
  eyebrow?: string
  lead?: ReactNode
  children: ReactNode
  back?: { href: string; label: string }
  bare?: boolean
}) {
  const { data } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 120_000 })
  const cart = useCart()
  const router = useRouter()
  const pathname = usePathname()
  const [basketOpen, setBasketOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [placed, setPlaced] = useState<PlacedOrder | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [term, setTerm] = useState('')

  const shop = data?.shop ?? null
  const call = telLink(shop?.phone)
  const products = data?.products ?? []
  const findProduct = (code: number) => products.find((product) => product.code === code)

  /**
   * Which bottom-bar tab is lit on a page outside the storefront.
   *
   * Those pages *do* have a real pathname, so the tab is derived from it rather
   * than from a scroll position: the search page is Shop, anything else in the
   * shell is Home. Tapping a tab navigates — Home and Shop both resolve on `/`,
   * with the basket opening in place because it is the same drawer everywhere.
   */
  const activeTab: MobileTab =
    pathname === '/search' || pathname?.startsWith('/product') ? 'shop' : pathname?.startsWith('/orders') ? 'home' : 'home'

  const goToTab = (tab: 'home' | 'shop' | 'offers') => {
    if (tab === 'home') router.push('/')
    else if (tab === 'shop') router.push('/#store')
    else router.push('/#offers')
  }

  // The header should say what the page is — it is the only title a shared link
  // gets in a browser tab, and on a phone it is the tab strip.
  useEffect(() => {
    document.title = `${title} · ${shop?.name ?? 'Jewellery'}`
  }, [title, shop?.name])

  return (
    <div className="sf-canvas min-h-screen">
      <div className="sf-topbar px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[11px] sm:px-7 sm:py-2">
        <div className="mx-auto flex w-full max-w-[68rem] items-center justify-between gap-4">
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

      <header className="sf-header sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-[68rem] items-center gap-3 px-4 py-3 sm:px-7">
          {/* The same logo + name lockup the storefront uses, so the shop's
              identity is presented identically on every page the customer
              reaches — search, orders, a policy — not just the landing page. */}
          <Link href="/" className="sf-lockup flex min-w-0 flex-1 items-center gap-2.5 lg:flex-none">
            {shop ? (
              <img
                src={`/api/brand?kind=logo&v=${encodeURIComponent(data?.updatedAt ?? '1')}`}
                alt={`${shop.name} logo`}
                className="sf-lockup-logo"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <span className="flex min-w-0 flex-col justify-center">
              <span className="sf-lockup-name" title={shop?.name ?? 'Sri Maha Laxmi Jewellers'}>
                {shop?.name ?? 'Sri Maha Laxmi Jewellers'}
              </span>
              <span className="sf-lockup-tagline">Affordable jewellery</span>
            </span>
          </Link>

          {/* The middle of the row: the nav absorbs the free space and
              right-aligns itself, so the actions stay flush inside the header
              rather than being pushed past its edge. */}
          <nav className="hidden min-w-0 flex-1 items-center justify-end gap-1 lg:flex" aria-label="Sections">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-2 text-xs font-medium whitespace-nowrap transition hover:bg-black/5"
                style={{ color: 'var(--sf-heading)' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-2">
            {/*
              Search travels with the header, not on the page.
              It submits to /search rather than filtering in place, so a search
              can be bookmarked, shared and reached by the phone's back button —
              which is what a customer expects after tapping a result.
            */}
            <form action="/search" className="relative hidden sm:block">
              <input
                name="q"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="h-9 w-40 rounded-full border border-line bg-cream/60 pr-3 pl-8 text-xs transition focus:border-gold focus:bg-white xl:w-56"
                style={{ color: 'var(--sf-heading)' }}
              />
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" style={{ color: 'var(--sf-gold-deep)' }} />
            </form>

            <div className="relative shrink-0">
              <button
                onClick={() => setBasketOpen(true)}
                className="sf-btn sf-btn-gold h-9 px-3.5 text-xs"
                aria-label={`Open basket, ${cart.count} items`}
              >
                <ShoppingBag className="size-3.5" />
                <span className="hidden sm:inline">Basket</span>
              </button>
              {cart.ready && cart.count > 0 && (
                <span key={cart.count} className={`sf-count sf-pop${cart.count > 9 ? ' sf-count-many' : ''}`}>
                  {cart.count > 99 ? '99+' : cart.count}
                </span>
              )}
            </div>

            {/* Hidden by a wrapper: `.sf-btn` sets `display: inline-flex` and
                out-specifies Tailwind's `lg:hidden`, so the class on the button
                itself would leave the hamburger in the desktop header. */}
            <span className="flex lg:hidden">
              <button onClick={() => setMenuOpen((value) => !value)} aria-label="Menu" className="sf-btn sf-btn-ghost size-9">
                {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </button>
            </span>
          </div>
        </div>

        {menuOpen && (
          <nav className="animate-rise-in border-t border-line px-4 py-3 lg:hidden" aria-label="Sections">
            {NAV.concat([
              { label: 'Search products', href: '/search' },
              { label: 'My orders', href: '/orders' },
              { label: 'Our stores', href: '/pages/stores' },
            ]).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-cream"
                style={{ color: 'var(--sf-heading)' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-[68rem] px-4 py-8 sm:px-7 sm:py-12">
        {back && (
          <Link href={back.href} className="sf-btn sf-btn-ghost mb-6 h-9 px-3.5 text-xs">
            <ArrowLeft className="size-3.5" /> {back.label}
          </Link>
        )}

        {!bare && (
          <header className="mb-8 max-w-2xl">
            {eyebrow && <p className="sf-eyebrow">{eyebrow}</p>}
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[2.1rem]">{title}</h1>
            {lead && <p className="mt-3 text-sm leading-7">{lead}</p>}
          </header>
        )}

        {children}
      </main>

      <StoreFooter shop={shop} />

      <CartDrawer
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        shop={shop as (Shop & { whatsapp?: string | null; storeHours?: string | null }) | null}
        offer={data?.offer ?? null}
        findProduct={findProduct}
        onPlaced={(order) => {
          setBasketOpen(false)
          setPlaced(order)
        }}
      />

      {/* The saved-pieces drawer, so the bottom bar's Saved tab has somewhere to
          open on every page — not only on the landing page. */}
      <SavedDrawer open={savedOpen} onClose={() => setSavedOpen(false)} products={products} />

      {/* The same bottom navigation the storefront carries, so a customer who has
          wandered onto the search or a policy page still has the five places to
          go within thumb reach. */}
      <MobileBar
        active={activeTab}
        onNavigate={goToTab}
        onOpenSaved={() => setSavedOpen(true)}
        onOpenBasket={() => setBasketOpen(true)}
      />

      {placed && <OrderSuccess order={placed} shop={shop} onClose={() => setPlaced(null)} />}
    </div>
  )
}

/**
 * The footer every page carries.
 *
 * The three columns are the ones the counter sites all run — help, quick links,
 * discover — because a customer who has scrolled to the bottom is either
 * looking for a policy or looking for another shelf, and these answer both
 * without a search.
 */
export function StoreFooter({ shop }: { shop: Shop | null }) {
  const call = telLink(shop?.phone)
  const year = new Date().getFullYear()

  return (
    <footer className="sf-topbar mt-16 px-4 pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-12">
      <div className="mx-auto grid w-full max-w-[68rem] gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <p className="text-sm font-semibold text-white">{shop?.name ?? 'Sri Maha Laxmi Jewellers'}</p>
          <p className="mt-2 text-xs leading-6 text-white/60">
            {shop?.address ?? 'Our trusted destination for one-gram gold, panchaloha and silver jewellery — designed with tradition, priced for you.'}
          </p>
          {call && (
            <a href={call} className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/80 transition hover:text-white">
              <Phone className="size-3" /> {shop?.phone}
            </a>
          )}
          {shop?.storeHours && <p className="mt-2 text-xs text-white/55">{shop.storeHours}</p>}
        </div>

        <FooterColumn title="Help" links={FOOTER_HELP} />
        <FooterColumn title="Quick links" links={FOOTER_QUICK} />
        <FooterColumn title="Discover" links={FOOTER_DISCOVER} />
      </div>

      <div className="mx-auto mt-9 flex w-full max-w-[68rem] flex-col gap-3 border-t border-white/12 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-white/50">
          © {year} {shop?.name ?? 'Sri Maha Laxmi Jewellers'}. All rights reserved.
        </p>
        <div className="flex flex-wrap items-center gap-5 text-[11px] text-white/60">
          <Link href="/pages/about" className="transition hover:text-white">
            About
          </Link>
          <Link href="/pages/contact" className="transition hover:text-white">
            Contact
          </Link>
          <Link href="/admin-login" className="inline-flex items-center gap-1.5 transition hover:text-white">
            <StoreIcon className="size-3.5" /> Shop owner
          </Link>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.2em] text-white/45 uppercase">{title}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link href={link.href} className="text-xs text-white/72 transition hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
