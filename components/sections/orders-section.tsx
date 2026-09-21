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

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Filter,
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
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, Notice, SectionHeading, Select, Skeleton, StatCard, WorkspaceHero, money } from '@/components/ui'
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
const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  NEW: { status: 'CONFIRMED', label: 'Confirm with customer' },
  CONFIRMED: { status: 'READY', label: 'Mark packed & ready' },
  READY: { status: 'COMPLETED', label: 'Mark handed over' },
  COMPLETED: null,
  CANCELLED: null,
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

        <div className="mb-5 flex-wrap items-end gap-3">
          <label className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Order number, customer name, or mobile"
              className="!pl-9"
            />
          </label>
          <label className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="!w-48">
              <option value="">All statuses</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
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

                return (
                  <li
                    key={order.orderNumber}
                    className={`business-list-row rounded-2xl ${stale ? '!border-gold/45 !bg-gold-soft/40' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tnum text-sm font-semibold">{order.orderNumber}</span>
                          <Badge tone={STATUS_TONES[order.status] ?? 'neutral'}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
                          <Badge tone={order.paymentStatus === 'PAID' ? 'success' : 'warn'}>
                            {order.paymentStatus === 'PAID' ? 'PAID' : 'PAYMENT PENDING'}
                          </Badge>
                          {stale && <span className="text-[10px] font-bold tracking-[0.14em] text-gold-deep uppercase">New</span>}
                        </div>
                        <p className="mt-1.5 truncate text-sm">
                          {order.customerName} · <span className="tnum">{order.customerPhone}</span>
                        </p>
                        <p className="mt-0.5 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>
                            {new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            {order.fulfilment === 'DELIVERY' ? <Truck className="size-3" /> : <Store className="size-3" />}
                            {order.fulfilment === 'DELIVERY' ? 'Home delivery' : 'Store pickup'}
                          </span>
                          <span>
                            {order.itemCount} {order.itemCount === 1 ? 'piece' : 'pieces'}
                          </span>
                        </p>
                      </div>

                      <p className="tnum shrink-0 text-base font-semibold">{money(Number(order.totalAmount))}</p>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {call && (
                          <a href={call} className="flex h-9 items-center gap-1.5 rounded-xl border-hairline bg-card px-3 text-xs font-medium transition hover:bg-secondary">
                            <Phone className="size-3.5 text-success" /> Call
                          </a>
                        )}
                        <button
                          onClick={() => void update(order, { paymentStatus: order.paymentStatus === 'PAID' ? 'PENDING' : 'PAID' })}
                          disabled={busy === order.orderNumber}
                          className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-60 ${order.paymentStatus === 'PAID' ? 'border-hairline bg-card hover:bg-secondary' : 'bg-success text-white hover:opacity-90'
                            }`}
                        >
                          {busy === order.orderNumber ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
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
                      <div className="animate-rise-in border-t border-hairline px-4 py-4">
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
