'use client'

// Payments section: review every bill, filter by status and date range, and
// settle a pending one. Where Billing creates invoices, this is where money is
// reconciled — the two were previously mixed into one screen.

import { useCallback, useEffect, useState } from 'react'
import { BadgeIndianRupee, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Clock4, Eye, Loader2, Search, Trash2, TrendingUp, Wallet, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, Notice, SectionHeading, SkeletonRows, Select, StatCard, Table, WorkspaceHero, formatDay, money } from '@/components/ui'
import { usePreferences } from '@/components/preferences'
import type { Dashboard, Invoice, Transaction } from '@/lib/types'

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
  const [deletingInvoice, setDeletingInvoice] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  /**
   * The bill whose line items are open, and the fetched invoice behind it.
   *
   * `loading` and `error` live here too so one row can show a spinner and a
   * failed load can be explained, instead of the panel silently staying empty.
   */
  const [itemsOpen, setItemsOpen] = useState<{ loading: string | null; invoice: Invoice | null; error: string }>({
    loading: null,
    invoice: null,
    error: '',
  })
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

  // Escape closes the items panel, like any other overlay.
  useEffect(() => {
    if (!itemsOpen.invoice && itemsOpen.loading === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setItemsOpen({ loading: null, invoice: null, error: '' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [itemsOpen])

  /**
   * Loads one bill's line items by invoice number.
   *
   * Reuses the invoice endpoint the printed bill already uses, so the items shown
   * here are the same rows the customer's receipt is built from — one source of
   * truth rather than a second, subtly different query.
   */
  const openItems = async (invoiceNumber: string) => {
    setItemsOpen({ loading: invoiceNumber, invoice: null, error: '' })
    try {
      const response = await fetch(`/api/invoice?invoiceNumber=${encodeURIComponent(invoiceNumber)}`)
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setItemsOpen({ loading: null, invoice: null, error: result.error ?? 'Could not load the items on this bill.' })
        return
      }
      setItemsOpen({ loading: null, invoice: result as Invoice, error: '' })
    } catch {
      setItemsOpen({ loading: null, invoice: null, error: 'Could not load the items on this bill.' })
    }
  }

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

  /**
   * Removes a single bill.
   *
   * Deliberately a two-step confirmation naming the invoice number: this deletes
   * the customer's record, so the prompt says exactly which one is about to go.
   * The row is taken out of the list only after the server confirms, because a
   * bill that disappeared from the screen but survived in the database would be
   * worse than a slow delete.
   */
  const deleteTransaction = async (invoiceNumber: string) => {
    if (!window.confirm(`Delete invoice ${invoiceNumber}? Its line items and any customer photos go with it, and this cannot be undone.`)) return
    setDeletingInvoice(invoiceNumber)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/payments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber }),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) {
        setError(result.error ?? 'Could not delete that bill.')
        return
      }
      setMessage(`${invoiceNumber} deleted. Its daily total was recalculated.`)
      await load()
      refresh()
    } catch {
      setError('Could not delete that bill.')
    } finally {
      setDeletingInvoice(null)
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
                      {/*
                        The invoice number, and the way into the bill itself.

                        "View items" opens the full line-item list for this exact
                        invoice, with the counter photo when one was taken. The
                        list is the primary record — a thumbnail alone cannot tell
                        the admin which pieces were billed — so the photo sits
                        inside the panel rather than replacing the invoice link.
                      */}
                      <div className="flex items-center gap-2.5">
                        {bill.billPhoto && (
                          <img
                            src={`/api/invoice/bill-photo?id=${bill.billPhoto.id}`}
                            alt=""
                            loading="lazy"
                            className="size-9 shrink-0 rounded-lg border-hairline bg-secondary object-cover"
                          />
                        )}
                        <span className="min-w-0">
                          <button onClick={() => onOpenInvoice(bill.invoiceNumber)} className="block truncate text-left font-medium transition hover:text-gold-deep">
                            {bill.invoiceNumber}
                          </button>
                          <button
                            type="button"
                            onClick={() => void openItems(bill.invoiceNumber)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-gold-deep transition hover:underline"
                          >
                            {itemsOpen?.loading === bill.invoiceNumber ? (
                              <><Loader2 className="size-3 animate-spin" /> Loading…</>
                            ) : (
                              <><Eye className="size-3" /> View items</>
                            )}
                          </button>
                        </span>
                      </div>
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
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant={bill.paymentStatus === 'PAID' ? 'outline' : 'success'}
                          disabled={busyInvoice === bill.invoiceNumber || deletingInvoice === bill.invoiceNumber}
                          onClick={() => setPaymentStatus(bill.invoiceNumber, bill.paymentStatus === 'PAID' ? 'PENDING' : 'PAID')}
                          className="!h-9 !px-3 text-xs"
                        >
                          {busyInvoice === bill.invoiceNumber ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                          {bill.paymentStatus === 'PAID' ? t('payments.markPending') : t('payments.markPaid')}
                        </Button>
                        <button
                          type="button"
                          onClick={() => void deleteTransaction(bill.invoiceNumber)}
                          disabled={deletingInvoice === bill.invoiceNumber}
                          aria-label={`Delete invoice ${bill.invoiceNumber}`}
                          title="Delete this bill"
                          className="flex size-9 items-center justify-center rounded-xl border-hairline bg-card text-muted-foreground transition hover:bg-red-50 hover:text-destructive disabled:opacity-55 dark:hover:bg-red-950/25"
                        >
                          {deletingInvoice === bill.invoiceNumber ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                        </button>
                      </div>
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

      {/*
        The items on one bill, opened from the invoice number.

        This is the point of the screen: the Payments list says what was paid,
        and this says what was bought. The line items come from the same invoice
        endpoint the printed receipt uses, and the counter photo — when one was
        taken — sits alongside them as the visual record of the same bill.
      */}
      {(itemsOpen.invoice || itemsOpen.loading !== null || itemsOpen.error) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 py-8 backdrop-blur-sm sm:py-12" role="dialog" aria-modal="true" aria-label="Items on this bill">
          <button className="fixed inset-0 cursor-default" aria-hidden onClick={() => setItemsOpen({ loading: null, invoice: null, error: '' })} />

          <div className="animate-rise-in relative z-10 w-full max-w-2xl rounded-3xl border-hairline bg-card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.14em] text-gold-deep uppercase">Items billed</p>
                <h3 className="mt-1 truncate text-lg font-semibold tracking-tight">
                  {itemsOpen.invoice?.invoiceNumber ?? itemsOpen.loading ?? 'Loading…'}
                </h3>
                {itemsOpen.invoice && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {itemsOpen.invoice.customerName || t('common.walkIn')}
                    {itemsOpen.invoice.customerPhone ? ` · ${itemsOpen.invoice.customerPhone}` : ''}
                    {' · '}{formatDay(itemsOpen.invoice.businessDay)}
                  </p>
                )}
              </div>
              <button
                aria-label="Close items"
                onClick={() => setItemsOpen({ loading: null, invoice: null, error: '' })}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            {itemsOpen.loading !== null ? (
              <div className="mt-5"><SkeletonRows rows={4} /></div>
            ) : itemsOpen.error ? (
              <div className="mt-5"><Notice tone="danger">{itemsOpen.error}</Notice></div>
            ) : itemsOpen.invoice ? (
              <>
                {/* The counter photo of the whole bill, when one was taken. */}
                {itemsOpen.invoice.billPhoto ? (
                  <section className="mt-5 rounded-2xl border border-dashed border-gold/45 bg-gold-soft/30 p-4">
                    <p className="text-xs font-semibold">Item photo captured at the counter</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">The pieces on this bill as they left the shop · private to the admin</p>
                    <img
                      src={`/api/invoice/bill-photo?id=${itemsOpen.invoice.billPhoto.id}`}
                      alt={`Items billed on ${itemsOpen.invoice.invoiceNumber}`}
                      className="mt-3 max-h-80 w-full rounded-xl border-hairline bg-card object-contain"
                    />
                  </section>
                ) : (
                  <p className="mt-5 rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
                    No item photo was captured for this bill.
                  </p>
                )}

                <div className="mt-5 overflow-x-auto">
                  <Table head={['Item', 'Qty', 'Rate', 'Amount']}>
                    {itemsOpen.invoice.lines.map((line) => (
                      <tr key={line.id} className="border-b border-hairline last:border-0">
                        <td className="py-2.5">
                          <span className="block text-sm font-medium">{line.itemName}</span>
                          <span className="block text-[11px] text-muted-foreground">Code {line.itemCode} · {line.category}</span>
                        </td>
                        <td className="py-2.5 text-sm">{line.quantity}</td>
                        <td className="tnum py-2.5 text-sm">{money(Number(line.unitPrice))}</td>
                        <td className="tnum py-2.5 text-sm font-semibold">{money(Number(line.lineTotal))}</td>
                      </tr>
                    ))}
                  </Table>
                </div>

                {/* The same arithmetic the receipt shows, so the two never disagree. */}
                <div className="mt-4 flex flex-col items-end gap-1 text-sm">
                  <div className="tnum flex w-full max-w-xs justify-between text-muted-foreground">
                    <span>{t('common.subtotal')}</span>
                    <span>{money(itemsOpen.invoice.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0))}</span>
                  </div>
                  {Number(itemsOpen.invoice.discount) > 0 && (
                    <div className="tnum flex w-full max-w-xs justify-between text-muted-foreground">
                      <span>{t('common.discount')}</span>
                      <span>− {money(Number(itemsOpen.invoice.discount))}</span>
                    </div>
                  )}
                  <div className="tnum flex w-full max-w-xs justify-between border-t border-hairline pt-1.5 text-base font-semibold">
                    <span>{t('common.total')}</span>
                    <span>{money(Number(itemsOpen.invoice.totalAmount))}</span>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => { const n = itemsOpen.invoice!.invoiceNumber; setItemsOpen({ loading: null, invoice: null, error: '' }); onOpenInvoice(n) }}>
                    Open full invoice
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
