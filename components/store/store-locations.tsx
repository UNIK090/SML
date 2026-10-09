'use client'

// The store locator.
//
// A jewellery shop of this kind almost always has one counter, so this is not a
// chain's branch finder — it is the "can I come and see it?" page. It answers
// the four questions a customer asks before travelling: where, when, how to
// reach a person, and whether it is worth the trip.
//
// The address, hours and numbers all come from the shop profile the admin edits
// on the Profile screen, so the page is never a second place those facts are
// stored — a shop that moves changes one field and this page follows.

import { Clock3, MapPin, Navigation, Phone, Store, MessageCircle } from 'lucide-react'
import { useApi } from '@/lib/use-api'
import { telLink, whatsappLink } from '@/lib/store'
import type { StoreCatalogue } from '@/lib/types'

export default function StoreLocations() {
  const { data, isLoading } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 300_000 })
  const shop = data?.shop ?? null

  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(shop?.whatsapp ?? shop?.phone, `Hello ${shop?.name ?? ''}, I would like to visit the shop. Are you open today?`)

  // A maps link rather than an embedded map: an <iframe> to a third-party map
  // costs the page a network round-trip, a cookie banner and a layout shift on
  // every visit, for a shop that is usually one address. The link opens the
  // customer's own maps app with directions already filled in, which is what
  // they wanted from the map anyway.
  const mapsUrl = shop?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name}, ${shop.address}`)}`
    : null

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="h-72 animate-pulse rounded-2xl border border-line bg-white" />
        <div className="h-72 animate-pulse rounded-2xl border border-line bg-white" />
      </div>
    )
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <section className="sf-card overflow-hidden">
        <div className="sf-store-map relative flex items-center justify-center border-b border-line bg-cream">
          <span className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-white" style={{ color: 'var(--sf-maroon)' }}>
              <Store className="size-5" strokeWidth={1.5} />
            </span>
            <span className="text-xs font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--sf-heading)' }}>
              {shop?.name ?? 'The shop'}
            </span>
          </span>
        </div>

        <div className="p-6 sm:p-7">
          <dl className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
              <div>
                <dt className="text-[10px] font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--sf-muted)' }}>
                  Address
                </dt>
                <dd className="mt-1 text-sm leading-6" style={{ color: 'var(--sf-heading)' }}>
                  {shop?.address ?? 'The shop address will appear here once the profile is filled in. Call us and we will direct you.'}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
              <div>
                <dt className="text-[10px] font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--sf-muted)' }}>
                  Opening hours
                </dt>
                <dd className="mt-1 text-sm leading-6" style={{ color: 'var(--sf-heading)' }}>
                  {shop?.storeHours ?? 'Call the shop for today\u2019s timings.'}
                </dd>
              </div>
            </div>
          </dl>

          <div className="mt-7 flex flex-wrap gap-2.5">
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="sf-btn sf-btn-gold h-11 px-5 text-sm">
                <Navigation className="size-4" /> Get directions
              </a>
            )}
            {call && (
              <a href={call} className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
                <Phone className="size-4" /> {shop?.phone}
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="sf-card p-6 sm:p-7">
          <p className="sf-eyebrow">Before you travel</p>
          <h2 className="mt-3 text-lg font-semibold tracking-tight">Worth a phone call first</h2>
          <p className="mt-3 text-sm leading-7">
            Most of our designs are single pieces. Tell us the item number or send a screenshot and we will keep it aside
            until you arrive — that way the trip is never wasted.
          </p>

          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-gold mt-5 h-11 w-full text-sm">
              <MessageCircle className="size-4" /> Message us on WhatsApp
            </a>
          )}
        </div>

        <div className="sf-card p-6 sm:p-7">
          <p className="sf-eyebrow">At the counter</p>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-6">
            <li className="flex items-start gap-2.5">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full" style={{ background: 'var(--sf-gold-deep)' }} aria-hidden />
              You can see, hold and try on any piece before buying.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full" style={{ background: 'var(--sf-gold-deep)' }} aria-hidden />
              Payment is settled at the counter — cash or transfer.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full" style={{ background: 'var(--sf-gold-deep)' }} aria-hidden />
              Bring the bill if you are asking about care, resizing or an exchange.
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
