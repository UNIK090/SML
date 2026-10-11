'use client'

// The Collections page — every shelf the shop keeps, on its own URL.
//
// This was the `#collections` section of the single-page storefront. On its own
// page a collection is a real destination a customer can be sent to ("see the
// Silver shelf"), and tapping one opens the Shop grid already filtered to it.

import Link from 'next/link'
import { ArrowRight, Gem } from 'lucide-react'
import StoreShell from '@/components/store/store-shell'
import { useApi } from '@/lib/use-api'
import { rupees } from '@/lib/store'
import type { StoreCatalogue } from '@/lib/types'

export default function CollectionsPage() {
  const { data, isLoading, error } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 60_000 })
  const products = data?.products ?? []
  const collections = data?.collections ?? []

  return (
    <StoreShell
      title="Collections"
      eyebrow="The collections"
      lead="Explore one-gram gold, panchaloha and silver designs for daily wear, gifting and celebrations. Every shelf is updated by the shop, so you see what is available at the counter today."
      back={{ href: '/', label: 'Back to the shop' }}
    >
      {/* The round shortcuts, as a lead-in to the full list. */}
      {collections.length > 0 && (
        <div className="mb-12 flex flex-wrap justify-center gap-6 sm:gap-8" data-reveal="up">
          {collections.slice(0, 8).map((entry) => {
            const preview = products.find((product) => product.collection === entry.name)
            return (
              <Link key={entry.name} href={`/shop?collection=${encodeURIComponent(entry.name)}`} className="sf-circle w-24">
                <span className="sf-circle-ring">
                  {preview?.image ? (
                    <img
                      src={`/api/store/image?id=${preview.code}&v=${encodeURIComponent(preview.imageVersion)}`}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Gem className="size-7" style={{ color: 'var(--sf-gold-deep)' }} strokeWidth={1.3} />
                  )}
                </span>
                <span className="text-center text-xs font-medium leading-5" style={{ color: 'var(--sf-heading)' }}>
                  {entry.name}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-xl border border-line bg-white" />
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error} — the collection could not be loaded. Please refresh in a moment.
        </p>
      )}

      {!isLoading && !error && collections.length === 0 && (
        <div className="rounded-xl border border-line bg-white px-6 py-12 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-gold-deep)' }}>
            <Gem className="size-6" strokeWidth={1.4} />
          </span>
          <p className="text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
            The store is being prepared
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-6">
            Collections appear here the moment the shop publishes them. Call or WhatsApp in the meantime and we will show you what
            is in the counter.
          </p>
        </div>
      )}

      {collections.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((entry, index) => {
            const preview = products.find((product) => product.collection === entry.name)
            return (
              <Link
                key={entry.name}
                href={`/shop?collection=${encodeURIComponent(entry.name)}`}
                data-reveal="up"
                data-reveal-delay={index * 80}
                className="sf-card group flex items-center gap-4 p-5 text-left"
              >
                <span className="sf-circle-ring" style={{ width: '4rem', height: '4rem', flexShrink: 0 }}>
                  {preview?.image ? (
                    <img
                      src={`/api/store/image?id=${preview.code}&v=${encodeURIComponent(preview.imageVersion)}`}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Gem className="size-6" style={{ color: 'var(--sf-gold-deep)' }} strokeWidth={1.3} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold" style={{ color: 'var(--sf-heading)' }}>
                    {entry.name}
                  </span>
                  <span className="mt-1 block text-xs" style={{ color: 'var(--sf-muted)' }}>
                    {entry.count} pieces · from {rupees(entry.from)}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--sf-maroon)' }}>
                    Browse <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </StoreShell>
  )
}
