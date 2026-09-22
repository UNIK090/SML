'use client'

// The notification bell in the desk header.
//
// It exists so a shopkeeper working inside Billing or Items still sees an order
// land — the Orders screen does not have to be the open tab. The badge counts
// orders no device has acknowledged yet, so it clears the moment the panel is
// opened rather than the moment the order arrives.
//
// The panel separates what has not been looked at from what has. That split is
// the whole point: a shop open since morning will have a long list, and the
// three orders nobody has read yet must not be lost inside it.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, BellRing, Check, ChevronRight, Package, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import type { OrderNotification } from '@/lib/types'

const relative = (iso: string) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 30) return 'just now'
  if (seconds < 90) return 'a minute ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export default function NotificationBell({
  unseenCount,
  openCount,
  notifications,
  connected,
  soundOn,
  onToggleSound,
  onOpen,
  onViewOrder,
  onOpenOrders,
  suppressPanel,
}: {
  unseenCount: number
  /** Orders still needing work: new, confirmed, or ready. */
  openCount: number
  notifications: OrderNotification[]
  connected: boolean
  soundOn: boolean
  onToggleSound: () => void
  onOpen: () => void
  onViewOrder: (orderNumber: string) => void
  onOpenOrders: () => void
  /**
   * Set while an order toast is on screen. The toast and this panel both occupy
   * the top-right corner and the toast sits above it, so rather than stack two
   * overlays on the same spot the panel yields — the toast is the louder signal
   * and already offers "open order" and "seen".
   */
  suppressPanel?: boolean
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [ringing, setRinging] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  /** Event ids dismissed locally, so a cleared item stays cleared. */
  const [cleared, setCleared] = useState<Set<string>>(() => new Set())
  const previousUnseen = useRef(unseenCount)

  // Anything that is both new and unacknowledged must visibly demand attention
  // — a silent badge is easy to miss across a shop counter. The ref is written
  // here and ONLY here: a second effect touching the same ref would race this
  // one and swallow the rise that should trigger the ring.
  useEffect(() => {
    if (unseenCount <= previousUnseen.current) return
    previousUnseen.current = unseenCount
    setRinging(true)
    const timer = window.setTimeout(() => setRinging(false), 2400)
    return () => window.clearTimeout(timer)
  }, [unseenCount])

  // The count can also fall — the shop may acknowledge an order on another
  // device — so keep the ref honest on the way down as well.
  useEffect(() => {
    previousUnseen.current = unseenCount
  }, [unseenCount])

  // Yield the corner to the toast while one is showing.
  useEffect(() => {
    if (suppressPanel) setPanelOpen(false)
  }, [suppressPanel])

  const visible = useMemo(
    () => notifications.filter((notification) => !cleared.has(notification.eventId)),
    [notifications, cleared],
  )

  /**
   * The first `unseenCount` entries of the feed are the ones nobody has read.
   * The feed is newest-first and the server counts unacknowledged orders, so the
   * split is positional rather than something every row has to carry.
   */
  const unreadIds = useMemo(() => new Set(visible.slice(0, unseenCount).map((n) => n.eventId)), [visible, unseenCount])
  const unreadCount = unreadIds.size
  const shown = unreadOnly ? visible.filter((n) => unreadIds.has(n.eventId)) : visible
  // Opening the bell marks alerts as seen, but orders can still need action.
  // Prioritise unread alerts; otherwise show the active order workload.
  const badgeCount = unseenCount > 0 ? unseenCount : openCount
  const urgent = unseenCount > 0

  const toggle = () => {
    setPanelOpen((value) => {
      if (!value) onOpen()
      return !value
    })
  }

  const openOrder = (orderNumber: string | null) => {
    if (orderNumber) onViewOrder(orderNumber)
    setPanelOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label={badgeCount > 0 ? `Order notifications: ${badgeCount} ${urgent ? 'new' : 'still to action'}` : 'Order notifications'}
        aria-expanded={panelOpen}
        className={`relative flex h-9 items-center gap-1.5 rounded-full border-hairline px-2.5 text-xs font-medium transition hover:bg-secondary hover:text-foreground ${
          urgent ? 'bell-unseen text-foreground' : 'text-muted-foreground'
        }`}
      >
        {urgent ? (
          <BellRing className={`size-4 text-gold-deep ${ringing ? 'sf-bell-ringing' : ''}`} />
        ) : (
          <Bell className="size-4" />
        )}

        <span className="hidden sm:inline">Orders</span>

        {badgeCount > 0 && (
          <span
            key={`${badgeCount}-${urgent}`}
            className={`bell-badge tnum absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
              urgent ? 'bg-gold text-slate-950' : 'bg-secondary text-foreground'
            }`}
            title={urgent ? `${unseenCount} new order${unseenCount === 1 ? '' : 's'}` : `${openCount} order${openCount === 1 ? '' : 's'} still to action`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}

        {/* The dot is the honest state of the realtime channel itself. */}
        <span
          className={`absolute -bottom-0.5 -left-0.5 size-2 rounded-full ${connected ? 'bg-success' : 'bg-warn'}`}
          title={connected ? 'Live: connected' : 'Reconnecting — orders are still being checked every 30 seconds'}
        />
      </button>

      {panelOpen && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setPanelOpen(false)} />

          <div className="bell-panel card-shadow-lg absolute right-0 z-50 mt-2 w-[22rem] overflow-hidden rounded-2xl border-hairline bg-card">
            <header className="border-b border-hairline px-4 pt-3.5 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    Order notifications
                    {unreadCount > 0 && (
                      <span className="tnum rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                        {unreadCount} new
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={`size-1.5 rounded-full ${connected ? 'bg-success' : 'bg-warn'}`} />
                    {connected ? 'Listening live' : 'Reconnecting — checking every 30 seconds'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={onToggleSound}
                    aria-label={soundOn ? 'Mute the order alert' : 'Unmute the order alert'}
                    title={soundOn ? 'Sound is on' : 'Sound is muted'}
                    className={`flex size-8 items-center justify-center rounded-lg transition hover:bg-secondary ${
                      soundOn ? 'text-gold-deep' : 'text-muted-foreground'
                    }`}
                  >
                    {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  </button>
                  <button
                    onClick={() => setPanelOpen(false)}
                    aria-label="Close"
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Filters: the whole feed, or just what nobody has read. */}
              {visible.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5">
                  {[
                    { value: false, label: `All ${visible.length}` },
                    { value: true, label: `Unread ${unreadCount}` },
                  ].map((tab) => (
                    <button
                      key={String(tab.value)}
                      onClick={() => setUnreadOnly(tab.value)}
                      aria-pressed={unreadOnly === tab.value}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                        unreadOnly === tab.value
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/60'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}

                  {unreadCount > 0 && (
                    <button
                      onClick={() => {
                        setCleared(new Set(visible.map((n) => n.eventId)))
                        onOpen()
                      }}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
                    >
                      <Check className="size-3" /> Mark all read
                    </button>
                  )}
                </div>
              )}
            </header>

            {shown.length === 0 ? (
              <div className="px-4 py-9 text-center">
                <span
                  className={`mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl ${
                    visible.length > 0 ? 'bg-success-soft text-success' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {visible.length > 0 ? <Check className="size-5" /> : <Package className="size-4" />}
                </span>
                <p className="text-sm font-medium">
                  {visible.length > 0 ? 'You are all caught up' : 'No orders yet today'}
                </p>
                <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-5 text-muted-foreground">
                  {visible.length > 0
                    ? 'Every notification has been read. New orders will appear here instantly.'
                    : 'When a customer orders from your website, it appears here instantly.'}
                </p>
              </div>
            ) : (
              <ul className="max-h-[22rem] overflow-y-auto">
                {shown.map((notification, index) => {
                  const unread = unreadIds.has(notification.eventId)
                  const previous = shown[index - 1]
                  // A day divider, so a long feed stays readable.
                  const showDay =
                    !previous ||
                    new Date(previous.createdAt).toDateString() !== new Date(notification.createdAt).toDateString()

                  return (
                    <li key={notification.eventId}>
                      {showDay && (
                        <p className="bg-secondary/50 px-4 py-1.5 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                          {new Date(notification.createdAt).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                          })}
                        </p>
                      )}

                      <div
                        data-unread={unread}
                        className="bell-item group relative flex items-start gap-3 border-b border-hairline/60 pr-2 pl-4 transition hover:bg-secondary/70"
                      >
                        <button
                          onClick={() => openOrder(notification.orderNumber)}
                          className="flex min-w-0 flex-1 items-start gap-3 py-3 text-left"
                        >
                          <span
                            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                              unread ? 'bg-gold-soft text-gold-deep' : 'bg-secondary text-muted-foreground'
                            }`}
                          >
                            <Package className="size-4" />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-xs ${unread ? 'font-semibold' : 'font-medium'}`}>
                              {notification.title}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                              {notification.body}
                            </span>
                            <span className="mt-1 flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground/80">
                                {relative(notification.createdAt)}
                              </span>
                              {notification.orderNumber && (
                                <span className="tnum text-[10px] font-medium text-muted-foreground/70">
                                  · {notification.orderNumber}
                                </span>
                              )}
                            </span>
                          </span>

                          {notification.orderNumber && (
                            <ChevronRight className="mt-2 size-3.5 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                          )}
                        </button>

                        <button
                          onClick={() => setCleared((current) => new Set(current).add(notification.eventId))}
                          aria-label={`Dismiss notification: ${notification.title}`}
                          title="Dismiss"
                          className="mt-3 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <footer className="flex items-center gap-2 border-t border-hairline px-4 py-3">
              <button
                onClick={() => {
                  onOpenOrders()
                  setPanelOpen(false)
                }}
                className="flex-1 rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-92"
              >
                Go to the orders screen
              </button>
              <Link
                href="/"
                target="_blank"
                onClick={() => setPanelOpen(false)}
                className="rounded-xl border-hairline px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Website
              </Link>
            </footer>
          </div>
        </>
      )}
    </div>
  )
}
