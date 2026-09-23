'use client'

// ===========================================================================
// Sharing a piece.
//
// A customer rarely buys jewellery alone: the piece is sent to a mother, a
// husband, a friend, or a group. So sharing has to be one tap from the place
// they are already looking — the product card — and it has to offer the three
// channels people actually use, in the order they use them on a phone:
//
//   1. WhatsApp, with the piece's name, code and price already written out
//   2. The phone's own share sheet, which covers Instagram, Messages, mail
//   3. Copy link, for anywhere else
//
// The link always points at /product/<code>, which is a page of its own, so the
// recipient sees one piece rather than a whole grid to scroll through.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, Share2, X } from 'lucide-react'
import { canShareNatively, copyText, productLink, productShareMessage, whatsappLink } from '@/lib/store'

type ShareProduct = { code: number; name: string; price: number }

type State = 'idle' | 'busy' | 'copied' | 'failed'

export function shareUrlFor(code: number): string {
  // window is always available here: every caller is a click handler.
  return productLink(code, typeof window === 'undefined' ? undefined : window.location.origin)
}

/** The one-tap path used by cards and the product page: the OS share sheet. */
export async function shareProduct(product: ShareProduct, shopName?: string | null): Promise<boolean> {
  const url = shareUrlFor(product.code)
  if (canShareNatively()) {
    try {
      await navigator.share({ title: product.name, text: productShareMessage(product, shopName), url })
      return true
    } catch (error) {
      // The customer dismissed the sheet — not a failure worth reporting.
      if (error instanceof DOMException && error.name === 'AbortError') return false
    }
  }
  return copyText(url)
}

export default function ShareMenu({
  product,
  shopName,
  whatsapp,
  onShared,
  className = '',
  buttonClassName = '',
  label = 'Share',
  icon = <Share2 className="size-3.5" />,
}: {
  product: ShareProduct
  shopName?: string | null
  /** The shop's WhatsApp number, so the enquiry lands in the right chat. */
  whatsapp?: string | null
  onShared?: () => void
  className?: string
  buttonClassName?: string
  label?: string
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>('idle')
  const container = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape, so the panel never traps the customer
  // inside a product card they were only passing through.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const copy = useCallback(async () => {
    setState('busy')
    const done = await copyText(shareUrlFor(product.code))
    setState(done ? 'copied' : 'failed')
    if (done) onShared?.()
    window.setTimeout(() => setState('idle'), 2200)
  }, [product.code, onShared])

  const native = useCallback(async () => {
    setState('busy')
    const done = await shareProduct(product, shopName)
    setState(done ? 'copied' : 'idle')
    if (done) onShared?.()
    window.setTimeout(() => setState('idle'), 2200)
  }, [product, shopName, onShared])

  const url = shareUrlFor(product.code)
  const whatsappHref = whatsappLink(whatsapp, `${productShareMessage(product, shopName)} ${url}`)

  return (
    <div ref={container} className={`relative ${className}`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        aria-expanded={open}
        aria-label={`Share ${product.name}`}
        title="Share this piece"
        className={buttonClassName}
      >
        {state === 'copied' ? <Check className="size-3.5" /> : icon}
        {label && <span>{state === 'copied' ? 'Link copied' : label}</span>}
      </button>

      {open && (
        <div
          // stopPropagation keeps the card's own click behaviour (opening the
          // piece) from firing when the customer is only picking a channel.
          onClick={(event) => event.stopPropagation()}
          className="bell-panel sf-share-panel absolute z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white p-2 text-left shadow-xl"
          style={{ color: 'var(--sf-body)' }}
          role="menu"
          aria-label={`Share ${product.name}`}
        >
          <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--sf-muted)' }}>
            Share this piece
          </p>

          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                onShared?.()
                setOpen(false)
              }}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition hover:bg-cream"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-maroon)' }}>
                <WhatsAppMark />
              </span>
              Send on WhatsApp
            </a>
          )}

          {canShareNatively() && (
            <button
              type="button"
              onClick={native}
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition hover:bg-cream"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-maroon)' }}>
                <Share2 className="size-3.5" />
              </span>
              More sharing options
            </button>
          )}

          <button
            type="button"
            onClick={copy}
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition hover:bg-cream"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-cream" style={{ color: 'var(--sf-maroon)' }}>
              {state === 'busy' ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
            </span>
            {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Could not copy — copy it from the address bar' : 'Copy link'}
          </button>

          <p className="mt-1 truncate border-t border-line px-2.5 pt-2 text-[10px]" style={{ color: 'var(--sf-muted)' }}>
            {url}
          </p>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full transition hover:bg-cream"
            aria-label="Close share options"
            style={{ color: 'var(--sf-muted)' }}
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}

/** The WhatsApp glyph, drawn inline so no icon font or extra request is needed. */
export function WhatsAppMark({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`sf-share-mark ${className}`} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.26.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.7-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.96-.14.17-.29.19-.54.07-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.41-.55-.42h-.48c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.17 1.69 2.58 4.09 3.62.57.25 1.02.39 1.37.5.57.19 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  )
}