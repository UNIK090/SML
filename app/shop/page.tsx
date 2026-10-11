'use client'

// The Shop page — the full, filterable grid, on its own URL.
//
// This used to be the `#store` section of the single-page storefront, reached by
// scrolling. It is now a page of its own so a shelf can be linked, bookmarked and
// shared, and so the browser's back button behaves the way a customer expects
// after they tap into a collection. The filters read from the query string, so a
// link like /shop?collection=Silver opens the grid already narrowed to Silver.

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Gem, Search as SearchIcon } from 'lucide-react'
import StoreShell from '@/components/store/store-shell'
import ProductCard from '@/components/store/product-card'
import { useApi } from '@/lib/use-api'
import { rupees } from '@/lib/store'
import type { PriceBand, StoreCatalogue } from '@/lib/types'

export default function ShopPage() {
  const params = useSearchParams()

  const { data, isLoading, error } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 60_000 })
  const shop = data?.shop ?? null
  const products = data?.products ?? []

  // Seed the filters from the URL once, then let the customer drive them.
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [collection, setCollection] = useState(params.get('collection') ?? 'All')
  const [category, setCategory] = useState(params.get('category') ?? 'All')
  const [band, setBand] = useState<PriceBand | null>(null)

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      if (collection !== 'All' && product.collection !== collection) return false
      if (category !== 'All' && product.category !== category) return false
      if (band && !(product.price >= band.from && product.price < band.to)) return false
      if (!term) return true
      return (
        product.name.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term) ||
        product.collection.toLowerCase().includes(term) ||
        String(product.code).includes(term)
      )
    })
  }, [products, collection, category, band, query])

  return (
    <StoreShell
      title="Shop the collection"
      eyebrow="Shop the collection"
      lead={`${products.length} ${products.length === 1 ? 'piece' : 'pieces'} at the counter today. Filter by collection, kind or budget — every price is the price at the shop.`}
      back={{ href: '/', label: 'Back to the shop' }}
    >
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3" data-reveal="up">
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2" style={{ color: 'var(--sf-gold-deep)' }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, category, or code — e.g. one-gram, panchaloha, silver"
            className="h-11 w-full rounded-lg border border-line bg-white pr-3.5 pl-10 text-[13px] transition focus:border-gold"
            style={{ color: 'var(--sf-heading)' }}
          />
        </label>

        {data && data.collections.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setCollection('All')} data-active={collection === 'All'} className="sf-chip">
              All<span className="sf-chip-count">{products.length}</span>
            </button>

            {data.collections.map((entry) => (
              <button
                key={entry.name}
                onClick={() => setCollection(entry.name)}
                data-active={collection === entry.name}
                aria-pressed={collection === entry.name}
                className="sf-chip"
              >
                {entry.name}
                <span className="sf-chip-count">{entry.count}</span>
              </button>
            ))}

            {collection !== 'All' && (
              <button
                onClick={() => setCollection('All')}
                className="ml-0.5 text-[11px] transition hover:underline"
                style={{ color: 'var(--sf-muted)' }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {data && data.categoryRails.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: 'var(--sf-muted)' }}>
              Kind
            </span>
            <button onClick={() => setCategory('All')} data-active={category === 'All'} className="sf-chip">
              All kinds
            </button>

            {data.categoryRails.map((entry) => (
              <button
                key={entry.name}
                onClick={() => setCategory(entry.name)}
                data-active={category === entry.name}
                aria-pressed={category === entry.name}
                className="sf-chip"
              >
                {entry.name}
                <span className="sf-chip-count">{entry.count}</span>
              </button>
            ))}
          </div>
        )}

        {band && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-white"
              style={{ background: 'var(--sf-maroon)' }}
            >
              {band.label}
              <button onClick={() => setBand(null)} aria-label={`Remove the ${band.label} filter`}>
                ×
              </button>
            </span>
          </div>
        )}

        {/* The budget shortcuts, as their own row on the shop page. */}
        {data && data.priceBands.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: 'var(--sf-muted)' }}>
              Budget
            </span>
            {data.priceBands.map((entry) => (
              <button
                key={entry.label}
                onClick={() => setBand(band?.label === entry.label ? null : entry)}
                data-active={band?.label === entry.label}
                aria-pressed={band?.label === entry.label}
                className="sf-chip"
              >
                {entry.label}
                <span className="sf-chip-count">{entry.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mb-4 text-xs" style={{ color: 'var(--sf-muted)' }}>
        {visible.length} of {products.length} shown
        {collection !== 'All' && ` in ${collection}`}
        {category !== 'All' && ` · ${category}`}
        {band && ` · ${band.label}`}
      </p>

      {isLoading && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="animate-pulse overflow-hidden rounded-lg border border-line bg-white">
              <div className="aspect-square bg-cream-soft" />
              <div className="space-y-2 p-3">
                <div className="h-2.5 w-12 rounded bg-cream-soft" />
                <div className="h-3.5 w-24 rounded bg-cream-soft" />
                <div className="h-5 w-16 rounded bg-cream-soft" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error} — the collection could not be loaded. Please refresh in a moment.
        </p>
      )}

      {!isLoading && products.length > 0 && visible.length === 0 && (
        <div className="rounded-xl border border-line bg-white px-6 py-14 text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
            Nothing matches that search
          </p>
          <p className="mt-2 text-xs">Try a different word, or clear the filters to see the whole collection.</p>
          <button
            onClick={() => {
              setQuery('')
              setCollection('All')
              setCategory('All')
              setBand(null)
            }}
            className="sf-btn sf-btn-ghost mt-5 h-10 px-5 text-xs"
          >
            Clear filters
          </button>
        </div>
      )}

      {!isLoading && !error && products.length === 0 && (
        <div className="rounded-xl border border-line bg-white px-6 py-12 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-gold-deep)' }}>
            <Gem className="size-6" strokeWidth={1.4} />
          </span>
          <p className="text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
            The store is being prepared
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-6">
            Pieces appear here the moment the shop publishes them. Call or WhatsApp in the meantime and we will show you what is
            in the counter.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {visible.map((product, index) => (
            <ProductCard
              key={product.code}
              product={product}
              index={index}
              whatsapp={shop?.whatsapp ?? shop?.phone}
              shopName={shop?.name}
            />
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <p className="mt-8 text-xs" style={{ color: 'var(--sf-muted)' }}>
          Prices start at {rupees(Math.min(...visible.map((product) => product.price)))}. Ask the shop about a piece and we will
          show you more like it.
        </p>
      )}
    </StoreShell>
  )
}
