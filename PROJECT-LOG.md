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

### 执行 Shopify customerJourney 订单归因回填

修改文件：
- `PROJECT-LOG.md`

原因：
- 用户重新写入有效的 `SHOPIFY_ADMIN_TOKEN` 后，线上 `/api/order-journey?order_id=7371027841308` 已从 Shopify GraphQL 正常返回 `status: 200`、`ok: true`，可以开始把订单侧 `customerJourneySummary` 写入 D1。

内容：
- 调用线上 `POST /api/backfill-attribution` 多轮回填历史订单归因。
- 共处理 169 单：第一轮 50 单，后续三轮分别 50、50、19 单。
- 回填完成后，D1 中 `first_touch_channel` 或 `last_touch_channel` 仍为 `Pending Attribution` 的订单数为 0。
- 最近订单渠道已从 Pending 更新为 Google Ads、Google Organic、Facebook、YouTube、Email、Bing、Referral、Other、No Conversion Details 等真实渠道。
- `No Conversion Details` 代表 Shopify GraphQL 返回 `customerJourneySummary.ready = true` 但 `moments_count = 0`，即 Shopify 本身没有给该订单转化路径。

验证：
- 线上 D1 查询 Pending 订单数：`pending_count = 0`。
- 线上 `/api/agentic-summary?range=7d` 已识别 AI 智能体订单：3 单，销售额 `$807.03`，AOV `$269.01`，会话 176，AI 首单获客 3。
- AI 平台明细：ChatGPT 2 单 / `$556.86`，Gemini 1 单 / `$250.17`；Perplexity、Claude、Copilot 当前只有会话没有订单。

未解决事项：
- `Catalog -> API logs` 仍没有写入来源，`catalog_logs` 为空；后续需要接入商品/catalog API 访问日志。

### 修正 No Conversion Details 行动建议

修改文件：
- `src/worker.js`
- `PROJECT-LOG.md`

原因：
- Shopify 订单归因回填完成后，Pending 已清零；此时 `No Conversion Details` 代表 Shopify 官方未提供转化路径，继续执行 `/api/backfill-attribution` 不会改善结果。

内容：
- 主看板 AI 建议和飞书提醒中，`No Conversion Details` 的建议从“继续执行 backfill”改为“抽查 UTM、referrer、landing page 和 Pixel 会话链路”。

验证：
- `node --check src/worker.js` 通过。
- `git diff --check` 通过，只有 CRLF 提示。
- `npx wrangler deploy` 成功，Worker Version ID: `89ce8c62-cac7-4b37-8330-7b8eb018eef9`。
- 线上 `/api/dashboard?range=7d` 正常返回，`No Conversion Details` 行动建议已改为检查 UTM/referrer/landing page/Pixel 会话链路。
- 线上 `/api/agentic-summary?range=7d` 仍正常返回 AI 智能体订单数据：3 单，销售额 `$807.03`。

### 优化 Catalog logs、AI 诊断和飞书日报

修改文件：
- `src/worker.js`
- `app.js`
- `index.html`
- `PROJECT-LOG.md`

原因：
- 看板的 `Catalog API logs · SKU + Agent` 为空，因为 `agent_catalog_logs` 目前只有表结构，没有商品/catalog API 写入来源。
- AI 数据分析总结偏概览，没有明确指出问题、影响、证据、排查方式和修复动作。
- 用户要求这些诊断内容和 Shopify 智能体总结同步推送到飞书。

内容：
- `queryAgenticCatalogLogs()` 增加 fallback：当 `agent_catalog_logs` 没有数据时，从现有 `pixel_events` 的 AI 来源商品浏览/加购事件聚合 `agent_name / product_id / product_title / requests`，先展示 “AI Agent 看了哪些 Product”。
- AI 分析新增 `diagnostics` 结构化诊断项，包含 `severity`、`title`、`impact`、`evidence`、`checks`、`fixes`。
- 前端 `AI 数据分析总结` 新增 “问题诊断与修复排查” 卡片，展示影响、证据、排查、修复。
- 飞书日报新增 “问题诊断与修复排查” 和 “Shopify 智能体渠道总结”，同时推送 AI 平台表现、AI 订单清单和 Catalog/SKU 访问摘要。

验证：
- `node --check src/worker.js` 通过。
- `node --check app.js` 通过。
- `git diff --check` 通过，只有 CRLF 提示。
- `npx wrangler deploy` 成功，Worker Version ID: `3a757ec3-58c8-4052-a2e4-6061a67e8eb8`。
- 线上 `/api/agentic-summary?range=7d` 已返回 Catalog fallback：`catalog_log_count = 61`，Top 商品包含 ChatGPT 访问 `Thermal Master P1 Repair Master` 27 次、`NV300 MAX` 13 次。
- 线上 `/api/dashboard?range=7d` 已返回 `diagnostics`，包含付费渠道花费缺失、No Conversion Details、Other 渠道金额较高、Brave Organic 下滑等诊断。
- 手动触发 `/api/feishu-sync?date=2026-05-29` 因缺少 `Authorization: Bearer API_WRITE_TOKEN` 返回 `Unauthorized`；自动定时飞书日报会使用新卡片，手动推送需要带写入 token。

未解决事项：
- fallback 只能展示 Pixel 捕获到的 AI 来源商品事件，SKU 字段仍可能为空；真实 SKU 级 Catalog API logs 仍需要后续在商品/catalog API 访问入口写入 `agent_catalog_logs`。

### 新增同步健康、归因异常明细和商品/SKU 分析

修改文件：
- `src/worker.js`
- `app.js`
- `index.html`
- `shopify-custom-pixel.js`
- `schema.sql`
- `migrations/2026-05-30-pixel-product-sku.sql`
- `README.md`
- `DEPLOYMENT-GUIDE.md`
- `PROJECT-LOG.md`

原因：
- 自查后确认广告花费暂时不处理，但 `Other + No Conversion Details` 7 天合计已有 37 单 / `$16,987.99`，金额足够大，需要在看板和飞书里给出可执行的排查明细。
- 当前 Pending Attribution 已清零，继续重复 backfill 不是主要解决办法；重点应转向 UTM/referrer/landing page/Pixel 链路和渠道映射排查。
- Catalog fallback 已能展示 AI 商品访问，但历史 Pixel 商品事件缺 SKU 字段；需要先补上新事件的 SKU 捕获，同时保留旧数据兼容。
- 用户要求 AI 总结、具体问题、修复排查方法，以及这些内容都同步到飞书。

内容：
- 新增 `GET /api/sync-health`，返回最新订单日期、最新 Pixel 日期、Pending Attribution、Other/No Conversion Details 异常规模、Pixel SKU 字段状态、Feishu/Webhook 配置状态和健康检查项。
- 新增 `GET /api/attribution-anomalies`，列出 Other / No Conversion Details 订单明细，包含金额、有效渠道、UTM/referrer/source_name、问题判断、排查项和修复建议。
- 新增 `GET /api/product-performance`，从 Shopify `line_items` 汇总商品/SKU 的订单数、件数、销售额、Top 渠道，并结合 Pixel 商品事件展示浏览、加购和 AI 商品兴趣。
- 前端新增三个看板模块：`数据同步健康`、`归因异常订单明细`、`商品 / SKU 经营分析`，让问题和修复方法不只停留在摘要里。
- 飞书日报新增 `数据同步健康`、`归因异常订单 Top`、`商品 / SKU 经营分析`、`AI 商品兴趣` 四块内容，和原有 AI 诊断/Shopify 智能体总结一起推送。
- `pixel_events` 新增 `product_sku` 字段和索引；`shopify-custom-pixel.js` 在 `product_viewed`、`product_added_to_cart` 上报 SKU。
- Worker 的 Pixel 写入对 `product_sku` 做兼容 fallback：如果远端表尚未迁移，会自动回退旧字段写入，避免事件丢失。
- README 和部署指南补充新接口、SKU 迁移、验证命令和检查清单。

验证：
- `node --check src/worker.js` 通过。
- `node --check app.js` 通过。
- `node --check shopify-custom-pixel.js` 通过。
- `git diff --check` 通过，仅有 Windows CRLF 提示。
- 线上 D1 已执行 `migrations/2026-05-30-pixel-product-sku.sql`，成功处理 2 条 SQL，`pixel_events.product_sku` 已启用。
- `npx wrangler deploy` 成功，Worker Version ID: `cbf98a5d-cfb4-4705-9c54-26d50aed8f5e`。
- 线上 `/api/sync-health?range=7d&date=2026-05-29` 返回 `status=watch`、`pending_attribution_count=0`、`product_sku_enabled=true`、异常归因 `56` 单 / `$23046.93`。
- 线上 `/api/attribution-anomalies?range=7d&date=2026-05-29&limit=3` 返回 Top 异常订单：`#22315` 已识别为 `入口信号缺失 / high`；`#22269` 已识别为 `Shopify 无 journey，但订单 URL 有 UTM`；`#22221` 已识别为 `Last touch 已识别，但主渠道仍是 Other`。
- 线上 `/api/product-performance?range=7d&date=2026-05-29&limit=3` 返回 Top SKU：`1A00200181`、`1A00800007`、`1A00800022`，并包含订单数、件数、销售额、Top 渠道、浏览、加购和 AI 访问。
- 已推送 GitHub `main`；GitHub Pages 的 `app.js` 已确认包含 `/api/sync-health`、`/api/attribution-anomalies`、`/api/product-performance`，`index.html` 已确认包含 `syncHealthSection`、`attributionAnomalySection`、`productPerformanceSection`。
- 本地没有可用 Playwright/Browser 自动化运行时，因此未做浏览器截图验证；前端已通过 `node --check app.js`，线上 API 已确认可返回真实数据。

### 归因闭环、订单诊断和商品目录优化

修改文件：
- `src/worker.js`
- `app.js`
- `index.html`
- `schema.sql`
- `migrations/2026-05-30-attribution-closure.sql`
- `README.md`
- `DEPLOYMENT-GUIDE.md`
- `PROJECT-LOG.md`

原因：
- 深度自查后确认，仅展示 Other / No Conversion Details 明细还不够，需要能标记处理状态、查看单订单证据链、用规则批量回填明确来源，并把这些内容推送到飞书。
- 商品/SKU 看板需要把 Shopify 订单 line_items、Pixel 商品事件和 AI 商品兴趣更稳定地串起来；如果只靠 SKU 或标题，历史数据容易匹配不完整。
- 默认归因规则必须谨慎，不能把已经明确的 Facebook、Google、Email 等正常渠道误改。

内容：
- 新增 `attribution_rules`、`order_attribution_overrides`、`product_catalog` 三张表；`product_catalog` 使用 `catalog_key` 做稳定唯一键，避免只有标题或只有 SKU 的记录互相覆盖。
- 新增 `GET /api/attribution-rules`、`POST /api/attribution-rules`、`POST /api/attribution-rules/apply`、`POST /api/attribution-anomalies/status`、`GET /api/order-diagnostics`、`POST /api/product-catalog/backfill`。
- 归因异常明细增加 `handling_status`、`effective_source`、`suggested_rule`、规则数量和 open 状态统计；订单诊断接口返回原始归因、有效归因、来源信号、排查建议、商品行、相关 Pixel 事件和 catalog 匹配。
- 前端异常归因表新增状态、命中规则和“详情”按钮，并新增归因规则表；详情面板展示“问题 / 排查 / 修复 / 商品 / Pixel 与 Catalog 证据”。
- Feishu 日报新增“今日执行摘要”，并把归因异常 Top、规则建议、商品/SKU 经营分析、AI 商品兴趣和 Shopify 智能体总结一起推送。
- 默认规则只在弱归因或异常归因订单上生效；AI Referral 规则允许捕获明显 AI 来源，避免误伤正常渠道。

验证：
- 本地 `node --check src/worker.js` 通过。
- 本地 `node --check app.js` 通过。
- 本地 `npx wrangler d1 execute thermal-master-db --local --file=migrations/2026-05-30-attribution-closure.sql` 通过，12 条 SQL 成功执行。
- 远端 `npx wrangler d1 execute thermal-master-db --remote --file=migrations/2026-05-30-attribution-closure.sql` 失败：Cloudflare `Invalid access token [code: 9109]`。
- 远端 `npx wrangler deploy` 失败：Cloudflare `Invalid access token [code: 9109]`。
- 后续需要刷新 Cloudflare/Wrangler 登录后，再执行远端 D1 migration、Worker deploy，并用线上接口复核 `/api/attribution-rules`、`/api/attribution-anomalies`、`/api/order-diagnostics`、`/api/product-performance`、`/api/sync-health`。

未解决事项：
- `POST /api/attribution-rules/apply` 和 `POST /api/product-catalog/backfill` 需要 `API_WRITE_TOKEN`；如果没有 token，只能先验证只读接口，不能手动触发批量回填。
- 当前本机 Wrangler 远端 access token 已失效，需要重新 `wrangler login` 或更新 Cloudflare API token。

### 部署归因闭环并补齐 Pending Attribution 维护

修改文件：
- `src/worker.js`
- `DEPLOYMENT-GUIDE.md`
- `PROJECT-LOG.md`

原因：
- Cloudflare 登录恢复后，需要把归因闭环迁移和 Worker 正式部署到线上。
- 线上验证发现 `sync-health` 的 Pending Attribution 用全库口径，会把 2026-05-30 的新订单计入 2026-05-29 的 7d 报表，造成过度报警。
- 新订单白天进入 D1 后，如果等到第二天飞书日报才回填 customerJourney，Pending 会在当天持续堆积。

内容：
- 远端执行 `migrations/2026-05-30-attribution-closure.sql`，创建并初始化归因规则、订单 override、商品目录表。
- 部署 Worker 版本 `a5060911-7e86-421d-a1b5-0f2fa78eaa6b`，归因闭环接口上线。
- 直接用 D1 从历史 `orders.line_items` 回填 `product_catalog`，237 条 line item 合并为 33 个唯一商品键。
- `sync-health` 的 `pending_attribution_count` 改为当前查询区间口径，并新增 `pending_attribution_total_count` 保存全库 pending 总数。
- Cron 增加每小时轻量维护：每次触发先自动回填最多 25 单 Pending Attribution；日报时段仍继续执行订单同步、归因回填和飞书推送。
- 部署 Worker 版本 `745c0f87-adb2-42c2-a2d4-607829adcc61`，使 pending 口径修正和每小时自动回填维护生效。

验证：
- 远端 D1 migration 成功：12 条 SQL，58 行写入。
- `/api/attribution-rules` 返回 10 条 ACTIVE 默认规则。
- `/api/attribution-anomalies?range=7d&date=2026-05-29&limit=3` 返回 56 单 / `$23046.93`，open 56，rules_count 10。
- `/api/order-diagnostics?order_id=7364960289052` 返回 #22315 的原始归因、有效归因、问题诊断、line_items 和相关 Pixel 事件。
- `/api/product-performance?range=7d&date=2026-05-29&limit=3` 返回 19 个商品、SKU 覆盖率 100%、AI requests 84，Top SKU 包含 `1A00200181`、`1A00800007`、`1A00800022`。
- `/api/agentic-summary?range=7d&date=2026-05-29` 返回 AI 订单 3 单 / `$807.03` / sessions 176 / Catalog fallback 61。
- 远端 D1 复核 `product_catalog` 已有 33 个唯一商品键。
- 远端 D1 复核全库 Pending Attribution 已降至 1 单，说明新增的回填维护/现有回填链路已经开始清理新单 pending。
- 后续本机对 Worker 域名出现 TCP 443 连接失败，但此前只读接口已完成验证；D1 和 Wrangler deploy 通道正常。

未解决事项：
- 仍有 56 单 Other / No Conversion Details 处于 open，需要用订单诊断逐步确认来源，或先通过 `POST /api/attribution-rules/apply` dry run 查看可批量回填样本。
- Worker 域名在本机 DNS 解析到 `69.171.229.73` 后 TCP 443 连接失败，疑似本地网络/解析问题；线上部署已成功，但本机后续 HTTP 复核受阻。
