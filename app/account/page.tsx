'use client'

// "My account" — the customer's home base.
//
// This shop has no passwords, on purpose. A customer who buys a ₹350 pair of
// earrings will not remember an account, and a forgotten password loses the
// sale. What a customer actually needs is to find their orders, keep their
// details so they do not retype them, and know how to reach the shop — and all
// three of those are keyed on the mobile number they already gave at the till.
//
// So this page is not a login. It is a small hub: the number that identifies
// them here, a shortcut into their orders, and the reference material a
// returning customer reaches for (policies, how to complain, how to contact).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Gem,
  MapPin,
  Package,
  Phone,
  Receipt,
  Search,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import StoreShell from '@/components/store/store-shell'
import { telLink, whatsappLink } from '@/lib/store'
import { useApi } from '@/lib/use-api'
import type { StoreCatalogue } from '@/lib/types'

const STORAGE_KEY = 'sml-my-orders-phone'

export default function AccountPage() {
  const { data } = useApi<StoreCatalogue>('/api/store/catalogue')
  const shop = data?.shop ?? null
  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(shop?.whatsapp ?? shop?.phone, `Hello ${shop?.name ?? ''}, I have a question about my account.`)

  const [phone, setPhone] = useState('')
  useEffect(() => {
    const stored = typeof window === 'undefined' ? '' : window.localStorage.getItem(STORAGE_KEY)
    if (stored) setPhone(stored)
  }, [])

  const links = [
    {
      icon: Package,
      title: 'My orders',
      body: phone
        ? `See everything ordered with ${phone}, and where each piece has reached.`
        : 'Open your orders, tracking each piece from request to collection.',
      href: '/orders',
      cta: 'View my orders',
    },
    {
      icon: Search,
      title: 'Search the collection',
      body: 'Find a piece by name, kind, or the item number on a card.',
      href: '/search',
      cta: 'Search products',
    },
    {
      icon: MapPin,
      title: 'Visit the store',
      body: 'Opening hours, the address, and directions to the counter.',
      href: '/pages/stores',
      cta: 'Get directions',
    },
    {
      icon: Receipt,
      title: 'Returns and refunds',
      body: 'What we can take back, and how a refund is settled.',
      href: '/pages/refunds',
      cta: 'Read the policy',
    },
  ]

  return (
    <StoreShell
      title="My account"
      eyebrow="Your account"
      lead="There is no password to remember here. Your mobile number is what identifies you — it is the number we already call to confirm an order."
      back={{ href: '/', label: 'Back to the shop' }}
    >
      <section className="grid items-start gap-6 lg:grid-cols-[1fr_.85fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {links.map((entry) => (
            <Link key={entry.href} href={entry.href} className="sf-card group flex flex-col p-5 text-left sm:p-6">
              <span
                className="flex size-10 items-center justify-center rounded-full"
                style={{ background: 'var(--sf-gold-wash)', color: 'var(--sf-gold-deep)' }}
              >
                <entry.icon className="size-4.5" strokeWidth={1.6} />
              </span>
              <span className="mt-4 text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
                {entry.title}
              </span>
              <span className="mt-2 text-xs leading-6" style={{ color: 'var(--sf-body)' }}>
                {entry.body}
              </span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-semibold" style={{ color: 'var(--sf-maroon)' }}>
                {entry.cta} <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>

        <aside className="flex flex-col gap-6">
          <div className="sf-card p-6">
            <p className="sf-eyebrow">How you are identified</p>
            <h2 className="mt-3 text-base font-semibold tracking-tight">Your mobile number</h2>
            <p className="mt-3 text-xs leading-6" style={{ color: 'var(--sf-body)' }}>
              {phone ? (
                <>
                  You have used <span className="font-semibold" style={{ color: 'var(--sf-heading)' }}>{phone}</span> on this
                  browser. It is stored on your device only, so it is ready the next time you open your orders.
                </>
              ) : (
                'Enter the number you ordered with on the My orders page and we will remember it on this device, so you do not have to type it again.'
              )}
            </p>
            <Link href="/orders" className="sf-btn sf-btn-gold mt-5 h-11 w-full text-sm">
              <Package className="size-4" /> Open my orders
            </Link>
          </div>

          <div className="sf-card p-6">
            <p className="sf-eyebrow">Need a person?</p>
            <p className="mt-3 text-xs leading-6" style={{ color: 'var(--sf-body)' }}>
              Call or message the shop and quote your order number or item number. Both reach the counter directly.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {call && (
                <a href={call} className="sf-btn sf-btn-ghost h-10 px-4 text-xs">
                  <Phone className="size-3.5" /> {shop?.phone}
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-10 px-4 text-xs">
                  WhatsApp
                </a>
              )}
            </div>
          </div>

          <div className="sf-card p-6">
            <p className="sf-eyebrow">What you are buying</p>
            <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-6">
              {[
                { icon: Gem, text: 'One-gram gold, panchaloha and silver — never solid gold.' },
                { icon: ShieldCheck, text: 'No payment is taken on this website.' },
                { icon: Truck, text: 'Store pickup or home delivery, arranged by the shop.' },
                { icon: BadgeCheck, text: 'Every design is verified before it is published here.' },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2.5">
                  <item.icon className="mt-1 size-3.5 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </StoreShell>
  )
}
