# Thermal Master Shopify Analytics Dashboard

Thermal Master 的 Shopify 数据看板项目，用 GitHub Pages 承载前端看板，用 Cloudflare Worker + D1 聚合 Shopify 订单、像素事件、广告花费、退款和飞书日报。

## 当前架构

```
Shopify Store
  ├─ Custom Pixel -> Cloudflare Worker -> D1 pixel_events
  ├─ Order / Refund Webhook -> Cloudflare Worker -> D1 orders / refunds
  └─ Theme UTM Snippet -> Cart Attributes -> Order attribution

GitHub Pages Dashboard -> Worker API -> D1
Cloudflare Cron -> Worker -> Shopify sync -> Feishu Webhook
```

## 目录说明

```
shopify-dashboard/
├── index.html                       # GitHub Pages 看板页面，当前内置主要样式
├── app.js                           # 看板交互、API 请求和图表渲染
├── style.css                        # 早期独立样式文件，当前 index.html 未直接引用
├── src/worker.js                    # Cloudflare Worker API、Shopify 同步、飞书日报
├── schema.sql                       # D1 当前推荐建表脚本
├── wrangler.toml                    # Worker 部署配置
├── shopify-custom-pixel.js          # Shopify Customer Events 自定义像素代码
├── shopify-theme-utm-snippet.html   # Shopify theme.liquid UTM 持久化脚本
├── DEPLOYMENT-GUIDE.md              # 部署和接入步骤记录
└── PROJECT-LOG.md                   # 项目整理、修改记录和后续规则
```

本地 `.wrangler/`、`.env*`、`node_modules/`、备份副本等文件不进 Git 仓库。密钥必须通过 Wrangler secret 或 Cloudflare 控制台配置，不能写入代码。

## GitHub 关系

当前本地目录已关联：

```bash
origin  https://github.com/yeguoyu/shopify-dashboard.git
branch  main -> origin/main
```

## 前端看板

前端入口是 `index.html`，页面底部加载 `app.js`。`app.js` 当前 API 地址：

```javascript
var API_BASE = 'https://thermal-master-api.thermalmaster.workers.dev';
```

主要接口：

- `GET /api/dashboard?range=today|7d|30d`
- `GET /api/channels?range=today|7d|30d`
- `GET /api/funnel?range=today|7d|30d`
- `GET /api/ai-analysis?range=today|7d|30d`
- `GET /api/agentic-summary?range=today|7d|30d`
- `GET /api/sync-health?range=today|7d|30d`
- `GET /api/attribution-anomalies?range=today|7d|30d`
- `GET /api/product-performance?range=today|7d|30d`

## Cloudflare Worker

Worker 入口是 `src/worker.js`，由 `wrangler.toml` 指向：

```toml
name = "thermal-master-api"
main = "src/worker.js"
```

主要接口：

- `GET /api/health`
- `POST /api/pixel-event`
- `POST /api/webhook/orders`
- `POST /api/webhook/refunds`
- `POST /api/ad-spend`
- `GET /api/ad-spend`
- `POST /api/sync-orders`
- `POST /api/backfill-attribution`
- `POST /api/meta/sync`
- `GET /api/meta/insights`
- `GET /api/agentic-summary`
- `GET /api/sync-health`
- `GET /api/attribution-anomalies`
- `GET /api/product-performance`
- `POST /api/feishu-sync`
- `GET /api/order-journey?order_id=...`

需要的环境变量或密钥：

- `DB`: D1 binding，由 `wrangler.toml` 配置
- `DASHBOARD_URL`: GitHub Pages 地址
- `SHOPIFY_STORE`: Shopify 店铺域名，例如 `xxx.myshopify.com`
- `SHOPIFY_ADMIN_TOKEN`: Shopify Admin API token
- `SHOPIFY_WEBHOOK_SECRET`: Shopify Webhook signing secret
- `FEISHU_WEBHOOK`: 飞书机器人 webhook
- `FEISHU_REPORT_TIMEZONE`: 飞书日报推送时区，当前为 `Asia/Shanghai`
- `FEISHU_REPORT_HOUR`: 飞书日报推送小时，当前为 `9`
- `FEISHU_REPORT_DATE_OFFSET_DAYS`: 推送哪一天的数据，当前为 `1`，表示推送昨天
- `META_ACCESS_TOKEN`: Meta Marketing API access token
- `META_AD_ACCOUNT_ID`: Meta 广告账户 ID，可以填 `act_xxx` 或纯数字
- `META_API_VERSION`: Meta Graph API 版本，当前默认 `v25.0`
- `META_ATTRIBUTION_WINDOWS`: Meta 归因窗口，当前默认 `["1d_click","7d_click","1d_view"]`
- `META_SYNC_LEVEL`: Meta 同步层级，当前默认 `campaign`，可选 `campaign`、`adset`、`ad`
- `SHOPIFY_API_VERSION`: 可选，默认 `2024-10`
- `API_WRITE_TOKEN`: 可选，保护写入类接口

## 常用命令

```bash
wrangler d1 execute thermal-master-db --file=schema.sql
wrangler d1 execute thermal-master-db --file=migrations/2026-05-29-meta-ad-insights.sql
wrangler d1 execute thermal-master-db --file=migrations/2026-05-29-agent-catalog-logs.sql
wrangler d1 execute thermal-master-db --file=migrations/2026-05-30-pixel-product-sku.sql
wrangler deploy
```

手动同步 Meta 昨日 campaign 级数据：

```bash
curl -X POST "https://thermal-master-api.thermalmaster.workers.dev/api/meta/sync?date=YYYY-MM-DD&level=campaign" \
  -H "Authorization: Bearer YOUR_API_WRITE_TOKEN"
```

查看已同步的 Meta 数据：

```bash
curl "https://thermal-master-api.thermalmaster.workers.dev/api/meta/insights?date=YYYY-MM-DD&level=campaign"
```

查看 Shopify 智能体渠道总结：

```bash
curl "https://thermal-master-api.thermalmaster.workers.dev/api/agentic-summary?range=today&date=YYYY-MM-DD"
```

查看同步健康、异常归因和商品/SKU 分析：
```bash
curl "https://thermal-master-api.thermalmaster.workers.dev/api/sync-health?range=7d&date=YYYY-MM-DD"
curl "https://thermal-master-api.thermalmaster.workers.dev/api/attribution-anomalies?range=7d&date=YYYY-MM-DD"
curl "https://thermal-master-api.thermalmaster.workers.dev/api/product-performance?range=7d&date=YYYY-MM-DD"
```

## Shopify 智能体渠道总结

看板新增了 `Shopify 智能体渠道总结` 板块，对齐 Shopify Admin 可直接查看的 5 个入口：

- `Analytics -> Reports -> Sales by channel`：AI 渠道销售额、订单数、AOV。
- `Analytics -> Reports -> Sessions by channel`：AI 渠道会话数。
- `Orders -> Filter: Agentic channel`：AI 渠道订单清单和来源平台标签。
- `Customers -> Acquired via Agentic`：AI 渠道首单获客客户。
- `Catalog -> API logs`：AI Agent 抓取 SKU 的记录。

当前后端接口是 `GET /api/agentic-summary`。它会先用 D1 现有的订单归因、UTM、referrer、pixel session 识别 ChatGPT/OpenAI、Perplexity、Gemini、Claude、Copilot、Agentic 等来源；如果 Shopify Admin 已有 Agentic channel，但 D1 还没同步到相应字段，板块会显示空数据并提示检查 UTM、referrer 或 customerJourney。

`Catalog -> API logs` 依赖新增的 `agent_catalog_logs` 表，表结构已加入 `schema.sql` 和迁移文件；后续如果要精确看到 “哪个 AI Agent 抓了哪个 SKU”，还需要把商品/catalog API 访问日志写入这张表。

补充：当前 Catalog fallback 会使用 Pixel 商品浏览/加购事件展示 AI 商品兴趣；`pixel_events.product_sku` 已新增，更新 Shopify Custom Pixel 后，新商品事件会带 SKU。

语法检查：

```bash
node --check app.js
node --check src/worker.js
```

## 项目记录规则

后续只要我修改了代码、配置、SQL 或文档，都要同步更新 `PROJECT-LOG.md`。部署步骤或外部平台操作变化，要同时更新 `DEPLOYMENT-GUIDE.md`。

每次记录至少写清楚：

- 日期
- 修改文件
- 修改原因
- 验证结果
- 尚未解决的问题

## 当前注意事项

- `schema.sql` 已按当前 Worker 代码补齐 `orders` 归因字段、`ad_spend` 和 `refunds` 表。已有线上 D1 如果是旧结构，需要单独做迁移，不能只依赖 `CREATE TABLE IF NOT EXISTS` 自动补列。
- 自动飞书日报使用 `FEISHU_REPORT_TIMEZONE` 判断推送时间，和 Shopify 数据时区 `SHOPIFY_TIMEZONE` 分开，避免北京时间 09:05 被洛杉矶时区判断跳过。
- Meta 第一阶段接入会把 Meta Insights 写入 `meta_ad_insights`，并把每日 Facebook 花费回写到 `ad_spend`，让现有渠道 ROAS 和飞书日报直接使用 Meta 花费。
- Shopify 智能体渠道总结已接入 `GET /api/agentic-summary`，前端会展示 AI 渠道销售额、订单、会话、AOV、首单获客和 Catalog API logs；真实 AI 订单数据取决于 Shopify/Pixel 是否已经把 Agentic 来源同步进 D1。
- `src/worker - 副本.js` 是本地备份文件，先不作为正式源码提交。
- `style.css` 目前未被 `index.html` 引用，后续可以再决定是否合并、恢复引用或移入归档。
