-- Attribution cleanup rules, per-order handling state, and product catalog mapping.

CREATE TABLE IF NOT EXISTS attribution_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  priority INTEGER DEFAULT 100,
  match_field TEXT DEFAULT 'all',
  match_type TEXT DEFAULT 'contains',
  pattern TEXT NOT NULL,
  target_channel TEXT NOT NULL,
  target_campaign TEXT DEFAULT '',
  status TEXT DEFAULT 'ACTIVE',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attribution_rules_status ON attribution_rules(status);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_priority ON attribution_rules(priority);

CREATE TABLE IF NOT EXISTS order_attribution_overrides (
  order_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'open',
  override_channel TEXT DEFAULT '',
  override_campaign TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  note TEXT DEFAULT '',
  rule_id INTEGER,
  updated_by TEXT DEFAULT 'dashboard',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_attr_override_status ON order_attribution_overrides(status);
CREATE INDEX IF NOT EXISTS idx_order_attr_override_rule ON order_attribution_overrides(rule_id);

CREATE TABLE IF NOT EXISTS product_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_key TEXT UNIQUE NOT NULL,
  product_id TEXT DEFAULT '',
  variant_id TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  product_title TEXT DEFAULT '',
  source TEXT DEFAULT '',
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  raw_data TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_key ON product_catalog(catalog_key);
CREATE INDEX IF NOT EXISTS idx_product_catalog_product ON product_catalog(product_id);
CREATE INDEX IF NOT EXISTS idx_product_catalog_variant ON product_catalog(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_catalog_sku ON product_catalog(sku);

INSERT OR IGNORE INTO attribution_rules
  (name, priority, match_field, match_type, pattern, target_channel, target_campaign, notes)
VALUES
  ('AI source: chatgpt/openai', 10, 'all', 'contains_any', 'chatgpt|openai', 'AI Referral', 'ChatGPT', 'Classify ChatGPT/OpenAI traffic as AI Referral'),
  ('AI source: perplexity', 11, 'all', 'contains', 'perplexity', 'AI Referral', 'Perplexity', 'Classify Perplexity traffic as AI Referral'),
  ('AI source: claude', 12, 'all', 'contains', 'claude', 'AI Referral', 'Claude', 'Classify Claude traffic as AI Referral'),
  ('AI source: gemini', 13, 'all', 'contains', 'gemini', 'AI Referral', 'Gemini', 'Classify Gemini traffic as AI Referral'),
  ('AI source: copilot', 14, 'all', 'contains', 'copilot', 'AI Referral', 'Copilot', 'Classify Copilot traffic as AI Referral'),
  ('Internal domain referral', 20, 'referring_site', 'contains_any', 'thermalmaster.com|thermalmaster.myshopify.com|checkout.shopify.com', 'Direct', '', 'Treat internal and checkout referrals as Direct'),
  ('Shop App referral', 30, 'all', 'contains_any', 'shop.app|shop_app', 'Shop App', '', 'Classify Shop App visits'),
  ('Merchantly app referral', 31, 'referring_site', 'contains_any', 'merchantly.io|addressvalidator.merchantly.io', 'Internal App', '', 'Classify internal app referrals'),
  ('Omnisend email', 40, 'all', 'contains', 'omnisend', 'Email', '', 'Classify Omnisend email traffic'),
  ('YouTube source', 50, 'all', 'contains_any', 'youtube|youtu.be', 'YouTube', '', 'Classify YouTube traffic');
