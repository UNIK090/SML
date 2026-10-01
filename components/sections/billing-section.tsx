'use client'

// Billing section: build a multi-item invoice and hand it to the customer.
//
// The cart and the send-invoice interaction both live here; the surrounding
// shell owns navigation and the sign-out control.

import { useEffect, useMemo, useState } from 'react'
import { Camera, FileText, ImagePlus, Loader2, Minus, Plus, ReceiptText, Search, ShoppingBag, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, Notice, SectionHeading, Skeleton, SkeletonRows, Select, WorkspaceHero, money } from '@/components/ui'
import BarcodeScanner from '@/components/barcode-scanner'
import { usePreferences } from '@/components/preferences'
import type { BillPhoto, CartLine, Dashboard, Item, Shop } from '@/lib/types'

export default function BillingSection({
  items,
  dashboard,
  shop,
  refresh,
  onOpenInvoice,
  onSaved,
  itemsLoading,
  dashboardLoading,
}: {
  items: Item[]
  itemsLoading: boolean
  dashboard: Dashboard | null
  dashboardLoading: boolean
  shop: Shop | null
  refresh: () => void
  onOpenInvoice: (invoiceNumber: string) => void
  onSaved: (info: { invoiceNumber: string; amount: string }) => void
}) {
  const { t } = usePreferences()
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Item[]>([])
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('PAID')
  const [saving, setSaving] = useState(false)
  const [billPhoto, setBillPhoto] = useState<BillPhoto | undefined>(undefined)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const customerPhotoLimit = 700 * 1024
  const allowedCustomerPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

  // Debounced free-text search across name, category and code.
  useEffect(() => {
    const term = search.trim()
    if (!term) {
      setMatches([])
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/items?q=${encodeURIComponent(term)}`)
        if (!cancelled) setMatches(response.ok ? await response.json() : [])
      } catch {
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  // `customerPrice` lets the barcode scanner hand back an operator-entered price.
  // Otherwise the line starts at 0 — the operator types the amount in the bill.
  const addToCart = (item: Item, customerPrice?: number) => {
    setMessage('')
    setError('')
    const unitPrice = customerPrice !== undefined && Number.isFinite(customerPrice) && customerPrice >= 0 ? customerPrice : 0
    setCart((prev) => {
      const existing = prev.find((line) => line.code === item.code)
      // Each add inserts exactly one row at qty 1. Re-adding the same code only
      // refreshes its price — it never bumps the quantity or duplicates the row.
      if (existing) return prev.map((line) => (line.code === item.code ? { ...line, unitPrice: unitPrice || line.unitPrice } : line))
      return [
        ...prev,
        { code: item.code, name: item.name, category: item.category, cataloguePrice: Number(item.price), unitPrice, quantity: 1 },
      ]
    })
    setSearch('')
    setMatches([])
  }

  const updateLine = (code: number, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((line) => (line.code === code ? { ...line, ...patch } : line)))
  const removeLine = (code: number) => setCart((prev) => prev.filter((line) => line.code !== code))

  /**
   * Attaches the single reference photo for the whole bill.
   *
   * One frame is taken with every piece being billed laid out together, rather
   * than a separate picture per line: the admin reviewing the invoice later wants
   * to see the whole transaction at a glance, and a bill is a single event. Any
   * newly attached photo replaces the previous one.
   */
  const attachBillPhoto = (file: File | undefined) => {
    if (!file) return
    setMessage('')
    setError('')
    if (!allowedCustomerPhotoTypes.has(file.type)) {
      setError('Use a PNG, JPEG, GIF, or WebP photo of the billed items.')
      return
    }
    if (file.size === 0 || file.size > customerPhotoLimit) {
      setError(`The bill photo must be under ${customerPhotoLimit / 1024} KB.`)
      return
    }

    setPhotoLoading(true)
    const reader = new FileReader()
    reader.onerror = () => {
      setPhotoLoading(false)
      setError('Could not read that bill photo. Please try another image.')
    }
    reader.onload = () => {
      setPhotoLoading(false)
      const result = typeof reader.result === 'string' ? reader.result : ''
      const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(result)
      if (!match) {
        setError('Could not read that bill photo. Use a PNG, JPEG, GIF, or WebP image.')
        return
      }
      setBillPhoto({ mime: match[1], data: match[2], byteSize: file.size })
    }
    reader.readAsDataURL(file)
  }

  const clearCart = () => {
    setCart([])
    setDiscount('')
    setCustomerName('')
    setCustomerPhone('')
    setPaymentStatus('PAID')
    setBillPhoto(undefined)
    setPhotoLoading(false)
  }

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart])
  const discountValue = Math.max(0, Number(discount) || 0)
  const total = Math.max(0, subtotal - discountValue)

  // One representative item per kind of piece, so the quick-add panel shows a
  // single Ring, Earrings, Chain, Bracelet, Necklace … instead of the whole
  // catalogue. The first item of each category wins; ties keep catalogue order.
  const categoryPicks = useMemo(() => {
    const firstOfCategory = new Map<string, Item>()
    for (const item of items) {
      const key = item.category.trim()
      if (!key) continue
      if (!firstOfCategory.has(key)) firstOfCategory.set(key, item)
    }
    return [...firstOfCategory.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, item]) => ({ category, item }))
  }, [items])

  const createBill = async () => {
    setMessage('')
    setError('')
    if (cart.length === 0) return setError('Add at least one item to the bill.')
    if (photoLoading) return setError('Wait for the bill photo to finish loading.')
    if (cart.some((line) => line.unitPrice <= 0)) return setError('Enter an amount for every item.')
    if (discountValue > subtotal) return setError('The discount cannot be more than the subtotal.')

    setSaving(true)
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((line) => ({
            code: line.code,
            quantity: line.quantity,
            billedPrice: line.unitPrice,
          })),
          billPhoto: billPhoto ? { data: billPhoto.data } : undefined,
          discount: discountValue,
          paymentStatus,
          customerName,
          customerPhone,
        }),
      })
      const text = await response.text()
      const result = text ? JSON.parse(text) : {}
      if (!response.ok) return setError(result.error ?? 'Could not save the bill.')

      let note = `Invoice ${result.invoiceNumber} saved — ${money(total)} for ${cart.length} item${cart.length > 1 ? 's' : ''}.`
      if (result.sendStatus === 'SCHEDULED') note += ` ${result.sendDetail ?? 'Invoice delivery is being sent in the background.'}`
      else if (result.sendStatus === 'SENT') note += ' Invoice sent to the customer.'
      else if (result.sendStatus === 'QUEUED' && result.sendLink) {
        window.open(result.sendLink, '_blank', 'noopener')
        note += ' WhatsApp opened to send the invoice.'
      } else if (result.sendStatus === 'FAILED') note += ` Sending failed: ${result.sendDetail ?? 'unknown error'}.`

      setMessage(note)
      clearCart()
      refresh()
      // Raise the success dialog after the data has been refreshed, so the
      // dashboard behind it already shows the new bill.
      onSaved({ invoiceNumber: result.invoiceNumber, amount: money(total) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the bill.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Sales operations"
        title="Billing command centre"
        description="Build accurate invoices, manage customer details, and keep revenue flowing from one focused workspace."
        action={
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur">
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgb(52_211_153_/_15%)]" /> Live business day
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="business-hero-metric rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-slate-300 uppercase">Sales today</p>
            <p className="tnum mt-1 text-xl font-semibold text-white">{money(dashboard?.todayTotal ?? 0)}</p>
          </div>
          <div className="business-hero-metric rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-slate-300 uppercase">Invoices today</p>
            <p className="mt-1 text-xl font-semibold text-white">{dashboard?.todayCount ?? 0}</p>
          </div>
          <div className="business-hero-metric rounded-2xl p-3.5">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-slate-300 uppercase">Pending collection</p>
            <p className="tnum mt-1 text-xl font-semibold text-white">{money(dashboard?.pendingTotal ?? 0)}</p>
          </div>
        </div>
      </WorkspaceHero>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(21rem,0.7fr)]">
      <Card className="business-primary-card">
        <SectionHeading
          title={t('billing.new')}
          description={t('billing.new.hint')}
          action={
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <FileText className="size-5" />
            </span>
          }
        />

        <div className="mb-4">
          <BarcodeScanner onAdd={(item, price) => addToCart(item, price)} />
        </div>

        <div className="catalogue-search relative">
          <Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-gold-deep" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('billing.searchPlaceholder')}
            className="!border-gold/70 !pl-10 font-medium"
            aria-label={t('common.search')}
          />
          {searching && <span className="absolute top-3.5 right-3.5 text-xs text-muted-foreground">{t('billing.searching')}</span>}
        </div>

        {matches.length > 0 && (
          <div className="card-shadow mt-2 max-h-72 overflow-y-auto rounded-2xl border-hairline bg-card">
            {matches.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="flex w-full items-center justify-between border-b border-hairline px-4 py-3 text-left transition last:border-0 hover:bg-gold-soft/50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold">{item.code}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">{item.category} · {money(Number(item.price))}</span>
                  </span>
                </span>
                <Plus className="size-4 shrink-0 text-gold-deep" />
              </button>
            ))}
          </div>
        )}
        {search.trim() && !searching && matches.length === 0 && (
          <p className="mt-2 rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{t('billing.noMatch')}</p>
        )}

        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBag className="size-4 text-muted-foreground" />
              {t('billing.items')} ({cart.length})
            </h3>
            {cart.length > 0 && (
              <button onClick={clearCart} className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-destructive">
                <Trash2 className="size-3.5" /> {t('billing.clear')}
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t('billing.empty.title')} description={t('billing.empty.hint')} />
          ) : (
            <div className="flex flex-col gap-3">
              {cart.map((line) => (
                <div key={line.code} className="business-list-row rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Code {line.code} · {line.category} · catalogue {money(line.cataloguePrice)}
                      </p>
                    </div>
                    <button aria-label={`Remove ${line.name}`} onClick={() => removeLine(line.code)} className="text-muted-foreground transition hover:text-destructive">
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label={t('billing.qty')}>
                      <span className="flex items-center gap-1.5">
                        <button aria-label="Decrease quantity" onClick={() => updateLine(line.code, { quantity: Math.max(1, line.quantity - 1) })} className="flex size-11 shrink-0 items-center justify-center rounded-xl border-hairline transition hover:bg-secondary">
                          <Minus className="size-3.5" />
                        </button>
                        <Input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.code, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                          className="text-center"
                        />
                        <button aria-label="Increase quantity" onClick={() => updateLine(line.code, { quantity: line.quantity + 1 })} className="flex size-11 shrink-0 items-center justify-center rounded-xl border-hairline transition hover:bg-secondary">
                          <Plus className="size-3.5" />
                        </button>
                      </span>
                    </Field>
                    <Field label={t('billing.customerPrice')}>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice === 0 ? '' : line.unitPrice}
                        placeholder="Enter amount"
                        onChange={(event) => updateLine(line.code, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </Field>
                    <Field label={t('billing.lineTotal')}>
                      <p className="tnum flex h-11 items-center text-sm font-semibold">{money(line.unitPrice * line.quantity)}</p>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/*
          One photo of the whole bill.

          Taken with every piece laid out together, this is the admin's record of
          what left the shop on this invoice. It sits above the customer details
          because it belongs to the bill as a whole, not to any single line.
        */}
        {cart.length > 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-gold/50 bg-gold-soft/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <Camera className="size-3.5 text-gold-deep" /> Bill photo — all items together
              </p>
              <span className="text-[11px] text-muted-foreground">One picture for the whole bill · private to the admin</span>
            </div>

            {billPhoto ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <img
                  src={`data:${billPhoto.mime};base64,${billPhoto.data}`}
                  alt="Photo of the items on this bill"
                  className="h-24 w-36 rounded-xl border-hairline bg-card object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">Bill photo attached</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Saved with the invoice as an admin reference</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-semibold text-gold-deep shadow-sm transition hover:bg-white dark:hover:bg-secondary">
                    <ImagePlus className="size-3.5" /> Replace
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        attachBillPhoto(file)
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setBillPhoto(undefined)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-card hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className={photoLoading ? 'pointer-events-none mt-3 opacity-60' : 'mt-3'}>
                {photoLoading ? (
                  <p className="flex min-h-12 items-center gap-2 text-xs font-medium text-gold-deep"><Loader2 className="size-4 animate-spin" /> Preparing bill photo…</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-gold px-3 text-xs font-semibold text-slate-950 shadow-sm transition hover:opacity-90">
                      <Camera className="size-3.5" /> Capture items photo
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        capture="environment"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          attachBillPhoto(file)
                        }}
                      />
                    </label>
                    <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-semibold text-gold-deep shadow-sm transition hover:bg-white dark:hover:bg-secondary">
                      <ImagePlus className="size-3.5" /> Upload photo
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          attachBillPhoto(file)
                        }}
                      />
                    </label>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">Lay out every piece on this bill and take one photo · Capture opens the rear camera on supported phones · PNG, JPEG, GIF, or WebP · up to 700 KB</p>
              </div>
            )}
          </div>
        )}

        {cart.length > 0 && (
          <div className="mt-7 border-t border-hairline pt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('billing.customerName')} hint={t('common.optional')}>
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in" />
              </Field>
              <Field label={t('billing.mobile')} hint={t('billing.mobile.hint')}>
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="10-digit number" inputMode="numeric" />
              </Field>
              <Field label={t('billing.payment')}>
                <Select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
                  <option value="PAID">PAID</option>
                  <option value="PENDING">PENDING</option>
                </Select>
              </Field>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label={t('common.discount')} hint={t('billing.discount.hint')}>
                <Input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0.00" />
              </Field>
              <div className="flex flex-col justify-end gap-1.5 text-sm">
                <div className="tnum flex justify-between text-muted-foreground">
                  <span>{t('common.subtotal')}</span>
                  <span>{money(subtotal)}</span>
                </div>
                {discountValue > 0 && (
                  <div className="tnum flex justify-between text-muted-foreground">
                    <span>{t('common.discount')}</span>
                    <span>− {money(discountValue)}</span>
                  </div>
                )}
                <div className="tnum flex justify-between border-t border-hairline pt-2 text-lg font-semibold">
                  <span>{t('common.total')}</span>
                  <span>{money(total)}</span>
                </div>
              </div>
            </div>

            <Button onClick={createBill} disabled={saving || photoLoading} variant="gold" className="mt-6 w-full">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}
              {saving ? t('common.saving') : t('billing.saveInvoice')}
            </Button>
          </div>
        )}

        <div className="mt-5 flex-col gap-3">
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        <Card className="business-side-card">
          <SectionHeading title={t('billing.quickAdd')} description={t('billing.quickAdd.hint')} />
          {itemsLoading ? (
            <SkeletonRows rows={5} />
          ) : items.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t('billing.catalogueEmpty')} description={t('billing.catalogueEmpty.hint')} />
          ) : (
            <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
              {categoryPicks.map(({ category, item }) => (
                <button
                  key={category}
                  onClick={() => addToCart(item)}
                  className="business-list-row flex items-center justify-between rounded-2xl px-3 py-2.5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold">{item.code}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{category}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.name}</span>
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0 text-gold-deep" />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="business-side-card">
          <SectionHeading title={t('billing.latest')} description={t('billing.latest.hint')} />
          {dashboardLoading ? (
            <SkeletonRows rows={4} />
          ) : !dashboard?.recent?.length ? (
            <EmptyState icon={ReceiptText} title={t('billing.latest.empty')} description={t('billing.latest.empty.hint')} />
          ) : (
            <div className="flex flex-col gap-2">
              {dashboard.recent.slice(0, 6).map((bill) => (
                <button
                  key={bill.invoiceNumber}
                  onClick={() => onOpenInvoice(bill.invoiceNumber)}
                  className="business-list-row flex items-center justify-between rounded-2xl px-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{bill.invoiceNumber}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {bill.customerName || t('common.walkIn')} · {new Date(bill.createdAt).toLocaleString('en-IN')}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tnum text-sm font-semibold">{money(Number(bill.totalAmount))}</span>
                    <Badge tone={bill.paymentStatus === 'PAID' ? 'success' : 'warn'}>{bill.paymentStatus === 'PAID' ? t('common.paid') : t('common.pending')}</Badge>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {shop && !shop.address && (
          <Notice>
            Add your shop address, phone and GSTIN to <span className="font-medium">.env.local</span> so they print on the invoice.
          </Notice>
        )}
      </div>
      </div>
    </div>
  )
}
