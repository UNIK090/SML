'use client'

// Top-level client component: owns shared data and routes between sections.
//
// Data comes from the cached hook in lib/use-api, so switching sections paints
// instantly from cache and revalidates in the background.

import { useCallback, useMemo, useState } from 'react'
import AppShell, { type SectionKey } from '@/components/app-shell'
import BillingSection from '@/components/sections/billing-section'
import PaymentsSection from '@/components/sections/payments-section'
import ItemsSection from '@/components/sections/items-section'
import ProfileSection from '@/components/sections/profile-section'
import InvoiceModal from '@/components/invoice-modal'
import PaymentSuccess from '@/components/payment-success'
import { Notice } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import { useApi, writeCache } from '@/lib/use-api'
import type { Dashboard, Invoice, Item, Shop } from '@/lib/types'

const todayIso = () => new Date().toISOString().slice(0, 10)
const firstOfMonthIso = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function BillingDashboard() {
  const { t } = usePreferences()
  const [section, setSection] = useState<SectionKey>('billing')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [success, setSuccess] = useState<{ invoiceNumber: string; amount: string } | null>(null)
  const [paid, setPaid] = useState<{ invoiceNumber: string; amount: string } | null>(null)

  const range = useMemo(() => `from=${firstOfMonthIso()}&to=${todayIso()}`, [])
  const dashboardUrl = `/api/dashboard?${range}`

  const dashboard = useApi<Dashboard>(dashboardUrl)
  const items = useApi<Item[]>('/api/items')
  const shop = useApi<Shop>('/api/shop')
  const session = useApi<{ email: string }>('/api/auth/session')
  const logo = useApi<unknown>('/api/logo')

  const hasLogo = Boolean(logo.data) && !logo.error
  const logoVersion = 1

  // Revalidating while data is already on screen drives the thin top bar rather
  // than replacing content with a skeleton.
  const isRevalidating =
    (dashboard.isValidating && Boolean(dashboard.data)) ||
    (items.isValidating && Boolean(items.data)) ||
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

  return (
    <>
      {isRevalidating && <div className="top-progress" role="status" aria-label={t('common.loading')} />}

      <AppShell
        section={section}
        onSectionChange={setSection}
        shopName={shop.data?.name ?? 'Sri Maha Laxmi Jewellers'}
        adminEmail={session.data?.email ?? ''}
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
          {section === 'profile' && <ProfileSection onShopChanged={handleShopChanged} />}
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
