'use client'

// The free-gift bot.
//
// The standing "free gift on bills above ₹500" promise used to be a passive
// strip in the page. This is the same promise, said out loud: a small animated
// helper that slides up from the corner, waves, and holds a speech bubble with
// the offer. It replaces the banner, so the message reaches a customer wherever
// they are on the page rather than only if they scroll past a ribbon.
//
// Rules that keep it welcome rather than noisy:
//   · it waits a moment, so it never competes with the first paint of the shop
//   · it is shown at most once per browser session — a refresh cannot re-trigger
//     it, and once dismissed it stays gone for that visit
//   · it can always be dismissed, and the little bot stays as a tap target, so
//     a customer who dismissed the bubble can bring the offer back deliberately
//   · it sits clear of the back-to-top button (right) and the phone bottom bar

import { useEffect, useState } from 'react'
import { Gift, Sparkles, X } from 'lucide-react'
import { FREE_GIFT_ABOVE, rupees } from '@/lib/store'

/** How long the page settles before the bot introduces itself. */
const APPEAR_DELAY_MS = 2600

/** Session key, so a dismissed bot does not reappear on every scroll. */
const SEEN_KEY = 'sf-gift-bot-seen'

export default function FreeGiftBot({ onShop }: { onShop?: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Already introduced this session — leave the customer in peace.
    try {
      if (window.sessionStorage.getItem(SEEN_KEY) === '1') {
        // The bot itself stays, collapsed, as a tap target; only the bubble is
        // held back, so the offer is never more than one tap away.
        setMounted(true)
        return
      }
    } catch {
      // Storage blocked (private mode): show the bot anyway, it is just an offer.
    }

    const enter = window.setTimeout(() => setMounted(true), 900)
    const greet = window.setTimeout(() => {
      setOpen(true)
      try {
        window.sessionStorage.setItem(SEEN_KEY, '1')
      } catch {
        // Nothing to do — the bubble is already open.
      }
    }, APPEAR_DELAY_MS)

    return () => {
      window.clearTimeout(enter)
      window.clearTimeout(greet)
    }
  }, [])

  // Escape closes the bubble, like any other dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!mounted) return null

  return (
    <div className="sf-bot" data-open={open}>
      {/*
        The speech bubble.

        Rendered only while open so a dismissed bubble takes no space and leaves
        nothing behind for a screen reader to trip over.
      */}
      {open && (
        <div className="sf-bot-bubble" role="dialog" aria-label={`Free gift on bills above ${rupees(FREE_GIFT_ABOVE)}`}>
          <button onClick={() => setOpen(false)} aria-label="Close this message" className="sf-bot-bubble-close">
            <X className="size-3.5" />
          </button>

          <p className="sf-bot-bubble-eyebrow">
            <Sparkles className="size-3" /> A little something
          </p>
          <p className="sf-bot-bubble-title">
            Free gift on bills above <span className="tnum">{rupees(FREE_GIFT_ABOVE)}</span>
          </p>
          <p className="sf-bot-bubble-desc">
            Add a piece, and a small gift goes in the bag with it — chosen at the counter.
          </p>

          <div className="sf-bot-bubble-actions">
            <button
              onClick={() => {
                setOpen(false)
                onShop?.()
              }}
              className="sf-bot-bubble-cta"
            >
              <Gift className="size-3.5" /> Shop the collection
            </button>
            <button onClick={() => setOpen(false)} className="sf-bot-bubble-later">
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* The bot. A button, so the offer is one tap away when the bubble is shut. */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="sf-bot-avatar"
        aria-expanded={open}
        aria-label={open ? 'Hide the free-gift offer' : 'Show the free-gift offer'}
      >
        <span className="sf-bot-antenna" aria-hidden>
          <span className="sf-bot-antenna-tip" />
        </span>

        <span className="sf-bot-head" aria-hidden>
          <span className="sf-bot-eye" />
          <span className="sf-bot-eye" />
          <span className="sf-bot-mouth" />
        </span>

        <span className="sf-bot-body" aria-hidden>
          <Gift className="sf-bot-gift" strokeWidth={2.2} />
        </span>
      </button>
    </div>
  )
}
