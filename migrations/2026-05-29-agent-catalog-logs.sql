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
