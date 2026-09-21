'use client'

// The notification bell in the desk header.
//
// It exists so a shopkeeper working inside Billing or Items still sees an order
// land — the Orders screen does not have to be the open tab. The badge counts
// orders no device has acknowledged yet, so it clears the moment the panel is
// opened rather than the moment the order arrives.

import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Package, Volume2, VolumeX, X } from 'lucide-react'
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
  notifications,
  connected,
  soundOn,
  onToggleSound,
  onOpen,
  onViewOrder,
  onOpenOrders,
}: {
  unseenCount: number
  notifications: OrderNotification[]
  connected: boolean
  soundOn: boolean
  onToggleSound: () => void
  onOpen: () => void
  onViewOrder: (orderNumber: string) => void
  onOpenOrders: () => void
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [ringing, setRinging] = useState(false)
  const previousUnseen = useRef(unseenCount)

  // Anything that is both new and unacknowledged must visibly demand attention
  // — a silent badge is easy to miss across a shop counter.
  useEffect(() => {
    if (unseenCount > previousUnseen.current) {
      setRinging(true)
      const timer = window.setTimeout(() => setRinging(false), 2400)
      return () => window.clearTimeout(timer)
    }
    previousUnseen.current = unseenCount
  }, [unseenCount])

  useEffect(() => {
    previousUnseen.current = unseenCount
  }, [unseenCount])

  const toggle = () => {
    setPanelOpen((value) => {
      if (!value) onOpen()
      return !value
    })
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label={unseenCount > 0 ? `New orders: ${unseenCount} waiting` : 'Order notifications'}
        aria-expanded={panelOpen}
        className="relative flex h-9 items-center gap-1.5 rounded-full border-hairline px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      >
        {unseenCount > 0 ? (
          <BellRing className={`size-4 text-gold-deep ${ringing ? 'sf-bell-ringing' : ''}`} />
        ) : (
          <Bell className="size-4" />
        )}
        <span className="hidden sm:inline">Orders</span>

        {unseenCount > 0 && (
          <span className="tnum absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-slate-950">
            {unseenCount > 99 ? '99+' : unseenCount}
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
          <div className="card-shadow-lg absolute right-0 z-50 mt-2 w-[21rem] overflow-hidden rounded-2xl border-hairline bg-card">
            <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Order notifications</p>
                <p className="text-[11px] text-muted-foreground">
                  {connected ? 'Listening live' : 'Reconnecting — checking every 30 seconds'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggleSound}
                  aria-label={soundOn ? 'Mute the order alert' : 'Unmute the order alert'}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
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
            </header>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                  <Package className="size-4" />
                </span>
                <p className="text-sm font-medium">No orders yet today</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  When a customer orders from your website, it appears here instantly.
                </p>
              </div>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto">
                {notifications.map((notification) => (
                  <li key={notification.eventId}>
                    <button
                      onClick={() => {
                        if (notification.orderNumber) onViewOrder(notification.orderNumber)
                        setPanelOpen(false)
                      }}
                      className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-secondary"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-deep">
                        <Package className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold">{notification.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{notification.body}</span>
                        <span className="mt-1 block text-[10px] text-muted-foreground/80">{relative(notification.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <footer className="border-t border-hairline px-4 py-3">
              <button
                onClick={() => {
                  onOpenOrders()
                  setPanelOpen(false)
                }}
                className="w-full rounded-xl bg-secondary py-2 text-xs font-semibold transition hover:bg-secondary/70"
              >
                Go to the orders screen
              </button>
            </footer>
          </div>
        </>
      )}
    </div>
  )
}
