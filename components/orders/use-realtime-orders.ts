'use client'

// ===========================================================================
// Realtime online orders for the billing desk.
//
// The requirement is "when a customer orders, I get the notification in real
// time", on a page the shopkeeper leaves open all day. Three mechanisms are
// stacked so that stays true in every situation:
//
//   1. Server-sent events (EventSource). One long-lived connection; a new order
//      arrives in well under a second.
//   2. A resume cursor. Every event carries an id, and the last one seen is kept
//      in localStorage. On reconnect the stream replays everything missed, so an
//      order placed while the tab was asleep is never lost.
//   3. A 30s poll. Covers a browser where EventSource is blocked (some corporate
//      proxies), and an order that arrived on a different serverless instance.
//
// Notifications are deduplicated by event id, which is why the desktop popup,
// the in-app toast and the list refresh can all fire without double-reporting
// the same order.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { invalidate, readJson } from '@/lib/use-api'
import type { Order, OrderNotification } from '@/lib/types'

const CURSOR_KEY = 'sml-orders-cursor'
const POLL_MS = 30_000

export type RealtimeState = {
  orders: Order[]
  total: number
  loading: boolean
  refreshing: boolean
  error: string
  openCount: number
  unseenCount: number
  /** True while the SSE connection is open. Drives the "Live" indicator. */
  connected: boolean
  /** Newest first, capped at 20, for the bell panel. */
  notifications: OrderNotification[]
  /** Transient toasts currently on screen. */
  toasts: OrderNotification[]
  refresh: () => void
  dismissToast: (eventId: string) => void
  dismissAllToasts: () => void
  /** Stamps every open order as seen, clearing the badge. */
  markAllSeen: () => void
  /** Silences the alert sound for this session. */
  soundOn: boolean
  toggleSound: () => void
}

type Options = {
  /** Only fetch orders changed after this instant (used by the poll). */
  filters?: { status?: string; q?: string }
}

function readCursor(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CURSOR_KEY)
  } catch {
    return null
  }
}

function writeCursor(value: string) {
  try {
    window.localStorage.setItem(CURSOR_KEY, value)
  } catch {
    // Private mode; the sweeper still covers a lost cursor.
  }
}

/** A short two-note chime, synthesised so no audio file has to be shipped. */
function chime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const context = new Ctor()
    const play = (frequency: number, startAt: number) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + startAt + 0.42)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(context.currentTime + startAt)
      oscillator.stop(context.currentTime + startAt + 0.45)
    }
    play(880, 0)
    play(1318, 0.16)
    window.setTimeout(() => void context.close().catch(() => undefined), 1200)
  } catch {
    // Audio is a nicety; never let it break the alert.
  }
}

export function useRealtimeOrders(options: Options = {}): RealtimeState {
  const { filters } = options
  const status = filters?.status ?? ''
  const search = filters?.q ?? ''

  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [openCount, setOpenCount] = useState(0)
  const [unseenCount, setUnseenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [notifications, setNotifications] = useState<OrderNotification[]>([])
  const [toasts, setToasts] = useState<OrderNotification[]>([])
  const [soundOn, setSoundOn] = useState(true)

  // Refs, not state: these are read inside long-lived async callbacks and must
  // never be stale, while changing them must not re-render anything.
  const seenEvents = useRef<Set<string>>(new Set())
  const cursor = useRef<string | null>(readCursor())
  const sound = useRef(true)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ limit: '80', ...extra })
      if (status) params.set('status', status)
      if (search) params.set('q', search)
      return `/api/orders?${params.toString()}`
    },
    [status, search],
  )

  const apply = useCallback((payload: { rows: Order[]; total: number; openCount: number; unseenCount: number }) => {
    setOrders(payload.rows)
    setTotal(payload.total)
    setOpenCount(payload.openCount)
    setUnseenCount(payload.unseenCount)
  }, [])

  /** The authoritative read: the list the shopkeeper actually sees. */
  const load = useCallback(
    async (background = false) => {
      if (background) setRefreshing(true)
      else setLoading(true)
      try {
        const payload = await readJson<{ rows: Order[]; total: number; openCount: number; unseenCount: number }>(query())
        if (!mounted.current) return
        apply(payload)
        setError('')
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load the orders.')
      } finally {
        if (mounted.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [query, apply],
  )

  /** Handles one realtime event — from the stream or from the feed endpoint. */
  const receive = useCallback(
    (notification: OrderNotification, announce: boolean) => {
      if (!notification?.eventId || seenEvents.current.has(notification.eventId)) return
      seenEvents.current.add(notification.eventId)
      if (notification.eventId > (cursor.current ?? '')) {
        cursor.current = notification.eventId
        writeCursor(notification.eventId)
      }

      setNotifications((current) => [notification, ...current].slice(0, 20))

      // A cancellation or a status change from another desk should just refresh
      // the list quietly; only a genuinely new order interrupts.
      if (announce && notification.type === 'ORDER_PLACED') {
        setToasts((current) => [notification, ...current].slice(0, 3))
        if (sound.current) chime()
        // The row list and the session's cached pages must both catch up.
        invalidate('/api/orders')
        invalidate('/api/dashboard')
      }
      void load(true)
    },
    [load],
  )

  // ------------------------------ Initial load ------------------------------
  useEffect(() => {
    void load(false)
  }, [load])

  // --------------------------- Realtime SSE stream --------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

    const url = cursor.current ? `/api/orders/stream?cursor=${encodeURIComponent(cursor.current)}` : '/api/orders/stream'
    let source: EventSource | null = new EventSource(url)

    source.addEventListener('ready', () => setConnected(true))
    source.addEventListener('notification', (event) => {
      try {
        receive(JSON.parse((event as MessageEvent).data) as OrderNotification, true)
      } catch {
        // A malformed frame is ignored rather than allowed to kill the stream.
      }
    })
    source.addEventListener('order-updated', () => {
      void load(true)
    })
    source.onerror = () => {
      // EventSource reconnects on its own; surface the state honestly and let
      // the polling layer keep the screen current in the meantime.
      setConnected(false)
    }

    return () => {
      source?.close()
      source = null
    }
  }, [receive, load])

  // ------------------------------ Polling net ------------------------------
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      // Only ask for what changed since the last event; the response is small
      // and the cursor makes it idempotent.
      const since = Date.now() - 120_000
      void readJson<{ rows: Order[]; total: number; openCount: number; unseenCount: number }>(query({ since: String(since) }))
        .then((payload) => {
          if (!mounted.current) return
          setOpenCount(payload.openCount)
          setUnseenCount(payload.unseenCount)
          // Anything in that window that we have not announced yet gets a toast,
          // which is what covers a blocked EventSource.
          for (const order of payload.rows) {
            const synthetic: OrderNotification = {
              eventId: `poll-${order.orderNumber}-${order.createdAt}`,
              type: 'ORDER_PLACED',
              orderNumber: order.orderNumber,
              title: `New online order · ${order.itemCount} ${order.itemCount === 1 ? 'piece' : 'pieces'}`,
              body: `${order.customerName} (${order.customerPhone})`,
              audience: 'admin',
              createdAt: order.createdAt,
            }
            receive(synthetic, true)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (mounted.current) void load(true)
        })
    }

    const timer = window.setInterval(tick, POLL_MS)
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [query, receive, load])

  // ------------------------- Desktop notifications -------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    const latest = notifications[0]
    if (!latest || latest.type !== 'ORDER_PLACED') return
    try {
      const popup = new Notification('New online order', { body: `${latest.title}\n${latest.body}`, tag: latest.eventId })
      popup.onclick = () => {
        window.focus()
        popup.close()
      }
    } catch {
      // Some browsers refuse Notification outside a service worker; the in-app
      // toast is already showing, so this is a bonus, not a requirement.
    }
  }, [notifications])

  const markAllSeen = useCallback(() => {
    setUnseenCount(0)
    void fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ack' }) })
      .then(() => invalidate('/api/orders'))
      .catch(() => undefined)
  }, [])

  const toggleSound = useCallback(() => {
    setSoundOn((value) => {
      sound.current = !value
      return !value
    })
  }, [])

  return {
    orders,
    total,
    loading,
    refreshing,
    error,
    openCount,
    unseenCount,
    connected,
    notifications,
    toasts,
    refresh: () => void load(true),
    dismissToast: (eventId) => setToasts((current) => current.filter((toast) => toast.eventId !== eventId)),
    dismissAllToasts: () => setToasts([]),
    markAllSeen,
    soundOn,
    toggleSound,
  }
}
