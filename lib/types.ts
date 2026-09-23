// Shapes shared between the app shell and its sections.
// These mirror the JSON returned by the API routes.

export type Item = {
  id: number
  code: number
  barcode: string | null
  name: string
  category: string
  price: string
  /** Image bytes are never placed in catalogue JSON; this flags the image endpoint. */
  image: boolean
  imageVersion: string
  // --- Storefront ---------------------------------------------------------
  /** True when the item is listed on the public website. */
  published: boolean
  /** Website selling price; null means the reference price above is used. */
  storePrice: string | null
  description: string | null
  collection: string | null
  badge: string | null
  featured: number
}

/** A product as the public storefront is allowed to see it. */
export type StoreProduct = {
  /** Catalogue code — the id used when adding to the basket. */
  code: number
  name: string
  category: string
  collection: string
  description: string | null
  badge: string | null
  price: number
  image: boolean
  imageVersion: string
}

export type StoreCatalogue = {
  shop: Shop & { tagline: string | null; whatsapp: string | null; storeHours: string | null }
  products: StoreProduct[]
  collections: { name: string; count: number; from: number }[]
  categories: string[]
  updatedAt: string
}

/**
 * What a shared product link (`/product/1042`) loads.
 *
 * One piece plus enough context to be a landing page for somebody who has never
 * seen the shop: the shop details, and a short rail from the same collection.
 */
export type StoreProductLink = {
  shop: Shop & { tagline: string | null; whatsapp: string | null; storeHours: string | null }
  product: StoreProduct
  related: StoreProduct[]
  updatedAt: string
}

export type OrderStatus = 'NEW' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED'
export type OrderPaymentStatus = 'PENDING' | 'PAID'

export type OrderLine = {
  id: number
  itemCode: number
  itemName: string
  category: string
  unitPrice: string
  quantity: number
  lineTotal: string
}

/** An order as returned to the storefront's tracking page. */
export type PublicOrder = {
  orderNumber: string
  customerName: string
  status: OrderStatus
  paymentStatus: OrderPaymentStatus
  fulfilment: string
  totalAmount: string
  itemCount: number
  createdAt: string
  shop: { name: string; phone: string | null; address: string | null }
  lines: OrderLine[]
}

/** An order as returned to the admin Orders screen. */
export type Order = {
  id: number
  orderNumber: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  fulfilment: string
  addressLine: string | null
  city: string | null
  pincode: string | null
  notes: string | null
  paymentStatus: OrderPaymentStatus
  status: OrderStatus
  itemCount: number
  subtotal: string
  deliveryFee: string
  totalAmount: string
  invoiceNumber: string | null
  ackedAt: string | null
  createdAt: string
  lines: OrderLine[]
}

/** One line in the admin notification feed (also the realtime payload). */
export type OrderNotification = {
  eventId: string
  type: string
  orderNumber: string | null
  title: string
  body: string
  audience: string
  createdAt: string
}

export type Transaction = {
  invoiceNumber: string
  itemName: string
  totalAmount: string
  paymentStatus: string
  createdAt: string
  businessDay: string
  customerName: string | null
  customerPhone: string | null
  discount: string
  quantity: number
  publicToken: string | null
}

export type InvoiceLine = {
  id: number
  itemCode: number
  itemName: string
  category: string
  unitPrice: string
  quantity: number
  lineTotal: string
}

export type Invoice = Transaction & { lines: InvoiceLine[] }

export type CartLine = {
  code: number
  name: string
  category: string
  cataloguePrice: number
  unitPrice: number
  quantity: number
}

export type DailyRow = { businessDay: string; total: number; count: number }

export type MonthlyReport = {
  month: string
  from: string
  to: string
  currentBusinessDay: string
  total: number
  count: number
  average: number
  bestDay: DailyRow
  days: DailyRow[]
}

export type Shop = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  gstin: string | null
  tagline?: string | null
  whatsapp?: string | null
  storeHours?: string | null
}

export type BrandAssets = {
  logo: boolean
  favicon: boolean
  avatar: boolean
  updatedAt: string | null
}

export type Dashboard = {
  today: string
  todayTotal: number
  todayCount: number
  allTotal: number
  allCount: number
  rangeTotal: number
  rangeCount: number
  pendingTotal: number
  pendingCount: number
  recent: Transaction[]
  daily: DailyRow[]
}

export type SendRecord = {
  id: number
  invoiceNumber: string
  channel: string
  provider: string
  phone: string
  status: string
  response: string | null
  createdAt: string
}
