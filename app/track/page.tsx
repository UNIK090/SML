'use client'

// "Track an order" landing page.
//
// The customer usually arrives here from the confirmation dialog with the link
// already built, so this is the fallback for anyone who wrote the order number
// down instead. It asks for the number and hands over to the API, which is the
// only thing that can confirm whether the order exists.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Package, Phone } from 'lucide-react'
import { useApi } from '@/lib/use-api'
import { telLink, whatsappLink } from '@/lib/store'
import type { Shop } from '@/lib/types'

export default function TrackPage() {
  const router = useRouter()
  const { data } = useApi<{ shop: Shop }>('/api/store/catalogue')
  const shop = data?.shop ?? null

  const [orderNumber, setOrderNumber] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const call = telLink(shop?.phone)
  const whatsapp = whatsappLink(shop?.whatsapp ?? shop?.phone, 'Hello, I would like to check on my order.')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const number = orderNumber.trim().toUpperCase()
    const secret = token.trim()
    if (!number) return setError('Enter the order number from your confirmation.')
    if (!secret) return setError('Paste the whole link you were given, or ask the shop to send it again.')

    setBusy(true)
    setError('')
    // A quick check so the customer gets a clear answer here rather than a blank
    // tracking page that only says "not found".
    try {
      const response = await fetch(`/api/store/order?orderNumber=${encodeURIComponent(number)}&t=${encodeURIComponent(secret)}`)
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string }
        setError(result.error ?? 'We could not find that order.')
        return
      }
      router.push(`/order/${encodeURIComponent(number)}?t=${encodeURIComponent(secret)}`)
    } catch {
      setError('Could not reach the shop. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="sf-canvas flex min-h-screen items-center justify-center px-5 py-14">
      <div className="w-full max-w-lg">
        <Link href="/" className="sf-btn sf-btn-ghost mb-7 h-9 px-4 text-xs">
          <ArrowLeft className="size-3.5" /> Back to the store
        </Link>

        <div className="sf-card p-7 sm:p-9">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-champagne/12 text-champagne">
            <Package className="size-5" strokeWidth={1.5} />
          </span>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Track your order</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Enter the order number from your confirmation. The order link you were given opens straight to this page — if you still
            have it, just tap that.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase">Order number</span>
              <input
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder="e.g. SML-8K2Q4"
                autoCapitalize="characters"
                className="h-11 rounded-xl border border-white/12 bg-black/25 px-3 text-sm text-white uppercase transition placeholder:text-white/30 focus:border-champagne/70"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase">Order link code</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste the code after ?t= in your link"
                className="h-11 rounded-xl border border-white/12 bg-black/25 px-3 font-mono text-xs text-white transition placeholder:text-white/30 focus:border-champagne/70"
              />
              <span className="text-[10px] leading-4 text-white/40">
                This code is your private key to the order, which is why the order number alone does not open it.
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-xl bg-red-500/12 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="sf-btn sf-btn-gold h-11 w-full text-sm disabled:opacity-60">
              {busy ? 'Looking…' : 'Open my order'} <ArrowRight className="size-4" />
            </button>
          </form>

          {(call || whatsapp) && (
            <p className="mt-6 border-t border-white/8 pt-5 text-xs leading-6 text-white/45">
              Lost the code? Call the shop with your name and order number and they will read out the status.{' '}
              {call && (
                <a href={call} className="inline-flex items-center gap-1 text-champagne hover:underline">
                  <Phone className="size-3" /> {shop?.phone}
                </a>
              )}
              {call && whatsapp && ' or '}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="text-champagne hover:underline">
                  message us on WhatsApp
                </a>
              )}
              .
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
