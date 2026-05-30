-- Add SKU capture for Shopify Custom Pixel product events.
ALTER TABLE pixel_events ADD COLUMN product_sku TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_pixel_product_sku ON pixel_events(product_sku);
