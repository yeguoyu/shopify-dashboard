-- Meta Ads Insights table for the first Meta integration phase.

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
