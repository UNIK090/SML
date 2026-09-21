'use client'

// One product tile on the storefront.
//
// The image comes from the public store image endpoint, which only serves bytes
// for published catalogue rows — so an unpublished piece can never be previewed
// by guessing a URL.

import { Check, Gem, Plus } from 'lucide-react'
import type { StoreProduct } from '@/lib/types'
import { rupees } from '@/lib/store'
import { useCart } from '@/components/store/cart'

export function ProductMedia({ product, className = '' }: { product: StoreProduct; className?: string }) {
  if (!product.image) {
    return (
      <span className={`flex items-center justify-center text-champagne/70 ${className}`} aria-hidden>
        <Gem className="size-9" strokeWidth={1.2} />
      </span>
    )
  }
  return (
    <img
      src={`/api/store/image?id=${product.code}&v=${encodeURIComponent(product.imageVersion)}`}
      alt={product.name}
      loading="lazy"
      decoding="async"
      className={`object-cover ${className}`}
    />
  )
}

export default function ProductCard({ product, index = 0 }: { product: StoreProduct; index?: number }) {
  const { add, has } = useCart()
  const inBasket = has(product.code)

  return (
    <article className="sf-card sf-card-sheen group flex flex-col" data-reveal="up" data-reveal-delay={Math.min(index, 8) * 60}>
      <div className="sf-card-media relative aspect-[4/5] overflow-hidden">
        <ProductMedia product={product} className="absolute inset-0 size-full" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

        {product.badge && (
          <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-champagne uppercase backdrop-blur">
            {product.badge}
          </span>
        )}

        <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] tracking-wide text-white/75 backdrop-blur">
          #{product.code}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-champagne/75 uppercase">{product.collection}</p>
        <h3 className="mt-1.5 text-[15px] leading-6 font-medium text-white">{product.name}</h3>
        {product.description && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/55">{product.description}</p>
        )}

        <div className="mt-3 flex items-end justify-between gap-3 pt-1">
          <p className="tnum text-lg font-semibold text-white">{rupees(product.price)}</p>
          <button
            type="button"
            onClick={() => add(product)}
            aria-label={inBasket ? `${product.name} is in your basket` : `Add ${product.name} to basket`}
            className={`sf-btn h-9 shrink-0 px-3.5 text-xs ${inBasket ? 'border border-champagne/45 text-champagne' : 'sf-btn-gold'}`}
          >
            {inBasket ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            {inBasket ? 'In basket' : 'Add'}
          </button>
        </div>
      </div>
    </article>
  )
}