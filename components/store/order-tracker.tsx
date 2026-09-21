'use client'

// The customer's order page: /order/<number>?t=<token>
//
// It polls while the order is open and stops the moment it is completed or
// cancelled, so a finished order costs nothing. The token in the URL is the
// authorisation — the order number alone will not open it.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CircleCheck, Clock3, MapPin, PackageCheck, Phone, RefreshCw, Store } from 'lucide-react'
import { ORDER_STATUS_LABELS, ORDER_TIMELINE, rupeesExact, telLink } from '@/lib/store'
import type { PublicOrder } from '@/lib/types'

export default function OrderTracker({ orderNumber, token }: { orderNumber: string; token: string }) {
  const [order, setOrder] = useState<PublicOrder | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/store/order?orderNumber=${encodeURIComponent(orderNumber)}&t=${encodeURIComponent(token)}`, { cache: 'no-store' })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setError(result.error ?? 'We could not find that order.')
        return
      }
      setError('')
      setOrder(result as PublicOrder)
    } catch {
      setError('Could not reach the shop. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [orderNumber, token])

  useEffect(() => {
    void load()
  }, [load])

  // Only poll while the order is still moving.
  useEffect(() => {
    if (!order || order.status === 'COMPLETED' || order.status === 'CANCELLED') return
    const timer = window.setInterval(() => void load(), 20_000)
    return () => window.clearInterval(timer)
  }, [order, load])

  const stepIndex = order ? ORDER_TIMELINE.indexOf(order.status as (typeof ORDER_TIMELINE)[number]) : 0
  const cancelled = order?.status === 'CANCELLED'

  return (
    <main className="sf-canvas min-h-screen px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/" className="sf-btn sf-btn-ghost mb-7 h-9 px-4 text-xs">
          <ArrowLeft className="size-3.5" /> Back to the store
        </Link>

        {loading && !order && (
          <div className="flex items-center gap-3 rounded-3xl border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
            <RefreshCw className="size-4 animate-spin" /> Looking up your order…
          </div>
        )}

        {error && !order && (
          <div className="rounded-3xl border-white/10 bg-white/[0.03] p-6">
            <p className="text-sm text-white/80">{error}</p>
            <p className="mt-2 text-xs leading-6 text-white/45">
              Check that the whole link was copied. If it still does not open, call the shop with your order number and they will
              read it back to you.
            </p>
          </div>
        )}

        {order && (
          <div className="animate-rise-in flex-col gap-5">
            <header className="sf-card sf-card-sheen p-6">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-champagne/80 uppercase">Order {order.orderNumber}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {cancelled ? 'This order was cancelled' : ORDER_STATUS_LABELS[order.status] ?? order.status}
              </h1>
              <p className="mt-1.5 text-sm text-white/55">
                Placed {new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} for{' '}
                {order.customerName}
              </p>

              {!cancelled && (
                <ol className="mt-7 flex-col gap-0">
                  {ORDER_TIMELINE.map((status, index) => {
                    const reached = index <= stepIndex
                    const current = index === stepIndex
                    return (
                      <li key={status} className="flex gap-3.5">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-full border transition ${reached ? 'border-champagne/70 bg-champagne/20 text-champagne' : 'border-white/15 text-white/30'
                              }`}
                          >
                            {reached ? <CircleCheck className="size-4" strokeWidth={1.8} /> : <Clock3 className="size-3.5" />}
                          </span>
                          {index < ORDER_TIMELINE.length - 1 && (
                            <span className={`w-px flex-1 ${index < stepIndex ? 'bg-champagne/45' : 'bg-white/12'}`} aria-hidden />
                          )}
                        </div>
                        <div className={`pb-6 ${current ? '' : 'opacity-70'}`}>
                          <p className="text-sm font-medium text-white">{ORDER_STATUS_LABELS[status]}</p>
                          <p className="mt-0.5 text-xs leading-5 text-white/45">
                            {status === 'NEW' && 'We have your request and will call to confirm.'}
                            {status === 'CONFIRMED' && 'Confirmed by the shop. Your pieces are reserved.'}
                            {status === 'READY' && (order.fulfilment === 'DELIVERY' ? 'Packed and ready to be sent out.' : 'Ready for you to collect at the shop.')}
                            {status === 'COMPLETED' && 'Completed. Thank you for shopping with us.'}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </header>

            <section className="sf-card p-6">
              <h2 className="text-sm font-semibold tracking-wide text-white/80">Your pieces</h2>
              <ul className="mt-4 flex-col divide-y divide-white/8">
                {order.lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{line.itemName}</p>
                      <p className="text-[11px] tracking-wide text-white/40 uppercase">
                        {line.category} · #{line.itemCode} · ×{line.quantity}
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-sm text-white/85">{rupeesExact(Number(line.lineTotal))}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="text-sm text-white/60">Total ({order.itemCount} {order.itemCount === 1 ? 'piece' : 'pieces'})</span>
                <span className="tnum text-lg font-semibold text-champagne">{rupeesExact(Number(order.totalAmount))}</span>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="sf-card p-5">
                <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">
                  {order.fulfilment === 'DELIVERY' ? <MapPin className="size-3.5" /> : <Store className="size-3.5" />}
                  {order.fulfilment === 'DELIVERY' ? 'Home delivery' : 'Store pickup'}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/80">{order.shop.name}</p>
                {order.shop.address && <p className="mt-1 text-xs leading-5 text-white/50">{order.shop.address}</p>}
              </div>

              <div className="sf-card p-5">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">Need to change something?</p>
                <p className="mt-2 text-xs leading-5 text-white/55">
                  Call the shop with your order number and they will update it for you.
                </p>
                {telLink(order.shop.phone) && (
                  <a href={telLink(order.shop.phone)!} className="sf-btn sf-btn-ghost mt-3 h-9 px-4 text-xs">
                    <Phone className="size-3.5" /> {order.shop.phone}
                  </a>
                )}
              </div>
            </section>

            <p className="flex items-center gap-2 text-[11px] text-white/40">
              <PackageCheck className="size-3.5" /> This page refreshes itself while your order is being prepared.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
