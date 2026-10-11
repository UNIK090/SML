'use client'

// The Boutique page — where to find the shop and how buying works.
//
// This was the `#boutique` section of the single-page storefront. It carries the
// things a customer checks before visiting or ordering: the address, the phone
// and WhatsApp, the shop hours, how an online order is settled, and the promises
// the counter makes. On its own page it is the natural target for a "visit us"
// link from anywhere.

import Link from 'next/link'
import { Clock3, MapPin, Package, Phone, ShieldCheck } from 'lucide-react'
import StoreShell from '@/components/store/store-shell'
import { OrderSteps, PromiseBand } from '@/components/store/store-sections'
import { useApi } from '@/lib/use-api'
import { telLink, whatsappLink } from '@/lib/store'
import type { Shop, StoreCatalogue } from '@/lib/types'

export default function BoutiquePage() {
  const { data } = useApi<StoreCatalogue>('/api/store/catalogue', { refreshInterval: 120_000 })
  const shop = data?.shop ?? null

  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(
    shop?.whatsapp ?? shop?.phone,
    `Hello ${shop?.name ?? ''}, I would like to visit the boutique.`,
  )

  return (
    <StoreShell
      title="Visit the boutique"
      eyebrow="Visit the boutique"
      lead="The address, the timings, and how buying works — whether you visit the counter or order from the website."
      back={{ href: '/', label: 'Back to the shop' }}
    >
      <section className="grid w-full gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="sf-card p-7 sm:p-9" data-reveal="left">
          <p className="sf-eyebrow">Visit the boutique</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {shop?.name ?? 'Sri Maha Laxmi Jewellers'}
          </h2>
          <p className="mt-4 flex items-start gap-3 text-sm leading-7">
            <MapPin className="mt-1 size-4 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
            {shop?.address ?? 'Visit us at the shop — address will appear here once the profile is filled in.'}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {call && (
              <a href={call} className="sf-btn sf-btn-gold h-11 px-5 text-sm">
                <Phone className="size-4" /> {shop?.phone}
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
                WhatsApp us
              </a>
            )}
            <Link href="/track" className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
              <Package className="size-4" /> Track an order
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="sf-card p-7" data-reveal="right">
            <p
              className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] uppercase"
              style={{ color: 'var(--sf-heading)' }}
            >
              <Clock3 className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Shop hours
            </p>
            <p className="mt-3 text-sm leading-6">{shop?.storeHours ?? 'Call the shop for today timings.'}</p>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-6" style={{ color: 'var(--sf-muted)' }}>
              Orders placed online are confirmed by phone. Nothing is charged on the website — payment is settled at the shop or on
              delivery, whichever you prefer.
            </p>
          </div>

          <div className="sf-card p-7" data-reveal="right" data-reveal-delay={120}>
            <p
              className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] uppercase"
              style={{ color: 'var(--sf-heading)' }}
            >
              <ShieldCheck className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Buying with confidence
            </p>
            <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-6">
              <li>· One-gram gold, panchaloha and silver options</li>
              <li>· Prices shown clearly before you order</li>
              <li>· Speak with our team for product care and exchange details</li>
            </ul>
          </div>
        </div>
      </section>

      <OrderSteps shop={shop as (Shop & { storeHours?: string | null }) | null} />
      <PromiseBand />
    </StoreShell>
  )
}
