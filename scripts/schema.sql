-- Schema for the jewellery billing system.
-- Matches lib/db/schema.ts exactly. Safe to run more than once.

CREATE TABLE IF NOT EXISTS inventory_items (
  id          serial PRIMARY KEY,
  code        integer NOT NULL UNIQUE,
  barcode     text,
  name        text NOT NULL,
  category    text NOT NULL,
  price       numeric(12, 2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Barcodes stay text so EAN/UPC values keep leading zeroes and are not limited
-- by the range of the integer item code. Blank values remain optional.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS barcode text;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_barcode_unique
  ON inventory_items (barcode) WHERE barcode IS NOT NULL;

-- Optional product photographs for the visual catalogue. Bytes are stored in
-- the database because the production app has a read-only serverless disk.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_mime_type text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_data text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_byte_size integer;

CREATE TABLE IF NOT EXISTS billing_transactions (
  id              serial PRIMARY KEY,
  invoice_number  text NOT NULL UNIQUE,
  item_code       integer NOT NULL,
  item_name       text NOT NULL,
  category        text NOT NULL,
  unit_price      numeric(12, 2) NOT NULL,
  quantity        integer NOT NULL,
  total_amount    numeric(12, 2) NOT NULL,
  payment_status  text NOT NULL DEFAULT 'PAID',
  business_day    date NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Customer and discount details on the invoice header (added with multi-item bills).
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS customer_name  text;
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS discount       numeric(12, 2) NOT NULL DEFAULT '0';

-- Each new invoice gets an unguessable token for its QR receipt link. It is
-- nullable for invoices created before this feature was installed.
ALTER TABLE billing_transactions ADD COLUMN IF NOT EXISTS public_token text;
CREATE UNIQUE INDEX IF NOT EXISTS billing_transactions_public_token_unique
  ON billing_transactions (public_token) WHERE public_token IS NOT NULL;

-- One row per item on an invoice.
CREATE TABLE IF NOT EXISTS invoice_items (
  id               serial PRIMARY KEY,
  invoice_number   text NOT NULL,
  item_code        integer NOT NULL,
  item_name        text NOT NULL,
  category         text NOT NULL,
  catalogue_price  numeric(12, 2) NOT NULL,
  unit_price       numeric(12, 2) NOT NULL,
  quantity         integer NOT NULL,
  line_total       numeric(12, 2) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_number_idx ON invoice_items (invoice_number);

CREATE TABLE IF NOT EXISTS daily_earnings (
  business_day      date PRIMARY KEY,
  total_amount      numeric(12, 2) NOT NULL DEFAULT '0',
  transaction_count integer NOT NULL DEFAULT 0,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- The shop logo. Stored in the database (single row, id = 1) because a
-- serverless filesystem is read-only and does not survive a deploy.
CREATE TABLE IF NOT EXISTS shop_logo (
  id         integer PRIMARY KEY,
  mime_type  text NOT NULL,
  data       text NOT NULL,
  byte_size  integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Browser favicon and display picture use the same single-row brand record as
-- the shop logo. These additions are safe for existing installations.
ALTER TABLE shop_logo ADD COLUMN IF NOT EXISTS favicon_mime_type text;
ALTER TABLE shop_logo ADD COLUMN IF NOT EXISTS favicon_data text;
ALTER TABLE shop_logo ADD COLUMN IF NOT EXISTS favicon_byte_size integer;
ALTER TABLE shop_logo ADD COLUMN IF NOT EXISTS avatar_mime_type text;
ALTER TABLE shop_logo ADD COLUMN IF NOT EXISTS avatar_data text;
ALTER TABLE shop_logo ADD COLUMN IF NOT EXISTS avatar_byte_size integer;
-- The original three columns are optional now: this lets a shop upload a
-- favicon or display picture before its invoice logo.
ALTER TABLE shop_logo ALTER COLUMN mime_type DROP NOT NULL;
ALTER TABLE shop_logo ALTER COLUMN data DROP NOT NULL;
ALTER TABLE shop_logo ALTER COLUMN byte_size DROP NOT NULL;

-- Every attempt to send an invoice to a customer, so a bill can be proved sent
-- and failures can be retried. `status` is QUEUED (a WhatsApp link was handed to
-- the user), SENT (a provider accepted it), or FAILED.
CREATE TABLE IF NOT EXISTS invoice_sends (
  id             serial PRIMARY KEY,
  invoice_number text NOT NULL,
  channel        text NOT NULL,
  provider       text NOT NULL,
  phone          text NOT NULL,
  status         text NOT NULL DEFAULT 'QUEUED',
  response       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_sends_invoice_number_idx ON invoice_sends (invoice_number);

-- Editable shop profile (single row, id = 1).
-- These values override the SHOP_* environment variables, so the shop details
-- can be changed from the Profile screen without editing .env.local or
-- redeploying. Anything null here falls back to the environment.
CREATE TABLE IF NOT EXISTS shop_profile (
  id         integer PRIMARY KEY,
  name       text NOT NULL,
  address    text,
  phone      text,
  email      text,
  gstin      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Online storefront
-- ---------------------------------------------------------------------------
-- An item appears on the public website only when published is true, so the
-- billing catalogue is never exposed by accident. Everything here is edited
-- from the admin Store screen.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS published    boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS store_price  numeric(12, 2);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS description  text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS collection   text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS badge        text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS featured     integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS inventory_items_published_idx
  ON inventory_items (published, featured, updated_at DESC);

-- Storefront copy on the shop profile row (id = 1).
ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS tagline     text;
ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS whatsapp    text;
ALTER TABLE shop_profile ADD COLUMN IF NOT EXISTS store_hours text;

-- One row per online order. Kept separate from billing_transactions: an order
-- is a request the shop confirms, and invoice_number links it to the bill that
-- is raised later, so the same sale is never counted twice.
CREATE TABLE IF NOT EXISTS store_orders (
  id              serial PRIMARY KEY,
  order_number    text NOT NULL UNIQUE,
  public_token    text NOT NULL UNIQUE,
  customer_name   text NOT NULL,
  customer_phone  text NOT NULL,
  customer_email  text,
  fulfilment      text NOT NULL DEFAULT 'PICKUP',
  address_line    text,
  city            text,
  pincode         text,
  notes           text,
  payment_status  text NOT NULL DEFAULT 'PENDING',
  status          text NOT NULL DEFAULT 'NEW',
  item_count      integer NOT NULL DEFAULT 0,
  subtotal        numeric(12, 2) NOT NULL DEFAULT '0',
  delivery_fee    numeric(12, 2) NOT NULL DEFAULT '0',
  total_amount    numeric(12, 2) NOT NULL DEFAULT '0',
  invoice_number  text,
  business_day    date NOT NULL DEFAULT now(),
  acked_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_orders_created_at_idx ON store_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS store_orders_status_idx     ON store_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS store_orders_acked_idx      ON store_orders (acked_at);

-- Line items, copied rather than referenced so a later catalogue edit cannot
-- rewrite an order that has already been placed.
CREATE TABLE IF NOT EXISTS store_order_items (
  id           serial PRIMARY KEY,
  order_number text NOT NULL,
  item_code    integer NOT NULL,
  item_name    text NOT NULL,
  category     text NOT NULL,
  unit_price   numeric(12, 2) NOT NULL,
  quantity     integer NOT NULL,
  line_total   numeric(12, 2) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_order_items_order_number_idx ON store_order_items (order_number);

-- Append-only feed behind the realtime order alerts and the admin bell history.
CREATE TABLE IF NOT EXISTS order_notifications (
  id           serial PRIMARY KEY,
  event_id     text NOT NULL UNIQUE,
  type         text NOT NULL,
  order_number text,
  title        text NOT NULL,
  body         text NOT NULL,
  audience     text NOT NULL DEFAULT 'admin',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_notifications_created_at_idx ON order_notifications (created_at DESC);
