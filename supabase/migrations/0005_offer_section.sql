-- Offers section support: a card colour and a per-offer toggle.
--
-- accent chooses the card colour on the website. It is a short text field rather
-- than a free colour value because the cards are white text on a solid field, and
-- the app only needs to know which of a fixed set of legible colours to use.
--
-- show_in_section lets a shop run a small announcement strip without also
-- filling a card in the Offers grid. Defaults to true so offers created before
-- this change keep appearing exactly where they did.
ALTER TABLE festival_offers
ADD COLUMN IF NOT EXISTS accent TEXT NOT NULL DEFAULT 'red';
ALTER TABLE festival_offers
ADD COLUMN IF NOT EXISTS show_in_section BOOLEAN NOT NULL DEFAULT TRUE;