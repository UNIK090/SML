import { date, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  code: integer('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
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
  mimeType: text('mime_type').notNull(),
  data: text('data').notNull(),
  byteSize: integer('byte_size').notNull(),
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
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
