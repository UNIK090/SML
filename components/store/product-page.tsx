'use client'

// ===========================================================================
// A piece on its own page, at /product/<code>.
//
// This is the page a shared link opens. It exists because a piece is what gets
// sent — to a mother, a husband, a group — and a shared link should show that
// piece rather than a grid the recipient has to search inside.
//
// It does the three things a recipient needs, in order:
//
//   1. See the piece at a size worth looking at, with the price in the clear.
//   2. Ask the shop about it, on WhatsApp or by phone, without leaving the page.
//   3. Order it, or send it on to somebody else with the same link.
//
// The route is public. The endpoint behind it checks `published`, so a piece the
// shop has withdrawn says so plainly instead of 404-ing.
// ===========================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Gem,
  Package,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import { ProductMedia } from '@/components/store/product-card'
import ShareMenu from '@/components/store/share-menu'
import { useApi } from '@/lib/use-api'
import { rupees, telLink, whatsappLink } from '@/lib/store'
import type { StoreProductLink } from '@/lib/types'

export default function ProductPage({ code }: { code: number }) {
  const { data, isLoading, error } = useApi<StoreProductLink>(`/api/store/product?code=${code}`)
  const [added, setAdded] = useState(false)

  const product = data?.product ?? null
  const shop = data?.shop ?? null
  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(
    shop?.whatsapp ?? shop?.phone,
    `Hello ${shop?.name ?? ''}, I saw ${product?.name ?? 'a piece'} on your website (item #${code}) and would like to know more.`,
  )

  // Ordering from here puts the piece in the basket and opens the drawer, which
  // is the same path the grid uses — one checkout, not two.
  const order = useCallback(() => {
    if (!product) return
    setAdded(true)
    window.dispatchEvent(
      new CustomEvent('sml:open-basket', { detail: { code: product.code, fulfilment: 'PICKUP' } }),
    )
    window.setTimeout(() => setAdded(false), 2600)
  }, [product])

  useEffect(() => {
    if (product) document.title = `${product.name} · ${shop?.name ?? 'Jewellery'}`
  }, [product, shop?.name])

  if (isLoading) {
    return (
      <main className="sf-canvas min-h-screen px-4 py-16 sm:px-7">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 lg:grid-cols-2">
          <div className="aspect-[4/5] animate-pulse rounded-xl border border-line bg-white" />
          <div className="space-y-4">
            <div className="h-3 w-24 animate-pulse rounded bg-cream-soft" />
            <div className="h-8 w-2/3 animate-pulse rounded bg-cream-soft" />
            <div className="h-6 w-32 animate-pulse rounded bg-cream-soft" />
            <div className="h-24 w-full animate-pulse rounded bg-cream-soft" />
          </div>
        </div>
      </main>
    )
  }

  // A link to a piece the shop has withdrawn, or to a code that never existed.
  if (error || !product) {
    return (
      <main className="sf-canvas flex min-h-screen items-center justify-center px-5 py-16">
        <div className="sf-card w-full max-w-md p-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-gold-deep)' }}>
            <Gem className="size-6" strokeWidth={1.4} />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">This piece is not on the website</h1>
          <p className="mt-2 text-sm leading-6">
            {error ?? 'Item'} It may have been sold or taken off the website. Everything the shop has published is still in the
            store.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/#store" className="sf-btn sf-btn-gold h-11 w-full text-sm">
              Browse the collection <ArrowRight className="size-4" />
            </Link>
            <Link href="/" className="sf-btn sf-btn-ghost h-11 w-full text-sm">
              <ArrowLeft className="size-4" /> Back to the shop
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="sf-canvas min-h-screen pb-16">
      {/* A thin maroon bar keeps the piece's page recognisably the same shop. */}
      <div className="sf-topbar px-4 py-2 text-[11px] sm:px-7">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4">
          <Link href="/" className="truncate font-semibold tracking-[0.1em] uppercase transition hover:text-white">
            {shop?.name ?? 'Jewellery'}
          </Link>
          <div className="flex shrink-0 items-center gap-4">
            <Link href="/#store" className="transition hover:text-white">
              All pieces
            </Link>
            <Link href="/track" className="transition hover:text-white">
              Track an order
            </Link>
          </div>
        </div>
      </div>

      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-3.5 sm:px-7">
          <Link href="/" className="sf-btn sf-btn-ghost h-9 px-3.5 text-xs">
            <ArrowLeft className="size-3.5" /> Back to the shop
          </Link>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--sf-muted)' }}>
            <BadgeCheck className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Shared piece · #{product.code}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-7">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,.92fr)] lg:gap-12">
          {/* ------------------------------ The piece ------------------------------ */}
          <div>
            <div className="sf-card overflow-hidden">
              <div className="sf-card-media relative aspect-[4/5]">
                <ProductMedia product={product} className="size-full" />
                {product.badge && (
                  <span
                    className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-white uppercase"
                    style={{ background: 'var(--sf-maroon)' }}
                  >
                    {product.badge}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ShareMenu
                product={product}
                shopName={shop?.name}
                whatsapp={shop?.whatsapp ?? shop?.phone}
                label="Share this piece"
                className=""
                buttonClassName="sf-btn sf-btn-ghost h-10 px-4 text-xs"
              />
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-10 px-4 text-xs">
                  Ask the shop
                </a>
              )}
            </div>

            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {[
                { icon: ShieldCheck, text: 'The shop confirms every order by phone' },
                { icon: Truck, text: 'Delivery arranged by the shop' },
                { icon: Package, text: 'Gift packing on request' },
                { icon: Check, text: 'No payment taken on the website' },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-xs leading-5">
                  <item.icon className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          {/* ------------------------------ The order ------------------------------ */}
          <div className="lg:pt-2">
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'var(--sf-gold-deep)' }}>
              {product.collection}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2.1rem]">{product.name}</h1>

            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              <p className="tnum text-2xl font-semibold" style={{ color: 'var(--sf-maroon)' }}>
                {rupees(product.price)}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--sf-muted)' }}>
                Item #{product.code} · {product.category}
              </p>
            </div>

            {product.description && <p className="mt-4 text-sm leading-7">{product.description}</p>}

            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={order} className="sf-btn sf-btn-gold h-12 w-full text-sm">
                {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}
                {added ? 'Added to basket' : 'Order this piece'}
              </button>
            </div>

            {/* The shop, so a recipient of a shared link can reach a human. */}
            <div className="sf-card mt-6 p-5">
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--sf-heading)' }}>
                {shop?.name ?? 'The shop'}
              </p>
              {shop?.address && <p className="mt-2 text-xs leading-6">{shop.address}</p>}
              {shop?.storeHours && <p className="mt-1 text-xs leading-6">{shop.storeHours}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {call && (
                  <a href={call} className="sf-btn sf-btn-ghost h-9 px-4 text-xs">
                    <Phone className="size-3.5" /> {shop?.phone}
                  </a>
                )}
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-9 px-4 text-xs">
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

            {/* More from the same shelf, so the piece is not a dead end. */}
            {data && data.related.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--sf-heading)' }}>
                  More from {product.collection}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {data.related.map((entry) => (
                    <Link
                      key={entry.code}
                      href={`/product/${encodeURIComponent(String(entry.code))}`}
                      className="sf-card group flex items-center gap-3 p-2.5"
                    >
                      <span className="block size-14 shrink-0 overflow-hidden rounded-lg bg-cream-soft">
                        <ProductMedia product={entry} className="size-full" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium" style={{ color: 'var(--sf-heading)' }}>
                          {entry.name}
                        </span>
                        <span className="tnum block text-[11px]" style={{ color: 'var(--sf-maroon)' }}>
                          {rupees(entry.price)}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}