-- Schema for the jewellery billing system.
-- Matches lib/db/schema.ts exactly. Safe to run more than once.

CREATE TABLE IF NOT EXISTS inventory_items (
  id          serial PRIMARY KEY,
  code        integer NOT NULL UNIQUE,
  name        text NOT NULL,
  category    text NOT NULL,
  price       numeric(12, 2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

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
