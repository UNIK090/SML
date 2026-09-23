// Storefront rules shared by the public site and the admin screens.
//
// Deliberately free of database imports: the landing page, the cart and the
// admin forms all import these, and none of them should be able to pull the
// pg driver into a client bundle.

export const DELIVERY_FEE = 0
export const FREE_DELIVERY_ABOVE = 5000
export const MAX_ORDER_LINES = 40
export const MAX_LINE_QUANTITY = 20

/** Selling price of an item: the website price when set, else the reference price. */
export function sellingPrice(item: { storePrice: string | number | null; price: string | number }): number {
  const raw = item.storePrice ?? item.price
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/** Delivery charge for a basket subtotal. Free above the threshold. */
export function deliveryFeeFor(subtotal: number, fulfilment: string): number {
  if (fulfilment !== 'DELIVERY') return 0
  return subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE
}

/** Formats a money amount for the storefront, which never shows paise noise. */
export function rupees(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

/** "INR 12,400" style figure used on printed and copyable order summaries. */
export function rupeesExact(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export type StoreCartLine = { code: number; name: string; price: number; quantity: number }

/** Clamps a requested quantity into the range a single online order allows. */
export function clampQuantity(value: unknown): number {
  const quantity = Math.floor(Number(value))
  if (!Number.isFinite(quantity)) return 1
  return Math.min(Math.max(quantity, 1), MAX_LINE_QUANTITY)
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  NEW: 'New order',
  CONFIRMED: 'Confirmed',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

/** The steps shown on the customer's order-tracking timeline. */
export const ORDER_TIMELINE = ['NEW', 'CONFIRMED', 'READY', 'COMPLETED'] as const

/** Items were ordered, delivery is done, delivery needs address. */
export function requiresAddress(fulfilment: string): boolean {
  return fulfilment === 'DELIVERY'
}

/** A stable WhatsApp link for the shop, from a phone number or full URL. */
export function whatsappLink(value: string | null | undefined, message: string): string | null {
  if (!value?.trim()) return null
  const raw = value.trim()
  if (/^https?:\/\//i.test(raw)) return raw
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  const withCountry = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`
}

/** A `tel:` link, normalised to plain digits so mobile dialers accept it. */
export function telLink(value: string | null | undefined): string | null {
  const digits = value?.replace(/[^\d+]/g, '') ?? ''
  return digits.length >= 6 ? `tel:${digits}` : null
}
// ---------------------------------------------------------------------------
// Sharing a piece
// ---------------------------------------------------------------------------

/**
 * The canonical link to one catalogue piece.
 *
 * `/product/<code>` is a real page, not a query string on the storefront, for
 * two reasons that matter on a phone: the recipient of a WhatsApp message sees
 * which piece they are opening, and a link to a piece that has since been
 * unpublished can say so instead of silently landing on an empty grid.
 */
export function productPath(code: number): string {
  return `/product/${encodeURIComponent(String(code))}`
}

/** The same link as a full URL, for the clipboard, WhatsApp and the share sheet. */
export function productLink(code: number, origin?: string): string {
  const base = origin?.replace(/\/+$/, '')
  const path = productPath(code)
  return base ? `${base}${path}` : path
}

/** The message the shop's WhatsApp number is pre-filled with for one piece. */
export function productShareMessage(product: { code: number; name: string; price: number }, shopName?: string | null): string {
  const from = shopName?.trim() ? ` from ${shopName.trim()}` : ''
  return `Have a look at this piece${from}: ${product.name} (item #${product.code}) at ${rupees(product.price)}. Do you like it?`
}

/**
 * A public order-tracking link.
 *
 * The token is what actually authorises the read, so the order number alone is
 * not enough — see app/api/store/order.
 */
export function orderTrackPath(orderNumber: string, token: string): string {
  return `/order/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// Browsers and their quirks
// ---------------------------------------------------------------------------

/** Clipboard writes need a secure context and an allowed permission. */
export function canUseClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function' && window.isSecureContext
}

/** The native share sheet — WhatsApp, Instagram, Messages — on a phone. */
export function canShareNatively(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Copies text, falling back to a hidden textarea on browsers that refuse the
 * async clipboard API (older Safari, and any page served over plain HTTP).
 */
export async function copyText(value: string): Promise<boolean> {
  if (canUseClipboard()) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Fall through to the legacy path rather than failing the copy.
    }
  }
  if (typeof document === 'undefined') return false
  try {
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(field)
    return copied
  } catch {
    return false
  }
}