-- Festival offers advertised on the storefront.
--
-- A dated, switchable announcement ("Akshaya Tritiya — 10% off this week"). The
-- start and end dates are what make it safe: an offer stops showing the day
-- after it ends, so one cannot be left up by accident.
--
-- The dates are calendar dates in the shop's own timezone (India business time),
-- compared against the business day rather than a timestamp, so an offer runs
-- for its whole last day.
CREATE TABLE IF NOT EXISTS festival_offers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT,
  -- 'percent' = percentage off, 'flat' = rupee amount off. Advertised only; no
  -- catalogue price is rewritten by an offer.
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(12, 2) NOT NULL DEFAULT '0',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_festival_offers_window ON festival_offers(active, starts_on, ends_on);