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
import ProductImageSlider from '@/components/store/product-image-slider'

export function ProductMedia({ product, className = '' }: { product: StoreProduct; className?: string }) {
  return <ProductImageSlider product={product} className={className} />
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
  const hasDiscount = product.originalPrice > product.price
  const discountPct = hasDiscount
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0
  const enquiry = whatsappLink(
    whatsapp,
    `Hello ${shopName ?? ''}, I would like to know more about ${product.name} (item #${product.code}), priced at ${rupees(product.price)}${hasDiscount ? ` (was ${rupees(product.originalPrice)})` : ''}.`,
  )
  const link = `/product/${encodeURIComponent(String(product.code))}`

  return (
    <article className="sf-card sf-card-sheen group flex flex-col" data-reveal="up" data-reveal-delay={Math.min(index, 8) * 45}>
      {/*
        A square photo rather than 4:5. A tall frame stretched every card and
        forced a customer to scroll past a lot of empty background to reach the
        price. Jewellery photographs fill a square well, and a square keeps the
        grid even when pieces are different shapes.
      */}
      <div className="sf-card-media relative aspect-square overflow-hidden">
        <a href={link} aria-label={`Open ${product.name}`} className="absolute inset-0 block">
          <ProductImageSlider
            product={product}
            className="size-full"
            overlay={
              <>
                {product.badge && (
                  <span
                    className="absolute top-2 left-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-white uppercase pointer-events-none"
                    style={{ background: 'var(--sf-maroon)' }}
                  >
                    {product.badge}
                  </span>
                )}

                {hasDiscount && (
                  <span
                    className="absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white pointer-events-none"
                    style={{ background: 'var(--sf-gold-deep)' }}
                  >
                    –{discountPct}%
                  </span>
                )}

                <span
                  className="absolute right-2 bottom-2 rounded-full px-1.5 py-0.5 text-[9px] tracking-wide pointer-events-none hidden sm:block"
                  style={{ background: 'oklch(1 0 0 / 88%)', color: 'var(--sf-heading)' }}
                >
                  #{product.code}
                </span>
              </>
            }
          />
        </a>
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <p className="text-[9px] font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--sf-gold-deep)' }}>
          {product.collection}
        </p>
        {/*
          Two lines at most, and the description is gone. A tile is a glance,
          not a page: the full description lives on the piece's own page, where
          the customer has already decided to look closer.
        */}
        <h3 className="mt-1 line-clamp-2 text-[12px] leading-4 font-medium sm:text-[13px] sm:leading-5" style={{ color: 'var(--sf-heading)' }}>
          {product.name}
        </h3>

        <div className="mt-auto pt-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <p className="tnum text-sm font-semibold sm:text-[15px]" style={{ color: 'var(--sf-maroon)' }}>
              {rupees(product.price)}
            </p>
            {hasDiscount && (
              <p className="tnum text-[10px] line-through decoration-1 decoration-dashed" style={{ color: 'var(--sf-muted)' }}>
                {rupees(product.originalPrice)}
              </p>
            )}
          </div>
          {hasDiscount && (
            <p className="mt-0.5 text-[9px] font-semibold" style={{ color: 'var(--sf-gold-deep)' }}>
              Save {rupees(product.originalPrice - product.price)}
            </p>
          )}

          {/*
            One action row: add to basket, and a way to ask about the piece.
            Share moved to the piece's own page — on a tile it competed with the
            buy button for a tap and made the card taller for a rare action.
          */}
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => add(product)}
              aria-label={inBasket ? `${product.name} is in your basket` : `Add ${product.name} to basket`}
              className={`sf-btn h-7 flex-1 px-2 text-[11px] ${inBasket ? 'border border-line bg-cream' : 'sf-btn-gold'}`}
              style={inBasket ? { color: 'var(--sf-maroon)' } : undefined}
            >
              {inBasket ? <Check className="size-3" /> : <Plus className="size-3" />}
              <span className="truncate">{inBasket ? 'In basket' : 'Add'}</span>
            </button>

            {enquiry && (
              <a
                href={enquiry}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ask about ${product.name} on WhatsApp`}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line transition hover:border-gold hover:bg-cream"
                style={{ color: 'var(--sf-maroon)' }}
              >
                <MessageCircle className="size-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}