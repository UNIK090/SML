'use client'

// Top-level client component: owns shared data and routes between sections.
//
// Data comes from the cached hook in lib/use-api, so switching sections paints
// instantly from cache and revalidates in the background.

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import AppShell, { type SectionKey } from '@/components/app-shell'
import { Notice } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import { useApi, writeCache } from '@/lib/use-api'
import type { BrandAssets, Dashboard, Invoice, Item, Shop } from '@/lib/types'

// Keep the first billing-desk bundle small; each work area is fetched only
// when it is opened, while the app shell remains interactive immediately.
const SectionFallback = () => (
  <div className="grid gap-4 sm:grid-cols-2">
    {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl border-hairline bg-secondary/60" />)}
  </div>
)
const BillingSection = dynamic(() => import('@/components/sections/billing-section'), { loading: SectionFallback })
const PaymentsSection = dynamic(() => import('@/components/sections/payments-section'), { loading: SectionFallback })
const ItemsSection = dynamic(() => import('@/components/sections/items-section'), { loading: SectionFallback })
const ReportsSection = dynamic(() => import('@/components/sections/reports-section'), { loading: SectionFallback })
const ProfileSection = dynamic(() => import('@/components/sections/profile-section'), { loading: SectionFallback })
const InvoiceModal = dynamic(() => import('@/components/invoice-modal'))
const PaymentSuccess = dynamic(() => import('@/components/payment-success'))

export default function BillingDashboard() {
  const { t } = usePreferences()
  const [section, setSection] = useState<SectionKey>('billing')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [success, setSuccess] = useState<{ invoiceNumber: string; amount: string } | null>(null)
  const [paid, setPaid] = useState<{ invoiceNumber: string; amount: string } | null>(null)

  // The server supplies the current India business month on every request, so
  // this remains correct when an open billing desk rolls past midnight.
  const dashboard = useApi<Dashboard>('/api/dashboard', { refreshInterval: 30_000 })
  const items = useApi<Item[]>('/api/items', { refreshInterval: 60_000 })
  const shop = useApi<Shop>('/api/shop', { refreshInterval: 300_000 })
  const session = useApi<{ email: string }>('/api/auth/session')
  const brand = useApi<BrandAssets>('/api/brand?info=1')

  const hasLogo = Boolean(brand.data?.logo)
  const logoVersion = brand.data?.updatedAt ?? '1'

  // Revalidating while data is already on screen drives the thin top bar rather
  // than replacing content with a skeleton.
  const isRevalidating =
    (dashboard.isValidating && Boolean(dashboard.data)) ||
    (items.isValidating && Boolean(items.data)) ||
    (shop.isValidating && Boolean(shop.data)) ||
    (dashboard.isLoading && Boolean(dashboard.data))

  const refresh = useCallback(() => {
    void dashboard.refresh()
    void items.refresh()
  }, [dashboard, items])

  const openInvoice = useCallback(async (invoiceNumber: string) => {
    try {
      const response = await fetch(`/api/invoice?invoiceNumber=${encodeURIComponent(invoiceNumber)}`)
      const text = await response.text()
      if (!response.ok) return
      setInvoice(JSON.parse(text) as Invoice)
    } catch {
      // The notice below already covers connectivity problems.
    }
  }, [])

  // A profile save should update the shell's shop name immediately.
  const handleShopChanged = useCallback(
    (next: Shop) => {
      writeCache('/api/shop', next)
    },
    [],
  )

  const handleBrandChanged = useCallback((next: BrandAssets) => {
    writeCache('/api/brand?info=1', next)
  }, [])

  return (
    <>
      {isRevalidating && <div className="top-progress" role="status" aria-label={t('common.loading')} />}

      <AppShell
        section={section}
        onSectionChange={setSection}
        shopName={shop.data?.name ?? 'Sri Maha Laxmi Jewellers'}
        adminEmail={session.data?.email ?? ''}
        brand={brand.data}
      >
        {dashboard.error && (
          <div className="mb-5">
            <Notice tone="danger">{dashboard.error}</Notice>
          </div>
        )}

        {/* Keying on the section restarts the entrance animation on every switch. */}
        <div key={section} className="animate-section">
          {section === 'billing' && (
            <BillingSection
              items={items.data ?? []}
              itemsLoading={items.isLoading}
              dashboard={dashboard.data ?? null}
              dashboardLoading={dashboard.isLoading}
              shop={shop.data ?? null}
              refresh={refresh}
              onOpenInvoice={openInvoice}
              onSaved={setSuccess}
            />
          )}
          {section === 'payments' && (
            <PaymentsSection
              dashboard={dashboard.data ?? null}
              dashboardLoading={dashboard.isLoading}
              refresh={refresh}
              onOpenInvoice={openInvoice}
              onPaid={setPaid}
            />
          )}
          {section === 'items' && <ItemsSection items={items.data ?? []} loading={items.isLoading} refresh={refresh} />}
          {section === 'reports' && <ReportsSection dashboard={dashboard.data ?? null} dashboardLoading={dashboard.isLoading} />}
          {section === 'profile' && <ProfileSection onShopChanged={handleShopChanged} onBrandChanged={handleBrandChanged} />}
        </div>
      </AppShell>

      <PaymentSuccess
        open={success !== null}
        title={t('success.billSaved')}
        hint={success?.invoiceNumber ?? ''}
        amount={success?.amount}
        onDone={() => setSuccess(null)}
        onViewInvoice={success ? () => { const target = success; setSuccess(null); openInvoice(target.invoiceNumber) } : undefined}
      />

      <PaymentSuccess
        open={paid !== null}
        title={t('success.paidTitle')}
        hint={paid?.invoiceNumber ?? ''}
        amount={paid?.amount}
        onDone={() => setPaid(null)}
        onViewInvoice={paid ? () => { const target = paid; setPaid(null); openInvoice(target.invoiceNumber) } : undefined}
      />

      {invoice && (
        <InvoiceModal
          invoice={invoice}
          shop={shop.data ?? null}
          hasLogo={hasLogo}
          logoVersion={logoVersion}
          onClose={() => setInvoice(null)}
        />
      )}
    </>
  )
}
