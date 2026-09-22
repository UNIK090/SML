'use client'

// One product tile on the storefront.
//
// The image comes from the public store image endpoint, which only serves bytes
// for published catalogue rows — so an unpublished piece can never be previewed
// by guessing a URL.

import { Check, Gem, MessageCircle, Plus } from 'lucide-react'
import type { StoreProduct } from '@/lib/types'
import { rupees, whatsappLink } from '@/lib/store'
import { useCart } from '@/components/store/cart'

export function ProductMedia({ product, className = '' }: { product: StoreProduct; className?: string }) {
  if (!product.image) {
    return (
      <span className={`flex items-center justify-center ${className}`} aria-hidden style={{ color: 'var(--sf-gold-deep)' }}>
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

export default function ProductCard({
  product,
  index = 0,
  whatsapp,
  shopName,
}: {
  product: StoreProduct
  index?: number
  whatsapp?: string | null
  shopName?: string | null
}) {
  const { add, has } = useCart()
  const inBasket = has(product.code)
  const enquiry = whatsappLink(
    whatsapp,
    `Hello ${shopName ?? ''}, I would like to know more about ${product.name} (item #${product.code}), priced at ${rupees(product.price)}.`,
  )

  return (
    <article className="sf-card sf-card-sheen group flex flex-col" data-reveal="up" data-reveal-delay={Math.min(index, 8) * 60}>
      <div className="sf-card-media relative aspect-[4/5] overflow-hidden">
        <ProductMedia product={product} className="absolute inset-0 size-full" />

        {product.badge && (
          <span
            className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-white uppercase"
            style={{ background: 'var(--sf-maroon)' }}
          >
            {product.badge}
          </span>
        )}

        <span
          className="absolute right-3 bottom-3 rounded-full px-2.5 py-1 text-[10px] tracking-wide"
          style={{ background: 'oklch(1 0 0 / 88%)', color: 'var(--sf-heading)' }}
        >
          #{product.code}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--sf-gold-deep)' }}>
          {product.collection}
        </p>
        <h3 className="mt-1.5 text-[15px] leading-6 font-medium" style={{ color: 'var(--sf-heading)' }}>
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-5" style={{ color: 'var(--sf-muted)' }}>
            {product.description}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3">
          <p className="tnum text-lg font-semibold" style={{ color: 'var(--sf-maroon)' }}>
            {rupees(product.price)}
          </p>
          <button
            type="button"
            onClick={() => add(product)}
            aria-label={inBasket ? `${product.name} is in your basket` : `Add ${product.name} to basket`}
            className={`sf-btn h-9 shrink-0 px-3.5 text-xs ${inBasket ? 'border border-line bg-cream' : 'sf-btn-gold'}`}
            style={inBasket ? { color: 'var(--sf-maroon)' } : undefined}
          >
            {inBasket ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            {inBasket ? 'In basket' : 'Add'}
          </button>
        </div>

        {enquiry && (
          <a
            href={enquiry}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex w-fit items-center gap-1.5 text-xs font-medium transition hover:underline"
            style={{ color: 'var(--sf-maroon)' }}
          >
            <MessageCircle className="size-3.5" /> Ask about this piece
          </a>
        )}
      </div>
    </article>
  )
}