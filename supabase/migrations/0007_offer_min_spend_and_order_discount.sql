-- Make an offer a rule the till checks, not just a poster.
--
-- Until now an offer was an advertisement only: the banner said "10% off" and
-- the shopkeeper settled it by hand at the counter. That is fine for a discount
-- nobody wants to enforce, but a threshold offer ("spend ₹3,000, get ₹500 off")
-- is a promise with arithmetic behind it, and arithmetic done by eye goes wrong.
--
-- `min_spend` is the threshold in rupees; 0 means the offer applies to any
-- basket, which keeps every existing row behaving exactly as it did.
--
-- The order side records what was actually given:
--
--   discount_amount  rupees taken off this order
--   offer_title      which offer did it, kept because offers expire and the
--                    order has to keep saying what the customer was promised
--
-- Both default to 0/NULL, so orders placed before this change read back as
-- "no discount" rather than as a broken row.
ALTER TABLE festival_offers
ADD COLUMN IF NOT EXISTS min_spend NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE store_orders
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE store_orders
ADD COLUMN IF NOT EXISTS offer_title TEXT;