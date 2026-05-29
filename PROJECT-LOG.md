# Project Log

这个文件是项目的长期记录本。后续我每次修改代码、配置、SQL 或文档，都必须同步更新这里；如果修改影响部署流程，也要同步更新 `DEPLOYMENT-GUIDE.md`。

## 记录规则

每条记录至少包含：

- 日期
- 修改文件
- 修改原因
- 验证结果
- 未解决事项或下一步

## 当前项目快照

- GitHub 仓库：`https://github.com/yeguoyu/shopify-dashboard`
- 本地分支：`main`
- 远端跟踪：`origin/main`
- 前端部署：GitHub Pages
- 后端部署：Cloudflare Worker
- 数据库：Cloudflare D1 `thermal-master-db`
- Worker 入口：`src/worker.js`
- 前端入口：`index.html` + `app.js`
- 当前 API Base：`https://thermal-master-api.thermalmaster.workers.dev`

## 2026-05-29

### 项目接入 GitHub

修改文件：

- `.git/` 本地仓库元数据

内容：

- 初始化当前目录为 Git 仓库。
- 绑定远端 `https://github.com/yeguoyu/shopify-dashboard.git`。
- 切换到 `main` 并跟踪 `origin/main`。

验证：

- `git fetch origin` 成功。
- 本地 `main` 已跟踪 `origin/main`。

未解决事项：

- 本地新增文件还未统一提交。

### 项目整理与文档梳理

修改文件：

- `.gitignore`
- `README.md`
- `schema.sql`
- `wrangler.toml`
- `DEPLOYMENT-GUIDE.md`
- `PROJECT-LOG.md`

内容：

- 新增 `.gitignore`，排除 `.wrangler/`、环境变量、日志、构建输出、本地备份文件。
- 重写 README，让它反映当前真实架构：GitHub Pages 前端、Cloudflare Worker、D1、Shopify、飞书日报。
- 将 `schema.sql` 对齐到当前 Worker 代码，补齐 `orders` 的归因字段、`ad_spend` 表、`refunds` 表和相关索引。
- 修正 `wrangler.toml` 的 Cron 注释，说明当前是每小时第 5 分钟触发，由 Worker 按 Shopify 时区 09 点筛选执行日报。
- 修正部署指南中飞书同步接口为 `/api/feishu-sync`，补充 Shopify 和写接口相关 secrets。
- 建立本文件作为后续修改记录入口。

验证：

- `node --check app.js` 通过。
- `node --check src/worker.js` 通过。
- 使用 SQLite 内存数据库执行 `schema.sql` 通过。

未解决事项：

- 线上 D1 如果已经按旧 `schema.sql` 建库，需要单独迁移补列；当前整理只更新仓库里的标准建表脚本。
- `style.css` 当前未被 `index.html` 引用，后续需要决定保留、合并或归档。
- `src/worker - 副本.js` 是本地备份文件，先通过 `.gitignore` 排除，不删除。

### 修复自动飞书定时推送时区判断

修改文件：

- `src/worker.js`
- `wrangler.toml`
- `README.md`
- `DEPLOYMENT-GUIDE.md`
- `PROJECT-LOG.md`

原因：

- 手动调用 `/api/feishu-sync` 正常，说明飞书 Webhook 和日报生成逻辑可用。
- 自动推送依赖 Cloudflare Cron，但原逻辑每小时触发后用 `SHOPIFY_TIMEZONE = America/Los_Angeles` 判断是否 9 点；如果按北京时间 09:05 等待，会被代码判断为非 9 点并跳过。

内容：

- 新增飞书日报专用配置：`FEISHU_REPORT_TIMEZONE`、`FEISHU_REPORT_HOUR`、`FEISHU_REPORT_DATE_OFFSET_DAYS`。
- `scheduled()` 改为按飞书日报时区判断推送时间，不再直接复用 Shopify 数据时区。
- `wrangler.toml` 默认配置为北京时间 09 点推送昨天数据。
- 手动 `/api/feishu-sync` 返回值补充当前飞书日报时区配置，方便排查。
- README 和部署指南同步说明新的自动推送配置。

验证：

- `node --check src/worker.js` 通过。
- `node --check app.js` 通过。
- 用 Node 验证 `2026-05-29T01:05:00Z` 在 `Asia/Shanghai` 为 `09:05`。
- 使用 Python `tomllib` 解析 `wrangler.toml` 通过，并确认 Cron 为 `5 * * * *`。
- `npx wrangler deploy` 部署成功，Worker Version ID: `6df9cb13-09f1-49a3-8d54-0608242b3819`。
- 线上 `/api/health` 返回 `status: ok`。

未解决事项：

- Cloudflare API 工具读取线上 Worker Cron 时返回认证错误 `10000: Authentication error`；本次最终通过 `npx wrangler deploy` 完成部署。
- 自动推送需要等下一次北京时间 09:05 的 Cron 触发后确认飞书实际收到消息。

### Meta Ads Insights 第一阶段接入

修改文件：

- `src/worker.js`
- `schema.sql`
- `migrations/2026-05-29-meta-ad-insights.sql`
- `wrangler.toml`
- `README.md`
- `DEPLOYMENT-GUIDE.md`
- `PROJECT-LOG.md`

原因：

- 看板已有 Facebook/Meta 渠道识别，但缺少 Meta 官方广告花费、Meta reported purchases、purchase value 和 ROAS。
- 现有 `ad_spend` 依赖手工录入，导致渠道 ROAS 和飞书日报容易缺少 Meta 花费。

内容：

- 新增 `meta_ad_insights` D1 表，保存 Meta Marketing API Insights 的 campaign/adset/ad 维度数据。
- 新增 `POST /api/meta/sync`，支持按日期和层级同步 Meta Insights。
- 新增 `GET /api/meta/insights`，查询已同步的 Meta 数据和汇总。
- Meta 同步成功后，会把每日 Meta 花费汇总回写到 `ad_spend` 的 `Facebook` 渠道。
- 每日飞书 pipeline 在配置了 `META_ACCESS_TOKEN` 和 `META_AD_ACCOUNT_ID` 时，会先同步 Meta 花费再推送日报。
- 新增 Worker 配置：`META_API_VERSION`、`META_ATTRIBUTION_WINDOWS`、`META_SYNC_LEVEL`。
- 文档补充 Meta token、广告账户 ID、D1 migration、手动同步和查询方式。

验证：

- `node --check src/worker.js` 通过。
- `node --check app.js` 通过。
- 使用 SQLite 内存数据库执行 `schema.sql` 和 `migrations/2026-05-29-meta-ad-insights.sql` 通过。
- `npx wrangler d1 execute thermal-master-db --remote --file=migrations/2026-05-29-meta-ad-insights.sql` 成功。
- `npx wrangler deploy` 成功，Worker Version ID: `f84c540a-c254-4278-b2bd-3646b98e47b5`。
- 线上 `/api/health` 返回 `status: ok`。
- 线上 `/api/meta/insights?date=2026-05-29&level=campaign` 正常返回空数据结构。
- 线上 `POST /api/meta/sync` 在缺少 `Authorization` 时返回 `Unauthorized`，确认写入接口受 `API_WRITE_TOKEN` 保护。

未解决事项：

- 还未配置 `META_ACCESS_TOKEN` 和 `META_AD_ACCOUNT_ID`，所以尚未完成真实 Meta 数据同步。
- 下一步需要拿到 Meta 广告账户 ID 和可读取 Insights 的 access token，并通过 Wrangler secret 写入线上 Worker。

### 修复看板默认日期为空

修改文件：

- `src/worker.js`
- `app.js`
- `index.html`
- `PROJECT-LOG.md`

原因：

- 看板默认请求店铺时区当天 `2026-05-29`，但 D1 最新订单日期是 `2026-05-28`。
- 因为当天订单为 0，默认 24h 视图显示销售额、订单和渠道为空，容易误判为看板没数据。

内容：

- 新增 `GET /api/data-status`，返回店铺时区今日、最新订单日期、最新 Pixel 日期和默认展示日期。
- 前端加载数据前先请求 `/api/data-status`，并把 `default_date` 带到 dashboard、channels、funnel 请求里。
- 默认日视图改为展示最新有订单日期；如果今天已经有订单，会自动切回今天。
- 将 KPI 和图表文案从“今日”调整为更中性的“销售额 / 广告花费 / 当前 / 对比”，避免最新完整日和今日混淆。

验证：

- `node --check src/worker.js` 通过。
- `node --check app.js` 通过。
- `npx wrangler deploy` 成功，Worker Version ID: `3f98b1c4-67bf-49a8-8773-e1942fb2cd27`。
- 线上 `/api/data-status` 返回 `default_date: 2026-05-28`、`shopify_today: 2026-05-29`、`today_orders: 0`。
- 线上 `/api/dashboard?range=today&date=2026-05-28` 返回销售额 `$5690.01`、订单 `22`。
- 线上 `/api/channels?range=today&date=2026-05-28` 返回 Direct 渠道销售额 `$5690.01`。

未解决事项：

- GitHub Pages 需要推送 `index.html` 和 `app.js` 后前端才会生效。

### 接入 Shopify 智能体渠道总结板块

修改文件：
- `src/worker.js`
- `app.js`
- `index.html`
- `schema.sql`
- `migrations/2026-05-29-agent-catalog-logs.sql`
- `README.md`
- `DEPLOYMENT-GUIDE.md`
- `PROJECT-LOG.md`

原因：
- 用户希望在看板里新增一个 Shopify 智能体/AI 渠道总结板块，并包含图片里的 5 个 Shopify Admin 入口：Sales by channel、Sessions by channel、Orders Agentic filter、Customers Acquired via Agentic、Catalog API logs。

内容：
- 新增 `GET /api/agentic-summary`，按当前 range/date 返回 AI 智能体渠道 `summary`、`kpi`、平台表现、订单清单、首单获客客户、Catalog API logs 和 Shopify Admin 入口映射。
- 后端基于现有 D1 订单归因、UTM、referrer、landing site 和 pixel session 识别 ChatGPT/OpenAI、Perplexity、Gemini、Claude、Copilot、Agentic 等来源。
- 没有 AI 渠道订单时不再把 AI AOV 与 Direct AOV 显示为 `-100%`，前端提示改为 `AI AOV 暂无订单`，避免把“暂无订单”误读成渠道质量下降。
- 前端新增 `Shopify 智能体渠道总结` 板块，展示 AI 渠道销售额、订单、会话、AOV、CVR、首单获客、平台表现、订单清单、客户清单和 SKU + Agent 抓取日志。
- 新增 `agent_catalog_logs` 表和迁移文件，预留 Catalog API logs 的 SKU/Agent 粒度统计。
- README 和部署指南补充新接口、D1 migration、验证命令和当前数据口径说明。

验证：
- `node --check src/worker.js` 通过。
- `node --check app.js` 通过。
- SQLite 内存执行 `schema.sql` 和 `migrations/2026-05-29-agent-catalog-logs.sql` 通过。
- `git diff --check` 通过，只有 CRLF 提示。
- 线上 D1 执行 `migrations/2026-05-29-agent-catalog-logs.sql` 成功。
- `npx wrangler deploy` 成功，Worker Version ID: `dc9dc160-fdf6-436f-81ed-dc470bc87b1d`。
- 线上 `/api/agentic-summary?range=today&date=2026-05-28` 正常返回；当前识别到 ChatGPT 会话 23、Claude 会话 3，AI 渠道订单为 0。
- 已推送到 GitHub `main`；GitHub Pages 的 `index.html` 和 `app.js` 已确认包含 `agenticSummarySection`、`/api/agentic-summary` 和 `AI AOV 暂无订单` 空状态文案。

未解决事项：
- 当前 D1 里的订单归因大多仍是 Direct/Pending Attribution；如果 Shopify Admin 已经出现 Agentic channel，但 D1 没有同步相应字段，AI 渠道订单会暂时为空。
- `Catalog -> API logs` 目前只有表结构和看板展示位，后续需要在商品/catalog API 访问入口写入 `agent_catalog_logs`，才能真正统计 AI Agent 抓取 SKU。

### 补强 Shopify Agentic 订单归因识别

修改文件：
- `src/worker.js`
- `PROJECT-LOG.md`

原因：
- 线上 `/api/backfill-attribution` 返回 `graphql_http_401`，说明当前 Shopify Admin GraphQL token 未通过认证；即使 token 修好，如果 Shopify 把 Agentic/ChatGPT 来源放在 `sourceName` 或 `customerJourneySummary.firstVisit.sourceDescription`，旧分类逻辑也可能在没有 UTM/referrer 时先判成 Direct。

内容：
- `classifyChannel()` 改为优先检查 `sourceName/sourceDescription` 中的 ChatGPT/OpenAI、Perplexity、Gemini、Claude、Copilot、Agentic 等文本，命中时归为 `AI Referral`。
- `parseShopifyJourneyVisit()` 在没有 UTM campaign 时，会把 AI 平台名作为 campaign fallback，方便智能体板块识别具体平台。
- `isAgenticOrderRow()` 和 `getAgenticPlatformFromOrder()` 增加 `first_touch_campaign`、`last_touch_campaign` 检测，让回填后的订单可以显示 ChatGPT/Claude 等平台。

验证：
- `node --check src/worker.js` 通过。
- `git diff --check` 通过，只有 CRLF 提示。
- `npx wrangler deploy` 成功，Worker Version ID: `d7b5a33e-ddae-4f83-88f5-f03001669001`。

未解决事项：
- 需要重新写入有效的 `SHOPIFY_ADMIN_TOKEN`，当前线上 GraphQL 返回 401，订单侧归因无法真正回填。
