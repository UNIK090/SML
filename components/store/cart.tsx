'use client'

// The customer's basket.
//
// Kept in one small context rather than in the landing page component so the
// header badge, the product cards, the drawer and the checkout all read the
// same numbers. Persisted to localStorage so a refresh halfway through browsing
// does not lose the basket — which matters a lot on a phone.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clampQuantity, type StoreCartLine } from '@/lib/store'
import type { StoreProduct } from '@/lib/types'

type Cart = {
  lines: StoreCartLine[]
  count: number
  subtotal: number
  /** True once localStorage has been read, so the badge does not flicker. */
  ready: boolean
  has: (code: number) => boolean
  add: (product: StoreProduct, quantity?: number) => void
  setQuantity: (code: number, quantity: number) => void
  remove: (code: number) => void
  clear: () => void
}

const STORAGE_KEY = 'sml-store-basket'

const CartContext = createContext<Cart | null>(null)

function read(): StoreCartLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Re-validate on read: a stale basket can reference a product that has since
    // been unpublished or renamed, and a bad line must not break the cart.
    return parsed
      .map((line) => {
        const candidate = line as Partial<StoreCartLine>
        const code = Number(candidate.code)
        const price = Number(candidate.price)
        const name = typeof candidate.name === 'string' ? candidate.name : ''
        if (!Number.isInteger(code) || code <= 0 || !Number.isFinite(price) || !name) return null
        return { code, name, price, quantity: clampQuantity(candidate.quantity) }
      })
      .filter((line): line is StoreCartLine => line !== null)
      .slice(0, 40)
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<StoreCartLine[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setLines(read())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Private mode: the basket simply lasts for this session.
    }
  }, [lines, ready])

  const add = useCallback((product: StoreProduct, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.code === product.code)
      if (existing) {
        return current.map((line) =>
          line.code === product.code ? { ...line, quantity: clampQuantity(line.quantity + quantity) } : line,
        )
      }
      return [...current, { code: product.code, name: product.name, price: product.price, quantity: clampQuantity(quantity) }]
    })
  }, [])

  const setQuantity = useCallback((code: number, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.code !== code)
        : current.map((line) => (line.code === code ? { ...line, quantity: clampQuantity(quantity) } : line)),
    )
  }, [])

  const remove = useCallback((code: number) => {
    setLines((current) => current.filter((line) => line.code !== code))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<Cart>(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0)
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    return {
      lines,
      count,
      subtotal,
      ready,
      has: (code: number) => lines.some((line) => line.code === code),
      add,
      setQuantity,
      remove,
      clear,
    }
  }, [lines, ready, add, setQuantity, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): Cart {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside CartProvider')
  return context
}
