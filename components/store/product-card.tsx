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
import ShareMenu, { WhatsAppMark } from '@/components/store/share-menu'

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
  const link = `/product/${encodeURIComponent(String(product.code))}`

  return (
    <article className="sf-card sf-card-sheen group flex flex-col" data-reveal="up" data-reveal-delay={Math.min(index, 8) * 60}>
      <div className="sf-card-media relative aspect-[4/5] overflow-hidden">
        {/*
          The image is the link to the piece's own page, so a customer who taps
          the photo lands on something they can share — not on a grid position
          they have to describe out loud.
        */}
        <a href={link} aria-label={`Open ${product.name}`} className="absolute inset-0 block">
          <ProductMedia product={product} className="size-full" />
        </a>

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

        {/* Two quiet actions under the piece: ask the shop about it, or send it
            on to somebody. The photo above keeps only its badge and code, so
            the jewellery itself is never covered up. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {enquiry && (
            <a
              href={enquiry}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-xs font-medium transition hover:underline"
              style={{ color: 'var(--sf-maroon)' }}
            >
              <MessageCircle className="size-3.5" /> Ask about this piece
            </a>
          )}

          <ShareMenu
            product={product}
            shopName={shopName}
            whatsapp={whatsapp}
            label="Share"
            buttonClassName="inline-flex w-fit items-center gap-1.5 text-xs font-medium transition hover:underline"
            icon={<WhatsAppMark className="size-3.5" />}
          />
        </div>
      </div>
    </article>
  )
}