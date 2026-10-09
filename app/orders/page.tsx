'use client'

// "My orders" — the customer's own door into their purchases.
//
// There are no customer logins on this website, and that is a deliberate
// choice: a customer who buys a ₹350 pair of earrings will not create an
// account to see it again, and asking them to would lose the sale at the
// counter. Instead, identity is proven the way the shop already proves it on
// the phone — with the mobile number on the bill.
//
// So this page asks for a number and returns the orders placed against it. The
// server does the matching; nothing is listed here that the server did not
// authorise, and no order is ever visible by guessing a number. The number is
// kept in this browser so a returning customer is not asked every time.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, Package, Phone, RefreshCw, ShoppingBag } from 'lucide-react'
import StoreShell from '@/components/store/store-shell'
import { rupees, telLink } from '@/lib/store'
import { useApi } from '@/lib/use-api'
import type { OrderStatus, PublicOrder, StoreCatalogue } from '@/lib/types'

const STATUS_TONE: Record<OrderStatus, { bg: string; fg: string; label: string }> = {
  NEW: { bg: 'oklch(0.95 0.04 85)', fg: 'oklch(0.45 0.1 70)', label: 'Waiting to be confirmed' },
  CONFIRMED: { bg: 'oklch(0.94 0.05 250)', fg: 'oklch(0.45 0.13 255)', label: 'Confirmed' },
  READY: { bg: 'oklch(0.94 0.06 150)', fg: 'oklch(0.42 0.12 155)', label: 'Ready to collect' },
  COMPLETED: { bg: 'oklch(0.94 0.02 150)', fg: 'oklch(0.4 0.06 155)', label: 'Completed' },
  CANCELLED: { bg: 'oklch(0.95 0.02 25)', fg: 'oklch(0.45 0.16 25)', label: 'Cancelled' },
}

const STORAGE_KEY = 'sml-my-orders-phone'

type OrderLookup = {
  orders: PublicOrder[]
  shop: { name: string; phone: string | null }
}

export default function MyOrdersPage() {
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lookup, setLookup] = useState<OrderLookup | null>(null)

  const { data: catalogue } = useApi<StoreCatalogue>('/api/store/catalogue')
  const shop = catalogue?.shop ?? null
  const call = telLink(shop?.phone)

  /**
   * Remember the number, and look it up on arrival.
   *
   * A customer checking an order is usually doing it twice — once to see it was
   * received, once to see whether it is ready — and typing the number again the
   * second time is the kind of friction that ends in a phone call instead. The
   * number is only ever a read key here, so storing it locally carries no more
   * risk than the order confirmation already sitting in their messages.
   */
  useEffect(() => {
    const stored = typeof window === 'undefined' ? '' : window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setPhone(stored)
      void search(stored)
    }
    // Run once on mount. `search` is stable enough for this and re-running it on
    // every render would refetch the list on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const search = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Enter the mobile number you gave when you ordered.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/store/orders?phone=${encodeURIComponent(trimmed)}`)
      const result = (await response.json()) as Partial<OrderLookup> & { error?: string }
      if (!response.ok) {
        setError(result.error ?? 'Could not look that number up. Please try again.')
        setLookup(null)
        return
      }
      setLookup({ orders: result.orders ?? [], shop: result.shop ?? { name: '', phone: null } })
      setSubmitted(trimmed)
      window.localStorage.setItem(STORAGE_KEY, trimmed)
    } catch {
      setError('Could not reach the shop. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const forget = () => {
    window.localStorage.removeItem(STORAGE_KEY)
    setPhone('')
    setSubmitted('')
    setLookup(null)
    setError('')
  }

  return (
    <StoreShell
      title="My orders"
      eyebrow="Your purchases"
      lead="Enter the mobile number you gave us when you ordered and we will show you every order placed against it."
      back={{ href: '/', label: 'Back to the shop' }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void search(phone)
        }}
        className="sf-card mb-8 p-6 sm:p-7"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--sf-heading)' }}>
              Mobile number
            </span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="e.g. 98765 43210"
              inputMode="tel"
              autoComplete="tel"
              className="h-12 w-full rounded-xl border border-line bg-white px-3.5 text-sm transition focus:border-gold"
              style={{ color: 'var(--sf-heading)' }}
            />
          </label>
          <button type="submit" disabled={busy} className="sf-btn sf-btn-gold h-12 px-6 text-sm disabled:opacity-60">
            {busy ? <RefreshCw className="size-4 animate-spin" /> : <Package className="size-4" />}
            {busy ? 'Looking…' : 'Find my orders'}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-5" style={{ color: 'var(--sf-muted)' }}>
          This is the number we called to confirm your order. We use it only to find your orders — nothing else is shown.
        </p>

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </form>

      {lookup && submitted && (
        <section>
          <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sf-eyebrow">Placed with {submitted}</p>
              <h2 className="mt-3 text-lg font-semibold tracking-tight">
                {lookup.orders.length === 0
                  ? 'No orders found for this number'
                  : `${lookup.orders.length} ${lookup.orders.length === 1 ? 'order' : 'orders'} found`}
              </h2>
            </div>
            <button onClick={forget} className="text-[11px] transition hover:underline" style={{ color: 'var(--sf-muted)' }}>
              Use a different number
            </button>
          </header>

          {lookup.orders.length === 0 ? (
            <div className="sf-card px-6 py-12 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-gold-deep)' }}>
                <ShoppingBag className="size-6" strokeWidth={1.4} />
              </span>
              <p className="mt-4 text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
                Nothing under that number yet
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-6">
                If you ordered over the phone or at the counter, your purchase is on our bill records rather than an online
                order. Call the shop and we will look it up for you.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link href="/#store" className="sf-btn sf-btn-gold h-11 px-5 text-sm">
                  Start shopping <ArrowRight className="size-4" />
                </Link>
                {call && (
                  <a href={call} className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
                    <Phone className="size-4" /> Call the shop
                  </a>
                )}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {lookup.orders.map((order) => (
                <li key={order.orderNumber}>
                  <OrderRow order={order} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </StoreShell>
  )
}

/**
 * One order, in the customer's own terms.
 *
 * The status is stated in plain words ("Ready to collect") before the code, and
 * the shop's phone number is on the row rather than only in the footer — the
 * customer reading this is usually about to ask when they can collect, and the
 * answer is a tap away.
 */
function OrderRow({ order }: { order: PublicOrder }) {
  const tone = STATUS_TONE[order.status]

  return (
    <article className="sf-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="tnum text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
              {order.orderNumber}
            </span>
            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
              {tone.label}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={
                order.paymentStatus === 'PAID'
                  ? { background: 'oklch(0.94 0.06 150)', color: 'oklch(0.42 0.12 155)' }
                  : { background: 'oklch(0.95 0.03 85)', color: 'oklch(0.48 0.09 70)' }
              }
            >
              {order.paymentStatus === 'PAID' ? 'Paid' : 'Payment pending'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--sf-muted)' }}>
            {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(order.createdAt))}
            {' · '}
            {order.itemCount} {order.itemCount === 1 ? 'piece' : 'pieces'}
            {' · '}
            {order.fulfilment === 'DELIVERY' ? 'Home delivery' : 'Store pickup'}
          </p>
        </div>

        <p className="tnum shrink-0 text-base font-semibold" style={{ color: 'var(--sf-maroon)' }}>
          {rupees(Number(order.totalAmount))}
        </p>
      </div>

      <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4">
        {order.lines.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-4 text-xs">
            <span className="min-w-0 truncate" style={{ color: 'var(--sf-body)' }}>
              {line.itemName} <span style={{ color: 'var(--sf-muted)' }}>× {line.quantity}</span>
            </span>
            <span className="tnum shrink-0" style={{ color: 'var(--sf-muted)' }}>
              {rupees(Number(line.lineTotal))}
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}
