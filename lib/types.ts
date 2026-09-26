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
  /** Current selling price (discounted price when on sale, else reference price). */
  price: number
  /** Original catalogue price. Differs from `price` when a website discount is active. */
  originalPrice: number
  image: boolean
  imageVersion: string
  /**
   * Total photos on this piece, counting the cover. 1 means cover only.
   *
   * The bytes never travel in the catalogue JSON — this is the count the
   * gallery needs to decide whether to show thumbnails at all, and to know how
   * many `/api/store/image?n=` positions exist.
   */
  imageCount: number
}

export type StoreCollection = { name: string; count: number; from: number }

/** A shop category as the storefront shows it — e.g. Necklaces, Bangles. */
export type StoreCategory = { name: string; count: number; from: number; imageCode: number | null }

export type StoreCatalogue = {
  shop: Shop & { tagline: string | null; whatsapp: string | null; storeHours: string | null }
  products: StoreProduct[]
  collections: StoreCollection[]
  categories: string[]
  /**
   * Shortcuts the counter sites all carry, computed from the real catalogue
   * rather than hard-coded: a band the shop has nothing in is simply absent,
   * so a customer never taps through to an empty grid.
   */
  categoryRails: StoreCategory[]
  bestSellers: StoreProduct[]
  /** Units actually sold, keyed by item code. Only real sales appear here. */
  soldCounts: Record<number, number>
  priceBands: PriceBand[]
  /**
   * The festival offer the site leads with, when the shop is running one.
   *
   * The state is decided server-side against the shop's business day, so a
   * visitor whose own clock is a day ahead cannot see a finished offer.
   * `null` when nothing is scheduled — the banner is then simply absent.
   */
  offer: PublicOffer | null
  /**
   * Every offer worth showing in the Offers section, best first.
   *
   * A festival season can have more than one running at once — a gold offer and
   * a silver offer — and the section is designed as a row of cards, so it needs
   * the whole set rather than only the lead one. Finished offers are excluded:
   * an expired promise is worse than an empty section.
   */
  offers: PublicOffer[]
  updatedAt: string
}

/** A "shop in budget" shortcut — "Under ₹500", derived from real prices. */
export type PriceBand = {
  label: string
  /** Inclusive lower bound; 0 for the first band. */
  from: number
  /** Exclusive upper bound; Infinity for the open-ended last band. */
  to: number
  count: number
}

/**
 * One entry in the recommendation rail under a piece.
 *
 * `reason` is carried through to the page on purpose: a shop that has not sold
 * much yet still needs a full rail, and the label has to be true. A piece can
 * only be called a best seller when it actually sold.
 */
export type ProductRecommendation = {
  product: StoreProduct
  sold: number
  reason: 'similar' | 'best-seller' | 'featured'
}

/**
 * What a shared product link (`/product/1042`) loads.
 *
 * One piece plus enough context to be a landing page for somebody who has never
 * seen the shop: the shop details, and the recommendation rail underneath.
 */
export type StoreProductLink = {
  shop: Shop & { tagline: string | null; whatsapp: string | null; storeHours: string | null }
  product: StoreProduct
  related: ProductRecommendation[]
  /** True when at least one recommendation is backed by a real sale. */
  hasSalesData: boolean
  /** The live festival offer, when one is running. See StoreCatalogue.offer. */
  offer: PublicOffer | null
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

/** One slice of a breakdown chart — a category or a payment status. */
export type ReportSlice = {
  label: string
  total: number
  count: number
  /** Share of the period's income, 0–100. Computed server-side so the client
   *  never re-derives a number the shopkeeper might see differently. */
  share: number
}

/**
 * One weekday's average across the month.
 *
 * "Which day do I actually sell most?" is the question a shopkeeper asks when
 * planning stock and staffing, and a per-day bar chart cannot answer it — there
 * are only four or five of each weekday in a month, and one big Saturday would
 * simply be that Saturday. Averaging per weekday is what makes the pattern
 * visible.
 */
export type WeekdayStat = {
  /** 0 = Sunday … 6 = Saturday, matching Date.getDay(). */
  weekday: number
  label: string
  total: number
  count: number
  /** Mean income on this weekday across the month. */
  average: number
}

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
  // --- Analytics added for the visual report -------------------------------
  /** Average income per day that had any sales. */
  averageActiveDay: number
  /** Mean invoice value across the month; 0 when nothing was sold. */
  averageInvoice: number
  /** Highest single invoice value in the month. */
  highestInvoice: number
  /** Daily income split by category of the pieces sold. */
  categories: ReportSlice[]
  /** Daily income split by PAID / pending. */
  payments: ReportSlice[]
  /** Average income for each weekday, Sunday first. */
  weekdays: WeekdayStat[]
  /**
   * Income in the same month last year, and the percentage change against it.
   * `null` when last year had no sales at all — a percentage against zero is
   * not a number, and showing "+∞%" would be worse than showing nothing.
   */
  previousYearTotal: number
  yearChangePct: number | null
  /** Days in the month that had at least one invoice. */
  activeDays: number
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

/** How a festival offer discounts: a percentage or a flat rupee amount. */
export type OfferDiscountType = 'percent' | 'flat'

/** The card colours an offer can take on the website. */
export type OfferAccent = 'red' | 'gold' | 'green' | 'maroon'

/**
 * One festival offer, as the admin Offers screen edits it.
 *
 * An offer is an advertisement, not a price change: it tells the customer what
 * the shop is running, and the advertised shelf price is untouched. The dates
 * decide when it shows, so an offer cannot be left up after the festival.
 */
export type Offer = {
  id: number
  title: string
  description: string | null
  /** Coupon / announcement code the customer quotes at the counter. */
  code: string | null
  discountType: OfferDiscountType
  discountValue: string
  /** Inclusive first day it shows, as YYYY-MM-DD. */
  startsOn: string
  /** Inclusive last day it shows, as YYYY-MM-DD. */
  endsOn: string
  active: boolean
  /**
   * Card colour on the website: 'red' (festive, the default), 'gold', 'green'
   * or 'maroon'.
   *
   * A fixed set rather than free-form colour: the storefront cards are built
   * with white text on a solid field, and a shopkeeper picking pale yellow would
   * make the offer name unreadable. Four colours that all carry white text keep
   * every combination legible.
   */
  accent: OfferAccent
  /**
   * Whether the offer also appears as a card in the website's Offers section.
   *
   * Separate from `active` so a shop can run a small announcement without also
   * filling a large card — the two are different sizes of promise, and a
   * one-line offer can look thin as a full card.
   */
  showInSection: boolean
  /** True when festival artwork has been uploaded. Bytes stay in the database. */
  hasBanner: boolean
  /**
   * When the banner photo was last replaced, or null when there is none.
   *
   * Used as a cache-buster on the image URL, so the endpoint can cache the
   * bytes immutably for a year and a fresh upload still appears immediately.
   */
  bannerVersion: string | null
}

/**
 * An offer narrowed for the storefront.
 *
 * `savingsLabel` is computed server-side — "10% off" or "₹200 off" — so the
 * public page never has to re-derive a number the shopkeeper might see framed
 * differently, and the `running` / `startsSoon` / `expired` state is decided
 * against the shop's business day rather than the visitor's clock.
 */
export type PublicOffer = {
  /** Database id — needed to build the banner image URL. */
  id: number
  title: string
  description: string | null
  code: string | null
  discountType: OfferDiscountType
  discountValue: number
  savingsLabel: string
  /** Card colour on the website. */
  accent: OfferAccent
  startsOn: string
  endsOn: string
  /** ACTIVE = showing now, UPCOMING = starts later, EXPIRED = finished. */
  state: 'ACTIVE' | 'UPCOMING' | 'EXPIRED'
  /** Whole days left including today; 0 on the final day, null when not live. */
  daysLeft: number | null
  /** True when the shop uploaded festival artwork to lead the banner with. */
  hasBanner: boolean
  /** Cache-buster for the banner URL; null when there is no photo. */
  bannerVersion: string | null
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
