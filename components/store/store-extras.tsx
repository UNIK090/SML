'use client'

// ===========================================================================
// Amazon-style storefront furniture.
//
// The pieces the big marketplaces all share that this shop kept missing, and
// that a customer has been trained by years of Amazon to expect:
//
//   · a "save for later" heart on every card, collected in a drawer
//   · a back-to-top button, because the catalogue is long by design
//
// Kept in one file because each is small. Nothing here fetches: everything
// reads props or context.
//
// Note: the section links used to live in a second sticky "department bar"
// layered under this header. That put two nav bars on screen at once, which
// read as a duplicated header — the sections now live in a thin strip *inside*
// the one header (see store-page.tsx), so there is a single bar at every width.
// ===========================================================================

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUp, ChevronRight, Heart, ShoppingBag, X } from 'lucide-react'
import { useWishlist } from '@/components/store/wishlist'
import { rupees } from '@/lib/store'

/* ---------------------------------------------------------------------------
   Saved pieces
   --------------------------------------------------------------------------- */

/** The heart that sits on a product tile. Filled once the piece is saved. */
export function SaveButton({
  code,
  name,
  price,
  imageVersion,
}: {
  code: number
  name: string
  price?: number
  imageVersion?: string
}) {
  const wishlist = useWishlist()
  const saved = wishlist.has(code)

  return (
    <button
      type="button"
      onClick={(event) => {
        // The heart sits inside the card's photo link, so a save must not also
        // navigate to the piece.
        event.preventDefault()
        event.stopPropagation()
        wishlist.toggle({ code, name, price, imageVersion })
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name} for later`}
      className="sf-save-heart"
      data-on={saved}
    >
      <Heart className={`size-3.5 ${saved ? 'fill-current' : ''}`} />
    </button>
  )
}

/**
 * The saved-pieces drawer.
 *
 * Slides in from the right like the basket, because it is the same kind of
 * thing: a shortlist the customer has set aside. Each row links back to the
 * piece and can be moved straight to the basket.
 */
export function SavedDrawer({
  open,
  onClose,
  products,
}: {
  open: boolean
  onClose: () => void
  /** The live catalogue, so a saved row can show its photo and true price. */
  products: { code: number; name: string; price: number; imageVersion: string }[]
}) {
  const wishlist = useWishlist()

  // Escape closes it, which is what a modal in this position owes the keyboard.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="sf-scrim fixed inset-0 z-50" onClick={onClose} aria-hidden />
      <aside className="sf-drawer fixed top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col bg-white" aria-label="Saved pieces">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
              Saved pieces
            </p>
            <p className="text-[11px]" style={{ color: 'var(--sf-muted)' }}>
              {wishlist.count === 0 ? 'Nothing saved yet' : `${wishlist.count} kept for later`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close saved pieces" className="sf-btn sf-btn-ghost size-9">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {wishlist.count === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex size-14 items-center justify-center rounded-full" style={{ background: 'var(--sf-gold-wash)', color: 'var(--sf-gold-deep)' }}>
                <Heart className="size-6" />
              </span>
              <p className="mt-4 text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
                Keep the pieces you like
              </p>
              <p className="mt-2 max-w-[16rem] text-xs leading-6" style={{ color: 'var(--sf-muted)' }}>
                Tap the heart on any piece to save it here for later.
              </p>
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {wishlist.items.map((saved) => {
              // Prefer the live catalogue for price and photo; fall back to the
              // snapshot so a piece that has just been unpublished still shows.
              const live = products.find((product) => product.code === saved.code)
              const name = live?.name ?? saved.name
              const price = live?.price ?? saved.price
              const version = live?.imageVersion ?? saved.imageVersion
              return (
                <li key={saved.code} className="sf-saved-row">
                  <Link href={`/product/${encodeURIComponent(String(saved.code))}`} className="sf-saved-thumb" onClick={onClose}>
                    {version ? (
                      <img src={`/api/store/image?id=${saved.code}&v=${encodeURIComponent(version)}`} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <ShoppingBag className="size-4" style={{ color: 'var(--sf-gold-deep)' }} />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/product/${encodeURIComponent(String(saved.code))}`} onClick={onClose} className="block">
                      <p className="line-clamp-2 text-xs font-medium" style={{ color: 'var(--sf-heading)' }}>
                        {name}
                      </p>
                    </Link>
                    <p className="tnum mt-1 text-sm font-semibold" style={{ color: 'var(--sf-maroon)' }}>
                      {rupees(price)}
                    </p>
                  </div>
                  <button
                    onClick={() => wishlist.remove(saved.code)}
                    aria-label={`Remove ${name} from saved`}
                    className="sf-btn sf-btn-ghost size-8 shrink-0"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {wishlist.count > 0 && (
          <footer className="border-t border-line px-5 py-4">
            <button onClick={wishlist.clear} className="sf-btn sf-btn-ghost h-10 w-full text-xs">
              Clear all saved pieces
            </button>
          </footer>
        )}
      </aside>
    </>
  )
}

/* ---------------------------------------------------------------------------
   Back to top
   --------------------------------------------------------------------------- */

/**
 * The button that takes the reader back up a long catalogue.
 *
 * Appears only once the reader is well down the page — on a short catalogue it
 * would never show at all — and scrolls without animation when the visitor has
 * asked for reduced motion.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 1.4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toTop = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }, [])

  return (
    <button
      onClick={toTop}
      aria-label="Back to top"
      className="sf-to-top"
      data-visible={visible}
    >
      <ArrowUp className="size-4" />
      <span className="hidden sm:inline">Top</span>
    </button>
  )
}

/* ---------------------------------------------------------------------------
   A section heading with a "see all" — used by the new feature rails
   --------------------------------------------------------------------------- */

export function RailHeader({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow: string
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-xl">
        <p className="sf-eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {hint && (
          <p className="mt-2 text-xs leading-6" style={{ color: 'var(--sf-muted)' }}>
            {hint}
          </p>
        )}
      </div>
      {action}
    </header>
  )
}

/** A small chevron link, the pattern every "View all" in a rail uses. */
export function ViewAllLink({ onClick, children = 'View all' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--sf-maroon)' }}>
      {children} <ChevronRight className="size-3.5" />
    </button>
  )
}
