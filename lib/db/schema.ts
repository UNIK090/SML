import { boolean, date, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  code: integer('code').notNull().unique(),
  barcode: text('barcode'),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  // Product artwork is stored with the catalogue record so it survives
  // serverless deployments and never needs a public file-system write.
  imageMimeType: text('image_mime_type'),
  imageData: text('image_data'),
  imageByteSize: integer('image_byte_size'),
  // --- Storefront ---------------------------------------------------------
  // An item is only visible on the public website when `published` is true, so
  // the billing catalogue (costs, high codes, discontinued pieces) is never
  // exposed by accident. Everything below is edited from the Store section.
  published: boolean('published').notNull().default(false),
  /** Optional selling price for the website; falls back to `price` when null. */
  storePrice: numeric('store_price', { precision: 12, scale: 2 }),
  description: text('description'),
  /** Drives the landing-page filters and the collection shelves. */
  collection: text('collection'),
  /** Optional badge shown on the product card, e.g. "New", "Bridal". */
  badge: text('badge'),
  /** Display order inside a collection; lower sorts first. */
  featured: integer('featured').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// One row per invoice (the bill header). Line items live in invoice_items.
//
// The item_* columns are kept so single-item bills keep working and the rows
// created before multi-item billing still read back correctly. For a multi-item
// invoice they describe the first line as a convenience summary; the authoritative
// details are in invoice_items.
export const billingTransactions = pgTable('billing_transactions', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  itemCode: integer('item_code').notNull(),
  itemName: text('item_name').notNull(),
  category: text('category').notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  paymentStatus: text('payment_status').notNull().default('PAID'),
  businessDay: date('business_day').notNull().defaultNow(),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
  publicToken: text('public_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// One row per item on an invoice.
export const invoiceItems = pgTable('invoice_items', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull(),
  itemCode: integer('item_code').notNull(),
  itemName: text('item_name').notNull(),
  category: text('category').notNull(),
  cataloguePrice: numeric('catalogue_price', { precision: 12, scale: 2 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dailyEarnings = pgTable('daily_earnings', {
  businessDay: date('business_day').primaryKey(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  transactionCount: integer('transaction_count').notNull().default(0),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Single-row table holding the shop logo.
//
// The image bytes live in the database as base64 rather than on disk, because a
// serverless deployment has a read-only, ephemeral filesystem — a file written to
// public/ at runtime would vanish on the next deploy. `id` is fixed at 1 by the
// API so there is only ever one logo.
export const shopLogo = pgTable('shop_logo', {
  id: integer('id').primaryKey(),
  mimeType: text('mime_type'),
  data: text('data'),
  byteSize: integer('byte_size'),
  // Kept alongside the invoice logo so the three public-facing brand assets
  // can be updated atomically from the Profile screen.
  faviconMimeType: text('favicon_mime_type'),
  faviconData: text('favicon_data'),
  faviconByteSize: integer('favicon_byte_size'),
  avatarMimeType: text('avatar_mime_type'),
  avatarData: text('avatar_data'),
  avatarByteSize: integer('avatar_byte_size'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Audit trail of invoice sends: who was messaged, over which channel, and whether
// it went out. Kept separate from the invoice so a bill can be re-sent safely.
export const invoiceSends = pgTable('invoice_sends', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull(),
  channel: text('channel').notNull(),
  provider: text('provider').notNull(),
  phone: text('phone').notNull(),
  status: text('status').notNull().default('QUEUED'),
  response: text('response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Editable shop profile. Single row (id = 1); values override the SHOP_* env
// vars so the details can be edited from the Profile screen at runtime.
export const shopProfile = pgTable('shop_profile', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  gstin: text('gstin'),
  // Storefront copy, editable from the Profile screen alongside the bill details.
  tagline: text('tagline'),
  whatsapp: text('whatsapp'),
  storeHours: text('store_hours'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// One row per online order placed through the storefront.
//
// This is deliberately separate from `billing_transactions`: an order starts as
// a request (PENDING) that the shop confirms, and only later becomes a bill.
// `invoiceNumber` links the two once billing happens, so the same sale is never
// counted twice in the reports until it is billed.
export const storeOrders = pgTable('store_orders', {
  id: serial('id').primaryKey(),
  /** Human reference shown to the customer and typed into the admin search. */
  orderNumber: text('order_number').notNull().unique(),
  /** Unguessable token for the public order-tracking page. */
  publicToken: text('public_token').notNull().unique(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email'),
  /** DELIVERY = ship to the address, PICKUP = collect at the shop. */
  fulfilment: text('fulfilment').notNull().default('PICKUP'),
  addressLine: text('address_line'),
  city: text('city'),
  pincode: text('pincode'),
  notes: text('notes'),
  /** PENDING until the shop confirms payment and fulfilment. */
  paymentStatus: text('payment_status').notNull().default('PENDING'),
  /** NEW -> CONFIRMED -> READY -> COMPLETED, or CANCELLED. */
  status: text('status').notNull().default('NEW'),
  itemCount: integer('item_count').notNull().default(0),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  deliveryFee: numeric('delivery_fee', { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  /** Set when the order is billed at the counter. */
  invoiceNumber: text('invoice_number'),
  businessDay: date('business_day').notNull().defaultNow(),
  /** Stamped once a device has actually shown the order alert. */
  ackedAt: timestamp('acked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// One row per product on an online order. Item details are copied rather than
// referenced so a later catalogue edit cannot rewrite a placed order.
export const storeOrderItems = pgTable('store_order_items', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull(),
  itemCode: integer('item_code').notNull(),
  itemName: text('item_name').notNull(),
  category: text('category').notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Append-only feed that powers the realtime order alerts and the bell history.
// Written inside the same transaction as the order, so an alert can never be
// lost even if no admin browser is open when the order arrives.
export const orderNotifications = pgTable('order_notifications', {
  id: serial('id').primaryKey(),
  /** UUID created by the server; also the SSE resume cursor. */
  eventId: text('event_id').notNull().unique(),
  type: text('type').notNull(),
  orderNumber: text('order_number'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: text('audience').notNull().default('admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
