'use client'

// Lightweight image slider for storefront product galleries.
//
// Supports: touch swipe, dot navigation, optional auto-advance, left/right
// arrows, and an image counter (1/4). The image URLs are built from the
// product's `code` and `imageVersion` (cache-buster) plus a per-image `index`
// query parameter served by `/api/store/image`.
//
// The component intentionally has zero outside libraries: the storefront is
// what customers load first, so drag and pointer events are kept pure React.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Gem } from 'lucide-react'
import type { StoreProduct } from '@/lib/types'

type SliderKind = 'card' | 'page' | 'recommendation'

export type ProductImageSliderProps = {
  product: Pick<StoreProduct, 'code' | 'image' | 'imageVersion' | 'imageCount' | 'name'>
  /** Visual style + behavior tuning. */
  kind?: SliderKind
  className?: string
  /** Optional children rendered on top of the image (badges, codes). */
  overlay?: React.ReactNode
}

export default function ProductImageSlider({ product, kind = 'card', className = '', overlay }: ProductImageSliderProps) {
  const imageCount = Math.max(0, product.imageCount ?? (product.image ? 1 : 0))
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const deltaX = useRef(0)

  const clamped = (n: number) => Math.max(0, Math.min(imageCount - 1, n))
  const next = useCallback(() => setIndex((i) => clamped((i + 1) % Math.max(1, imageCount))), [imageCount])
  const prev = useCallback(() => setIndex((i) => clamped((i - 1 + Math.max(1, imageCount)) % Math.max(1, imageCount))), [imageCount])

  // Thumbnail strip (or any parent) can drive the selected image via a custom
  // event, avoiding prop-drilling of slider state through the page component.
  useEffect(() => {
    const onSetIndex = (e: Event) => {
      const ev = e as CustomEvent<{ code: number; index: number }>
      if (ev.detail?.code !== product.code) return
      setIndex(clamped(ev.detail.index))
    }
    window.addEventListener('pp:set-index', onSetIndex as EventListener)
    return () => window.removeEventListener('pp:set-index', onSetIndex as EventListener)
  }, [product.code]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to hero if the product code changes (page navigation).
  useEffect(() => {
    setIndex(0)
  }, [product.code])

  // When slider index changes (from swipe, dots, arrows), broadcast it so the
  // thumbnail strip can highlight the right frame.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pp:sync-index', { detail: { code: product.code, index } }))
  }, [product.code, index])

  // Auto-advance only for card-kind when there are multiple images.
  const autoPlay = kind === 'card' && imageCount > 1
  useEffect(() => {
    if (!autoPlay || paused) return
    const t = window.setInterval(next, 4200)
    return () => window.clearInterval(t)
  }, [autoPlay, paused, next])

  // Pointer / swipe tracking on the track itself.
  const onPointerDown = (e: React.PointerEvent) => {
    if (imageCount <= 1) return
    startX.current = e.clientX
    deltaX.current = 0
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return
    deltaX.current = e.clientX - startX.current
    if (trackRef.current) {
      const w = trackRef.current.clientWidth || 1
      const pct = (deltaX.current / w) * 100
      trackRef.current.style.transform = `translateX(calc(${-index * 100}% + ${pct}%))`
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current == null) return
    const w = (trackRef.current?.clientWidth ?? 1) || 1
    const threshold = Math.min(60, w * 0.18)
    const dx = deltaX.current
    startX.current = null
    deltaX.current = 0
    if (trackRef.current) trackRef.current.style.transform = ''
    if (dx > threshold) prev()
    else if (dx < -threshold) next()
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  if (!product.image && imageCount === 0) {
    return (
      <span className={`flex items-center justify-center ${className}`} aria-hidden style={{ color: 'var(--sf-gold-deep)' }}>
        <Gem className="size-9" strokeWidth={1.2} />
      </span>
    )
  }

  const baseUrl = `/api/store/image?id=${product.code}&v=${encodeURIComponent(product.imageVersion)}`

  const showArrows = kind !== 'card' && imageCount > 1
  const showDots = imageCount > 1
  const showCounter = kind === 'page' && imageCount > 1

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="flex h-full touch-pan-y select-none will-change-transform transition-transform duration-300 ease-out"
        style={{ width: `${imageCount * 100}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {Array.from({ length: Math.max(1, imageCount) }).map((_, i) => (
          <div key={i} className="relative h-full shrink-0" style={{ width: `${100 / Math.max(1, imageCount)}%` }}>
            <img
              src={`${baseUrl}&index=${i}`}
              alt={i === 0 ? product.name : `${product.name} view ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              className="size-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Admin- or page-supplied overlays (badges, item #) live above the images. */}
      {overlay}

      {showArrows && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous image"
            className="group absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-900 shadow-sm transition hover:bg-white disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next image"
            className="group absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-900 shadow-sm transition hover:bg-white disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {showCounter && (
        <span className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
          {index + 1} / {imageCount}
        </span>
      )}

      {showDots && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
          {Array.from({ length: imageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show image ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation()
                setIndex(i)
              }}
              className={`pointer-events-auto size-1.5 rounded-full transition ${i === index ? 'bg-white/90 w-4' : 'bg-white/45 hover:bg-white/70'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
