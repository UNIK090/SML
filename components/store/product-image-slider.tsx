'use client'

// Product photo display for the storefront.
//
// Despite the name it carried before, this used to render exactly one image.
// It is now a gallery: a large photo with left/right arrows, shown only when
// the shop has uploaded more than one picture of the piece.
//
// Two behaviours matter more than the visuals:
//
//   1. A single-photo product must look exactly as it did before. Most pieces
//      have one photo, and arrows that have nowhere to go are worse than no
//      arrows at all, so they render only when `imageCount > 1`.
//   2. The bytes are fetched lazily. Only the photo actually on screen loads
//      eagerly; the rest wait until the customer arrows on to them.
//
// Urls are built from the product's `code` plus the position `n`, and are
// cache-busted by `imageVersion` — the item's updatedAt. The storefront caches
// product images for a year, so without that stamp a replaced photo would keep
// showing the old bytes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Gem } from 'lucide-react'
import type { StoreProduct } from '@/lib/types'

export type ProductImageSliderProps = {
  product: Pick<StoreProduct, 'code' | 'image' | 'imageVersion' | 'name'> & { imageCount?: number }
  className?: string
  /** Optional children rendered on top of the image (badges, codes). */
  overlay?: React.ReactNode
  /**
   * Set on the product page, where the photo is the main event and earns the
   * arrows. Left off on cards, which stay a single quiet image.
   */
  interactive?: boolean
  /** How the photo fills its frame. Cards crop to fill; the page fits it in. */
  fit?: 'cover' | 'contain'
}

/** Position 0 is the cover photo; 1… are the gallery shots, in shop order. */
export function storeImageUrl(product: { code: number; imageVersion: string }, position: number) {
  const version = encodeURIComponent(product.imageVersion)
  return position === 0
    ? `/api/store/image?code=${product.code}&v=${version}`
    : `/api/store/image?code=${product.code}&n=${position}&v=${version}`
}

export default function ProductImageSlider({
  product,
  className = '',
  overlay,
  interactive = false,
  fit = 'cover',
}: ProductImageSliderProps) {
  const count = Math.max(1, product.imageCount ?? 1)
  const [active, setActive] = useState(0)

  // If the shop removes photos while a customer is looking, the active index
  // can point past the end. Clamp it rather than showing a broken frame.
  useEffect(() => {
    if (active > count - 1) setActive(count - 1)
  }, [active, count])

  const go = useCallback((next: number) => setActive(Math.min(Math.max(next, 0), count - 1)), [count])

  // Arrow-key support, but only where the gallery is the main content. On a
  // grid card the arrows would fight the page scroll and fire on every card.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!interactive || count < 2) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(active + 1)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(active - 1)
    }
  }

  // Touch swipe, tracked with a ref so a drag does not re-render per frame.
  // Horizontal intent only: a mostly-vertical drag is the customer scrolling
  // the page, and hijacking that would make the gallery feel broken.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!interactive || count < 2 || !start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    go(dx < 0 ? active + 1 : active - 1)
  }

  if (!product.image) {
    return (
      <span className={`flex items-center justify-center ${className}`} aria-hidden style={{ color: 'var(--sf-gold-deep)' }}>
        <Gem className="size-9" strokeWidth={1.2} />
      </span>
    )
  }

  const showControls = interactive && count > 1

  return (
    <div className={`flex flex-col ${className}`}>
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onKeyDown={onKeyDown}
        onTouchStart={showControls ? onTouchStart : undefined}
        onTouchEnd={showControls ? onTouchEnd : undefined}
        tabIndex={showControls ? 0 : undefined}
        role={showControls ? 'group' : undefined}
        aria-label={showControls ? `${product.name} photos` : undefined}
      >
        <img
          src={storeImageUrl(product, active)}
          alt={active === 0 ? product.name : `${product.name} — photo ${active + 1}`}
          loading="eager"
          decoding="async"
          draggable={false}
          className={`size-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />

        {overlay}

        {showControls && (
          <>
            <button
              type="button"
              onClick={() => go(active - 1)}
              disabled={active === 0}
              aria-label="Previous photo"
              className="sf-gallery-arrow left-3"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go(active + 1)}
              disabled={active === count - 1}
              aria-label="Next photo"
              className="sf-gallery-arrow right-3"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
