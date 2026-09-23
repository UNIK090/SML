-- Multi-image gallery support for catalogue items.
--
-- The legacy inventory_items.image_* columns remain as the primary / first
-- image so old storefront code keeps working. New gallery rows live here.

CREATE TABLE IF NOT EXISTS inventory_item_images (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_images_item_order
  ON inventory_item_images(item_id, display_order);
