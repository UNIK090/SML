'use client'

// Payments section: review every bill, filter by status and date range, and
// settle a pending one. Where Billing creates invoices, this is where money is
// reconciled — the two were previously mixed into one screen.

import { useCallback, useEffect, useState } from 'react'
import { BadgeIndianRupee, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Clock4, Loader2, Search, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, Notice, SectionHeading, SkeletonRows, Select, StatCard, Table, WorkspaceHero, formatDay, money } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import type { Dashboard, Transaction } from '@/lib/types'

type PaymentsResponse = { rows: Transaction[]; total: number; page: number; pages: number }

export default function PaymentsSection({
  dashboard,
  refresh,
  onOpenInvoice,
  onPaid,
  dashboardLoading,
}: {
  dashboard: Dashboard | null
  dashboardLoading: boolean
  refresh: () => void
  onOpenInvoice: (invoiceNumber: string) => void
  onPaid: (info: { invoiceNumber: string; amount: string }) => void
}) {
  const { t } = usePreferences()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PaymentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyInvoice, setBusyInvoice] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '20' })
      if (status) params.set('status', status)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (search.trim()) params.set('q', search.trim())
      const response = await fetch(`/api/payments?${params}`)
      const result = response.ok ? await response.json() : null
      setData(result)
      if (!response.ok) setError('Could not load the payments list.')
    } catch {
      setError('Could not load the payments list.')
    } finally {
      setLoading(false)
    }
  }, [page, status, from, to, search])

  // Reload when any filter changes; reset to page 1 first so a filter never
  // lands on a page that no longer exists.
  useEffect(() => {
    setPage(1)
  }, [status, from, to, search])

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  const setPaymentStatus = async (invoiceNumber: string, next: 'PAID' | 'PENDING') => {
    setBusyInvoice(invoiceNumber)
    setMessage('')
    setError('')

    // Optimistic: flip the row straight away so the tap feels instant. If the
    // server rejects, the reload below restores the real value.
    const previousRows = data?.rows ?? []
    if (data) {
      setData({ ...data, rows: data.rows.map((row) => (row.invoiceNumber === invoiceNumber ? { ...row, paymentStatus: next } : row)) })
    }
    try {
      const response = await fetch('/api/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber, paymentStatus: next }),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        // Roll the optimistic change back.
        if (data) setData({ ...data, rows: previousRows })
        setError(result.error ?? 'Could not update the payment status.')
        return
      }
      setMessage(next === 'PAID' ? `${invoiceNumber} marked as paid.` : `${invoiceNumber} marked as pending.`)
      await load()
      refresh()
      // Celebrate the settlement — this is the moment money arrived.
      if (next === 'PAID') onPaid({ invoiceNumber, amount: money(Number(result.totalAmount ?? 0)) })
    } catch {
      setError('Could not update the payment status.')
    } finally {
      setBusyInvoice(null)
    }
  }

  const clearTransactions = async () => {
    if (!window.confirm('Clear every invoice, payment history, daily total, and invoice send record? Your catalogue and shop settings will remain. This cannot be undone.')) return
    setClearing(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/payments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'CLEAR_TRANSACTIONS' }),
      })
      const result = (await response.json()) as { error?: string; cleared?: number }
      if (!response.ok) {
        setError(result.error ?? 'Could not clear transactions.')
        return
      }
      setData({ rows: [], total: 0, page: 1, pages: 1 })
      setPage(1)
      setMessage(`${result.cleared ?? 0} transaction${result.cleared === 1 ? '' : 's'} cleared. Your catalogue and settings were kept.`)
      refresh()
    } catch {
      setError('Could not clear transactions.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Revenue intelligence"
        title="Payments & performance"
        description="Review cash flow, settle outstanding invoices, and keep a dependable record of every business day."
        action={<span className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur">Financial overview</span>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="business-hero-metric rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-slate-300 uppercase">Month to date</p>
            <p className="tnum mt-1 text-xl font-semibold text-white">{money(dashboard?.rangeTotal ?? 0)}</p>
          </div>
          <div className="business-hero-metric rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-slate-300 uppercase">Open receivables</p>
            <p className="tnum mt-1 text-xl font-semibold text-white">{money(dashboard?.pendingTotal ?? 0)}</p>
          </div>
        </div>
      </WorkspaceHero>

      {/* Two-up until there is genuinely room for four, so large totals never collide. */}
      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard icon={BadgeIndianRupee} label={t('payments.today')} amount={dashboard?.todayTotal ?? 0} hint={`${dashboard?.todayCount ?? 0} ${t('payments.today.hint')}`} tone="gold" loading={dashboardLoading} />
        <StatCard icon={TrendingUp} label={t('payments.allTime')} amount={dashboard?.allTotal ?? 0} hint={`${dashboard?.allCount ?? 0} ${t('payments.allTime.hint')}`} loading={dashboardLoading} />
        <StatCard icon={Clock4} label={t('payments.pending')} amount={dashboard?.pendingTotal ?? 0} hint={`${dashboard?.pendingCount ?? 0} ${t('payments.pending.hint')}`} tone="warn" loading={dashboardLoading} />
        <StatCard icon={Banknote} label={t('payments.range')} amount={dashboard?.rangeTotal ?? 0} hint={`${dashboard?.rangeCount ?? 0} ${t('payments.range.hint')}`} tone="success" loading={dashboardLoading} />
      </section>

      <Card className="business-primary-card">
        <SectionHeading
          title={t('payments.allBills')}
          description={t('payments.allBills.hint')}
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <Wallet className="size-5" />
            </span>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label={t('common.search')}>
            <div className="relative">
              <Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('payments.col.invoice')} className="pl-10" />
            </div>
          </Field>
          <Field label={t('payments.filter.status')}>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">{t('payments.filter.all')}</option>
              <option value="PAID">{t('payments.filter.paid')}</option>
              <option value="PENDING">{t('payments.filter.pending')}</option>
            </Select>
          </Field>
          <Field label={t('payments.filter.from')}>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label={t('payments.filter.to')}>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>

        {(from || to || status || search) && (
          <button
            onClick={() => {
              setFrom('')
              setTo('')
              setStatus('')
              setSearch('')
            }}
            className="mt-3 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            {t('payments.filter.clear')}
          </button>
        )}

        <div className="mt-5 flex-col gap-3">
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="py-4">
              <SkeletonRows rows={6} />
            </div>
          ) : !data?.rows?.length ? (
            <EmptyState icon={Wallet} title={t('payments.empty')} description={t('payments.empty.hint')} />
          ) : (
            <>
              <Table head={[t('payments.col.invoice'), t('payments.col.customer'), t('payments.col.date'), t('payments.col.amount'), t('payments.col.status'), t('payments.col.action')]}>
                {data.rows.map((bill) => (
                  <tr key={bill.invoiceNumber} className="border-b border-hairline last:border-0">
                    <td className="py-3">
                      <button onClick={() => onOpenInvoice(bill.invoiceNumber)} className="text-left font-medium transition hover:text-gold-deep">
                        {bill.invoiceNumber}
                      </button>
                      <span className="block text-xs text-muted-foreground">{bill.itemName}</span>
                    </td>
                    <td className="py-3">
                      <span className="block text-sm">{bill.customerName || t('common.walkIn')}</span>
                      <span className="block text-xs text-muted-foreground">{bill.customerPhone || '—'}</span>
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">{formatDay(bill.businessDay)}</td>
                    <td className="tnum py-3 font-semibold">{money(Number(bill.totalAmount))}</td>
                    <td className="py-3">
                      <Badge tone={bill.paymentStatus === 'PAID' ? 'success' : 'warn'}>{bill.paymentStatus === 'PAID' ? t('common.paid') : t('common.pending')}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant={bill.paymentStatus === 'PAID' ? 'outline' : 'success'}
                        disabled={busyInvoice === bill.invoiceNumber}
                        onClick={() => setPaymentStatus(bill.invoiceNumber, bill.paymentStatus === 'PAID' ? 'PENDING' : 'PAID')}
                        className="!h-9 !px-3 text-xs"
                      >
                        {busyInvoice === bill.invoiceNumber ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                        {bill.paymentStatus === 'PAID' ? t('payments.markPending') : t('payments.markPaid')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>

              <div className="mt-5 flex items-center justify-between text-sm">
                <p className="text-muted-foreground">
                  {data.total} bill{data.total === 1 ? '' : 's'} · page {data.page} of {data.pages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="!h-9 !px-3 text-xs">
                    <ChevronLeft className="size-3.5" /> Prev
                  </Button>
                  <Button variant="outline" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)} className="!h-9 !px-3 text-xs">
                    Next <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeading title={t('payments.daily')} description={t('payments.daily.hint')} />
        {!dashboard?.daily?.length ? (
          <EmptyState icon={Banknote} title={t('payments.daily.empty')} description={t('payments.daily.empty.hint')} />
        ) : (
          <Table head={[t('payments.col.date'), t('payments.col.invoice'), t('payments.col.amount')]}>
            {dashboard.daily.map((row) => (
              <tr key={row.businessDay} className="border-b border-hairline last:border-0">
                <td className="py-3">{formatDay(row.businessDay)}</td>
                <td className="py-3 text-muted-foreground">{row.count}</td>
                <td className="tnum py-3 text-right font-semibold">{money(row.total)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="flex justify-end pt-1">
        <button
          onClick={() => void clearTransactions()}
          disabled={clearing}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-red-50 hover:text-destructive disabled:opacity-55 dark:hover:bg-red-950/25"
          title="Permanently clear all invoices and transaction history"
        >
          {clearing ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          {clearing ? 'Clearing…' : 'Clear transactions'}
        </button>
      </div>
    </div>
  )
}
