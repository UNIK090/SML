-- Banner artwork for festival offers.
--
-- The festival photograph the landing page leads with. Bytes live in the
-- database as base64, like product photos, because a serverless deployment has
-- a read-only, ephemeral filesystem: a file written at runtime would vanish on
-- the next deploy.
--
-- banner_updated_at is a cache-buster as well as a record of when the photo was
-- replaced, so the image endpoint can cache the bytes immutably and a new upload
-- still appears at once.
ALTER TABLE festival_offers
ADD COLUMN IF NOT EXISTS banner_mime_type TEXT;
ALTER TABLE festival_offers
ADD COLUMN IF NOT EXISTS banner_data TEXT;
ALTER TABLE festival_offers
ADD COLUMN IF NOT EXISTS banner_byte_size INTEGER;
ALTER TABLE festival_offers
ADD COLUMN IF NOT EXISTS banner_updated_at TIMESTAMPTZ;