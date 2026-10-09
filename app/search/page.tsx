'use client'

// Search results.
//
// The reference shop's header carries a search box, so a customer who types in
// it expects a page — not a grid that silently filters behind their back. This
// is that page: the query in the URL, the results below it, and the query still
// editable so a typo can be corrected without going back.
//
// The search is a light client-side filter over the public catalogue, which is
// what the storefront is anyway — the catalogue is already on the device, so a
// round-trip per keystroke would buy nothing. It matches the same fields the
// grid's filter does (name, code, collection, category) so the two never
// disagree about what "mango" finds.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Gem, Search as SearchIcon, X } from 'lucide-react'
import StoreShell from '@/components/store/store-shell'
import ProductCard from '@/components/store/product-card'
import { useApi } from '@/lib/use-api'
import { rupees } from '@/lib/store'
import type { StoreCatalogue, StoreProduct } from '@/lib/types'

export default function SearchPage() {
  const params = useSearchParams()
  const initial = params.get('q') ?? ''
  const [term, setTerm] = useState(initial)

  const { data, isLoading } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 120_000 })
  const shop = data?.shop ?? null
  const products = data?.products ?? []

  /**
   * The result set.
   *
   * Ranked rather than merely filtered: a piece whose name starts with the
   * search word is far more likely to be what was meant than one that mentions
   * it in a description, so exact prefix matches come first. Within a rank the
   * shelf order the shop set is kept, so a search never scrambles the
   * shopkeeper's own arrangement.
   */
  const results = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (!needle) return []

    const scored: { product: StoreProduct; rank: number }[] = []
    for (const product of products) {
      const name = product.name.toLowerCase()
      const collection = product.collection.toLowerCase()
      const category = product.category.toLowerCase()
      const code = String(product.code)

      let rank = -1
      if (code === needle) rank = 0
      else if (name.startsWith(needle)) rank = 1
      else if (name.includes(needle)) rank = 2
      else if (collection.includes(needle) || category.includes(needle)) rank = 3
      else if (code.includes(needle)) rank = 4

      if (rank >= 0) scored.push({ product, rank })
    }

    return scored.sort((a, b) => a.rank - b.rank).map((entry) => entry.product)
  }, [products, term])

  // What the customer probably meant, offered when a search finds nothing.
  // A jewellery counter's vocabulary is narrow — a customer typing "harem" or
  // "neckles" is not confused about what they want, only about how it is spelt.
  const suggestions = useMemo(() => {
    const set = new Set<string>()
    for (const product of products) {
      set.add(product.collection)
      set.add(product.category)
    }
    return [...set].filter(Boolean).slice(0, 10)
  }, [products])

  return (
    <StoreShell
      title={term.trim() ? `Results for “${term.trim()}”` : 'Search products'}
      eyebrow="Search"
      lead={
        term.trim() && !isLoading
          ? `${results.length} ${results.length === 1 ? 'piece matches' : 'pieces match'} in the collection.`
          : 'Type a name, a kind of piece, or an item number — for example “mango”, “haram” or “2654”.'
      }
      back={{ href: '/', label: 'Back to the shop' }}
    >
      <form action="/search" method="get" className="mb-8 flex flex-wrap gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" style={{ color: 'var(--sf-gold-deep)' }} />
          <input
            name="q"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by name, kind, collection or item number"
            autoFocus
            aria-label="Search products"
            className="h-12 w-full rounded-xl border border-line bg-white pr-10 pl-11 text-sm transition focus:border-gold"
            style={{ color: 'var(--sf-heading)' }}
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Clear the search"
              className="absolute top-1/2 right-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-full transition hover:bg-cream"
              style={{ color: 'var(--sf-muted)' }}
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <button type="submit" className="sf-btn sf-btn-gold h-12 px-6 text-sm">
          Search
        </button>
      </form>

      {isLoading && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="animate-pulse overflow-hidden rounded-lg border border-line bg-white">
              <div className="aspect-square bg-cream-soft" />
              <div className="space-y-2 p-3">
                <div className="h-2.5 w-12 rounded bg-cream-soft" />
                <div className="h-3.5 w-24 rounded bg-cream-soft" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !term.trim() && (
        <section className="sf-card p-7">
          <p className="sf-eyebrow">Browse instead</p>
          <h2 className="mt-3 text-lg font-semibold tracking-tight">Not sure what it is called?</h2>
          <p className="mt-2 text-sm leading-7">
            Pick a shelf and we will show you everything in it. Every piece is one-gram gold, panchaloha or silver with the
            look of gold.
          </p>
          {suggestions.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {suggestions.map((entry) => (
                <Link key={entry} href={`/search?q=${encodeURIComponent(entry)}`} className="sf-chip">
                  {entry}
                </Link>
              ))}
            </div>
          )}
          <Link href="/#store" className="sf-btn sf-btn-ghost mt-6 h-11 px-5 text-sm">
            See the whole collection <ArrowRight className="size-4" />
          </Link>
        </section>
      )}

      {!isLoading && term.trim() && results.length === 0 && (
        <div className="sf-card px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-gold-deep)' }}>
            <Gem className="size-6" strokeWidth={1.4} />
          </span>
          <p className="mt-5 text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
            Nothing matches “{term.trim()}”
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-6">
            Try a shorter word, or the item number from a card — it looks like #2654. The shop can also find a piece for you
            if you describe it over the phone.
          </p>

          {suggestions.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestions.map((entry) => (
                <Link key={entry} href={`/search?q=${encodeURIComponent(entry)}`} className="sf-chip">
                  {entry}
                </Link>
              ))}
            </div>
          )}

          <Link href="/#store" className="sf-btn sf-btn-gold mt-7 h-11 px-6 text-sm">
            Browse the whole collection
          </Link>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((product, index) => (
              <ProductCard
                key={product.code}
                product={product}
                index={index}
                whatsapp={shop?.whatsapp ?? shop?.phone}
                shopName={shop?.name}
              />
            ))}
          </div>

          {results.length === 1 && (
            <p className="mt-8 text-xs" style={{ color: 'var(--sf-muted)' }}>
              Only one piece matched — it costs {rupees(results[0].price)}. Ask the shop if you would like to see something
              similar.
            </p>
          )}
        </>
      )}
    </StoreShell>
  )
}
