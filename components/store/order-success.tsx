'use client'

// Confirmation shown the instant an order is placed.
//
// Deliberately calm and explicit: the order number is the one thing the
// customer needs, the shop's number is one tap away, and the "you will get a
// call" promise is stated plainly — because that is exactly what happens.

import { CircleCheck, Phone, ShoppingBag, X } from 'lucide-react'
import { rupeesExact, telLink, whatsappLink } from '@/lib/store'
import type { PlacedOrder } from '@/components/store/cart-drawer'
import type { Shop } from '@/lib/types'

export default function OrderSuccess({
  order,
  shop,
  onClose,
}: {
  order: PlacedOrder
  shop: (Shop & { whatsapp?: string | null }) | null
  onClose: () => void
}) {
  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(
    shop?.whatsapp ?? shop?.phone,
    `Hello ${shop?.name ?? ''}, I just placed order ${order.orderNumber} on your website.`,
  )
  const trackUrl = `/order/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.token)}`

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Order placed">
      <button className="sf-scrim absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />

      <div className="sf-toast relative w-full max-w-md overflow-hidden rounded-xl border border-line bg-white p-7 text-center shadow-2xl" style={{ color: 'var(--sf-body)' }}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-full transition hover:bg-cream"
          style={{ color: 'var(--sf-muted)' }}
        >
          <X className="size-4" />
        </button>

        <span
          className="animate-ring-pop relative mx-auto mb-5 flex size-20 items-center justify-center rounded-full"
          style={{ border: '1px solid var(--sf-gold-line)' }}
        >
          <span className="animate-ripple absolute inset-0 rounded-full" style={{ border: '1px solid var(--sf-gold-line)' }} />
          <CircleCheck className="size-10" style={{ color: 'var(--sf-gold-deep)' }} strokeWidth={1.4} />
        </span>

        <h2 className="text-xl font-semibold tracking-tight">Order placed</h2>
        <p className="mt-2 text-sm leading-6">
          Thank you, your pieces are reserved. The shop will call you shortly to confirm and arrange payment.
        </p>

        <div className="mt-5 rounded-lg border border-line bg-cream px-4 py-3.5">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--sf-muted)' }}>
            Your order number
          </p>
          <p className="tnum mt-1 text-xl font-semibold tracking-wide" style={{ color: 'var(--sf-maroon)' }}>
            {order.orderNumber}
          </p>
          <p className="tnum mt-1.5 text-xs" style={{ color: 'var(--sf-muted)' }}>
            Total {rupeesExact(order.totalAtPlacement)}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <a href={trackUrl} className="sf-btn sf-btn-gold h-11 w-full text-sm">
            <ShoppingBag className="size-4" /> Track this order
          </a>
          <div className="flex gap-2">
            {call && (
              <a href={call} className="sf-btn sf-btn-ghost h-11 flex-1 text-sm">
                <Phone className="size-3.5" /> Call shop
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-11 flex-1 text-sm">
                WhatsApp
              </a>
            )}
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-5" style={{ color: 'var(--sf-muted)' }}>
          Keep this number. Open the tracking link any time to see whether your order is confirmed, ready, or completed.
        </p>
      </div>
    </div>
  )
}
