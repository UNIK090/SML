import { boolean, check, date, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  code: integer('code').notNull().unique(),
  barcode: text('barcode'),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  // Product artwork is stored with the catalogue record so it survives
  // serverless deployments and never needs a public file-system write.
  //
  // These three columns are the item's PRIMARY photo — the first image in the
  // gallery, and the one the storefront grid, the cart and the invoice use.
  // Extra gallery shots live in `inventoryItemImages`, ordered by displayOrder.
  // Keeping the primary here means every existing caller (billing, invoices,
  // the store grid) keeps working untouched.
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

// Additional photographs for one inventory item.
//
// A piece of jewellery is judged from several angles — the face, the clasp, how
// it sits on the hand — and one photo cannot answer "is this the piece I want?".
// These rows power the gallery on the product page.
//
// Bytes live in the database, like the primary image, because a serverless
// deployment has a read-only, ephemeral disk: a file written to public/ at
// runtime would vanish on the next deploy.
//
// `displayOrder` is the customer-visible order and is authoritative — the admin
// can reorder shots and the product page reads them back in that order. The
// primary image (inventory_items.image_*) is always shown first and is NOT
// duplicated here.
export const inventoryItemImages = pgTable(
  'inventory_item_images',
  {
    id: serial('id').primaryKey(),
    /** Database id of the catalogue row, not the public item code. */
    itemId: integer('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    displayOrder: integer('display_order').notNull().default(0),
    mimeType: text('mime_type').notNull(),
    data: text('data').notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('inventory_item_images_item_order_idx').on(table.itemId, table.displayOrder)],
)

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
  /**
   * The customer record this bill belongs to, when one could be identified.
   *
   * Nullable on purpose. Every invoice written before the customers table
   * existed has no link, and a walk-in bill taken without a phone number still
   * has none — so this is an enrichment of the row, never a requirement for
   * saving it. Nothing that reads billing_transactions today has to change.
   */
  customerId: integer('customer_id'),
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

// A customer will sometimes show the counter a photo of the exact piece they
// want repaired, matched, or billed. These photos are attached to the invoice
// line rather than the catalogue item: they are a private sales reference, not
// product artwork that should appear in the public storefront.
export const invoiceItemPhotos = pgTable(
  'invoice_item_photos',
  {
    id: serial('id').primaryKey(),
    invoiceItemId: integer('invoice_item_id')
      .notNull()
      .references(() => invoiceItems.id, { onDelete: 'cascade' }),
    mimeType: text('mime_type').notNull(),
    data: text('data').notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invoice_item_photos_invoice_item_idx').on(table.invoiceItemId)],
)

// One photograph of the WHOLE set of items on a bill.
//
// Distinct from `invoiceItemPhotos`, which hangs one photo off each line. The
// counter lays everything being billed out together and takes a single frame —
// that is the reference an admin wants later ("what exactly left the shop on
// this bill?"), and it is deliberately one image per invoice rather than one per
// item, so it is captured, stored and read back as a single unit.
//
// Attached to the invoice header rather than a line item, because it depicts the
// bill as a whole and must survive any later line-item change. Bytes live in the
// database for the same reason product photos do: a serverless deployment has a
// read-only, ephemeral disk.
export const invoiceBillPhotos = pgTable(
  'invoice_bill_photos',
  {
    id: serial('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    data: text('data').notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invoice_bill_photos_invoice_idx').on(table.invoiceNumber)],
)

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
  /**
   * The offer discount actually applied to this order, in rupees.
   *
   * Stored rather than recomputed because an offer is dated: the row that made
   * the order cheaper may have ended, or been edited, by the time anyone reads
   * the order again. A saved order has to keep saying what the customer was
   * actually promised.
   */
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  /** The offer that produced `discountAmount`, for the admin's own records. */
  offerTitle: text('offer_title'),
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

// Festival offers advertised on the storefront.
//
// A jewellery counter lives on the festival calendar — Akshaya Tritiya, Diwali,
// Ugadi, Varalakshmi Vratham — and each one is a short, dated promise: "10% off
// this week". Keeping it as a row rather than a field on the shop profile is
// what makes it safe to run: the dates decide when it shows, so an offer cannot
// be left up by accident after the festival has passed.
//
// `startsOn`/`endsOn` are plain calendar dates in the shop's own timezone (India
// business time), compared against the business day, not a timestamp — an offer
// ends at midnight on its last day, not at an hour that depends on the server.
//
// Only one offer is ever promoted on the site at a time, so `active` is an
// explicit switch the shopkeeper controls and the newest active offer wins.
export const festivalOffers = pgTable(
  'festival_offers',
  {
    id: serial('id').primaryKey(),
    /** Customer-facing name, e.g. "Diwali Offer". */
    title: text('title').notNull(),
    /** One line under the title, e.g. "Flat 10% off on all silver pieces". */
    description: text('description'),
    /** Optional coupon/announcement code the customer quotes at the counter. */
    code: text('code'),
    /**
     * `percent` = a percentage off, `flat` = a rupee amount off.
     * Either way it is advertised only — no price is rewritten by an offer, so
     * the catalogue price a customer sees stays the price the shop set.
     */
    discountType: text('discount_type').notNull().default('percent'),
    /** Percent (0–100) or a flat rupee amount, depending on `discountType`. */
    discountValue: numeric('discount_value', { precision: 12, scale: 2 }).notNull().default('0'),
    /**
     * Basket value the customer must reach before the offer applies, in rupees.
     * `0` means no threshold — the offer applies to any basket.
     *
     * A shop almost never discounts a single cheap piece; the point of a festival
     * offer is to lift the size of the basket. Storing the threshold turns the
     * banner into a rule the till can check, instead of a claim on a poster that
     * nothing enforces.
     */
    minSpend: numeric('min_spend', { precision: 12, scale: 2 }).notNull().default('0'),
    /** Inclusive first day the offer shows on the website. */
    startsOn: date('starts_on').notNull(),
    /** Inclusive last day the offer shows on the website. */
    endsOn: date('ends_on').notNull(),
    /** Master switch — an offer past its dates never shows even when active. */
    active: boolean('active').notNull().default(true),
    /**
     * Card colour on the website: red, gold, green or maroon. A short, closed
     * set rather than a free colour, so every card keeps readable white text.
     */
    accent: text('accent').notNull().default('red'),
    /**
     * Whether the offer also appears as a card in the Offers section.
     *
     * Separate from `active` so a shop can run a small announcement strip
     * without also filling a card in the grid — the two are different sizes of
     * promise, and a one-line offer looks thin as a big card.
     */
    showInSection: boolean('show_in_section').notNull().default(true),
    // --- Banner artwork ------------------------------------------------------
    // The festival photograph the landing page leads with.
    //
    // Bytes are stored in the database as base64 rather than on disk, for the
    // same reason product photos are: a serverless deployment has a read-only,
    // ephemeral filesystem, so a file written at runtime would vanish on the
    // next deploy. The image is served by /api/offers/image.
    //
    // `bannerUpdatedAt` doubles as the client's cache-buster. The endpoint can
    // then cache the bytes immutably for a year, because the URL changes the
    // moment the photo is replaced — the same trick product images use.
    bannerMimeType: text('banner_mime_type'),
    bannerData: text('banner_data'),
    bannerByteSize: integer('banner_byte_size'),
    bannerUpdatedAt: timestamp('banner_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('festival_offers_window_idx').on(table.active, table.startsOn, table.endsOn)],
)

// A customer of the shop.
//
// Until now the system had no customer record at all: a name and a phone were
// typed onto each invoice as free text, so the same person buying twice left two
// unrelated strings behind. That is fine for printing a bill and impossible for
// anything that has to recognise a returning customer — which is exactly what a
// referral programme needs, since a reward belongs to a person and not to a bill.
//
// The phone number is the identity. It is the one thing a customer says the same
// way every visit, and it is the only field the shop already captures on every
// bill. `phone` therefore holds a NORMALISED value (digits only, last 10 for an
// Indian number) and carries a unique index; the raw formatting the staff typed
// is kept in `phoneDisplay` purely so it can be read back.
//
// Names are deliberately NOT unique and never used to match. Two customers can
// genuinely share a name, and merging them would hand one person's reward points
// to another.
export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    /** Digits only, normalised — the matching key. Unique. */
    phone: text('phone').notNull().unique(),
    /** The number as it was typed, for display on bills and screens. */
    phoneDisplay: text('phone_display'),
    email: text('email'),
    /**
     * The customer's referral number, e.g. SML10245.
     *
     * Unique and generated by the server only. The API never accepts this from a
     * client, so a member of staff cannot type their own — the whole value of the
     * code is that it identifies one person and cannot be guessed or reused.
     */
    referralCode: text('referral_code').notNull().unique(),
    /**
     * The live reward balance.
     *
     * Derived from the ledger rather than authoritative on its own, but kept here
     * because every screen needs it and summing the ledger on each read would be
     * wasteful. Every write to it happens in the same transaction as its ledger
     * row, so the two cannot drift.
     */
    rewardPoints: integer('reward_points').notNull().default(0),
    /** Lifetime earned, never reduced by a redemption. Reporting only. */
    totalReferralPointsEarned: integer('total_referral_points_earned').notNull().default(0),
    /** Lifetime redeemed. Reporting only. */
    totalPointsRedeemed: integer('total_points_redeemed').notNull().default(0),
    /**
     * Set when a reversal would push the balance negative because the points were
     * already spent. The account is flagged for the shopkeeper to review instead
     * of silently holding a negative balance nobody can explain.
     */
    flaggedForReview: boolean('flagged_for_review').notNull().default(false),
    /** A deactivated customer cannot earn or redeem. */
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('customers_name_idx').on(table.name),
    index('customers_created_idx').on(table.createdAt),
  ],
)

// The shop's referral rule. One row, id = 1.
//
// These numbers decide how many points a bill earns and what a point is worth,
// and they are stored rather than hardcoded because a shop changes its festival
// offer without wanting a code change. The rule applies to FUTURE transactions
// only: every past referral keeps the points it was actually awarded, because a
// transaction that has been settled with a customer must not silently rewrite
// itself when the shop adjusts the rate.
//
export const rewardSettings = pgTable(
  'reward_settings',
  {
    id: integer('id').primaryKey(),
    /** Master switch. Off stops new credits; balances stay spendable. */
    referralEnabled: boolean('referral_enabled').notNull().default(true),
    /** Rupees per whole block, e.g. 500. */
    referralAmountStep: numeric('referral_amount_step', { precision: 12, scale: 2 }).notNull().default('500'),
    /** Points awarded per completed block, e.g. 30. */
    pointsPerStep: integer('points_per_step').notNull().default(30),
    /** Rupee value of one point at redemption, e.g. 1. */
    redemptionValuePerPoint: numeric('redemption_value_per_point', { precision: 12, scale: 2 }).notNull().default('1'),
    /** A redemption below this many points is refused. 0 = no minimum. */
    minimumPointsToRedeem: integer('minimum_points_to_redeem').notNull().default(0),
    /**
     * The most that may be redeemed on a single bill. 0 = no cap.
     *
     * A cap exists because a large balance redeemed at once can zero out a bill,
     * which usually means a mistyped number rather than a genuine intention.
     */
    maximumPointsPerBill: integer('maximum_points_per_bill').notNull().default(0),
    /** Whether staff may move points by hand. Off leaves reversals available. */
    allowManualAdjustment: boolean('allow_manual_adjustment').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('reward_settings_single_row', sql`${table.id} = 1`)],
)

// One row per successful referral — the permanent record that a purchase earned
// points for somebody.
//
// Kept forever rather than folded into a balance. A balance answers "how many
// points does this customer have?"; it cannot answer "why?", and a customer
// asking about a missing reward is the single most common support question a
// scheme like this generates.
//
// `status` moves CREDITED -> REVERSED, never deleted. A refunded bill reverses
// its referral so the audit trail still shows the reward was given and then
// taken back.
export const referralTransactions = pgTable(
  'referral_transactions',
  {
    id: serial('id').primaryKey(),
    /** The code that was entered at the counter. */
    referralCode: text('referral_code').notNull(),
    /** The customer who owns the code — the one who earns. */
    referrerCustomerId: integer('referrer_customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    /** Name/phone of the person who actually bought, as typed. */
    referredCustomerName: text('referred_customer_name').notNull(),
    referredCustomerPhone: text('referred_customer_phone'),
    /** The bill this referral was earned against. */
    invoiceNumber: text('invoice_number').notNull(),
    billAmount: numeric('bill_amount', { precision: 12, scale: 2 }).notNull(),
    /** Points awarded. Frozen at credit time, never recomputed. */
    pointsEarned: integer('points_earned').notNull(),
    /** The rule in force when this was awarded, kept for the audit trail. */
    settingsSnapshot: text('settings_snapshot'),
    /** CREDITED -> REVERSED. Never deleted. */
    status: text('status').notNull().default('CREDITED'),
    purchaseDate: date('purchase_date'),
    notes: text('notes'),
    /** Who entered it. Every reward action is attributable. */
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: text('reversed_by'),
    reversalReason: text('reversal_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // THE guard against paying twice. Two staff members entering the same bill
    // at the same moment cannot both succeed — the second insert violates this
    // index and is refused. Enforced in the database rather than in a check-then-insert
    // in application code, which is exactly the pattern that loses a race.
    uniqueIndex('referral_transactions_invoice_unique').on(table.invoiceNumber),
    index('referral_transactions_referrer_idx').on(table.referrerCustomerId),
    index('referral_transactions_created_idx').on(table.createdAt),
    index('referral_transactions_status_idx').on(table.status),
  ],
)

// Every change to a points balance, append-only.
//
// The balance on `customers` is a convenience so screens do not have to sum this
// table; it is never authoritative on its own. Every movement of points writes a
// row here in the SAME transaction, so the two cannot drift — and the history
// answers "why does this customer have 150 points?" line by line.
//
// A negative `points` is a deduction (redemption, reversal, downward adjustment)
// and a positive one is a credit. The sign is the meaning, so no separate
// direction column is needed.
export const rewardLedger = pgTable(
  'reward_ledger',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    /** REFERRAL_EARNED | REDEEMED | ADJUSTMENT | REVERSAL */
    type: text('type').notNull(),
    /** Signed: positive credits, negative deducts. */
    points: integer('points').notNull(),
    /** The balance immediately after this entry, so history reads correctly. */
    balanceAfter: integer('balance_after').notNull(),
    /** The referral transaction or invoice this movement belongs to. */
    referenceId: text('reference_id'),
    /** The invoice a redemption was spent against, for reversal on refund. */
    invoiceNumber: text('invoice_number'),
    description: text('description').notNull(),
    /** Who did it. A manual adjustment must always name a person. */
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reward_ledger_customer_idx').on(table.customerId, table.createdAt),
    index('reward_ledger_type_idx').on(table.type),
  ],
)

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
