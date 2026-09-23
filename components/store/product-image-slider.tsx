'use client'

// Product image display for the storefront.
//
// Single hero image per product. The image URL is built from the product's
// `code` and `imageVersion` (cache-buster) and served by `/api/store/image`.

import { Gem } from 'lucide-react'
import type { StoreProduct } from '@/lib/types'

export type ProductImageSliderProps = {
  product: Pick<StoreProduct, 'code' | 'image' | 'imageVersion' | 'name'>
  className?: string
  /** Optional children rendered on top of the image (badges, codes). */
  overlay?: React.ReactNode
}

export default function ProductImageSlider({ product, className = '', overlay }: ProductImageSliderProps) {
  if (!product.image) {
    return (
      <span className={`flex items-center justify-center ${className}`} aria-hidden style={{ color: 'var(--sf-gold-deep)' }}>
        <Gem className="size-9" strokeWidth={1.2} />
      </span>
    )
  }

  const url = `/api/store/image?code=${product.code}&v=${encodeURIComponent(product.imageVersion)}`

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        src={url}
        alt={product.name}
        loading="eager"
        decoding="async"
        draggable={false}
        className="size-full object-cover"
      />
      {overlay}
    </div>
  )
}
