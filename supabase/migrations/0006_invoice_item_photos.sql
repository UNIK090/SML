-- Private customer reference photos attached to a specific invoice line.
-- They deliberately do not use inventory_item_images: a photo that a customer
-- brings to the counter is sales evidence, not public catalogue artwork.

CREATE TABLE IF NOT EXISTS invoice_item_photos (
  id              SERIAL PRIMARY KEY,
  invoice_item_id INTEGER NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  mime_type       TEXT NOT NULL,
  data            TEXT NOT NULL,
  byte_size       INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_item_photos_invoice_item
  ON invoice_item_photos(invoice_item_id);
