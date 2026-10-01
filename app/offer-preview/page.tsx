// Temporary harness: mount the OfferPopup with a synthetic live offer to prove
// the component renders and its CSS applies. Not part of the app.
'use client'

import { useState } from 'react'
import OfferPopup from '@/components/store/offer-popup'
import { OfferBanner, OfferCards } from '@/components/store/store-sections'
import type { PublicOffer } from '@/lib/types'

const OFFER: PublicOffer = {
  id: 9999,
  title: 'Diwali Offer',
  description: 'Flat 10% off on all silver pieces this week.',
  code: 'DIWALI10',
  discountType: 'percent',
  discountValue: 10,
  savingsLabel: '10% off',
  accent: 'red',
  startsOn: '2026-09-25',
  endsOn: '2026-11-15',
  state: 'ACTIVE',
  daysLeft: 45,
  hasBanner: false,
  bannerVersion: null,
}

export default function OfferPreviewPage() {
  const [log, setLog] = useState('')
  return (
    <div className="sf-canvas min-h-screen p-6">
      <p id="probe" className="text-sm">
        harness mounted · onShop fired: {log || 'no'}
      </p>
      <OfferBanner offer={OFFER} onShop={() => setLog('banner')} />
      <OfferCards offers={[OFFER]} onSelect={() => setLog('card')} />
      <OfferPopup offer={OFFER} shopName="SRI MAHA LAXMI JEWELLERS" onShop={() => setLog('popup')} />
    </div>
  )
}


