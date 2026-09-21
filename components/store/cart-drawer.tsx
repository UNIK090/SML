'use client'

// The basket drawer.
//
// Two-step by design: review the pieces, then give a name and a mobile number.
// The shop confirms the order by phone, so nothing here asks for a payment —
// which is why checkout finishes in seconds and the customer immediately gets an
// order number to track.

import { useState, type ReactNode } from 'react'
import { ArrowRight, Check, Loader2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { useCart } from '@/components/store/cart'
import { ProductMedia } from '@/components/store/product-card'
import { DELIVERY_FEE, FREE_DELIVERY_ABOVE, deliveryFeeFor, rupees, rupeesExact, telLink, whatsappLink } from '@/lib/store'
import type { Shop, StoreProduct } from '@/lib/types'

export type PlacedOrder = { orderNumber: string; token: string; totalAtPlacement: number }

export default function CartDrawer({
  open,
  onClose,
  shop,
  findProduct,
  onPlaced,
}: {
  open: boolean
  onClose: () => void
  shop: (Shop & { whatsapp?: string | null; storeHours?: string | null }) | null
  findProduct: (code: number) => StoreProduct | undefined
  onPlaced: (order: PlacedOrder) => void
}) {
  const cart = useCart()
  const [step, setStep] = useState<'basket' | 'details'>('basket')
  const [form, setForm] = useState({ name: '', phone: '', email: '', fulfilment: 'PICKUP', address: '', city: '', pincode: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const deliveryFee = deliveryFeeFor(cart.subtotal, form.fulfilment)
  const total = cart.subtotal + deliveryFee

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || cart.lines.length === 0) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.name,
          customerPhone: form.phone,
          customerEmail: form.email,
          fulfilment: form.fulfilment,
          addressLine: form.address,
          city: form.city,
          pincode: form.pincode,
          notes: form.notes,
          items: cart.lines.map((line) => ({ code: line.code, quantity: line.quantity })),
        }),
      })
      const result = (await response.json()) as { error?: string; orderNumber?: string; publicToken?: string; total?: number }
      if (!response.ok || !result.orderNumber || !result.publicToken) {
        setError(result.error ?? 'Could not place the order. Please try again.')
        return
      }
      const placed: PlacedOrder = {
        orderNumber: result.orderNumber,
        token: result.publicToken,
        totalAtPlacement: result.total ?? total,
      }
      cart.clear()
      setStep('basket')
      setForm({ name: '', phone: '', email: '', fulfilment: 'PICKUP', address: '', city: '', pincode: '', notes: '' })
      onPlaced(placed)
    } catch {
      setError('Could not reach the shop. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const whatsapp = whatsappLink(shop?.whatsapp ?? shop?.phone, `Hello ${shop?.name ?? ''}, I have a question about my order.`)
  const call = telLink(shop?.phone)

  // The drawer is mounted by the page so its state survives the open/close
  // cycle, which means it has to render nothing at all when closed — an
  // always-visible drawer would sit over the lower half of the storefront.
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Your basket">
      <button className="sf-scrim absolute inset-0 bg-black/70" aria-label="Close basket" onClick={onClose} />

      <aside className="sf-drawer relative flex h-full w-full max-w-[27rem] flex-col border-l border-white/10 bg-ink text-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="size-4 text-champagne" />
            <div>
              <p className="text-sm font-semibold">{step === 'basket' ? 'Your basket' : 'Your details'}</p>
              <p className="text-[11px] text-white/50">
                {cart.count} {cart.count === 1 ? 'piece' : 'pieces'} · {rupees(cart.subtotal)}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {cart.lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-white/5 text-champagne/80">
                <ShoppingBag className="size-6" strokeWidth={1.4} />
              </span>
              <p className="text-sm font-medium">Your basket is empty</p>
              <p className="mt-1 max-w-[16rem] text-xs leading-5 text-white/50">
                Add a piece from the collection and it will appear here, ready to order.
              </p>
            </div>
          ) : step === 'basket' ? (
            <ul className="flex flex-col gap-3">
              {cart.lines.map((line) => {
                const product = findProduct(line.code)
                return (
                  <li key={line.code} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/40">
                      {product ? <ProductMedia product={product} className="size-16" /> : <ShoppingBag className="size-5 text-white/30" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="mt-0.5 text-[11px] text-white/45">{rupees(line.price)} each</p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 rounded-full border border-white/12 p-0.5">
                          <button
                            onClick={() => cart.setQuantity(line.code, line.quantity - 1)}
                            aria-label={`Reduce quantity of ${line.name}`}
                            className="flex size-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="tnum w-6 text-center text-xs font-semibold">{line.quantity}</span>
                          <button
                            onClick={() => cart.setQuantity(line.code, line.quantity + 1)}
                            aria-label={`Increase quantity of ${line.name}`}
                            className="flex size-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <p className="tnum text-sm font-semibold text-champagne">{rupees(line.price * line.quantity)}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => cart.remove(line.code)}
                      aria-label={`Remove ${line.name}`}
                      className="self-start rounded-lg p-1.5 text-white/35 transition hover:bg-white/8 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <form id="sf-checkout" onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Your name" value={form.name} onChange={(value) => set({ name: value })} placeholder="e.g. Lakshmi Rao" required />
              <Field label="Mobile number" value={form.phone} onChange={(value) => set({ phone: value })} placeholder="e.g. 98765 43210" inputMode="tel" required hint="The shop calls this number to confirm your order." />
              <Field label="Email (optional)" value={form.email} onChange={(value) => set({ email: value })} placeholder="you@example.com" inputMode="email" />

              <div>
                <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase">How would you like it?</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'PICKUP', label: 'Store pickup', hint: shop?.storeHours ?? 'Collect from the shop' },
                    { value: 'DELIVERY', label: 'Home delivery', hint: 'We call to arrange' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => set({ fulfilment: option.value })}
                      aria-pressed={form.fulfilment === option.value}
                      className={`rounded-2xl border p-3 text-left transition ${form.fulfilment === option.value ? 'border-champagne/60 bg-champagne/10' : 'border-white/12 hover:border-white/25'
                        }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        {form.fulfilment === option.value && <Check className="size-3 text-champagne" />}
                        {option.label}
                      </span>
                      <span className="mt-1 block text-[10px] leading-4 text-white/45">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {form.fulfilment === 'DELIVERY' && (
                <div className="animate-rise-in flex flex-col gap-4">
                  <Field label="Delivery address" value={form.address} onChange={(value) => set({ address: value })} placeholder="House, street, area" required />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="City" value={form.city} onChange={(value) => set({ city: value })} placeholder="Hyderabad" />
                    <Field label="PIN code" value={form.pincode} onChange={(value) => set({ pincode: value })} placeholder="500083" inputMode="numeric" />
                  </div>
                  <p className="rounded-xl bg-white/5 px-3 py-2 text-[11px] leading-5 text-white/55">
                    {cart.subtotal >= FREE_DELIVERY_ABOVE
                      ? 'Delivery is free on this order.'
                      : `Delivery is ₹${DELIVERY_FEE} on orders below ${rupees(FREE_DELIVERY_ABOVE)}.`}{' '}
                    We confirm the time over the phone.
                  </p>
                </div>
              )}

              <Field label="Anything we should know? (optional)" value={form.notes} onChange={(value) => set({ notes: value })} placeholder="Gift packing, a preferred time to visit…" />

              {error && (
                <p role="alert" className="rounded-xl bg-red-500/12 px-3 py-2 text-xs text-red-200">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>

        {cart.lines.length > 0 && (
          <footer className="border-t border-white/10 px-5 py-4">
            <dl className="mb-3 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between text-white/60">
                <dt>Subtotal</dt>
                <dd className="tnum">{rupeesExact(cart.subtotal)}</dd>
              </div>
              {step === 'details' && (
                <div className="flex justify-between text-white/60">
                  <dt>Delivery</dt>
                  <dd className="tnum">{deliveryFee === 0 ? 'Free' : rupeesExact(deliveryFee)}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold">
                <dt>{step === 'details' ? 'Total' : 'Basket total'}</dt>
                <dd className="tnum text-champagne">{rupeesExact(step === 'details' ? total : cart.subtotal)}</dd>
              </div>
            </dl>

            {step === 'basket' ? (
              <div className="flex flex-col gap-2">
                <button onClick={() => setStep('details')} className="sf-btn sf-btn-gold h-12 w-full text-sm">
                  Continue to details <ArrowRight className="size-4" />
                </button>
                <button onClick={cart.clear} className="text-[11px] text-white/40 transition hover:text-white/75">
                  Clear basket
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button type="submit" form="sf-checkout" disabled={busy} className="sf-btn sf-btn-gold h-12 w-full text-sm disabled:opacity-60">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {busy ? 'Sending your order…' : 'Place order'}
                </button>
                <button onClick={() => setStep('basket')} className="text-[11px] text-white/45 transition hover:text-white/80">
                  Back to basket
                </button>
                <p className="text-center text-[10px] leading-4 text-white/35">
                  No payment is taken online. The shop confirms your order and payment by phone.
                </p>
              </div>
            )}

            {(whatsapp || call) && (
              <p className="mt-3 border-t border-white/10 pt-3 text-center text-[11px] text-white/45">
                Need help?{' '}
                {call && (
                  <a href={call} className="text-champagne hover:underline">
                    Call the shop
                  </a>
                )}
                {call && whatsapp && ' · '}
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noreferrer" className="text-champagne hover:underline">
                    WhatsApp
                  </a>
                )}
              </p>
            )}
          </footer>
        )}
      </aside>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
  inputMode,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: ReactNode
  required?: boolean
  inputMode?: 'text' | 'tel' | 'email' | 'numeric'
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase">{label}</span>
      <input
        required={required}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-white/12 bg-black/25 px-3 text-sm text-white transition placeholder:text-white/30 focus:border-champagne/70"
      />
      {hint && <span className="text-[10px] leading-4 text-white/40">{hint}</span>}
    </label>
  )
}