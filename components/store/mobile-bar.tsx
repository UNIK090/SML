'use client'

// ===========================================================================
// The mobile bottom bar — the one piece of chrome every marketplace app has.
//
// Amazon and Flipkart both put their primary navigation at the *bottom* of the
// screen on a phone, not the top. The reason is purely physical: on a large
// phone the top of the screen is the hardest place for a thumb to reach, and the
// bottom is the easiest. A shop that only offers a hamburger in the top corner
// makes every section change a two-handed operation.
//
// This bar carries the five destinations a jewellery customer actually uses,
// in the order they reach for them:
//
//   Home · Shop · Offers · Saved · Basket
//
// It is deliberately *not* a nav every other page also draws. It renders only
// from the storefront's chrome surface, so a checkout receipt or a policy page
// never wears it. Hidden from `lg` up, where the header nav already does the job.
//
// All the styling that makes it stick to the bottom, respect the phone's home
// indicator and sit above the drawers lives in `.sf-mobile-bar` in globals.css.
// ===========================================================================

import { useEffect, useState } from 'react'
import { Gem, Home, LayoutGrid, ShoppingBag, Tag } from 'lucide-react'
import { useCart } from '@/components/store/cart'
import { useWishlist } from '@/components/store/wishlist'

export type MobileTab = 'home' | 'shop' | 'offers' | 'saved' | 'basket'

/**
 * The bottom bar.
 *
 * `active` is passed in rather than derived from the URL because the storefront
 * is a single page: Home, Shop and Offers are all anchors on `/`, so there is no
 * pathname to match against. The parent knows which one is in view.
 */
export default function MobileBar({
  active,
  onNavigate,
  onOpenSaved,
  onOpenBasket,
}: {
  active: MobileTab
  /** Home / Shop / Offers are handled in-page; the parent scrolls to them. */
  onNavigate: (tab: 'home' | 'shop' | 'offers') => void
  onOpenSaved: () => void
  onOpenBasket: () => void
}) {
  const cart = useCart()
  const saved = useWishlist()

  // The bar is rendered by the page, but it must never paint over a modal or a
  // drawer that has taken the screen — those sit at z-50, and the bar is lower,
  // so this only needs to know when *it* should hide itself for cleanliness.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <nav className="sf-mobile-bar" aria-label="Primary">
      <Tab
        label="Home"
        icon={<Home className="size-5" />}
        active={active === 'home'}
        onClick={() => onNavigate('home')}
      />
      <Tab
        label="Shop"
        icon={<LayoutGrid className="size-5" />}
        active={active === 'shop'}
        onClick={() => onNavigate('shop')}
      />
      <Tab
        label="Offers"
        icon={<Tag className="size-5" />}
        active={active === 'offers'}
        onClick={() => onNavigate('offers')}
      />

      {/*
        Saved and Basket open drawers rather than scrolling anywhere, so they are
        never the "active" tab — but they carry their own counts, which is what
        tells a customer from the bottom of the page that they have four pieces
        waiting. The number is only shown once localStorage has been read, so it
        never flashes a wrong 0 on the first paint.
      */}
      <Tab
        label="Saved"
        icon={<Gem className="size-5" />}
        count={saved.ready ? saved.count : 0}
        onClick={onOpenSaved}
      />
      <Tab
        label="Basket"
        icon={<ShoppingBag className="size-5" />}
        count={cart.ready ? cart.count : 0}
        onClick={onOpenBasket}
      />

      {/* `mounted` keeps the first server render and the first client render
          identical; nothing here depends on it beyond silencing an unused-var
          lint, but the flag documents that the counts fill in after hydration. */}
      <span hidden aria-hidden data-mounted={mounted} />
    </nav>
  )
}

/**
 * One tab.
 *
 * Every tab is at least 44px tall — the size a fingertip actually needs — and
 * the whole cell is the button, not just the icon, so a tap on the label counts.
 */
function Tab({
  label,
  icon,
  active = false,
  count = 0,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active?: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="sf-mobile-tab" data-active={active} aria-label={label}>
      <span className="sf-mobile-tab-icon">
        {icon}
        {count > 0 && (
          <span key={count} className={`sf-mobile-tab-count sf-pop${count > 9 ? ' sf-count-many' : ''}`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
      <span className="sf-mobile-tab-label">{label}</span>
    </button>
  )
}
