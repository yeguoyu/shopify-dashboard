-- ============================================
-- Thermal Master - Cloudflare D1 Schema
-- Canonical schema for the current Worker code.
-- ============================================

-- Orders from Shopify webhooks and Admin API sync.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  order_number TEXT,
  order_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  shopify_created_at TEXT,
  total_price REAL DEFAULT 0,
  subtotal_price REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  financial_status TEXT,
  fulfillment_status TEXT,
  customer_id TEXT,
  customer_email TEXT,
  landing_site TEXT,
  referring_site TEXT,
  channel TEXT DEFAULT 'Direct',
  utm_source TEXT DEFAULT '',
  utm_medium TEXT DEFAULT '',
  utm_campaign TEXT DEFAULT '',
  utm_content TEXT DEFAULT '',
  utm_term TEXT DEFAULT '',
  first_touch_channel TEXT,
  first_touch_campaign TEXT,
  last_touch_channel TEXT,
  last_touch_campaign TEXT,
  line_items_count INTEGER DEFAULT 0,
  line_items TEXT DEFAULT '[]',
  discount_codes TEXT DEFAULT '[]',
  raw_data TEXT,
  inserted_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_shopify_created ON orders(shopify_created_at);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_first_touch ON orders(first_touch_channel);
CREATE INDEX IF NOT EXISTS idx_orders_last_touch ON orders(last_touch_channel);
CREATE INDEX IF NOT EXISTS idx_orders_campaign ON orders(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

-- Events collected by Shopify Custom Pixel.
CREATE TABLE IF NOT EXISTS pixel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  session_id TEXT,
  page_url TEXT,
  referrer TEXT,
  utm_source TEXT DEFAULT '',
  utm_medium TEXT DEFAULT '',
  utm_campaign TEXT DEFAULT '',
  utm_content TEXT DEFAULT '',
  utm_term TEXT DEFAULT '',
  product_id TEXT,
  product_title TEXT,
  product_sku TEXT DEFAULT '',
  product_price REAL,
  variant_id TEXT,
  quantity INTEGER,
  cart_total REAL,
  order_id TEXT,
  order_total REAL,
  currency TEXT DEFAULT 'USD',
  customer_id TEXT,
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pixel_timestamp ON pixel_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_pixel_event ON pixel_events(event_name);
CREATE INDEX IF NOT EXISTS idx_pixel_session ON pixel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pixel_campaign ON pixel_events(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_pixel_product_sku ON pixel_events(product_sku);

-- Manual or imported ad spend by date and channel.
CREATE TABLE IF NOT EXISTS ad_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  channel TEXT NOT NULL,
  spend REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(date, channel)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_date ON ad_spend(date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_channel ON ad_spend(channel);

-- Meta Ads Insights imported from the Meta Marketing API.
CREATE TABLE IF NOT EXISTS meta_ad_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'campaign',
  account_id TEXT DEFAULT '',
  account_name TEXT DEFAULT '',
  campaign_id TEXT DEFAULT '',
  campaign_name TEXT DEFAULT '',
  adset_id TEXT DEFAULT '',
  adset_name TEXT DEFAULT '',
  ad_id TEXT DEFAULT '',
  ad_name TEXT DEFAULT '',
  attribution_setting TEXT DEFAULT '',
  attribution_windows TEXT DEFAULT '',
  spend REAL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  inline_link_clicks INTEGER DEFAULT 0,
  frequency REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  ctr REAL DEFAULT 0,
  purchases REAL DEFAULT 0,
  purchase_value REAL DEFAULT 0,
  purchase_roas REAL,
  website_purchase_roas REAL,
  raw_actions TEXT DEFAULT '[]',
  raw_action_values TEXT DEFAULT '[]',
  raw_purchase_roas TEXT DEFAULT '[]',
  raw_data TEXT DEFAULT '{}',
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(date, level, campaign_id, adset_id, ad_id, attribution_windows)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_date ON meta_ad_insights(date);
CREATE INDEX IF NOT EXISTS idx_meta_insights_level ON meta_ad_insights(level);
CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign ON meta_ad_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_adset ON meta_ad_insights(adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_ad ON meta_ad_insights(ad_id);

-- Optional catalog/API log table for AI agent SKU access analysis.
CREATE TABLE IF NOT EXISTS agent_catalog_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  agent_name TEXT DEFAULT 'AI Agent',
  user_agent TEXT DEFAULT '',
  ip_hash TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  product_id TEXT DEFAULT '',
  product_title TEXT DEFAULT '',
  request_path TEXT DEFAULT '',
  referrer TEXT DEFAULT '',
  raw_data TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_agent_catalog_logs_requested ON agent_catalog_logs(requested_at);
CREATE INDEX IF NOT EXISTS idx_agent_catalog_logs_agent ON agent_catalog_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_catalog_logs_sku ON agent_catalog_logs(sku);

-- Refunds from Shopify refund webhooks.
CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_id TEXT UNIQUE NOT NULL,
  order_id TEXT NOT NULL,
  amount REAL DEFAULT 0,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at);

-- Optional daily rollup table for future performance optimization.
CREATE TABLE IF NOT EXISTS daily_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  revenue REAL DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  aov REAL DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  add_to_cart INTEGER DEFAULT 0,
  checkout_started INTEGER DEFAULT 0,
  checkout_completed INTEGER DEFAULT 0,
  atc_rate REAL DEFAULT 0,
  checkout_rate REAL DEFAULT 0,
  cvr REAL DEFAULT 0,
  top_channel TEXT,
  channel_data TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summary(date);
