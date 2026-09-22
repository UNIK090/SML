'use client'

// The Orders screen.
//
// This is where an online order becomes a sale. The flow the screen is built
// around, in the order it actually happens at the counter:
//
//   order lands (realtime)  ->  call the customer  ->  confirm  ->  take payment
//   ->  raise the GST invoice in Billing  ->  mark it billed here
//
// The list is live: it is kept current by the realtime hook and it can be
// worked entirely from the keyboard-less counter tablet.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  PackagePlus,
  Phone,
  RefreshCw,
  Search,
  Store,
  Truck,
  X,
  Zap,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, Notice, SectionHeading, Skeleton, StatCard, WorkspaceHero, money } from '@/components/ui'
import { useRealtimeOrders } from '@/components/orders/use-realtime-orders'
import { ORDER_STATUS_LABELS, telLink, whatsappLink } from '@/lib/store'
import type { Order } from '@/lib/types'

const STATUS_TONES: Record<string, 'neutral' | 'success' | 'warn' | 'gold'> = {
  NEW: 'gold',
  CONFIRMED: 'neutral',
  READY: 'warn',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

/** The next step a shopkeeper would naturally take for each status. */
const NEXT_ACTION: Record<string, { status: string; label: string; short: string } | null> = {
  NEW: { status: 'CONFIRMED', label: 'Confirm with customer', short: 'Confirm' },
  CONFIRMED: { status: 'READY', label: 'Mark packed & ready', short: 'Mark ready' },
  READY: { status: 'COMPLETED', label: 'Mark handed over', short: 'Hand over' },
  COMPLETED: null,
  CANCELLED: null,
}

const ORDER_STAGES = ['NEW', 'CONFIRMED', 'READY', 'COMPLETED'] as const

/** Icon per status, so a row is identifiable before you read its label. */
const STAGE_ICONS = { NEW: BellRing, CONFIRMED: Package, READY: PackageCheck, COMPLETED: Check } as const

const STATUS_STRIPES: Record<Order['status'], string> = {
  NEW: 'from-gold/70 via-gold/25 to-transparent',
  CONFIRMED: 'from-sky-500/60 via-sky-500/20 to-transparent',
  READY: 'from-warn/70 via-warn/25 to-transparent',
  COMPLETED: 'from-success/60 via-success/20 to-transparent',
  CANCELLED: 'from-border via-border/40 to-transparent',
}

/**
 * How long an order has been sitting, in plain words.
 *
 * This exists because "ordered 6 hours ago and still unconfirmed" is the one
 * thing a counter needs to SEE, not calculate. Fresh orders read calm; anything
 * past an hour and still unconfirmed turns urgent, because that is about when a
 * customer starts wondering whether their order went through.
 */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function describeAge(from: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(from).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/**
 * Only raise the banner once an unconfirmed order has been waiting a while.
 * A banner that appears the second an order lands would fire on every order and
 * stop meaning anything.
 */
function awaitingIsOldest(order: Order, now: number) {
  return now - new Date(order.createdAt).getTime() > 30 * 60_000
}

/** More than an hour unconfirmed turns the age chip urgent. */
function isUrgent(order: Order, now: number) {
  return order.status === 'NEW' && now - new Date(order.createdAt).getTime() > 60 * 60_000
}

/** A compact, at-a-glance delivery path shown on every order card. */
function OrderJourney({ status }: { status: Order['status'] }) {
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="flex size-5 items-center justify-center rounded-full bg-secondary">×</span>
        Order cancelled
      </div>
    )
  }

  const current = ORDER_STAGES.indexOf(status as (typeof ORDER_STAGES)[number])

  return (
    <ol className="flex items-center gap-1.5" aria-label={`Order progress: ${ORDER_STATUS_LABELS[status] ?? status}`}>
      {ORDER_STAGES.map((stage, index) => {
        const reached = index <= current
        const complete = index < current
        const isCurrent = index === current
        return (
          <li key={stage} className="flex items-center">
            {index > 0 && <span className={`mx-1 h-px w-4 sm:w-6 ${index <= current ? 'bg-gold' : 'bg-border'}`} aria-hidden />}
            <span
              title={ORDER_STATUS_LABELS[stage]}
              className={`relative flex size-6 items-center justify-center rounded-full transition ${
                isCurrent
                  ? 'bg-gold text-slate-950 ring-4 ring-gold-soft'
                  : reached
                    ? 'bg-gold-soft text-gold-deep'
                    : 'bg-secondary text-muted-foreground/70'
              }`}
            >
              {complete ? <Check className="size-3" strokeWidth={3} /> : <span className="text-[9px] font-bold">{index + 1}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default function OrdersSection({ onRaiseBill }: { onRaiseBill?: () => void }) {
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const realtime = useRealtimeOrders({ filters: { status, q: query } })

  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const today = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return realtime.orders.filter((order) => new Date(order.createdAt) >= start)
  }, [realtime.orders])

  const todayValue = today.reduce((sum, order) => sum + Number(order.totalAmount), 0)
  const waiting = realtime.orders.filter((order) => order.status === 'NEW').length
  const now = useNow()

  /** Live tally per status, so the tabs double as a dashboard. */
  const counts = useMemo(() => {
    const tally: Record<string, number> = { '': realtime.orders.length }
    for (const order of realtime.orders) tally[order.status] = (tally[order.status] ?? 0) + 1
    return tally
  }, [realtime.orders])

  /** The oldest order still waiting on a phone call — the one to ring first. */
  const oldestNew = useMemo(() => {
    const pending = realtime.orders.filter((order) => order.status === 'NEW')
    if (pending.length === 0) return null
    return pending.reduce((oldest, order) =>
      new Date(order.createdAt) < new Date(oldest.createdAt) ? order : oldest,
    )
  }, [realtime.orders])

  const update = useCallback(
    async (order: Order, patch: { status?: string; paymentStatus?: string }) => {
      setBusy(order.orderNumber)
      setError('')
      setMessage('')
      try {
        const response = await fetch('/api/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNumber: order.orderNumber, ...patch }),
        })
        const text = await response.text()
        const result = text ? JSON.parse(text) : {}
        if (!response.ok) {
          setError(result.error ?? 'Could not update that order.')
          return
        }
        const label = patch.status ? ORDER_STATUS_LABELS[patch.status] : patch.paymentStatus === 'PAID' ? 'Paid' : 'Payment pending'
        setMessage(`${order.orderNumber} · ${label}`)
        realtime.refresh()
      } catch {
        setError('Could not reach the server. Please try again.')
      } finally {
        setBusy('')
      }
    },
    [realtime],
  )

  const copySummary = async (order: Order) => {
    const lines = order.lines.map((line) => `· ${line.itemName} ×${line.quantity} — ${money(Number(line.lineTotal))}`).join('\n')
    const summary = [
      `Order ${order.orderNumber}`,
      `${order.customerName} · ${order.customerPhone}`,
      order.fulfilment === 'DELIVERY' ? `Deliver to: ${order.addressLine ?? ''} ${order.city ?? ''} ${order.pincode ?? ''}`.trim() : 'Store pickup',
      lines,
      `Total ${money(Number(order.totalAmount))} (${order.paymentStatus === 'PAID' ? 'paid' : 'payment pending'})`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(summary)
      setMessage(`${order.orderNumber} summary copied — paste it into WhatsApp or a message.`)
    } catch {
      setError('Could not copy to the clipboard on this browser.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHero
        eyebrow="Online store"
        title="Live orders"
        description="Orders placed on your website arrive here the moment a customer sends them. Confirm, take payment, then raise the bill in Billing."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 rounded-xl border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur">
              <span className={realtime.connected ? 'sf-live-dot' : 'size-2 rounded-full bg-warn'} />
              {realtime.connected ? 'Live feed connected' : 'Reconnecting'}
            </span>
            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 backdrop-blur transition hover:bg-white/20"
            >
              <Store className="size-3.5" /> View the website
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          icon={BellRing}
          label="Waiting to be confirmed"
          value={String(waiting)}
          hint={waiting > 0 ? 'Call the customer to confirm' : 'Nothing needs attention'}
          tone={waiting > 0 ? 'gold' : 'success'}
        />
        <StatCard icon={Package} label="Open orders" value={String(realtime.openCount)} hint="New, confirmed or ready" />
        <StatCard icon={PackageCheck} label="Orders today" value={String(today.length)} hint="Placed since midnight" />
        <StatCard icon={Truck} label="Order value today" amount={todayValue} hint="Before any pending payment" tone="gold" />
      </section>

      <Card className="business-primary-card">
        <SectionHeading
          title="All online orders"
          description="Search by order number, name or phone. Everything updates itself as orders arrive."
          action={
            <Button variant="outline" onClick={realtime.refresh} disabled={realtime.refreshing}>
              {realtime.refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
          }
        />

        {/* The one order that most needs a phone call, pulled to the top. */}
        {oldestNew && awaitingIsOldest(oldestNew, now) && (
          <div className="order-attention mb-5 flex flex-wrap items-center gap-3 rounded-2xl border-gold/40 bg-gold-soft/50 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold text-slate-950">
              <Zap className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gold-deep">
                {waiting === 1 ? '1 order is waiting for a call' : `${waiting} orders are waiting for a call`}
              </p>
              <p className="mt-0.5 text-xs text-gold-deep/80">
                {oldestNew.customerName} ordered {describeAge(oldestNew.createdAt, now)} — take the oldest first.
              </p>
            </div>
            {telLink(oldestNew.customerPhone) && (
              <a
                href={telLink(oldestNew.customerPhone)!}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-gold px-3.5 text-xs font-semibold text-slate-950 transition hover:opacity-90"
              >
                <Phone className="size-3.5" /> Call {oldestNew.customerName.split(' ')[0]}
              </a>
            )}
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter by status">
            {[{ value: '', label: 'All' }, ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label }))].map(
              (tab) => (
                <button
                  key={tab.value || 'all'}
                  role="tab"
                  aria-selected={status === tab.value}
                  data-active={status === tab.value}
                  onClick={() => setStatus(tab.value)}
                  className="order-tab flex items-center gap-2 rounded-xl border-hairline bg-card px-3 py-2 text-xs font-medium"
                >
                  {tab.label}
                  <span
                    className={`tnum rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      status === tab.value ? 'bg-white/20' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {counts[tab.value] ?? 0}
                  </span>
                </button>
              ),
            )}
          </div>

          <label className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Order number, customer name, or mobile"
              className="!pl-9"
            />
          </label>

          {(status || query) && (
            <Button
              variant="ghost"
              onClick={() => {
                setStatus('')
                setQuery('')
              }}
            >
              <X className="size-3.5" /> Clear
            </Button>
          )}
        </div>

        <div className="flex-col gap-3">
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          {realtime.error && <Notice tone="danger">{realtime.error}</Notice>}
        </div>

        <div className="mt-5">
          {realtime.loading ? (
            <div className="flex flex-col gap-3" role="status" aria-label="Loading orders">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="business-list-row rounded-2xl p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : realtime.orders.length === 0 ? (
            <EmptyState
              icon={Package}
              title={status || query ? 'No orders match' : 'No online orders yet'}
              description={
                status || query
                  ? 'Try a different search, or clear the filters to see every order.'
                  : 'Publish items in the Store screen and share your website link. Orders will appear here in real time.'
              }
            />
          ) : (
            <ul className="stagger flex-col gap-3">
              {realtime.orders.map((order) => {
                const open = expanded === order.orderNumber
                const next = NEXT_ACTION[order.status]
                const call = telLink(order.customerPhone)
                const whatsapp = whatsappLink(order.customerPhone, `Hello ${order.customerName}, about your order ${order.orderNumber}.`)
                const stale = !order.ackedAt && order.status === 'NEW'
                const urgent = isUrgent(order, now)
                const StageIcon = STAGE_ICONS[order.status as keyof typeof STAGE_ICONS] ?? Package

                return (
                  <li
                    key={order.orderNumber}
                    data-open={open}
                    className={`order-row overflow-hidden rounded-2xl border-hairline bg-card/95 shadow-[var(--shadow-sm)] ${stale ? 'order-attention' : ''}`}
                  >
                    {/* A colour spine keyed to status: readable from across the counter. */}
                    <span className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${STATUS_STRIPES[order.status]}`} aria-hidden />
                    {open && <span className="order-edge" aria-hidden />}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 pr-4 pl-5">
                      <span
                        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                          order.status === 'NEW' ? 'bg-gold text-slate-950' : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        <StageIcon className="size-5" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tnum text-sm font-semibold">{order.orderNumber}</span>
                          <Badge tone={STATUS_TONES[order.status] ?? 'neutral'}>
                            {ORDER_STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                          <span
                            data-urgent={urgent}
                            className="order-age tnum inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <Clock3 className="size-3" /> {describeAge(order.createdAt, now)}
                          </span>
                        </div>

                        <p className="mt-1.5 truncate text-sm">
                          <span className="font-medium">{order.customerName}</span> ·{' '}
                          <span className="tnum text-muted-foreground">{order.customerPhone}</span>
                          <span className="mx-1.5 text-border">|</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            {order.fulfilment === 'DELIVERY' ? <Truck className="size-3" /> : <Store className="size-3" />}
                            {order.fulfilment === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                          </span>
                        </p>

                        {/* A peek at what was actually ordered, so the row means
                            something without expanding it. */}
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {order.lines[0]?.itemName ?? 'Order'}
                          {order.itemCount > 1 && ` +${order.itemCount - 1} more`}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-3">
                        <OrderJourney status={order.status} />

                        <div className="text-right">
                          <p className="tnum text-base font-semibold">{money(Number(order.totalAmount))}</p>
                          <p
                            className={`text-[10px] font-semibold tracking-wide uppercase ${
                              order.paymentStatus === 'PAID' ? 'text-success' : 'text-warn'
                            }`}
                          >
                            {order.paymentStatus === 'PAID' ? 'Paid' : 'Payment pending'}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {call && (
                          <a
                            href={call}
                            aria-label={`Call ${order.customerName}`}
                            className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs font-medium transition hover:bg-secondary"
                          >
                            <Phone className="size-3.5 text-success" /> Call
                          </a>
                        )}

                        {/* The next step sits on the row itself, so the counter
                            never has to expand an order just to move it on. */}
                        {next && (
                          <button
                            onClick={() => void update(order, { status: next.status })}
                            disabled={busy === order.orderNumber}
                            className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-60 ${
                              order.status === 'NEW'
                                ? 'bg-gold text-slate-950 hover:opacity-90'
                                : 'border-hairline bg-card hover:bg-secondary'
                            }`}
                          >
                            {busy === order.orderNumber ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <PackageCheck className="size-3.5" />
                            )}
                            {next.short}
                          </button>
                        )}

                        <button
                          onClick={() =>
                            void update(order, { paymentStatus: order.paymentStatus === 'PAID' ? 'PENDING' : 'PAID' })
                          }
                          disabled={busy === order.orderNumber}
                          className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-60 ${
                            order.paymentStatus === 'PAID'
                              ? 'border-hairline bg-card hover:bg-secondary'
                              : 'bg-success text-white hover:opacity-90'
                          }`}
                        >
                          <Check className="size-3.5" />
                          {order.paymentStatus === 'PAID' ? 'Mark unpaid' : 'Mark paid'}
                        </button>

                        <button
                          onClick={() => setExpanded(open ? null : order.orderNumber)}
                          aria-expanded={open}
                          className="flex size-9 items-center justify-center rounded-xl border-hairline bg-card transition hover:bg-secondary"
                          aria-label={open ? 'Hide order details' : 'Show order details'}
                        >
                          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="order-detail border-t border-hairline bg-secondary/30 px-4 py-4">
                        <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
                          <div>
                            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Pieces ordered</p>
                            <ul className="divide-y divide-border rounded-2xl border-hairline bg-card/70">
                              {order.lines.map((line) => (
                                <li key={line.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm">{line.itemName}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Code {line.itemCode} · {line.category} · {money(Number(line.unitPrice))} × {line.quantity}
                                    </p>
                                  </div>
                                  <p className="tnum shrink-0 text-sm font-medium">{money(Number(line.lineTotal))}</p>
                                </li>
                              ))}
                            </ul>

                            {(order.addressLine || order.notes) && (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {order.addressLine && (
                                  <p className="flex items-start gap-2 rounded-xl bg-secondary/70 px-3 py-2.5 text-xs leading-5">
                                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                    <span>
                                      {order.addressLine}
                                      {order.city ? `, ${order.city}` : ''}
                                      {order.pincode ? ` ${order.pincode}` : ''}
                                    </span>
                                  </p>
                                )}
                                {order.notes && (
                                  <p className="rounded-xl bg-gold-soft px-3 py-2.5 text-xs leading-5 text-gold-deep">
                                    Note from customer: {order.notes}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-3">
                            <div className="rounded-2xl border-hairline bg-card/70 p-4">
                              <p className="mb-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                What happens next
                              </p>
                              {order.status === 'CANCELLED' ? (
                                <p className="text-xs leading-5 text-muted-foreground">This order was cancelled.</p>
                              ) : next ? (
                                <button
                                  onClick={() => void update(order, { status: next.status })}
                                  disabled={busy === order.orderNumber}
                                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gold text-xs font-semibold text-slate-950 transition hover:opacity-92 disabled:opacity-60"
                                >
                                  {busy === order.orderNumber ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}
                                  {next.label}
                                </button>
                              ) : (
                                <p className="text-xs leading-5 text-muted-foreground">
                                  This order is finished. If it has not been billed yet, raise the invoice in Billing so it counts in the
                                  day&apos;s earnings.
                                </p>
                              )}

                              <div className="mt-3 flex-wrap gap-2">
                                <button
                                  onClick={() => void copySummary(order)}
                                  className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs transition hover:bg-secondary"
                                >
                                  <Copy className="size-3.5" /> Copy summary
                                </button>
                                {whatsapp && (
                                  <a
                                    href={whatsapp}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs transition hover:bg-secondary"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                                {onRaiseBill && (
                                  <button
                                    onClick={onRaiseBill}
                                    className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs transition hover:bg-secondary"
                                  >
                                    <PackagePlus /> Raise bill
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="rounded-2xl border-hairline bg-card/70 p-4">
                              <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Other states</p>
                              <div className="flex flex-wrap gap-1.5">
                                {(['NEW', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'] as const)
                                  .filter((value) => value !== order.status)
                                  .map((value) => (
                                    <button
                                      key={value}
                                      onClick={() => void update(order, { status: value })}
                                      disabled={busy === order.orderNumber}
                                      className="rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-secondary/70 disabled:opacity-60"
                                    >
                                      {ORDER_STATUS_LABELS[value]}
                                    </button>
                                  ))}
                              </div>
                              {order.invoiceNumber ? (
                                <p className="mt-3 text-[11px] text-success">Billed as {order.invoiceNumber}.</p>
                              ) : (
                                <p className="mt-3 text-[11px] text-muted-foreground">
                                  Not billed yet. Any payment you mark here is recorded against this order.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
