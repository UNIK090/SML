'use client'

// The Offers page — the festival offer board, on its own URL.
//
// This was the `#offers` section of the single-page storefront. On its own page
// an offer can be linked directly (the shop can share "our Diwali offer"), and it
// shares the running offer through the same `OfferPopup` the landing page uses,
// so a customer who lands here sees the live deal without hunting for it.

import { useRouter } from 'next/navigation'
import StoreShell from '@/components/store/store-shell'
import { OfferCards } from '@/components/store/store-sections'
import { useApi } from '@/lib/use-api'
import type { StoreCatalogue } from '@/lib/types'

export default function OffersPage() {
  const router = useRouter()
  const { data, isLoading } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 60_000 })
  const offers = data?.offers ?? []

  return (
    <StoreShell
      title="Offers"
      eyebrow="Festival offers"
      lead="Limited-time savings, live from the counter. Tap any offer to see the pieces it applies to."
      back={{ href: '/', label: 'Back to the shop' }}
    >
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-xl border border-line bg-white" />
          ))}
        </div>
      )}

      {!isLoading && offers.length === 0 && (
        <div className="sf-card px-6 py-14 text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
            No offers are running right now
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-6" style={{ color: 'var(--sf-muted)' }}>
            New festival offers appear here the moment the shop schedules them. Come back around the next festival, or browse the
            collection in the meantime.
          </p>
          <button onClick={() => router.push('/shop')} className="sf-btn sf-btn-gold mt-6 h-11 px-6 text-sm">
            Browse the collection
          </button>
        </div>
      )}

      {!isLoading && offers.length > 0 && (
        <OfferCards offers={offers} onSelect={() => router.push('/shop')} />
      )}
    </StoreShell>
  )
}
