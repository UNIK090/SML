'use client'

// ===========================================================================
// The customer's saved pieces.
//
// The one thing a browser on a jewellery site does that the counter cannot: it
// lets a customer keep the pieces they liked without committing to a basket.
// Amazon calls this "Save for later" and it is the reason a customer returns to
// a tab they left open — so the storefront gets the same thing, kept in the
// same shape as the basket: one small context, persisted to localStorage, read
// by the header badge and by every product card.
//
// Deliberately only the id and a snapshot of the fields a card needs. The
// catalogue is the source of truth for price and stock; a saved line that has
// since changed price must not resurrect a stale one.
// ===========================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** The bits of a product a saved tile needs to render without the catalogue. */
export type SavedPiece = {
  code: number
  name: string
  price: number
  imageVersion: string
}

/**
 * What `toggle` needs — deliberately not the whole `StoreProduct`.
 *
 * The heart is drawn on cards that already hold a full product, but it is also
 * usable anywhere only an id is known, so the context asks for the smallest
 * shape that can be rendered back rather than forcing a fake product object.
 */
export type SavablePiece = Pick<SavedPiece, 'code' | 'name'> & Partial<Pick<SavedPiece, 'price' | 'imageVersion'>>

type Wishlist = {
  items: SavedPiece[]
  count: number
  /** True once localStorage has been read, so badges do not flicker. */
  ready: boolean
  has: (code: number) => boolean
  toggle: (product: SavablePiece) => void
  remove: (code: number) => void
  clear: () => void
}

const STORAGE_KEY = 'sml-store-saved'

const WishlistContext = createContext<Wishlist | null>(null)

function read(): SavedPiece[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Re-validate on read: a saved piece may reference a product that has since
    // been unpublished, and a bad row must not break the saved list.
    return parsed
      .map((entry) => {
        const candidate = entry as Partial<SavedPiece>
        const code = Number(candidate.code)
        const price = Number(candidate.price)
        const name = typeof candidate.name === 'string' ? candidate.name : ''
        if (!Number.isInteger(code) || code <= 0 || !Number.isFinite(price) || !name) return null
        return { code, name, price, imageVersion: typeof candidate.imageVersion === 'string' ? candidate.imageVersion : '' }
      })
      .filter((entry): entry is SavedPiece => entry !== null)
      .slice(0, 60)
  } catch {
    return []
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedPiece[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setItems(read())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Private mode: the saved list simply lasts for this session.
    }
  }, [items, ready])

  const toggle = useCallback((product: SavablePiece) => {
    setItems((current) =>
      current.some((entry) => entry.code === product.code)
        ? current.filter((entry) => entry.code !== product.code)
        : [
            {
              code: product.code,
              name: product.name,
              price: product.price ?? 0,
              imageVersion: product.imageVersion ?? '',
            },
            ...current,
          ].slice(0, 60),
    )
  }, [])

  const remove = useCallback((code: number) => {
    setItems((current) => current.filter((entry) => entry.code !== code))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<Wishlist>(
    () => ({
      items,
      count: items.length,
      ready,
      has: (code: number) => items.some((entry) => entry.code === code),
      toggle,
      remove,
      clear,
    }),
    [items, ready, toggle, remove, clear],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist(): Wishlist {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider')
  return context
}
