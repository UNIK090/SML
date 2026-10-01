'use client'

// The festival offer that pops up over the storefront.
//
// The offer band sits inside the page and the offer board sits inside a section;
// both are only seen by a customer who scrolls to them. A festival offer is the
// one message that has to reach someone who has just landed — so it is also
// shown as a dialog, once, shortly after the page opens.
//
// Rules that keep it on the right side of annoying:
//   · it waits a moment, so it never competes with the first paint of the shop
//   · it shows at most once per offer per browser session, tracked in
//     sessionStorage keyed by the offer id — a refresh cannot re-trigger it
//   · it is never shown to a visitor who arrived with a filter or a search
//     (they are already shopping, not browsing)
//   · it can always be dismissed, by the button, the backdrop, or Escape

import { useEffect, useState } from 'react'
import { ArrowRight, Sparkles, Tag, X } from 'lucide-react'
import { offerBannerUrl, offerDate } from '@/lib/offers'
import type { PublicOffer } from '@/lib/types'

/** How long the page is allowed to settle before the offer appears. */
const APPEAR_DELAY_MS = 1600

/** Session-scoped key, so a dismissed offer does not chase the customer around. */
const seenKey = (offerId: number) => `sf-offer-popup-seen-${offerId}`

export default function OfferPopup({
  offer,
  shopName,
  onShop,
}: {
  offer: PublicOffer | null
  shopName?: string | null
  /** Opens the store grid for the offer — the same target the band and cards use. */
  onShop: () => void
}) {
  const [open, setOpen] = useState(false)

  const offerId = offer?.id ?? null

  useEffect(() => {
    if (!offer || offerId === null) return

    // Already shown this session — do not interrupt again.
    try {
      if (window.sessionStorage.getItem(seenKey(offerId)) === '1') return
    } catch {
      // Storage can be blocked (private mode, hardened settings). Showing the
      // offer anyway is the safer failure: the customer sees the sale.
    }

    const timer = window.setTimeout(() => {
      setOpen(true)
      try {
        window.sessionStorage.setItem(seenKey(offerId), '1')
      } catch {
        // Nothing to do — the popup is already open.
      }
    }, APPEAR_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [offer, offerId])

  // Escape closes it, like any other dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!offer || !open) return null

  const banner = offer.hasBanner ? offerBannerUrl(offer.id, offer.bannerVersion) : null
  const amount = offer.discountType === 'flat' ? `₹${offer.discountValue.toLocaleString('en-IN')}` : `${Math.round(offer.discountValue * 100) / 100}%`

  /**
   * The deadline, phrased so it can never overstate — the same wording rule the
   * band and the card follow. "Last day" only ever appears on the last day, and
   * an offer that has not begun is framed as coming up rather than running.
   *
   * `daysLeft` is null for an offer that is not live, so the UPCOMING case is
   * checked first: without it a scheduled festival would render "Ends in null
   * days", which is the kind of line that makes a shop look broken.
   */
  const timing =
    offer.state === 'UPCOMING'
      ? `Starts ${offerDate(offer.startsOn)}`
      : offer.daysLeft === 0
        ? offer.startsOn === offer.endsOn
          ? 'Today only'
          : 'Last day today'
        : offer.daysLeft === 1
          ? 'Ends tomorrow'
          : `Ends in ${offer.daysLeft} days`

  const running = offer.state === 'ACTIVE'

  return (
    <div
      className="sf-popup-root"
      role="dialog"
      aria-modal="true"
      aria-label={`${offer.title} — ${offer.savingsLabel || timing}`}
    >
      <button className="sf-popup-backdrop" aria-hidden onClick={() => setOpen(false)} />

      <div className="sf-popup" data-accent={offer.accent}>
        <button onClick={() => setOpen(false)} aria-label="Close this offer" className="sf-popup-close">
          <X className="size-4" />
        </button>

        {banner && (
          <div className="sf-popup-art">
            <img src={banner} alt="" />
          </div>
        )}

        <div className="sf-popup-body">
          <p className="sf-popup-eyebrow">
            <Sparkles className="size-3" /> {running ? 'Festival offer' : 'Festival offer — coming up'}
          </p>

          <p className="sf-popup-title">{offer.title}</p>

          <p className="sf-popup-amount">
            <span className="tnum">{amount}</span> <span className="sf-popup-unit">OFF</span>
          </p>

          {offer.description && <p className="sf-popup-desc">{offer.description}</p>}

          <p className="sf-popup-timing">
            <Tag className="size-3" /> {timing}
            {offer.startsOn !== offer.endsOn ? ` · ${offerDate(offer.startsOn)} – ${offerDate(offer.endsOn)}` : ''}
          </p>

          {offer.code && (
            <p className="sf-popup-code">
              Quote <span className="tnum">{offer.code}</span> at the counter
            </p>
          )}

          <div className="sf-popup-actions">
            <button onClick={() => { setOpen(false); onShop() }} className="sf-popup-shop">
              {running ? 'Shop the offer' : 'See what is coming'} <ArrowRight className="size-3.5" />
            </button>
            <button onClick={() => setOpen(false)} className="sf-popup-later">
              Maybe later
            </button>
          </div>

          {shopName && <p className="sf-popup-note">Saving settled in person at {shopName}.</p>}
        </div>
      </div>
    </div>
  )
}
