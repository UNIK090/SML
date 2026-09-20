'use client'

// A small client-side data layer.
//
// Why not SWR/React Query: this app has six endpoints and no server-state
// library is installed. This gives the two behaviours that actually matter for
// perceived speed:
//
//   1. A module-level cache, so switching sections renders instantly from the
//      last known data instead of showing a spinner for data we already have.
//   2. Request de-duplication, so several components asking for the same URL in
//      the same tick share one network request.
//
// Mutations can write straight into the cache (optimistic update) and roll back
// if the server rejects, which is what makes "Mark paid" feel instant.

import { useCallback, useEffect, useRef, useState } from 'react'

type CacheEntry = { data: unknown; at: number }

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

/** How long cached data is considered fresh before a background refetch. */
const STALE_MS = 15_000

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const text = await response.text()
  if (!response.ok) {
    // Surface the server's own message where it gave one.
    try {
      const parsed = JSON.parse(text) as { error?: string }
      throw new Error(parsed.error ?? `Request failed with status ${response.status}.`)
    } catch (error) {
      if (error instanceof Error && error.message) throw error
      throw new Error(`Request failed with status ${response.status}.`)
    }
  }
  if (!text) throw new Error('The server returned an empty response.')
  return JSON.parse(text) as T
}

async function fetchWithCache<T>(url: string): Promise<T> {
  const existing = inflight.get(url)
  if (existing) return existing as Promise<T>

  const request = readJson<T>(url)
    .then((data) => {
      cache.set(url, { data, at: Date.now() })
      notify()
      return data
    })
    .finally(() => {
      inflight.delete(url)
    })

  inflight.set(url, request)
  return request
}

/**
 * Subscribes to a URL.
 *
 * `data` is the cached value when present, so a section switch paints
 * immediately. `isLoading` is true only on a genuine first load with no cache,
 * which is what drives the skeleton.
 */
export function useApi<T>(url: string | null, options: { revalidate?: boolean; refreshInterval?: number } = {}) {
  const { revalidate = true, refreshInterval = 0 } = options
  const cached = url ? (cache.get(url)?.data as T | undefined) : undefined

  const [data, setData] = useState<T | undefined>(cached)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(url !== null && cached === undefined)
  const [isValidating, setIsValidating] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (background: boolean) => {
      if (!url) return
      if (background) setIsValidating(true)
      else setIsLoading(true)
      try {
        const fresh = await fetchWithCache<T>(url)
        if (mounted.current) {
          setData(fresh)
          setError(null)
        }
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : 'Something went wrong.')
      } finally {
        if (mounted.current) {
          setIsLoading(false)
          setIsValidating(false)
        }
      }
    },
    [url],
  )

  useEffect(() => {
    if (!url) {
      setData(undefined)
      setIsLoading(false)
      return
    }
    const entry = cache.get(url)
    if (entry) setData(entry.data as T)

    const fresh = entry && Date.now() - entry.at < STALE_MS
    if (revalidate && !fresh) void load(Boolean(entry))
    else setIsLoading(false)

    // Re-render this hook when any other request updates the shared cache.
    const listener = () => {
      const next = cache.get(url)
      if (next && mounted.current) setData(next.data as T)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [url, revalidate, load])

  // Keep a desk that stays open all day current without blocking interaction.
  // Refetch promptly when it returns to the foreground, and optionally poll a
  // small number of high-value endpoints while the tab is visible.
  useEffect(() => {
    if (!url || !revalidate || typeof window === 'undefined') return
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const timer = refreshInterval > 0 ? window.setInterval(refreshVisible, refreshInterval) : null
    return () => {
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      if (timer !== null) window.clearInterval(timer)
    }
  }, [url, revalidate, refreshInterval, load])

  return { data, error, isLoading, isValidating, refresh: () => load(Boolean(data)) }
}

/** Writes a value into the cache without a request (optimistic updates). */
export function writeCache<T>(url: string, data: T): void {
  cache.set(url, { data, at: Date.now() })
  notify()
}

/** Reads a cached value outside a component. */
export function peekCache<T>(url: string): T | undefined {
  return cache.get(url)?.data as T | undefined
}

/** Drops cached entries so the next read refetches. */
export function invalidate(prefix?: string): void {
  if (!prefix) {
    cache.clear()
  } else {
    for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
  }
  notify()
}
