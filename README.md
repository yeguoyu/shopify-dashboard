# Thermal Master · Shopify Analytics Dashboard

实时数据看板，展示 Shopify 店铺的销售、渠道归因、转化漏斗等核心指标。

![Dashboard Preview](preview.png)

## 🚀 部署到 GitHub Pages

### 第一步：创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角 **+** → **New repository**
3. 仓库名填 `shopify-dashboard`（或任意名称）
4. 选择 **Public**
5. **不要**勾选 Initialize with README
6. 点击 **Create repository**

### 第二步：上传代码

**方式一：命令行（推荐）**

```bash
# 进入项目文件夹
cd shopify-dashboard

# 初始化 Git
git init
git add .
git commit -m "init: shopify dashboard"

# 关联远程仓库（替换为你的用户名）
git remote add origin https://github.com/你的用户名/shopify-dashboard.git
git branch -M main
git push -u origin main
```

**方式二：网页上传**

1. 打开你刚创建的仓库页面
2. 点击 **uploading an existing file**
3. 将 `index.html`、`style.css`、`app.js` 三个文件拖入
4. 点击 **Commit changes**

### 第三步：开启 GitHub Pages

1. 进入仓库 → **Settings** → 左侧 **Pages**
2. Source 选择 **Deploy from a branch**
3. Branch 选择 **main**，目录选 **/ (root)**
4. 点击 **Save**
5. 等待 1-2 分钟，页面会显示你的看板地址：
   ```
   https://你的用户名.github.io/shopify-dashboard/
   ```

### 第四步：自定义域名（可选）

如果你有自己的域名：

1. 在 Pages 设置中填入你的域名（如 `dashboard.thermalmaster.com`）
2. 在你的域名 DNS 中添加 CNAME 记录指向 `你的用户名.github.io`
3. GitHub 会自动配置 HTTPS

## 📁 项目结构

```
shopify-dashboard/
├── index.html      # 主页面
├── style.css       # 样式（暗色/暖色主题）
├── app.js          # 交互逻辑 & 数据层
└── README.md       # 部署说明
```

## 🎨 功能

- **暗色 / 暖色** 主题一键切换
- 今日销售额、订单数、客单价、转化率 KPI 卡片
- 按小时销售趋势图（今日 vs 昨日）
- 加购 → 结账 → 付款 转化漏斗
- 各渠道流量 & 转化率（ATC / CVR）
- UTM Campaign 归因分析（First / Last / Linear Touch）
- 营销渠道同比明细表
- 飞书群推送按钮（待接入 Webhook）

## 🔌 后续接入真实数据

当前使用 Demo 数据。接入真实数据需要：

1. **Cloudflare Worker** — 数据聚合 API
2. **Shopify Custom Pixel** — 前端事件采集
3. **Shopify Admin API** — 订单和归因数据
4. **飞书 Webhook** — 每日推送

详细接入方案见后续文档。

## 📝 License

Private — Thermal Master Internal Use
