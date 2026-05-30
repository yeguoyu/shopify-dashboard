# 第二步：数据采集层部署指南

## 总览

```
Shopify 店铺
    ├── Custom Pixel ──→ Cloudflare Worker ──→ D1 数据库
    ├── Order Webhook ──→ Cloudflare Worker ──→ D1 数据库
    └── Theme UTM 脚本 ──→ Cart Attributes ──→ 订单数据
                                                    ↓
GitHub Pages 看板 ←── Worker API ←── D1 数据库
                                                    ↓
                        Cron Trigger ──→ 飞书 Webhook ──→ 飞书群
```

---

## 步骤 2.1 — 创建 Cloudflare Worker + D1

### A. 注册 Cloudflare（如果没有账号）

1. 打开 https://dash.cloudflare.com/sign-up
2. 邮箱注册，免费计划就够用

### B. 安装 Wrangler CLI

在电脑终端（Mac 用 Terminal，Windows 用 CMD / PowerShell）运行：

```bash
npm install -g wrangler
```

如果没有 Node.js，先去 https://nodejs.org 下载安装。

登录 Cloudflare：

```bash
wrangler login
```

浏览器会弹出授权页面，点击 Allow。

### C. 创建 D1 数据库

```bash
wrangler d1 create thermal-master-db
```

终端会输出类似：

```
✅ Successfully created DB 'thermal-master-db'
database_id = "xxxx-xxxx-xxxx-xxxx"
```

**⚠️ 复制这个 database_id**，后面要用。

### D. 初始化建表

```bash
wrangler d1 execute thermal-master-db --file=schema.sql
```

### E. 配置 wrangler.toml

打开 `wrangler.toml` 文件，把 `database_id` 替换为你刚才复制的 ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "thermal-master-db"
database_id = "xxxx-xxxx-xxxx-xxxx"  ← 替换这里
```

把 `DASHBOARD_URL` 替换为你的 GitHub Pages 地址：

```toml
[vars]
DASHBOARD_URL = "https://你的用户名.github.io/shopify-dashboard/"
FEISHU_REPORT_TIMEZONE = "Asia/Shanghai"
FEISHU_REPORT_HOUR = "9"
FEISHU_REPORT_DATE_OFFSET_DAYS = "1"
META_API_VERSION = "v25.0"
META_ATTRIBUTION_WINDOWS = "[\"1d_click\",\"7d_click\",\"1d_view\"]"
META_SYNC_LEVEL = "campaign"
```

### F. 设置 Secrets

```bash
# Shopify Webhook 验证密钥（步骤 2.3 创建 Webhook 时会拿到）
wrangler secret put SHOPIFY_WEBHOOK_SECRET

# Shopify Admin API 同步订单和 customerJourney 归因
wrangler secret put SHOPIFY_STORE
wrangler secret put SHOPIFY_ADMIN_TOKEN

# 飞书 Webhook URL（步骤 2.5 创建飞书机器人时会拿到）
wrangler secret put FEISHU_WEBHOOK

# 可选：保护写入类接口，例如 /api/sync-orders、/api/feishu-sync
wrangler secret put API_WRITE_TOKEN

# Meta Ads Insights 自动同步
wrangler secret put META_ACCESS_TOKEN
wrangler secret put META_AD_ACCOUNT_ID
```

每条命令运行后会提示你输入值，粘贴后回车。

### G. 部署 Worker

```bash
wrangler deploy
```

部署成功后终端会显示你的 Worker URL：

```
✅ Published thermal-master-api
  https://thermal-master-api.你的子域名.workers.dev
```

**⚠️ 记下这个 URL**，后面所有地方都要用。

### H. 测试

在浏览器打开：

```
https://thermal-master-api.你的子域名.workers.dev/api/health
```

看到 `{"status":"ok"}` 就说明部署成功。

---

## 步骤 2.2 — 安装 Shopify Custom Pixel

### A. 进入 Customer Events

Shopify 后台 → Settings → Customer events

### B. 创建自定义像素

1. 点击 **Add custom pixel**
2. 名称填：`TM Analytics Pixel`
3. 权限选择：**不限制**（需要访问所有事件）
4. 在代码编辑器中，粘贴 `shopify-custom-pixel.js` 的全部内容
5. **⚠️ 修改第 8 行的 WORKER_URL**，替换为你的 Worker URL：

```javascript
const WORKER_URL = 'https://thermal-master-api.你的子域名.workers.dev/api/pixel-event';
```

6. 点击 **Save** → **Connect**

### C. 验证

1. 打开你的 Shopify 店铺前台
2. 浏览一个商品页面，加入购物车
3. 回到 Cloudflare Dashboard → D1 → thermal-master-db → Console
4. 运行：

```sql
SELECT * FROM pixel_events ORDER BY id DESC LIMIT 5;
```

能看到刚才的事件记录就说明 Pixel 正常工作。

---

## 步骤 2.3 — 安装 UTM 持久化脚本

### A. 编辑主题代码

1. Shopify 后台 → Online Store → Themes
2. 当前主题 → 点击 **⋯** → **Edit code**
3. 左侧找到 `Layout` → `theme.liquid`
4. 找到 `</body>` 标签
5. 在 `</body>` **前面**粘贴 `shopify-theme-utm-snippet.html` 的全部内容
6. 点击 **Save**

### B. 验证

1. 用带 UTM 参数的链接访问你的店铺：
   ```
   https://你的店铺.com?utm_source=test&utm_medium=cpc&utm_campaign=test_campaign
   ```
2. 加一个商品到购物车
3. 打开浏览器开发者工具 → Console，看到 `[TM UTM] UTM persistence loaded` 日志
4. 访问 `https://你的店铺.com/cart.json`，在 `attributes` 里应该能看到 UTM 参数

---

## 步骤 2.4 — 创建 Shopify Webhook

### A. 创建 Custom App

1. Shopify 后台 → Settings → Apps and sales channels
2. 点击 **Develop apps** → **Create an app**
3. 名称填：`TM Dashboard`
4. 点击 **Configure Admin API scopes**
5. 勾选以下权限：
   - `read_orders`
   - `read_analytics`
   - `read_customers`
   - `read_products`
6. 点击 **Save** → **Install app** → **Install**
7. 在 **API credentials** 页面，复制 **Admin API access token**

### B. 注册 Order Webhook

在终端运行（替换你的店铺域名和 token）：

```bash
curl -X POST \
  https://你的店铺.myshopify.com/admin/api/2024-10/webhooks.json \
  -H "X-Shopify-Access-Token: 你的Admin_API_Token" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "topic": "orders/create",
      "address": "https://thermal-master-api.你的子域名.workers.dev/api/webhook/orders",
      "format": "json"
    }
  }'
```

返回结果里会包含一个 webhook ID，说明注册成功。

### C. 设置 Webhook 验证密钥

1. Shopify 后台 → Settings → Notifications → 页面底部找到 **Webhooks** 区域
2. 看到 **Signing secret**，复制这个值
3. 在终端运行：

```bash
wrangler secret put SHOPIFY_WEBHOOK_SECRET
```

粘贴刚才复制的 signing secret，回车。

### D. 验证

创建一个测试订单（可以用 Shopify 的 Bogus Gateway）。
然后在 D1 Console 运行：

```sql
SELECT order_id, total_price, channel, utm_campaign FROM orders ORDER BY id DESC LIMIT 5;
```

能看到订单数据就说明 Webhook 正常。

---

## 步骤 2.5 — 配置飞书群推送

### A. 创建飞书群机器人

1. 打开飞书，进入你要推送的群
2. 群设置 → **群机器人** → **添加机器人**
3. 选择 **自定义机器人**
4. 名称填：`Shopify 日报`
5. 描述填：每日销售数据自动推送
6. 点击 **完成**
7. **⚠️ 复制 Webhook 地址**，格式类似：
   ```
   https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx
   ```

### B. 设置到 Worker

```bash
wrangler secret put FEISHU_WEBHOOK
```

粘贴飞书 Webhook URL，回车。

### C. 测试推送

在浏览器或终端发起请求：

```bash
curl -X POST https://thermal-master-api.你的子域名.workers.dev/api/feishu-sync
```

飞书群应该能收到一条卡片消息。

### D. 自动定时推送

已在 `wrangler.toml` 中配置了 Cron Trigger：

```toml
[triggers]
crons = ["5 * * * *"]
```

Cloudflare Cron 使用 UTC。当前配置是每小时第 5 分钟触发一次，Worker 内部会按 `FEISHU_REPORT_TIMEZONE` 和 `FEISHU_REPORT_HOUR` 判断，只在北京时间 09:05 左右同步昨天订单并推送日报。
部署后自动生效，不需要额外操作。

---

## 步骤 2.6 — 接入 Meta Ads Insights

Meta 第一阶段接入用于同步广告花费、点击、展示、Meta reported purchase、purchase value 和 ROAS。同步成功后，Worker 会把每日 Meta 花费汇总写入 `ad_spend` 的 `Facebook` 渠道，现有看板和飞书日报会自动使用这部分花费。

### A. 准备 Meta 权限

1. 在 Meta Business / Developers 中准备能读取广告账户 Insights 的 access token。
2. token 至少需要能读取广告账户报表的权限，通常是 `ads_read`。
3. 记录广告账户 ID，可以是 `act_xxxxx`，也可以是纯数字。

### B. 初始化 D1 表

```bash
wrangler d1 execute thermal-master-db --file=migrations/2026-05-29-meta-ad-insights.sql
```

### C. 设置 Worker Secrets

```bash
wrangler secret put META_ACCESS_TOKEN
wrangler secret put META_AD_ACCOUNT_ID
```

`META_AD_ACCOUNT_ID` 可以填 `act_xxxxx` 或纯数字。

### D. 部署 Worker

```bash
wrangler deploy
```

### E. 手动同步和验证

```bash
curl -X POST "https://thermal-master-api.你的子域名.workers.dev/api/meta/sync?date=2026-05-29&level=campaign" \
  -H "Authorization: Bearer YOUR_API_WRITE_TOKEN"
```

查询结果：

```bash
curl "https://thermal-master-api.你的子域名.workers.dev/api/meta/insights?date=2026-05-29&level=campaign"
```

同步层级可选：

- `campaign`
- `adset`
- `ad`

默认每日飞书 pipeline 会在 Meta 配置存在时同步 `META_SYNC_LEVEL` 指定层级，默认是 `campaign`。

---

## 步骤 2.7 — 接入 Shopify 智能体渠道总结

看板已经新增 `Shopify 智能体渠道总结` 板块，对齐 Shopify Admin 的 5 个 AI/Agentic 渠道入口：

| 报表位置 | 可看数据 | 颗粒度 |
|--------|----------|--------|
| Analytics -> Reports -> Sales by channel | AI 渠道独立销售额 / 订单数 / AOV | 日 / 周 / 月 |
| Analytics -> Reports -> Sessions by channel | AI 渠道独立会话数 | 日 / 周 / 月 |
| Orders -> Filter: Agentic channel | AI 渠道订单清单，含来源平台标签 | 单订单粒度 |
| Customers -> Acquired via Agentic | AI 渠道首单获客的客户列表 | 客户粒度 |
| Catalog -> API logs | 哪些 AI Agent 在抓取哪些 SKU | SKU + Agent 粒度 |

### A. 初始化 Catalog API logs 表

```bash
wrangler d1 execute thermal-master-db --file=migrations/2026-05-29-agent-catalog-logs.sql
wrangler d1 execute thermal-master-db --file=migrations/2026-05-30-pixel-product-sku.sql
```

### B. 部署 Worker

```bash
wrangler deploy
```

### C. 验证接口

```bash
curl "https://thermal-master-api.你的子域名.workers.dev/api/agentic-summary?range=today&date=2026-05-28"
curl "https://thermal-master-api.你的子域名.workers.dev/api/sync-health?range=7d&date=2026-05-29"
curl "https://thermal-master-api.你的子域名.workers.dev/api/attribution-anomalies?range=7d&date=2026-05-29"
curl "https://thermal-master-api.你的子域名.workers.dev/api/product-performance?range=7d&date=2026-05-29"
```

接口会返回 `report_locations`、`summary`、`kpi`、`platforms`、`orders`、`acquired_customers` 和 `catalog_logs`。如果当前没有识别到 ChatGPT/OpenAI、Perplexity、Gemini、Claude、Copilot 或 Agentic 来源，`orders` 为空属于正常结果，说明 Shopify 的 Agentic 来源还没有进入 D1 订单归因或 pixel 数据。

### D. 后续接入 Catalog API logs

`Catalog -> API logs` 目前有表结构和看板展示位，但还需要在后续商品/catalog API 访问入口中把 `agent_name`、`sku`、`product_id`、`product_title`、`request_path` 等字段写入 `agent_catalog_logs`，才能精确统计 “哪个 AI Agent 抓了哪个 SKU”。

当前看板会用 Pixel 商品浏览/加购事件作为 Catalog fallback；执行 `2026-05-30-pixel-product-sku.sql` 并更新 Shopify Custom Pixel 后，新商品事件会写入 `product_sku`，商品/SKU 分析和飞书日报会同步展示。

---

## 步骤 2.8 — 看板接入真实数据

部署好 Worker 后，回到 GitHub Pages 的看板代码。

当前 `app.js` 使用顶部的 `API_BASE` 连接 Worker：

```javascript
var API_BASE = 'https://thermal-master-api.thermalmaster.workers.dev';
```

如果 Worker 域名变化，只需要把这里替换为新的 Worker URL。飞书推送在 Worker 端处理，前端不需要保存飞书 Webhook。

---

## 检查清单

完成以上所有步骤后，确认以下功能正常：

| 检查项 | 验证方式 |
|--------|----------|
| Worker 在线 | 访问 /api/health 返回 ok |
| Pixel 采集 | 浏览店铺后 D1 有 pixel_events 记录 |
| UTM 写入 | 带 UTM 访问后查看 /cart.json attributes |
| Webhook 接收 | 创建订单后 D1 有 orders 记录 |
| Meta 同步 | 调用 /api/meta/sync 后 D1 有 meta_ad_insights 记录，ad_spend 有 Facebook 花费 |
| Shopify 智能体总结 | 调用 /api/agentic-summary 返回 kpi、报表入口映射和空/非空 AI 渠道清单 |
| 同步健康 / 异常归因 / 商品SKU | 调用 /api/sync-health、/api/attribution-anomalies、/api/product-performance 返回明细 |
| 飞书推送 | 调用 /api/feishu-sync 群里收到消息 |
| 定时触发 | Cloudflare Dashboard → Workers → Triggers 显示 Cron |

全部 ✅ 后，进入第三步：看板对接真实 API 数据。

---

## 项目维护记录规则

后续只要修改代码、配置、SQL 或文档，都必须同步更新 `PROJECT-LOG.md`。

如果修改影响部署、Cloudflare、Shopify、D1、GitHub Pages 或飞书操作步骤，也要同步更新本文件。

每次记录至少写清楚：日期、修改文件、修改原因、验证结果、未解决事项。
