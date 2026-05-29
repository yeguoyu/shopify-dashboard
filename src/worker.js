// ============================================
// Thermal Master — Cloudflare Worker v2
// + Shopify GraphQL 归因 (customerJourney)
// + 广告花费 & ROI
// + 退货率
// ============================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Shopify-Hmac-Sha256, X-Shopify-Topic',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ---- Pixel & Webhooks ----
      if (path === '/api/pixel-event' && request.method === 'POST')
        return handlePixelEvent(request, env, corsHeaders);

      if (path === '/api/webhook/orders' && request.method === 'POST')
        return handleOrderWebhook(request, env, corsHeaders);

      if (path === '/api/webhook/refunds' && request.method === 'POST')
        return handleRefundWebhook(request, env, corsHeaders);

      // ---- Dashboard & Analytics ----
      if (path === '/api/health' && request.method === 'GET')
        return handleHealth(env, corsHeaders);

      if (path === '/api/data-status' && request.method === 'GET')
        return handleDataStatus(env, corsHeaders);

      if (path === '/api/dashboard' && request.method === 'GET')
        return handleDashboard(request, env, corsHeaders);

      if (path === '/api/channels' && request.method === 'GET')
        return handleChannels(request, env, corsHeaders);

      if (path === '/api/ai-analysis' && request.method === 'GET')
        return handleAIAnalysis(request, env, corsHeaders);

      if (path === '/api/order-journey' && request.method === 'GET')
      return handleOrderJourney(request, env, corsHeaders);

      if (path === '/api/funnel' && request.method === 'GET')
        return handleFunnel(request, env, corsHeaders);

      // ---- Ad Spend ----
      if (path === '/api/ad-spend' && request.method === 'POST')
        return handleAdSpendCreate(request, env, corsHeaders);

      if (path === '/api/ad-spend' && request.method === 'GET')
        return handleAdSpendQuery(request, env, corsHeaders);

      // ---- Meta Ads Insights ----
      if (path === '/api/meta/sync' && request.method === 'POST')
        return handleMetaInsightsSync(request, env, corsHeaders);

      if (path === '/api/meta/insights' && request.method === 'GET')
        return handleMetaInsightsQuery(request, env, corsHeaders);

      // ---- Sync Shopify Orders ----
      if (path === '/api/sync-orders' && request.method === 'POST')
        return handleSyncOrders(request, env, corsHeaders);
      // ---- Backfill Attribution ----
      if (path === '/api/backfill-attribution' && request.method === 'POST')
        return handleBackfillAttribution(env, corsHeaders);

      // ---- Feishu ----
      if (path === '/api/feishu-sync' && request.method === 'POST')
      return handleFeishuSync(request, env, corsHeaders);

      return json({ error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err.message }, 500, corsHeaders);
    }
  },

  // Cloudflare Cron 使用 UTC；这里用独立的飞书日报时区判断推送时间。
  // wrangler.toml 建议配置：crons = ["5 * * * *"]
  // 实际只会在 FEISHU_REPORT_TIMEZONE 的 FEISHU_REPORT_HOUR 推送一次。
  async scheduled(event, env, ctx) {
    const now = new Date();
    const reportTimezone = getFeishuReportTimezone(env);
    const reportHour = getFeishuReportHour(env);
    const reportOffsetDays = getFeishuReportDateOffsetDays(env);
    const reportNow = getDateTimePartsInTimezone(now, reportTimezone);
    const shopifyNow = getShopifyDateTimeParts(now);

    console.log('[CRON] triggered', JSON.stringify({
      report_now: reportNow,
      report_hour: reportHour,
      report_offset_days: reportOffsetDays,
      shopify_now: shopifyNow
    }));

    if (reportNow.hour !== reportHour) {
      console.log('[CRON] skipped, current report hour is', reportNow.hour);
      return;
    }

    const reportDate = addDaysToDateStr(reportNow.date, -reportOffsetDays);

    ctx.waitUntil(
      runDailyFeishuPipeline(env, reportDate)
        .then((result) => {
          console.log('[CRON] daily pipeline finished', JSON.stringify(result));
        })
        .catch((err) => {
          console.error('[CRON] daily pipeline failed', err.message);
        })
    );
  },
 };

// ============================================
// Helpers
// ============================================

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

const v = (val) => (val !== undefined ? val : null);
function hasWriteAccess(request, env) {
  if (!env.API_WRITE_TOKEN) return true;

  const auth = request.headers.get('Authorization') || '';
  return auth === 'Bearer ' + env.API_WRITE_TOKEN;
}
// ============================================
// Shopify Store Timezone Helpers
// 必须与 Shopify 后台时区保持一致
// ============================================

const SHOPIFY_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_FEISHU_REPORT_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_FEISHU_REPORT_HOUR = 9;
const DEFAULT_FEISHU_REPORT_DATE_OFFSET_DAYS = 1;
const DEFAULT_META_API_VERSION = 'v25.0';
const DEFAULT_META_ATTRIBUTION_WINDOWS = ['1d_click', '7d_click', '1d_view'];
const DEFAULT_META_SYNC_LEVEL = 'campaign';

function todayStr() {
  return formatDateInShopifyTZ(new Date());
}

function yesterdayStr() {
  return addDaysToDateStr(todayStr(), -1);
}

function formatDateInShopifyTZ(date) {
  return getShopifyDateTimeParts(date).date;
}

function getShopifyDateTimeParts(date) {
  return getDateTimePartsInTimezone(date, SHOPIFY_TIMEZONE);
}

function getFeishuReportTimezone(env) {
  return String(
    env.FEISHU_REPORT_TIMEZONE ||
      DEFAULT_FEISHU_REPORT_TIMEZONE ||
      SHOPIFY_TIMEZONE
  ).trim() || SHOPIFY_TIMEZONE;
}

function getFeishuReportHour(env) {
  const hour = Number(
    env.FEISHU_REPORT_HOUR === undefined
      ? DEFAULT_FEISHU_REPORT_HOUR
      : env.FEISHU_REPORT_HOUR
  );

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return DEFAULT_FEISHU_REPORT_HOUR;
  }

  return hour;
}

function getFeishuReportDateOffsetDays(env) {
  const days = Number(
    env.FEISHU_REPORT_DATE_OFFSET_DAYS === undefined
      ? DEFAULT_FEISHU_REPORT_DATE_OFFSET_DAYS
      : env.FEISHU_REPORT_DATE_OFFSET_DAYS
  );

  if (!Number.isFinite(days) || days < 0) {
    return DEFAULT_FEISHU_REPORT_DATE_OFFSET_DAYS;
  }

  return Math.floor(days);
}

function getDateTimePartsInTimezone(date, timezone) {
  let targetTimezone = timezone || 'UTC';
  let parts;

  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(date);
  } catch (err) {
    console.warn('[TIMEZONE] invalid timezone, fallback to UTC:', targetTimezone, err.message);
    targetTimezone = 'UTC';
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(date);
  }

  const map = {};

  parts.forEach(function (part) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  });

  return {
    date: map.year + '-' + map.month + '-' + map.day,
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    second: Number(map.second || 0),
    iso_like: map.year + '-' + map.month + '-' + map.day + ' ' + map.hour + ':' + map.minute + ':' + map.second,
    timezone: targetTimezone
  };
}

function isValidDateStr(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''));
}

function addDaysToDateStr(dateStr, days) {
  const parts = String(dateStr || '').split('-').map(Number);

  if (
    parts.length !== 3 ||
    !parts[0] ||
    !parts[1] ||
    !parts[2]
  ) {
    return todayStr();
  }

  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));

  d.setUTCDate(d.getUTCDate() + Number(days || 0));

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');

  return y + '-' + m + '-' + day;
}

function getRangeWindow(url) {
  const rawRange = String(url.searchParams.get('range') || '').toLowerCase();

  let range = 'today';

  if (rawRange === '24h' || rawRange === 'today') {
    range = 'today';
  }

  if (rawRange === '7d') {
    range = '7d';
  }

  if (rawRange === '30d') {
    range = '30d';
  }

  const dateParam = url.searchParams.get('date');
  const end = isValidDateStr(dateParam) ? dateParam : todayStr();

  const days =
    range === '30d'
      ? 30
      : range === '7d'
        ? 7
        : 1;

  const start = addDaysToDateStr(end, -(days - 1));

  const previousEnd = addDaysToDateStr(start, -1);
  const previousStart = addDaysToDateStr(previousEnd, -(days - 1));

  return {
    range,
    days,
    start,
    end,
    previousStart,
    previousEnd
  };
}
// ============================================
// Health Check
// ============================================

async function handleHealth(env, cors) {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all();
  return json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      tables: tables.results.map((r) => r.name),
    },
    200,
    cors
  );
}

async function handleDataStatus(env, cors) {
  const shopifyToday = todayStr();

  const latestOrder = await env.DB.prepare(
    `SELECT
      MAX(substr(shopify_created_at, 1, 10)) as latest_order_date,
      COUNT(*) as total_orders
     FROM orders
     WHERE shopify_created_at IS NOT NULL
       AND shopify_created_at != ''
       AND COALESCE(total_price, 0) > 0`
  ).first();

  const todayOrders = await env.DB.prepare(
    `SELECT
      COUNT(*) as orders,
      COALESCE(SUM(total_price), 0) as revenue
     FROM orders
     WHERE substr(shopify_created_at, 1, 10) = ?`
  ).bind(shopifyToday).first();

  const latestPixel = await env.DB.prepare(
    `SELECT MAX(substr(timestamp, 1, 10)) as latest_pixel_date
     FROM pixel_events
     WHERE timestamp IS NOT NULL
       AND timestamp != ''`
  ).first();

  const defaultDate = latestOrder && latestOrder.latest_order_date
    ? latestOrder.latest_order_date
    : shopifyToday;

  return json({
    shopify_timezone: SHOPIFY_TIMEZONE,
    shopify_today: shopifyToday,
    default_date: defaultDate,
    latest_order_date: latestOrder?.latest_order_date || null,
    latest_pixel_date: latestPixel?.latest_pixel_date || null,
    total_orders: latestOrder?.total_orders || 0,
    today_orders: todayOrders?.orders || 0,
    today_revenue: todayOrders?.revenue || 0,
    is_showing_latest_order_date: defaultDate !== shopifyToday
  }, 200, cors);
}

// ============================================
// Pixel Event
// ============================================

async function handlePixelEvent(request, env, cors) {
  const body = await request.json();

  await env.DB.prepare(
    `INSERT INTO pixel_events (
      event_name, timestamp, session_id, page_url, referrer,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      product_id, product_title, product_price, variant_id, quantity,
      cart_total, order_id, order_total, currency, customer_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      v(body.event_name),
      v(body.timestamp),
      v(body.session_id),
      v(body.page_url),
      v(body.referrer),
      v(body.utm_source),
      v(body.utm_medium),
      v(body.utm_campaign),
      v(body.utm_content),
      v(body.utm_term),
      v(body.product_id),
      v(body.product_title),
      v(body.product_price),
      v(body.variant_id),
      v(body.quantity),
      v(body.cart_total),
      v(body.order_id),
      v(body.order_total),
      v(body.currency),
      v(body.customer_id)
    )
    .run();

  return json({ ok: true }, 200, cors);
}

// ============================================
// Order Webhook + GraphQL Attribution
// ============================================

async function handleOrderWebhook(request, env, cors) {
  // 1. HMAC 验证
  const rawBody = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');
  if (env.SHOPIFY_WEBHOOK_SECRET && hmac) {
    const valid = await verifyShopifyHmac(rawBody, hmac, env.SHOPIFY_WEBHOOK_SECRET);
    if (!valid) return json({ error: 'Invalid HMAC' }, 401, cors);
  }

  const order = JSON.parse(rawBody);

  // 2. 提取 UTM 参数（从 landing_site / referring_site / note_attributes）
  const landingUrl = order.landing_site || '';
  const params = {};
  try {
    const u = new URL('https://x.com' + landingUrl);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
      params[k] = u.searchParams.get(k) || null;
    });
  } catch {
    // landing_site 可能是空或无效
  }

  // 从 note_attributes 中读取（Custom Pixel / UTM 脚本写入的）
  if (order.note_attributes) {
    order.note_attributes.forEach((attr) => {
      if (attr.name && attr.name.startsWith('utm_')) {
        if (!params[attr.name]) params[attr.name] = attr.value;
      }
    });
  }

  const channel = classifyChannel(
    params.utm_source,
    params.utm_medium,
    order.referring_site || '',
    order.source_name || ''
  );

  // 3. 写入 orders 表
  const orderId = String(order.id);
  const orderName = order.name || orderId;
  const totalPrice = parseFloat(order.total_price || 0);
  const currency = order.currency || 'USD';
  const customerEmail = order.email || (order.customer && order.customer.email) || null;
  const customerId = order.customer ? String(order.customer.id) : null;
  const lineItems = JSON.stringify(
    (order.line_items || []).map((li) => ({
      title: li.title,
      quantity: li.quantity,
      price: li.price,
      sku: li.sku,
    }))
  );

  await env.DB.prepare(
    `INSERT OR IGNORE INTO orders (
      order_id, order_name, total_price, currency, customer_email, customer_id,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      channel, line_items, shopify_created_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      orderId,
      orderName,
      totalPrice,
      currency,
      customerEmail,
      customerId,
      v(params.utm_source),
      v(params.utm_medium),
      v(params.utm_campaign),
      v(params.utm_content),
      v(params.utm_term),
      channel,
      lineItems,
      v(order.created_at)
    )
    .run();

  // 4. 异步调 GraphQL 补充 customerJourney 归因
  // 使用 waitUntil 确保 Webhook 快速响应

try {
  await enrichOrderAttribution(
    env,
    orderId,
    channel || 'Direct',
    params.utm_campaign || 'None'
  );
} catch (err) {
  console.error('Attribution enrichment failed for order', orderId, err.message);
}

  return json({ ok: true, order_id: orderId }, 200, cors);
}

// ============================================
// GraphQL Attribution (customerJourney)
// ============================================

async function enrichOrderAttribution(env, orderId, fallbackChannel = 'Direct', fallbackCampaign = 'None') {
  const shopDomain = env.SHOPIFY_STORE;
  const token = env.SHOPIFY_ADMIN_TOKEN;

  async function updateOfficialAttribution(first, last, status, reason) {
    const primaryChannel =
      first.channel && first.channel !== 'No Conversion Details'
        ? first.channel
        : last.channel || first.channel || 'No Conversion Details';

    await env.DB.prepare(
      `UPDATE orders SET
        channel = ?,
        first_touch_channel = ?,
        first_touch_campaign = ?,
        last_touch_channel = ?,
        last_touch_campaign = ?
       WHERE order_id = ?`
    )
      .bind(
        primaryChannel,
        first.channel || 'No Conversion Details',
        first.campaign || 'None',
        last.channel || 'No Conversion Details',
        last.campaign || 'None',
        String(orderId)
      )
      .run();

    return {
      status,
      reason,
      primary_channel: primaryChannel,
      first_touch_channel: first.channel || 'No Conversion Details',
      first_touch_campaign: first.campaign || 'None',
      last_touch_channel: last.channel || 'No Conversion Details',
      last_touch_campaign: last.campaign || 'None'
    };
  }

  async function markPending(reason) {
    return updateOfficialAttribution(
      {
        channel: 'Pending Attribution',
        campaign: 'None'
      },
      {
        channel: 'Pending Attribution',
        campaign: 'None'
      },
      'pending',
      reason
    );
  }

  if (!shopDomain || !token) {
    return markPending('missing_shopify_secret');
  }

  const apiVersion = env.SHOPIFY_API_VERSION || '2024-10';
  const gqlEndpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  const gid = `gid://shopify/Order/${orderId}`;

  const query = `
    query OrderOfficialJourney($id: ID!) {
      order(id: $id) {
        id
        legacyResourceId
        name
        createdAt
        customerJourneySummary {
          ready
          customerOrderIndex
          daysToConversion
          momentsCount {
            count
            precision
          }
          firstVisit {
            id
            occurredAt
            source
            sourceDescription
            sourceType
            referralCode
            referralInfoHtml
            referrerUrl
            landingPage
            landingPageHtml
            utmParameters {
              source
              medium
              campaign
              content
              term
            }
          }
          lastVisit {
            id
            occurredAt
            source
            sourceDescription
            sourceType
            referralCode
            referralInfoHtml
            referrerUrl
            landingPage
            landingPageHtml
            utmParameters {
              source
              medium
              campaign
              content
              term
            }
          }
        }
      }
    }
  `;

  let data;

  try {
    const resp = await fetch(gqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({
        query,
        variables: { id: gid }
      })
    });

    data = await resp.json();

    if (!resp.ok) {
      return markPending('graphql_http_' + resp.status);
    }
  } catch (err) {
    return markPending('graphql_fetch_failed');
  }

  if (data.errors && data.errors.length) {
    console.error('Shopify journey GraphQL errors:', JSON.stringify(data.errors));
    return markPending('graphql_errors');
  }

  const order = data?.data?.order || null;

  if (!order) {
    return markPending('order_not_found');
  }

  const journey = order.customerJourneySummary || null;

  if (!journey) {
    return updateOfficialAttribution(
      {
        channel: 'No Conversion Details',
        campaign: 'None'
      },
      {
        channel: 'No Conversion Details',
        campaign: 'None'
      },
      'updated',
      'no_customer_journey_summary'
    );
  }

  if (journey.ready === false) {
    return markPending('customer_journey_not_ready');
  }

  const momentsCount =
    journey.momentsCount && typeof journey.momentsCount.count === 'number'
      ? journey.momentsCount.count
      : 0;

  const hasFirstVisit = Boolean(journey.firstVisit);
  const hasLastVisit = Boolean(journey.lastVisit);

  if (momentsCount === 0 && !hasFirstVisit && !hasLastVisit) {
    return updateOfficialAttribution(
      {
        channel: 'No Conversion Details',
        campaign: 'None'
      },
      {
        channel: 'No Conversion Details',
        campaign: 'None'
      },
      'updated',
      'shopify_no_conversion_details'
    );
  }

  const first = hasFirstVisit
    ? parseShopifyJourneyVisit(journey.firstVisit)
    : {
        channel: 'No Conversion Details',
        campaign: 'None'
      };

  const last = hasLastVisit
    ? parseShopifyJourneyVisit(journey.lastVisit)
    : {
        channel: 'No Conversion Details',
        campaign: 'None'
      };

  return updateOfficialAttribution(
    first,
    last,
    'updated',
    'shopify_customer_journey_summary'
  );
}

async function handleOrderJourney(request, env, cors) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id');

  if (!orderId) {
    return json({ error: 'Missing order_id' }, 400, cors);
  }

  if (!env.SHOPIFY_STORE || !env.SHOPIFY_ADMIN_TOKEN) {
    return json({
      error: 'Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN'
    }, 500, cors);
  }

  const apiVersion = env.SHOPIFY_API_VERSION || '2024-10';
  const gqlEndpoint = `https://${env.SHOPIFY_STORE}/admin/api/${apiVersion}/graphql.json`;
  const gid = `gid://shopify/Order/${orderId}`;

  const query = `
    query OrderJourneyRaw($id: ID!) {
      order(id: $id) {
        id
        legacyResourceId
        name
        createdAt
        processedAt
        sourceName
        referrerDisplayText
        displayFinancialStatus
        displayFulfillmentStatus

        customer {
          id
          email
          displayName
        }

        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }

        customerJourneySummary {
          ready
          customerOrderIndex
          daysToConversion
          momentsCount {
            count
            precision
          }

          firstVisit {
            id
            occurredAt
            source
            sourceDescription
            sourceType
            referralCode
            referralInfoHtml
            referrerUrl
            landingPage
            landingPageHtml
            utmParameters {
              source
              medium
              campaign
              content
              term
            }
          }

          lastVisit {
            id
            occurredAt
            source
            sourceDescription
            sourceType
            referralCode
            referralInfoHtml
            referrerUrl
            landingPage
            landingPageHtml
            utmParameters {
              source
              medium
              campaign
              content
              term
            }
          }
        }
      }
    }
  `;

  const resp = await fetch(gqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({
      query,
      variables: { id: gid }
    })
  });

  let shopifyResponse;

  try {
    shopifyResponse = await resp.json();
  } catch (err) {
    return json({
      source: 'shopify_graphql',
      ok: false,
      error: 'Invalid Shopify GraphQL JSON response',
      status: resp.status,
      message: err.message
    }, 500, cors);
  }

  const order = shopifyResponse.data?.order || null;
  const journey = order?.customerJourneySummary || null;

  return json({
    source: 'shopify_graphql',
    ok: resp.ok && !shopifyResponse.errors,
    status: resp.status,
    api_version: apiVersion,
    requested_order_id: orderId,
    requested_gid: gid,

    shopify_errors: shopifyResponse.errors || null,
    shopify_data: shopifyResponse.data || null,

    order,
    customer_journey_summary: journey,

    shopify_conversion_state: {
      has_summary: Boolean(journey),
      ready: journey ? journey.ready : false,
      moments_count: journey?.momentsCount?.count ?? null,
      has_first_visit: Boolean(journey?.firstVisit),
      has_last_visit: Boolean(journey?.lastVisit),
      has_conversion_details: Boolean(
        journey &&
        journey.ready &&
        (
          (journey.momentsCount && journey.momentsCount.count > 0) ||
          journey.firstVisit ||
          journey.lastVisit
        )
      )
    }
  }, resp.ok ? 200 : 500, cors);
}
function parseShopifyJourneyVisit(visit) {
  if (!visit) {
    return {
      channel: 'No Conversion Details',
      campaign: 'None'
    };
  }

  const utm = visit.utmParameters || {};
  const source = utm.source || visit.source || '';
  const medium = utm.medium || '';
  const referrer = visit.referrerUrl || '';
  const sourceDescription = visit.sourceDescription || '';

  let channel = classifyChannel(source, medium, referrer, sourceDescription);

  if ((!channel || channel === 'Other') && sourceDescription) {
    const desc = sourceDescription.toLowerCase();

    if (desc.includes('youtube')) channel = 'YouTube';
    else if (desc.includes('google ads') || desc.includes('paid search')) channel = 'Google Ads';
    else if (desc.includes('google')) channel = 'Google Organic';
    else if (desc.includes('bing') || desc.includes('microsoft')) channel = 'Bing';
    else if (desc.includes('facebook') || desc.includes('instagram') || desc.includes('meta')) channel = 'Facebook';
    else if (desc.includes('brave')) channel = 'Brave Organic';
    else if (desc.includes('referral')) channel = 'Referral';
  }

  return {
    channel: normalizeChannelName(channel || 'No Conversion Details'),
    campaign: utm.campaign || 'None'
  };
}


// ============================================
// Refund Webhook
// ============================================

async function handleRefundWebhook(request, env, cors) {
  const rawBody = await request.text();
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');
  if (env.SHOPIFY_WEBHOOK_SECRET && hmac) {
    const valid = await verifyShopifyHmac(rawBody, hmac, env.SHOPIFY_WEBHOOK_SECRET);
    if (!valid) return json({ error: 'Invalid HMAC' }, 401, cors);
  }

  const refund = JSON.parse(rawBody);

  const refundId = String(refund.id);
  const orderId = String(refund.order_id);
  // 退款金额：汇总所有 refund_line_items 或 transactions
  let amount = 0;
  if (refund.transactions && refund.transactions.length > 0) {
    amount = refund.transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  } else if (refund.refund_line_items && refund.refund_line_items.length > 0) {
    amount = refund.refund_line_items.reduce(
      (sum, li) => sum + parseFloat(li.subtotal || 0),
      0
    );
  }
  const reason = refund.note || refund.reason || null;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO refunds (refund_id, order_id, amount, reason, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  )
    .bind(refundId, orderId, amount, reason)
    .run();

  return json({ ok: true, refund_id: refundId }, 200, cors);
}

// ============================================
// Ad Spend — POST (create/update)
// ============================================

async function handleAdSpendCreate(request, env, cors) {
  const body = await request.json();

  // 支持单条 { date, channel, spend } 或批量 { items: [{date,channel,spend}] }
  const items = body.items || [body];

  for (const item of items) {
    if (!item.date || !item.channel || item.spend === undefined) {
      return json({ error: 'Each item needs date, channel, spend' }, 400, cors);
    }
    await env.DB.prepare(
      `INSERT INTO ad_spend (date, channel, spend)
       VALUES (?, ?, ?)
       ON CONFLICT(date, channel) DO UPDATE SET spend = excluded.spend`
    )
      .bind(item.date, item.channel, parseFloat(item.spend))
      .run();
  }

  return json({ ok: true, count: items.length }, 200, cors);
}

// ============================================
// Ad Spend — GET (query)
// ============================================

async function handleAdSpendQuery(request, env, cors) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || todayStr();
  const startDate = url.searchParams.get('start') || date;
  const endDate = url.searchParams.get('end') || date;

  const rows = await env.DB.prepare(
    `SELECT date, channel, spend FROM ad_spend
     WHERE date >= ? AND date <= ?
     ORDER BY date DESC, channel`
  )
    .bind(startDate, endDate)
    .all();

  // 汇总
  const totalSpend = rows.results.reduce((s, r) => s + r.spend, 0);
  const byChannel = {};
  rows.results.forEach((r) => {
    byChannel[r.channel] = (byChannel[r.channel] || 0) + r.spend;
  });

  return json(
    {
      start: startDate,
      end: endDate,
      total_spend: totalSpend,
      by_channel: byChannel,
      records: rows.results,
    },
    200,
    cors
  );
}

// ============================================
// Meta Ads Insights
// ============================================

function isMetaConfigured(env) {
  return Boolean(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID);
}

function getMetaApiVersion(env) {
  const raw = String(env.META_API_VERSION || DEFAULT_META_API_VERSION).trim();
  return raw.startsWith('v') ? raw : 'v' + raw;
}

function getMetaAdAccountId(env) {
  return String(env.META_AD_ACCOUNT_ID || '')
    .trim()
    .replace(/^act_/, '');
}

function getMetaAttributionWindows(env) {
  const raw = env.META_ATTRIBUTION_WINDOWS;

  if (!raw) {
    return DEFAULT_META_ATTRIBUTION_WINDOWS;
  }

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
  }

  const parts = String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.length ? parts : DEFAULT_META_ATTRIBUTION_WINDOWS;
}

function getMetaSyncLevel(level) {
  const value = String(level || DEFAULT_META_SYNC_LEVEL).toLowerCase();
  const allowed = ['campaign', 'adset', 'ad'];
  return allowed.includes(value) ? value : DEFAULT_META_SYNC_LEVEL;
}

function isMetaPurchaseActionType(actionType) {
  const value = String(actionType || '').toLowerCase();

  return (
    value === 'purchase' ||
    value === 'omni_purchase' ||
    value === 'onsite_conversion.purchase' ||
    value === 'offsite_conversion.fb_pixel_purchase' ||
    value.endsWith('_purchase') ||
    value.includes('.purchase')
  );
}

function getMetaActionNumber(items, fallback = 0) {
  const rows = Array.isArray(items) ? items : [];

  for (const item of rows) {
    if (isMetaPurchaseActionType(item.action_type)) {
      const value = Number(item.value || 0);
      return Number.isFinite(value) ? value : fallback;
    }
  }

  return fallback;
}

function getMetaRoasNumber(items) {
  const rows = Array.isArray(items) ? items : [];

  for (const item of rows) {
    if (isMetaPurchaseActionType(item.action_type) || item.action_type === 'purchase_roas') {
      const value = Number(item.value || 0);
      return Number.isFinite(value) ? value : null;
    }
  }

  return null;
}

function metaInsightsFieldsForLevel(level) {
  const fields = [
    'date_start',
    'date_stop',
    'account_id',
    'account_name',
    'campaign_id',
    'campaign_name',
    'spend',
    'impressions',
    'reach',
    'clicks',
    'inline_link_clicks',
    'frequency',
    'cpm',
    'cpc',
    'ctr',
    'actions',
    'action_values',
    'purchase_roas',
    'website_purchase_roas',
    'attribution_setting'
  ];

  if (level === 'adset' || level === 'ad') {
    fields.splice(6, 0, 'adset_id', 'adset_name');
  }

  if (level === 'ad') {
    fields.splice(level === 'ad' ? 8 : 6, 0, 'ad_id', 'ad_name');
  }

  return fields;
}

async function fetchMetaInsights(env, startDate, endDate, level) {
  const apiVersion = getMetaApiVersion(env);
  const accountId = getMetaAdAccountId(env);
  const attributionWindows = getMetaAttributionWindows(env);
  const fields = metaInsightsFieldsForLevel(level);
  const rows = [];

  const firstUrl = new URL(`https://graph.facebook.com/${apiVersion}/act_${accountId}/insights`);

  firstUrl.searchParams.set('access_token', env.META_ACCESS_TOKEN);
  firstUrl.searchParams.set('level', level);
  firstUrl.searchParams.set('time_increment', '1');
  firstUrl.searchParams.set('limit', '500');
  firstUrl.searchParams.set('fields', fields.join(','));
  firstUrl.searchParams.set('time_range', JSON.stringify({
    since: startDate,
    until: endDate
  }));
  firstUrl.searchParams.set('use_unified_attribution_setting', 'true');

  if (attributionWindows.length) {
    firstUrl.searchParams.set('action_attribution_windows', JSON.stringify(attributionWindows));
  }

  let nextUrl = firstUrl.toString();
  let page = 0;

  while (nextUrl && page < 20) {
    const resp = await fetch(nextUrl);
    const data = await resp.json();

    if (!resp.ok || data.error) {
      const message = data.error?.message || ('Meta Insights HTTP ' + resp.status);
      throw new Error(message);
    }

    rows.push(...(data.data || []));

    nextUrl = data.paging && data.paging.next ? data.paging.next : null;
    page++;
  }

  return {
    rows,
    pages: page,
    api_version: apiVersion,
    account_id: accountId,
    attribution_windows: attributionWindows
  };
}

async function upsertMetaInsightRow(env, row, level, attributionWindows) {
  const attributionKey = attributionWindows.join(',');
  const campaignId = String(row.campaign_id || '');
  const adsetId = String(row.adset_id || '');
  const adId = String(row.ad_id || '');
  const spend = safeNumber(row.spend);
  const impressions = Math.round(safeNumber(row.impressions));
  const reach = Math.round(safeNumber(row.reach));
  const clicks = Math.round(safeNumber(row.clicks));
  const inlineLinkClicks = Math.round(safeNumber(row.inline_link_clicks));
  const purchases = getMetaActionNumber(row.actions, 0);
  const purchaseValue = getMetaActionNumber(row.action_values, 0);
  const purchaseRoas = getMetaRoasNumber(row.purchase_roas);
  const websitePurchaseRoas = getMetaRoasNumber(row.website_purchase_roas);

  await env.DB.prepare(
    `INSERT INTO meta_ad_insights (
      date,
      level,
      account_id,
      account_name,
      campaign_id,
      campaign_name,
      adset_id,
      adset_name,
      ad_id,
      ad_name,
      attribution_setting,
      attribution_windows,
      spend,
      impressions,
      reach,
      clicks,
      inline_link_clicks,
      frequency,
      cpm,
      cpc,
      ctr,
      purchases,
      purchase_value,
      purchase_roas,
      website_purchase_roas,
      raw_actions,
      raw_action_values,
      raw_purchase_roas,
      raw_data,
      synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date, level, campaign_id, adset_id, ad_id, attribution_windows) DO UPDATE SET
      account_id = excluded.account_id,
      account_name = excluded.account_name,
      campaign_name = excluded.campaign_name,
      adset_name = excluded.adset_name,
      ad_name = excluded.ad_name,
      attribution_setting = excluded.attribution_setting,
      spend = excluded.spend,
      impressions = excluded.impressions,
      reach = excluded.reach,
      clicks = excluded.clicks,
      inline_link_clicks = excluded.inline_link_clicks,
      frequency = excluded.frequency,
      cpm = excluded.cpm,
      cpc = excluded.cpc,
      ctr = excluded.ctr,
      purchases = excluded.purchases,
      purchase_value = excluded.purchase_value,
      purchase_roas = excluded.purchase_roas,
      website_purchase_roas = excluded.website_purchase_roas,
      raw_actions = excluded.raw_actions,
      raw_action_values = excluded.raw_action_values,
      raw_purchase_roas = excluded.raw_purchase_roas,
      raw_data = excluded.raw_data,
      synced_at = datetime('now')`
  )
    .bind(
      row.date_start || row.date_stop,
      level,
      String(row.account_id || ''),
      String(row.account_name || ''),
      campaignId,
      String(row.campaign_name || ''),
      adsetId,
      String(row.adset_name || ''),
      adId,
      String(row.ad_name || ''),
      String(row.attribution_setting || ''),
      attributionKey,
      spend,
      impressions,
      reach,
      clicks,
      inlineLinkClicks,
      safeNumber(row.frequency),
      safeNumber(row.cpm),
      safeNumber(row.cpc),
      safeNumber(row.ctr),
      purchases,
      purchaseValue,
      purchaseRoas,
      websitePurchaseRoas,
      JSON.stringify(row.actions || []),
      JSON.stringify(row.action_values || []),
      JSON.stringify(row.purchase_roas || row.website_purchase_roas || []),
      JSON.stringify(row)
    )
    .run();
}

async function rollupMetaSpendToAdSpend(env, startDate, endDate, level, attributionWindows) {
  const attributionKey = attributionWindows.join(',');
  const rows = await env.DB.prepare(
    `SELECT
      date,
      COALESCE(SUM(spend),0) as spend
     FROM meta_ad_insights
     WHERE date >= ? AND date <= ?
       AND level = ?
       AND attribution_windows = ?
     GROUP BY date`
  ).bind(startDate, endDate, level, attributionKey).all();

  for (const row of rows.results || []) {
    await env.DB.prepare(
      `INSERT INTO ad_spend (date, channel, spend)
       VALUES (?, ?, ?)
       ON CONFLICT(date, channel) DO UPDATE SET spend = excluded.spend`
    )
      .bind(row.date, 'Facebook', safeNumber(row.spend))
      .run();
  }

  return rows.results || [];
}

async function syncMetaInsightsForRange(env, startDate, endDate, level = DEFAULT_META_SYNC_LEVEL) {
  if (!isMetaConfigured(env)) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_meta_config'
    };
  }

  const syncLevel = getMetaSyncLevel(level);
  const result = await fetchMetaInsights(env, startDate, endDate, syncLevel);

  for (const row of result.rows) {
    await upsertMetaInsightRow(env, row, syncLevel, result.attribution_windows);
  }

  const spendRollup = await rollupMetaSpendToAdSpend(
    env,
    startDate,
    endDate,
    syncLevel,
    result.attribution_windows
  );

  return {
    ok: true,
    start: startDate,
    end: endDate,
    level: syncLevel,
    api_version: result.api_version,
    account_id: result.account_id,
    attribution_windows: result.attribution_windows,
    pages: result.pages,
    rows: result.rows.length,
    ad_spend_rollup: spendRollup
  };
}

async function handleMetaInsightsSync(request, env, cors) {
  if (!hasWriteAccess(request, env)) {
    return json({ error: 'Unauthorized' }, 401, cors);
  }

  if (!isMetaConfigured(env)) {
    return json({
      error: 'Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID'
    }, 500, cors);
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const start = url.searchParams.get('start') || date || yesterdayStr();
  const end = url.searchParams.get('end') || date || start;
  const level = getMetaSyncLevel(url.searchParams.get('level'));

  if (!isValidDateStr(start) || !isValidDateStr(end)) {
    return json({
      error: 'Invalid date. Use date=YYYY-MM-DD or start=YYYY-MM-DD&end=YYYY-MM-DD'
    }, 400, cors);
  }

  const result = await syncMetaInsightsForRange(env, start, end, level);

  return json(result, 200, cors);
}

async function handleMetaInsightsQuery(request, env, cors) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const start = url.searchParams.get('start') || date || todayStr();
  const end = url.searchParams.get('end') || date || start;
  const level = getMetaSyncLevel(url.searchParams.get('level'));
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  if (!isValidDateStr(start) || !isValidDateStr(end)) {
    return json({
      error: 'Invalid date. Use date=YYYY-MM-DD or start=YYYY-MM-DD&end=YYYY-MM-DD'
    }, 400, cors);
  }

  const rows = await env.DB.prepare(
    `SELECT
      date,
      level,
      campaign_id,
      campaign_name,
      adset_id,
      adset_name,
      ad_id,
      ad_name,
      spend,
      impressions,
      reach,
      clicks,
      inline_link_clicks,
      purchases,
      purchase_value,
      purchase_roas,
      website_purchase_roas,
      attribution_setting,
      attribution_windows,
      synced_at
     FROM meta_ad_insights
     WHERE date >= ? AND date <= ?
       AND level = ?
     ORDER BY date DESC, spend DESC
     LIMIT ?`
  ).bind(start, end, level, limit).all();

  const totals = (rows.results || []).reduce((acc, row) => {
    acc.spend += safeNumber(row.spend);
    acc.impressions += safeNumber(row.impressions);
    acc.reach += safeNumber(row.reach);
    acc.clicks += safeNumber(row.clicks);
    acc.inline_link_clicks += safeNumber(row.inline_link_clicks);
    acc.purchases += safeNumber(row.purchases);
    acc.purchase_value += safeNumber(row.purchase_value);
    return acc;
  }, {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    inline_link_clicks: 0,
    purchases: 0,
    purchase_value: 0
  });

  totals.purchase_roas = totals.spend > 0
    ? parseFloat((totals.purchase_value / totals.spend).toFixed(2))
    : null;

  return json({
    start,
    end,
    level,
    totals,
    rows: rows.results || []
  }, 200, cors);
}


// ============================================
// Sync Shopify Orders — 补齐历史 / 漏单订单
// ============================================

async function handleSyncOrders(request, env, cors) {
  if (!hasWriteAccess(request, env)) {
    return json({ error: 'Unauthorized' }, 401, cors);
  }

  if (!env.SHOPIFY_STORE || !env.SHOPIFY_ADMIN_TOKEN) {
    return json({
      error: 'Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN'
    }, 500, cors);
  }

  const url = new URL(request.url);

  const date = url.searchParams.get('date');
  const start = url.searchParams.get('start') || date || todayStr();
  const end = url.searchParams.get('end') || date || todayStr();

  if (!isValidDateStr(start) || !isValidDateStr(end)) {
    return json({
      error: 'Invalid date. Use date=YYYY-MM-DD or start=YYYY-MM-DD&end=YYYY-MM-DD'
    }, 400, cors);
  }

  const enrich = url.searchParams.get('enrich') !== '0';

  const maxPages = Math.min(
    parseInt(url.searchParams.get('max_pages') || '10', 10),
    50
  );

  let nextUrl = buildShopifyOrdersUrl(env, start, end);
  let page = 0;
  let fetched = 0;
  let synced = 0;
  let enriched = 0;
  const samples = [];

  while (nextUrl && page < maxPages) {
    const resp = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN
      }
    });

    if (!resp.ok) {
      const text = await resp.text();

      return json({
        error: 'Shopify orders fetch failed',
        status: resp.status,
        body: text.slice(0, 500)
      }, 500, cors);
    }

    const data = await resp.json();
    const orders = data.orders || [];

    fetched += orders.length;

    for (const order of orders) {
      const result = await upsertShopifyOrder(order, env);

      synced++;

      if (samples.length < 10) {
        samples.push({
          order_id: result.order_id,
          order_name: result.order_name,
          created_at: result.shopify_created_at,
          channel: result.channel,
          total_price: result.total_price
        });
      }

      if (enrich) {
        try {
          await enrichOrderAttribution(
            env,
            result.order_id,
            result.channel || 'Direct',
            result.utm_campaign || 'None'
          );
          enriched++;
        } catch (err) {
          console.error('Sync attribution failed:', result.order_id, err.message);
        }
      }
    }

    page++;
    nextUrl = getNextShopifyLink(resp.headers.get('Link'));
  }

  return json({
    ok: true,
    start,
    end,
    pages: page,
    fetched,
    synced,
    enriched,
    has_next_page: Boolean(nextUrl),
    samples
  }, 200, cors);
}

function buildShopifyOrdersUrl(env, startDate, endDate) {
  const apiVersion = env.SHOPIFY_API_VERSION || '2024-10';

  const createdAtMin =
    startDate + 'T00:00:00' + getShopifyOffsetForDate(startDate);

  const createdAtMax =
    endDate + 'T23:59:59' + getShopifyOffsetForDate(endDate);

  const params = new URLSearchParams();

  params.set('status', 'any');
  params.set('limit', '250');
  params.set('created_at_min', createdAtMin);
  params.set('created_at_max', createdAtMax);

  params.set(
    'fields',
    [
      'id',
      'name',
      'order_number',
      'created_at',
      'total_price',
      'subtotal_price',
      'currency',
      'financial_status',
      'fulfillment_status',
      'email',
      'customer',
      'landing_site',
      'referring_site',
      'source_name',
      'note_attributes',
      'line_items',
      'discount_codes'
    ].join(',')
  );

  return (
    'https://' +
    env.SHOPIFY_STORE +
    '/admin/api/' +
    apiVersion +
    '/orders.json?' +
    params.toString()
  );
}

function getShopifyOffsetForDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SHOPIFY_TIMEZONE,
      timeZoneName: 'longOffset',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);

    const tz = parts.find(function (p) {
      return p.type === 'timeZoneName';
    });

    if (tz && tz.value) {
      const offset = tz.value.replace('GMT', '');

      if (/^[+-]\d{2}:\d{2}$/.test(offset)) {
        return offset;
      }

      if (/^[+-]\d{1}:\d{2}$/.test(offset)) {
        return offset[0] + '0' + offset.slice(1);
      }
    }
  } catch (err) {
    console.warn('Timezone offset fallback:', err.message);
  }

  return '-07:00';
}

function getNextShopifyLink(linkHeader) {
  if (!linkHeader) return null;

  const parts = linkHeader.split(',');

  for (const part of parts) {
    if (part.includes('rel="next"')) {
      const match = part.match(/<([^>]+)>/);
      return match ? match[1] : null;
    }
  }

  return null;
}

function extractOrderUTM(order) {
  const params = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null
  };

  try {
    const u = new URL(order.landing_site || '', 'https://x.com');

    Object.keys(params).forEach(function (key) {
      params[key] = u.searchParams.get(key) || null;
    });
  } catch {
  }

  if (order.note_attributes) {
    order.note_attributes.forEach(function (attr) {
      if (attr.name && attr.name.startsWith('utm_') && !params[attr.name]) {
        params[attr.name] = attr.value;
      }
    });
  }

  return params;
}

async function upsertShopifyOrder(order, env) {
  const params = extractOrderUTM(order);

  const channel = classifyChannel(
    params.utm_source,
    params.utm_medium,
    order.referring_site || '',
    order.source_name || ''
  );

  const orderId = String(order.id);
  const orderName = order.name || String(order.order_number || order.id);

  const orderNumber =
    order.order_number
      ? String(order.order_number)
      : orderName.replace('#', '');

  const totalPrice = parseFloat(order.total_price || 0);
  const subtotalPrice = parseFloat(order.subtotal_price || 0);
  const currency = order.currency || 'USD';

  const customerEmail =
    order.email ||
    (order.customer && order.customer.email) ||
    null;

  const customerId =
    order.customer && order.customer.id
      ? String(order.customer.id)
      : null;

  const lineItems = JSON.stringify(
    (order.line_items || []).map(function (li) {
      return {
        title: li.title,
        quantity: li.quantity,
        price: li.price,
        sku: li.sku
      };
    })
  );

  await env.DB.prepare(
    `INSERT INTO orders (
      order_id,
      order_number,
      created_at,
      total_price,
      subtotal_price,
      currency,
      financial_status,
      fulfillment_status,
      customer_id,
      customer_email,
      landing_site,
      referring_site,
      channel,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      line_items_count,
      discount_codes,
      raw_data,
      order_name,
      line_items,
      shopify_created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      order_number = excluded.order_number,
      created_at = excluded.created_at,
      total_price = excluded.total_price,
      subtotal_price = excluded.subtotal_price,
      currency = excluded.currency,
      financial_status = excluded.financial_status,
      fulfillment_status = excluded.fulfillment_status,
      customer_id = excluded.customer_id,
      customer_email = excluded.customer_email,
      landing_site = excluded.landing_site,
      referring_site = excluded.referring_site,
      channel = excluded.channel,
      utm_source = excluded.utm_source,
      utm_medium = excluded.utm_medium,
      utm_campaign = excluded.utm_campaign,
      utm_content = excluded.utm_content,
      utm_term = excluded.utm_term,
      line_items_count = excluded.line_items_count,
      discount_codes = excluded.discount_codes,
      raw_data = excluded.raw_data,
      order_name = excluded.order_name,
      line_items = excluded.line_items,
      shopify_created_at = excluded.shopify_created_at`
  )
    .bind(
      orderId,
      orderNumber,
      order.created_at,
      totalPrice,
      subtotalPrice,
      currency,
      order.financial_status || '',
      order.fulfillment_status || '',
      customerId,
      customerEmail,
      order.landing_site || '',
      order.referring_site || '',
      channel,
      params.utm_source,
      params.utm_medium,
      params.utm_campaign,
      params.utm_content,
      params.utm_term,
      order.line_items ? order.line_items.length : 0,
      JSON.stringify(order.discount_codes || []),
      JSON.stringify(order),
      orderName,
      lineItems,
      order.created_at
    )
    .run();

  return {
    order_id: orderId,
    order_name: orderName,
    shopify_created_at: order.created_at,
    total_price: totalPrice,
    channel,
    utm_campaign: params.utm_campaign
  };
}
// ============================================
// Backfill Attribution — 给已有订单补归因
// ============================================

async function handleBackfillAttribution(env, cors) {
  const shopDomain = env.SHOPIFY_STORE;
  const token = env.SHOPIFY_ADMIN_TOKEN;

  const orders = await env.DB.prepare(
    `SELECT
      order_id,
      channel,
      utm_campaign
     FROM orders
     WHERE first_touch_channel IS NULL
        OR last_touch_channel IS NULL
        OR first_touch_channel = 'Pending Attribution'
        OR last_touch_channel = 'Pending Attribution'
     ORDER BY id DESC
     LIMIT 50`
  ).all();

  const results = [];

  for (const row of orders.results || []) {
    try {
      const result = await enrichOrderAttribution(
        env,
        row.order_id,
        row.channel || 'Direct',
        row.utm_campaign || 'None'
      );

      results.push({
        order_id: row.order_id,
        status: result.status,
        reason: result.reason || '',
        primary_channel: result.primary_channel || null,
        first_touch_channel: result.first_touch_channel || null,
        last_touch_channel: result.last_touch_channel || null
      });
    } catch (err) {
      results.push({
        order_id: row.order_id,
        status: 'error',
        message: err.message
      });
    }
  }

  return json({
    processed: results.length,
    shopify_configured: Boolean(shopDomain && token),
    results
  }, 200, cors);
}
// ============================================
// Dashboard — 增加 ROI + 退货率
// ============================================

async function handleDashboard(request, env, cors) {
  const url = new URL(request.url);
  const rangeWindow = getRangeWindow(url);
  const { range, days, start, end, previousStart, previousEnd } = rangeWindow;

  const currentOrders = await env.DB.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_price),0) as revenue
     FROM orders
     WHERE substr(shopify_created_at, 1, 10) >= ? AND substr(shopify_created_at, 1, 10) <= ?`
  ).bind(start, end).first();

  const previousOrders = await env.DB.prepare(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_price),0) as revenue
     FROM orders
     WHERE substr(shopify_created_at, 1, 10) >= ? AND substr(shopify_created_at, 1, 10) <= ?`
  ).bind(previousStart, previousEnd).first();

  const currentSessions = await env.DB.prepare(
    `SELECT COUNT(DISTINCT session_id) as cnt
     FROM pixel_events
     WHERE event_name = 'page_viewed'
       AND DATE(timestamp) >= ? AND DATE(timestamp) <= ?`
  ).bind(start, end).first();

  const previousSessions = await env.DB.prepare(
    `SELECT COUNT(DISTINCT session_id) as cnt
     FROM pixel_events
     WHERE event_name = 'page_viewed'
       AND DATE(timestamp) >= ? AND DATE(timestamp) <= ?`
  ).bind(previousStart, previousEnd).first();

  const currentCR = currentSessions.cnt > 0
    ? ((currentOrders.cnt / currentSessions.cnt) * 100).toFixed(2)
    : '0.00';

  const currentAOV = currentOrders.cnt > 0
    ? (currentOrders.revenue / currentOrders.cnt).toFixed(2)
    : '0.00';

  const previousAOV = previousOrders.cnt > 0
    ? (previousOrders.revenue / previousOrders.cnt).toFixed(2)
    : '0.00';

  const spendRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(spend),0) as total
     FROM ad_spend
     WHERE date >= ? AND date <= ?`
  ).bind(start, end).first();

  const channelSpend = await env.DB.prepare(
    `SELECT channel, COALESCE(SUM(spend),0) as spend
     FROM ad_spend
     WHERE date >= ? AND date <= ?
     GROUP BY channel
     ORDER BY spend DESC`
  ).bind(start, end).all();

  const roas = spendRow.total > 0
    ? (currentOrders.revenue / spendRow.total).toFixed(2)
    : null;

  const refundStats = await env.DB.prepare(
    `SELECT
      COUNT(DISTINCT order_id) as refund_orders,
      COALESCE(SUM(amount),0) as refund_amount
     FROM refunds
     WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?`
  ).bind(start, end).first();

  const refundRate = currentOrders.cnt > 0
    ? ((refundStats.refund_orders / currentOrders.cnt) * 100).toFixed(2)
    : '0.00';

  let chart;

  if (range === 'today') {
    const hourlyCurrent = await env.DB.prepare(
      `SELECT CAST(substr(shopify_created_at, 12, 2) AS INTEGER) as hour,
              COALESCE(SUM(total_price),0) as revenue
       FROM orders
       WHERE substr(shopify_created_at, 1, 10) = ?
       GROUP BY hour ORDER BY hour`
    ).bind(end).all();

    const hourlyPrevious = await env.DB.prepare(
      `SELECT CAST(substr(shopify_created_at, 12, 2) AS INTEGER) as hour,
              COALESCE(SUM(total_price),0) as revenue
       FROM orders
       WHERE substr(shopify_created_at, 1, 10) = ?
       GROUP BY hour ORDER BY hour`
    ).bind(previousEnd).all();

    chart = {
      mode: 'hourly',
      labels: Array.from({ length: 24 }, (_, i) => i + ':00'),
      today: hoursToArray(hourlyCurrent.results || []),
      yesterday: hoursToArray(hourlyPrevious.results || []),
      current_total: currentOrders.revenue,
      previous_total: previousOrders.revenue,
    };
  } else {
    const dailyCurrent = await env.DB.prepare(
      `SELECT substr(shopify_created_at, 1, 10) as date,
              COALESCE(SUM(total_price),0) as revenue
       FROM orders
       WHERE substr(shopify_created_at, 1, 10) >= ? AND substr(shopify_created_at, 1, 10) <= ?
       GROUP BY substr(shopify_created_at, 1, 10)
       ORDER BY date`
    ).bind(start, end).all();

    const dailyPrevious = await env.DB.prepare(
      `SELECT substr(shopify_created_at, 1, 10) as date,
              COALESCE(SUM(total_price),0) as revenue
       FROM orders
       WHERE substr(shopify_created_at, 1, 10) >= ? AND substr(shopify_created_at, 1, 10) <= ?
       GROUP BY substr(shopify_created_at, 1, 10)
       ORDER BY date`
    ).bind(previousStart, previousEnd).all();

    chart = {
      mode: 'daily',
      labels: buildDateLabels(start, days),
      today: dateRowsToArray(dailyCurrent.results || [], start, days),
      yesterday: dateRowsToArray(dailyPrevious.results || [], previousStart, days),
      current_total: currentOrders.revenue,
      previous_total: previousOrders.revenue,
    };
  }

  const analysis = await buildAttributionAnalysis(env, rangeWindow, 10);

  return json(
    {
      range,
      start,
      end,
      previous_start: previousStart,
      previous_end: previousEnd,
      kpi: {
        revenue: currentOrders.revenue,
        revenue_yesterday: previousOrders.revenue,
        orders: currentOrders.cnt,
        orders_yesterday: previousOrders.cnt,
        sessions: currentSessions.cnt,
        sessions_yesterday: previousSessions.cnt,
        conversion_rate: parseFloat(currentCR),
        aov: parseFloat(currentAOV),
        aov_yesterday: parseFloat(previousAOV),
        ad_spend: spendRow.total,
        roas: roas ? parseFloat(roas) : null,
        channel_spend: channelSpend.results || [],
        refund_rate: parseFloat(refundRate),
        refund_orders: refundStats.refund_orders || 0,
        refund_amount: refundStats.refund_amount || 0,
        total_orders_30d: currentOrders.cnt,
      },
      chart,
      analysis,
    },
    200,
    cors
  );
}

function hoursToArray(rows) {
  const arr = new Array(24).fill(0);
  rows.forEach((r) => {
    if (r.hour >= 0 && r.hour <= 23) arr[r.hour] = r.revenue || 0;
  });
  for (let i = 1; i < 24; i++) arr[i] += arr[i - 1];
  return arr;
}

function buildDateLabels(startDate, days) {
  const labels = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysToDateStr(startDate, i);
    labels.push(d.slice(5));
  }
  return labels;
}

function dateRowsToArray(rows, startDate, days) {
  const arr = new Array(days).fill(0);
  const map = {};
  (rows || []).forEach((r) => {
    map[r.date] = r.revenue || 0;
  });
  for (let i = 0; i < days; i++) {
    const d = addDaysToDateStr(startDate, i);
    arr[i] = map[d] || 0;
  }
  return arr;
}




// ============================================
// Attribution Top 10 + AI-style Analysis
// 口径：Last Non-Click / Last Non-Direct 归因
// ============================================

function isEmptyAttributionChannel(channel) {
  const v = String(channel || '').trim().toLowerCase();

  return (
    !v ||
    v === 'null' ||
    v === 'undefined' ||
    v === 'pending attribution' ||
    v === 'journey pending'
  );
}

function isWeakAttributionChannel(channel) {
  const v = normalizeChannelName(channel || '').toLowerCase();

  return (
    !v ||
    v === 'direct' ||
    v === 'no conversion details' ||
    v === 'pending attribution' ||
    v === 'other'
  );
}

function getLastNonClickChannelFromOrder(row) {
  const candidates = [
    row.last_touch_channel,
    row.first_touch_channel,
    row.channel
  ];

  for (const candidate of candidates) {
    if (isEmptyAttributionChannel(candidate)) continue;

    const normalized = normalizeChannelName(candidate);

    if (!isWeakAttributionChannel(normalized)) {
      return normalized;
    }
  }

  for (const candidate of candidates) {
    if (isEmptyAttributionChannel(candidate)) continue;

    const normalized = normalizeChannelName(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return 'Direct';
}

function channelMapKey(channel) {
  return normalizeChannelName(channel || 'Direct').toLowerCase();
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function calcChange(current, previous) {
  const cur = safeNumber(current);
  const prev = safeNumber(previous);
  const delta = cur - prev;

  return {
    current: cur,
    previous: prev,
    delta,
    pct: prev > 0 ? (delta / prev) * 100 : null
  };
}

function shortMoney(value) {
  return '$' + safeNumber(value).toFixed(2);
}

function signedNumber(value) {
  const n = safeNumber(value);
  return (n > 0 ? '+' : '') + n.toFixed(0);
}

function signedMoney(value) {
  const n = safeNumber(value);
  return (n > 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
}

function signedPct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '新增/无上期基准';
  }

  const n = Number(value);
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

async function queryOrderRowsForAttribution(env, startDate, endDate) {
  const rows = await env.DB.prepare(
    `SELECT
      order_id,
      COALESCE(total_price, 0) as total_price,
      COALESCE(channel, '') as channel,
      COALESCE(first_touch_channel, '') as first_touch_channel,
      COALESCE(last_touch_channel, '') as last_touch_channel
     FROM orders
     WHERE substr(shopify_created_at, 1, 10) >= ?
       AND substr(shopify_created_at, 1, 10) <= ?`
  ).bind(startDate, endDate).all();

  return rows.results || [];
}

function aggregateOrderRowsByAttribution(rows) {
  const map = {};

  (rows || []).forEach((row) => {
    const channel = getLastNonClickChannelFromOrder(row);
    const key = channelMapKey(channel);

    if (!map[key]) {
      map[key] = {
        channel,
        sessions: 0,
        orders: 0,
        revenue: 0,
        aov: 0,
        spend: 0,
        roas: null,
        cpa: null,
      };
    }

    map[key].orders += 1;
    map[key].revenue += safeNumber(row.total_price);
  });

  Object.keys(map).forEach((key) => {
    const row = map[key];
    row.aov = row.orders > 0 ? row.revenue / row.orders : 0;
  });

  return map;
}

async function querySessionMapByChannel(env, startDate, endDate) {
  const rows = await env.DB.prepare(
    `SELECT
      COALESCE(utm_source, '') as source,
      COALESCE(utm_medium, '') as medium,
      COALESCE(referrer, '') as referrer,
      COUNT(DISTINCT session_id) as sessions
     FROM pixel_events
     WHERE event_name = 'page_viewed'
       AND DATE(timestamp) >= ?
       AND DATE(timestamp) <= ?
     GROUP BY source, medium, referrer`
  ).bind(startDate, endDate).all();

  const map = {};

  (rows.results || []).forEach((row) => {
    const channel = normalizeChannelName(
      classifyChannel(row.source || '', row.medium || '', row.referrer || '', '')
    );
    const key = channelMapKey(channel);

    map[key] = (map[key] || 0) + safeNumber(row.sessions);
  });

  return map;
}

async function querySpendMapByChannel(env, startDate, endDate) {
  const rows = await env.DB.prepare(
    `SELECT
      channel,
      COALESCE(SUM(spend), 0) as spend
     FROM ad_spend
     WHERE date >= ?
       AND date <= ?
     GROUP BY channel`
  ).bind(startDate, endDate).all();

  const map = {};

  (rows.results || []).forEach((row) => {
    const channel = normalizeChannelName(row.channel || 'Direct');
    const key = channelMapKey(channel);

    map[key] = (map[key] || 0) + safeNumber(row.spend);
  });

  return map;
}

async function buildChannelDataset(env, startDate, endDate) {
  const orderRows = await queryOrderRowsForAttribution(env, startDate, endDate);
  const orderMap = aggregateOrderRowsByAttribution(orderRows);
  const sessionMap = await querySessionMapByChannel(env, startDate, endDate);
  const spendMap = await querySpendMapByChannel(env, startDate, endDate);

  const keys = new Set([
    ...Object.keys(orderMap),
    ...Object.keys(sessionMap),
    ...Object.keys(spendMap),
  ]);

  const rows = Array.from(keys).map((key) => {
    const order = orderMap[key] || {
      channel: normalizeChannelName(key),
      orders: 0,
      revenue: 0,
      aov: 0,
    };

    const sessions = sessionMap[key] || 0;
    const spend = spendMap[key] || 0;
    const orders = order.orders || 0;
    const revenue = order.revenue || 0;

    return {
      key,
      channel: order.channel,
      sessions,
      orders,
      revenue,
      aov: orders > 0 ? revenue / orders : 0,
      spend,
      roas: spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : null,
      cpa: spend > 0 && orders > 0 ? parseFloat((spend / orders).toFixed(2)) : null,
    };
  });

  const totals = rows.reduce((acc, row) => {
    acc.sessions += row.sessions || 0;
    acc.orders += row.orders || 0;
    acc.revenue += row.revenue || 0;
    acc.spend += row.spend || 0;
    return acc;
  }, {
    sessions: 0,
    orders: 0,
    revenue: 0,
    spend: 0,
  });

  totals.roas = totals.spend > 0 ? parseFloat((totals.revenue / totals.spend).toFixed(2)) : null;
  totals.cpa = totals.spend > 0 && totals.orders > 0 ? parseFloat((totals.spend / totals.orders).toFixed(2)) : null;

  return {
    rows,
    totals,
    order_rows_count: orderRows.length,
  };
}

function mergeCurrentAndPreviousChannels(currentRows, previousRows) {
  const currentMap = {};
  const previousMap = {};

  currentRows.forEach((row) => {
    currentMap[row.key] = row;
  });

  previousRows.forEach((row) => {
    previousMap[row.key] = row;
  });

  const keys = new Set([
    ...Object.keys(currentMap),
    ...Object.keys(previousMap),
  ]);

  return Array.from(keys).map((key) => {
    const current = currentMap[key] || {
      key,
      channel: previousMap[key]?.channel || normalizeChannelName(key),
      sessions: 0,
      orders: 0,
      revenue: 0,
      aov: 0,
      spend: 0,
      roas: null,
      cpa: null,
    };

    const previous = previousMap[key] || {
      sessions: 0,
      orders: 0,
      revenue: 0,
      aov: 0,
      spend: 0,
      roas: null,
      cpa: null,
    };

    const revenueChange = calcChange(current.revenue, previous.revenue);
    const ordersChange = calcChange(current.orders, previous.orders);
    const sessionsChange = calcChange(current.sessions, previous.sessions);
    const aovChange = calcChange(current.aov, previous.aov);
    const spendChange = calcChange(current.spend, previous.spend);
    const roasChange = calcChange(current.roas || 0, previous.roas || 0);

    return {
      ...current,
      previous_sessions: previous.sessions || 0,
      previous_orders: previous.orders || 0,
      previous_revenue: previous.revenue || 0,
      previous_aov: previous.aov || 0,
      previous_spend: previous.spend || 0,
      previous_roas: previous.roas,
      revenue_change: revenueChange.delta,
      revenue_change_pct: revenueChange.pct,
      orders_change: ordersChange.delta,
      orders_change_pct: ordersChange.pct,
      sessions_change: sessionsChange.delta,
      sessions_change_pct: sessionsChange.pct,
      aov_change: aovChange.delta,
      aov_change_pct: aovChange.pct,
      spend_change: spendChange.delta,
      spend_change_pct: spendChange.pct,
      roas_change: roasChange.delta,
      roas_change_pct: roasChange.pct,
    };
  });
}

function inferChannelReason(row, direction) {
  const isUp = direction === 'up';
  const parts = [];

  if ((isUp && row.orders_change > 0) || (!isUp && row.orders_change < 0)) {
    parts.push(`订单数${isUp ? '增加' : '减少'} ${Math.abs(row.orders_change)} 单`);
  }

  if ((isUp && row.sessions_change > 0) || (!isUp && row.sessions_change < 0)) {
    parts.push(`Sessions ${isUp ? '增加' : '减少'} ${Math.abs(row.sessions_change)}`);
  }

  if ((isUp && row.aov_change > 0) || (!isUp && row.aov_change < 0)) {
    parts.push(`AOV ${isUp ? '提升' : '下降'} ${signedMoney(row.aov_change)}`);
  }

  if ((isUp && row.spend_change > 0) || (!isUp && row.spend_change < 0)) {
    parts.push(`广告花费${isUp ? '增加' : '减少'} ${signedMoney(row.spend_change)}`);
  }

  if ((isUp && row.roas_change > 0) || (!isUp && row.roas_change < 0)) {
    parts.push(`ROAS ${isUp ? '提升' : '下降'} ${row.roas_change.toFixed(2)}x`);
  }

  if (!parts.length) {
    if (row.previous_revenue <= 0 && row.revenue > 0) {
      parts.push('上期无销售，本期新增成交');
    } else if (row.previous_revenue > 0 && row.revenue <= 0) {
      parts.push('本期无成交，上期销售额归零');
    } else {
      parts.push('销售额变化较小，建议结合订单明细确认具体来源');
    }
  }

  return parts.join('，');
}

function buildChannelAction(row, direction) {
  const channel = String(row.channel || '');

  if (direction === 'up') {
    if (row.spend > 0 && row.roas && row.roas >= 3) {
      return `${channel} 当前 ROAS ${row.roas.toFixed(2)}x，建议保留预算并检查可否小幅放量。`;
    }

    if (channel.includes('Organic') || channel === 'Referral' || channel === 'AI Referral') {
      return `${channel} 属于非付费/内容型流量，建议抽查带来订单的落地页、搜索词或引用来源，并复制到内容与外链策略。`;
    }

    return `${channel} 本期增长，建议查看该渠道订单明细，确认增长来自哪类产品、页面或活动。`;
  }

  if (row.sessions_change < 0) {
    return `${channel} 下降优先排查流量入口：广告状态、SEO 排名、Referrer 来源、UTM 是否丢失。`;
  }

  if (row.orders_change < 0 && row.sessions_change >= 0) {
    return `${channel} Sessions 未明显下降但订单减少，建议检查落地页转化、价格、库存、优惠和 checkout。`;
  }

  if (row.aov_change < 0) {
    return `${channel} AOV 下降，建议检查低价 SKU 占比、折扣、套装推荐和加购模块。`;
  }

  return `${channel} 销售额下降，建议优先抽查该渠道最近订单、落地页和广告/内容入口。`;
}

function buildAttributionNarrative(currentDataset, previousDataset, mergedRows, limit) {
  const revenueChange = calcChange(currentDataset.totals.revenue, previousDataset.totals.revenue);
  const ordersChange = calcChange(currentDataset.totals.orders, previousDataset.totals.orders);
  const spendChange = calcChange(currentDataset.totals.spend, previousDataset.totals.spend);

  const rising = mergedRows
    .filter((row) => row.revenue_change > 0)
    .sort((a, b) => b.revenue_change - a.revenue_change)
    .slice(0, 5)
    .map((row) => ({
      channel: row.channel,
      revenue: row.revenue,
      previous_revenue: row.previous_revenue,
      revenue_change: row.revenue_change,
      revenue_change_pct: row.revenue_change_pct,
      orders: row.orders,
      previous_orders: row.previous_orders,
      reason: inferChannelReason(row, 'up'),
      action: buildChannelAction(row, 'up'),
    }));

  const falling = mergedRows
    .filter((row) => row.revenue_change < 0)
    .sort((a, b) => a.revenue_change - b.revenue_change)
    .slice(0, 5)
    .map((row) => ({
      channel: row.channel,
      revenue: row.revenue,
      previous_revenue: row.previous_revenue,
      revenue_change: row.revenue_change,
      revenue_change_pct: row.revenue_change_pct,
      orders: row.orders,
      previous_orders: row.previous_orders,
      reason: inferChannelReason(row, 'down'),
      action: buildChannelAction(row, 'down'),
    }));

  const topRisingText = rising.length
    ? rising.slice(0, 3).map((row) => `${row.channel} ${signedMoney(row.revenue_change)}`).join('，')
    : '暂无明显上涨渠道';

  const topFallingText = falling.length
    ? falling.slice(0, 3).map((row) => `${row.channel} ${signedMoney(row.revenue_change)}`).join('，')
    : '暂无明显下降渠道';

  const actions = [];

  if (rising.length) {
    actions.push(rising[0].action);
  }

  if (falling.length) {
    actions.push(falling[0].action);
  }

  const paidNoSpend = mergedRows.filter((row) => {
    const name = String(row.channel || '').toLowerCase();

    return (
      row.orders > 0 &&
      row.spend <= 0 &&
      (
        name.includes('facebook') ||
        name.includes('google ads') ||
        name.includes('bing') ||
        name.includes('paid')
      )
    );
  });

  if (paidNoSpend.length) {
    actions.push(`存在付费渠道有订单但广告花费为 $0：${paidNoSpend.slice(0, 3).map((row) => row.channel).join('、')}。建议优先检查 ad_spend 或广告 API 同步。`);
  }

  const noConversionRow = mergedRows.find((row) => row.channel === 'No Conversion Details');
  if (noConversionRow && noConversionRow.orders > 0) {
    actions.push(`No Conversion Details 有 ${noConversionRow.orders} 单 / ${shortMoney(noConversionRow.revenue)}，建议继续执行 /api/backfill-attribution 补齐 Shopify customerJourney。`);
  }

  if (!actions.length) {
    actions.push('当前没有明显异常，建议继续观察 Top 10 渠道的订单数、AOV、ROAS 和 Sessions 变化。');
  }

  return {
    model: 'rule_based_attribution_analysis_v1',
    attribution_model: 'last_non_click',
    summary: `本期销售额 ${shortMoney(currentDataset.totals.revenue)}，较上期 ${signedMoney(revenueChange.delta)}（${signedPct(revenueChange.pct)}）；订单 ${currentDataset.totals.orders} 单，较上期 ${signedNumber(ordersChange.delta)} 单；广告花费 ${shortMoney(currentDataset.totals.spend)}，较上期 ${signedMoney(spendChange.delta)}。主要上涨：${topRisingText}。主要下降：${topFallingText}。`,
    rising_channels: rising,
    falling_channels: falling,
    actions: actions.slice(0, 6),
    notes: [
      `渠道列表只返回 Top ${limit}`,
      '订单归因使用 Last Non-Click / Last Non-Direct 口径：优先 last_touch_channel；如果 last_touch 是 Direct / No Conversion Details / Pending，则回退 first_touch_channel；再回退 channel。',
      'Sessions 来自 Pixel page_viewed 归类，和 Shopify 官方订单归因不是同一口径，只作为辅助解释。'
    ]
  };
}

async function buildAttributionAnalysis(env, rangeWindow, limit = 10) {
  const currentDataset = await buildChannelDataset(env, rangeWindow.start, rangeWindow.end);
  const previousDataset = await buildChannelDataset(env, rangeWindow.previousStart, rangeWindow.previousEnd);

  const mergedRows = mergeCurrentAndPreviousChannels(
    currentDataset.rows,
    previousDataset.rows
  );

  const channelsTop10 = mergedRows
    .filter((row) => row.orders > 0 || row.revenue > 0)
    .sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.orders - a.orders;
    })
    .slice(0, limit)
    .map((row) => {
      const { key, ...rest } = row;
      return rest;
    });

  return {
    start: rangeWindow.start,
    end: rangeWindow.end,
    previous_start: rangeWindow.previousStart,
    previous_end: rangeWindow.previousEnd,
    channels_top10: channelsTop10,
    totals: currentDataset.totals,
    previous_totals: previousDataset.totals,
    ai_summary: buildAttributionNarrative(currentDataset, previousDataset, mergedRows, limit),
  };
}

async function handleAIAnalysis(request, env, cors) {
  const url = new URL(request.url);
  const rangeWindow = getRangeWindow(url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 20);
  const analysis = await buildAttributionAnalysis(env, rangeWindow, limit);

  return json({
    range: rangeWindow.range,
    start: rangeWindow.start,
    end: rangeWindow.end,
    previous_start: rangeWindow.previousStart,
    previous_end: rangeWindow.previousEnd,
    ...analysis,
  }, 200, cors);
}

// ============================================
// Channels（渠道归因 — 增加 ROI per channel）
// ============================================

async function handleChannels(request, env, cors) {
  const url = new URL(request.url);
  const rangeWindow = getRangeWindow(url);
  const { range, start, end, previousStart, previousEnd } = rangeWindow;

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 20);
  const analysis = await buildAttributionAnalysis(env, rangeWindow, limit);

  let firstTouchResults = [];
  let lastTouchResults = [];

  try {
    const firstTouch = await env.DB.prepare(
      `SELECT
        first_touch_channel as channel,
        COUNT(*) as orders,
        COALESCE(SUM(total_price),0) as revenue
       FROM orders
       WHERE substr(shopify_created_at, 1, 10) >= ? AND substr(shopify_created_at, 1, 10) <= ?
         AND first_touch_channel IS NOT NULL
       GROUP BY first_touch_channel
       ORDER BY revenue DESC
       LIMIT 10`
    ).bind(start, end).all();

    firstTouchResults = (firstTouch.results || []).map((r) => ({
      channel: normalizeChannelName(r.channel || 'Direct'),
      orders: r.orders || 0,
      revenue: r.revenue || 0,
    }));

    const lastTouch = await env.DB.prepare(
      `SELECT
        last_touch_channel as channel,
        COUNT(*) as orders,
        COALESCE(SUM(total_price),0) as revenue
       FROM orders
       WHERE substr(shopify_created_at, 1, 10) >= ? AND substr(shopify_created_at, 1, 10) <= ?
         AND last_touch_channel IS NOT NULL
       GROUP BY last_touch_channel
       ORDER BY revenue DESC
       LIMIT 10`
    ).bind(start, end).all();

    lastTouchResults = (lastTouch.results || []).map((r) => ({
      channel: normalizeChannelName(r.channel || 'Direct'),
      orders: r.orders || 0,
      revenue: r.revenue || 0,
    }));
  } catch (err) {
    console.warn('Attribution query failed:', err.message);
  }

  return json(
    {
      range,
      start,
      end,
      previous_start: previousStart,
      previous_end: previousEnd,
      attribution_model: 'last_non_click',
      channels: analysis.channels_top10,
      totals: analysis.totals,
      previous_totals: analysis.previous_totals,
      ai_summary: analysis.ai_summary,
      attribution: {
        first_touch: firstTouchResults,
        last_touch: lastTouchResults,
      },
    },
    200,
    cors
  );
}
// ============================================
// Funnel
// ============================================

async function handleFunnel(request, env, cors) {
  const url = new URL(request.url);
  const rangeWindow = getRangeWindow(url);
  const { range, start, end, previousStart, previousEnd } = rangeWindow;

  async function getFunnelForRange(startDate, endDate) {
    const rows = await env.DB.prepare(
      `SELECT
        event_name,
        COUNT(DISTINCT session_id) as cnt
       FROM pixel_events
       WHERE DATE(timestamp) >= ? AND DATE(timestamp) <= ?
         AND event_name IN ('page_viewed','product_viewed','product_added_to_cart','checkout_started','checkout_completed')
       GROUP BY event_name`
    ).bind(startDate, endDate).all();

    const map = {};
    (rows.results || []).forEach((r) => {
      map[r.event_name] = r.cnt || 0;
    });

    return {
      sessions: map.page_viewed || 0,
      product_viewed: map.product_viewed || 0,
      add_to_cart: map.product_added_to_cart || 0,
      checkout_started: map.checkout_started || 0,
      checkout_completed: map.checkout_completed || 0,
    };
  }

  const today = await getFunnelForRange(start, end);
  const yesterday = await getFunnelForRange(previousStart, previousEnd);

  return json(
    {
      range,
      start,
      end,
      previous_start: previousStart,
      previous_end: previousEnd,
      today,
      yesterday,
    },
    200,
    cors
  );
}
// ============================================
// Feishu Sync
// ============================================


async function handleFeishuSync(request, env, cors) {
  if (!hasWriteAccess(request, env)) {
    return json({ error: 'Unauthorized' }, 401, cors);
  }

  const url = new URL(request.url);
  const rawDate = url.searchParams.get('date');

  let date;

  if (!rawDate) {
    date = yesterdayStr();
  } else if (rawDate === 'today') {
    date = todayStr();
  } else if (rawDate === 'yesterday') {
    date = yesterdayStr();
  } else {
    date = rawDate;
  }

  if (!isValidDateStr(date)) {
    return json({ error: 'Invalid date. Use YYYY-MM-DD, today, or yesterday' }, 400, cors);
  }

  const result = await runDailyFeishuPipeline(env, date);

  return json(
    {
      ok: true,
      date,
      shopify_timezone: SHOPIFY_TIMEZONE,
      shopify_now: getShopifyDateTimeParts(new Date()).iso_like,
      feishu_report_timezone: getFeishuReportTimezone(env),
      feishu_report_hour: getFeishuReportHour(env),
      feishu_report_date_offset_days: getFeishuReportDateOffsetDays(env),
      sync: result.sync,
      feishu: result.feishu
    },
    200,
    cors
  );
}

  async function pushFeishuDaily(env, date = todayStr()) {
    const webhookUrl = env.FEISHU_WEBHOOK;

    if (!webhookUrl) {
      return {
        sent: false,
        reason: 'missing_feishu_webhook'
      };
    }

    const orders = await env.DB.prepare(
      `SELECT
        COUNT(*) as cnt,
        COALESCE(SUM(total_price),0) as revenue
      FROM orders
      WHERE substr(shopify_created_at, 1, 10) = ?`
    )
      .bind(date)
      .first();

    const sessions = await env.DB.prepare(
      `SELECT COUNT(DISTINCT session_id) as cnt
      FROM pixel_events
      WHERE event_name = 'page_viewed'
        AND DATE(timestamp) = ?`
    )
      .bind(date)
      .first();

    const spendRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(spend),0) as total
      FROM ad_spend
      WHERE date = ?`
    )
      .bind(date)
      .first();

    const channelSpend = await env.DB.prepare(
      `SELECT
        channel,
        COALESCE(SUM(spend),0) as spend
      FROM ad_spend
      WHERE date = ?
      GROUP BY channel
      ORDER BY spend DESC`
    )
      .bind(date)
      .all();

    const refunds = await env.DB.prepare(
      `SELECT
        COUNT(DISTINCT order_id) as cnt,
        COALESCE(SUM(amount),0) as amount
      FROM refunds
      WHERE DATE(created_at) = ?`
    )
      .bind(date)
      .first();

    const aov = orders.cnt > 0 ? orders.revenue / orders.cnt : 0;
    const cr = sessions.cnt > 0 ? (orders.cnt / sessions.cnt) * 100 : 0;
    const roi = spendRow.total > 0 ? orders.revenue / spendRow.total : null;
    const refundRate = orders.cnt > 0 ? (refunds.cnt / orders.cnt) * 100 : 0;

    const rangeWindow = {
      range: 'today',
      days: 1,
      start: date,
      end: date,
      previousStart: addDaysToDateStr(date, -1),
      previousEnd: addDaysToDateStr(date, -1)
    };

    let analysis;
    let analysisError = null;

    try {
      analysis = await buildAttributionAnalysis(env, rangeWindow, 10);
    } catch (err) {
      analysisError = err && err.message ? err.message : String(err);
      analysis = {
        channels_top10: [],
        totals: {
          sessions: sessions.cnt || 0,
          orders: orders.cnt || 0,
          revenue: orders.revenue || 0,
          spend: spendRow.total || 0,
          roas: roi,
          cpa: spendRow.total > 0 && orders.cnt > 0 ? spendRow.total / orders.cnt : null
        },
        previous_totals: {
          sessions: 0,
          orders: 0,
          revenue: 0,
          spend: 0,
          roas: null,
          cpa: null
        },
        ai_summary: {
          model: 'rule_based_attribution_analysis_v1',
          attribution_model: 'last_non_click',
          summary: 'AI 数据分析暂不可用，建议先检查 /api/ai-analysis 接口。',
          rising_channels: [],
          falling_channels: [],
          actions: ['AI 分析生成失败：' + analysisError],
          notes: []
        }
      };
    }

    const ai = analysis.ai_summary || {
      summary: '暂无 AI 数据分析总结。',
      rising_channels: [],
      falling_channels: [],
      actions: []
    };

    const reasonMap = {};

    (ai.rising_channels || []).forEach((row) => {
      reasonMap[normalizeChannelName(row.channel || '')] = {
        direction: 'up',
        reason: row.reason || '',
        action: row.action || ''
      };
    });

    (ai.falling_channels || []).forEach((row) => {
      reasonMap[normalizeChannelName(row.channel || '')] = {
        direction: 'down',
        reason: row.reason || '',
        action: row.action || ''
      };
    });

    const topChannels = analysis.channels_top10 || [];

    const topChannelsText = topChannels.length
      ? topChannels.map((row, index) => {
          const channel = normalizeChannelName(row.channel || 'Direct');
          const crValue = row.sessions > 0 ? (row.orders / row.sessions) * 100 : 0;
          const changeText = row.revenue_change !== undefined
            ? `较昨日 ${signedMoney(row.revenue_change)}`
            : '较昨日 -';
          const reason = reasonMap[channel] && reasonMap[channel].reason
            ? `原因：${reasonMap[channel].reason}`
            : '';

          return [
            `${index + 1}. **${feishuEsc(channel)}**`,
            `${row.orders || 0}单`,
            feishuMoney(row.revenue || 0),
            `Sessions ${row.sessions || 0}`,
            `CR ${feishuPct(crValue)}`,
            `花费 ${feishuMoney(row.spend || 0)}`,
            row.roas != null ? `ROI ${row.roas.toFixed(2)}x` : `ROI -`,
            changeText,
            reason
          ].filter(Boolean).join(' / ');
        }).join('\n')
      : '暂无 Last Non-Click 渠道订单数据';

    const risingText = (ai.rising_channels || []).length
      ? (ai.rising_channels || []).slice(0, 5).map((row, index) => {
          return `${index + 1}. **${feishuEsc(row.channel)}**：${signedMoney(row.revenue_change)} / ${row.reason || '暂无明确原因'}；建议：${row.action || '查看该渠道订单明细'}`;
        }).join('\n')
      : '暂无明显上涨渠道';

    const fallingText = (ai.falling_channels || []).length
      ? (ai.falling_channels || []).slice(0, 5).map((row, index) => {
          return `${index + 1}. **${feishuEsc(row.channel)}**：${signedMoney(row.revenue_change)} / ${row.reason || '暂无明确原因'}；建议：${row.action || '查看该渠道订单明细'}`;
        }).join('\n')
      : '暂无明显下降渠道';

    const actionText = (ai.actions || []).length
      ? (ai.actions || []).slice(0, 6).map((item) => `- ${feishuEsc(item)}`).join('\n')
      : '- 暂无明确行动建议，继续观察 Top 10 渠道变化';

    const alerts = [];

    if (analysisError) {
      alerts.push(`AI 分析生成失败：${analysisError}`);
    }

    if ((orders.revenue || 0) > 0 && (spendRow.total || 0) <= 0) {
      alerts.push('今日有销售额但广告花费为 $0，建议检查 ad_spend 或广告 API 同步。');
    }

    topChannels.forEach((row) => {
      const name = String(row.channel || '').toLowerCase();

      if (
        row.orders > 0 &&
        (row.spend || 0) <= 0 &&
        (
          name.includes('facebook') ||
          name.includes('google ads') ||
          name.includes('bing') ||
          name.includes('paid')
        )
      ) {
        alerts.push(`${row.channel} 有 ${row.orders} 单但花费为 $0，ROI 暂不可用。`);
      }
    });

    const noConversionRow = topChannels.find((row) => row.channel === 'No Conversion Details');

    if (noConversionRow && noConversionRow.orders > 0) {
      alerts.push(`No Conversion Details：${noConversionRow.orders}单 / ${feishuMoney(noConversionRow.revenue)}，建议继续执行 /api/backfill-attribution。`);
    }

    const otherRow = topChannels.find((row) => row.channel === 'Other');

    if (otherRow && otherRow.orders > 0) {
      alerts.push(`Other：${otherRow.orders}单 / ${feishuMoney(otherRow.revenue)}，建议抽查来源、UTM 和 referrer。`);
    }

    if (!alerts.length) {
      alerts.push('暂无明显异常');
    }

    const spendText = (channelSpend.results || []).length
      ? (channelSpend.results || []).map((row) => {
          return `- ${feishuEsc(row.channel)}：${feishuMoney(row.spend)}`;
        }).join('\n')
      : '- 暂无广告花费记录';

    const card = {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true
        },
        header: {
          title: {
            tag: 'plain_text',
            content: `📊 Thermal Master 日报 — ${date}`
          },
          template: roi && roi >= 3 ? 'green' : roi && roi >= 1 ? 'blue' : 'orange'
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: [
                `**今日概览**`,
                `💰 销售额：**${feishuMoney(orders.revenue)}**`,
                `📦 订单数：**${orders.cnt}**`,
                `👤 Sessions：**${sessions.cnt || 0}**`,
                `📈 转化率：**${feishuPct(cr)}**`,
                `🛒 AOV：**${feishuMoney(aov)}**`,
                `💵 营销费用：**${feishuMoney(spendRow.total)}**`,
                `📊 当日 ROI：**${roi != null ? roi.toFixed(2) + 'x' : '-'}**`,
                `↩️ 退款：**${refunds.cnt || 0} 笔 / ${feishuMoney(refunds.amount)}**`,
                `↩️ 退款率：**${feishuPct(refundRate)}**`
              ].join('\n')
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**广告花费明细**\n${spendText}`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**渠道业绩 Top 10 — Last Non-Click**\n${topChannelsText}`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**AI 数据分析总结**\n${feishuEsc(ai.summary || '暂无总结')}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**上涨渠道原因**\n${risingText}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**下降渠道原因**\n${fallingText}`
            }
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**行动建议**\n${actionText}`
            }
          },
          {
            tag: 'hr'
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**异常提醒**\n${alerts.map((item) => `- ${item}`).join('\n')}`
            }
          },
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: '归因口径：Top 10 使用 Last Non-Click；Direct / No Conversion Details / Pending 会回退到 first_touch_channel。已移除 First Touch / Last Touch 重复列表。'
              }
            ]
          }
        ]
      }
    };

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(card)
    });

    if (!resp.ok) {
      const text = await resp.text();

      return {
        sent: false,
        reason: `feishu_http_${resp.status}: ${text.slice(0, 300)}`
      };
    }

    return {
      sent: true
    };
  }
  async function runDailyFeishuPipeline(env, date) {
    console.log('[DAILY] start pipeline for', date);

    const syncResult = await syncShopifyOrdersForDate(env, date, {
      enrich: true,
      maxPages: 50
    });

    console.log('[DAILY] sync result', JSON.stringify(syncResult));

    let metaResult = {
      ok: false,
      skipped: true,
      reason: 'missing_meta_config'
    };

    if (isMetaConfigured(env)) {
      try {
        metaResult = await syncMetaInsightsForRange(
          env,
          date,
          date,
          env.META_SYNC_LEVEL || DEFAULT_META_SYNC_LEVEL
        );

        console.log('[DAILY] meta result', JSON.stringify(metaResult));
      } catch (err) {
        metaResult = {
          ok: false,
          skipped: false,
          reason: err.message
        };

        console.error('[DAILY] meta sync failed', err.message);
      }
    }

    const feishuResult = await pushFeishuDaily(env, date);

    console.log('[DAILY] feishu result', JSON.stringify(feishuResult));

    return {
      ok: true,
      date,
      sync: syncResult,
      meta: metaResult,
      feishu: feishuResult
    };
  }
  async function syncShopifyOrdersForDate(env, date, options = {}) {
  if (!env.SHOPIFY_STORE || !env.SHOPIFY_ADMIN_TOKEN) {
    throw new Error('Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN');
  }

  if (!isValidDateStr(date)) {
    throw new Error('Invalid sync date: ' + date);
  }

  const enrich = options.enrich !== false;
  const maxPages = Math.min(Number(options.maxPages || 50), 50);

  let nextUrl = buildShopifyOrdersUrl(env, date, date);
  let page = 0;
  let fetched = 0;
  let synced = 0;
  let enriched = 0;
  const failed = [];

  while (nextUrl && page < maxPages) {
    const resp = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('Shopify orders fetch failed: ' + resp.status + ' ' + text.slice(0, 300));
    }

    const data = await resp.json();
    const orders = data.orders || [];

    fetched += orders.length;

    for (const order of orders) {
      try {
        const result = await upsertShopifyOrder(order, env);
        synced++;

        if (enrich) {
          try {
            await enrichOrderAttribution(
              env,
              result.order_id,
              result.channel || 'Direct',
              result.utm_campaign || 'None'
            );
            enriched++;
          } catch (err) {
            failed.push({
              order_id: result.order_id,
              stage: 'enrich',
              message: err.message
            });
          }
        }
      } catch (err) {
        failed.push({
          order_id: order.id ? String(order.id) : '',
          stage: 'upsert',
          message: err.message
        });
      }
    }

    page++;
    nextUrl = getNextShopifyLink(resp.headers.get('Link'));
  }

  return {
    date,
    pages: page,
    fetched,
    synced,
    enriched,
    has_next_page: Boolean(nextUrl),
    failed_count: failed.length,
    failed: failed.slice(0, 20)
  };
}
  function feishuMoney(value) {
    const n = Number(value || 0);
    return '$' + n.toFixed(2);
  }








function feishuPct(value) {
  const n = Number(value || 0);
  return n.toFixed(2) + '%';
}

function feishuEsc(value) {
  return String(value || '')
    .replace(/\*/g, '')
    .replace(/_/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function formatFeishuAttribution(rows) {
  if (!rows || !rows.length) {
    return '暂无归因数据';
  }

  return rows.slice(0, 10).map((row, index) => {
    return `${index + 1}. **${feishuEsc(row.channel || 'Unknown')}** / ${row.orders || 0}单 / ${feishuMoney(row.revenue)}`;
  }).join('\n');
}



// ============================================
// Channel Classification
// ============================================

function classifyChannel(source, medium, referrer, sourceName) {
  const s = String(source || '').toLowerCase().trim();
  const m = String(medium || '').toLowerCase().trim();
  const r = String(referrer || '').toLowerCase().trim();
  const sn = String(sourceName || '').toLowerCase().trim();

  if (!s && !m && !r) return 'Direct';

  if (
    !s &&
    !m &&
    (
      r.includes('thermalmaster.com') ||
      r.includes('www.thermalmaster.com') ||
      r.includes('thermal-master')
    )
  ) {
    return 'Direct';
  }
if (
  (
    s.includes('thermalmaster.com') ||
    s.includes('www.thermalmaster.com') ||
    s.includes('thermal-master')
  ) &&
  (
    m === 'referral' ||
    m === '' ||
    m === 'none'
  )
) {
  return 'Direct';
}
  if (
    s === 'fb' ||
    s.includes('facebook') ||
    s === 'meta' ||
    s.includes('meta') ||
    s === 'ig' ||
    s.includes('instagram') ||
    s === 'an' ||
    r.includes('facebook.com') ||
    r.includes('instagram.com')
  ) {
    return 'Facebook';
  }

  if (s.includes('google') || r.includes('google.')) {
    if (
      m === 'cpc' ||
      m === 'ppc' ||
      m === 'paid' ||
      m === 'paidsearch' ||
      m === 'paid_search'
    ) {
      return 'Google Ads';
    }

    if (
      m === 'product_sync' ||
      m === 'organic' ||
      m === 'organic_search' ||
      m === 'referral' ||
      !m
    ) {
      return 'Google Organic';
    }

    return 'Google Organic';
  }

  if (
    s.includes('bing') ||
    s.includes('microsoft') ||
    r.includes('bing.com')
  ) {
    return 'Bing';
  }

  if (
    s.includes('brave') ||
    r.includes('search.brave.com')
  ) {
    return 'Brave Organic';
  }

  if (
    s.includes('duckduckgo') ||
    r.includes('duckduckgo.com')
  ) {
    return 'DuckDuckGo Organic';
  }

  if (
    s.includes('yahoo') ||
    r.includes('yahoo.com')
  ) {
    return 'Yahoo Organic';
  }

  if (
    s.includes('tiktok') ||
    s === 'tt' ||
    r.includes('tiktok.com')
  ) {
    return 'TikTok';
  }

  if (
  s.includes('youtube') ||
  r.includes('youtube.com') ||
  r.includes('youtu.be')
) {
  return 'YouTube';
}

if (
  r.includes('shop.app')
) {
  return 'Shop App';
}

if (
  r.includes('addressvalidator.merchantly.io') ||
  r.includes('merchantly.io')
) {
  return 'Internal App';
}

if (
  r.includes('gathering.tweakers.net') ||
  r.includes('tweakers.net')
) {
  return 'Referral';
}

  if (
    m === 'email' ||
    s === 'email' ||
    s.includes('klaviyo') ||
    s.includes('omnisend') ||
    s.includes('shopify_email') ||
    s.includes('mailchimp')
  ) {
    return 'Email';
  }

  if (
    s.includes('chatgpt.com') ||
    s.includes('openai') ||
    r.includes('chatgpt.com') ||
    r.includes('openai.com')
  ) {
    return 'AI Referral';
  }

  if (
    m === 'cpc' ||
    m === 'ppc' ||
    m === 'paid' ||
    m === 'paidsearch' ||
    m === 'paid_search' ||
    m === 'paid_social'
  ) {
    return 'Paid';
  }

  if (
    m === 'social' ||
    m === 'organic_social'
  ) {
    return 'Social';
  }

  if (
    m === 'organic' ||
    m === 'organic_search'
  ) {
    return 'Organic Search';
  }

  if (
    m === 'referral' &&
    r &&
    !r.includes('thermalmaster.com')
  ) {
    return 'Referral';
  }
if (
  s === 'shopify' ||
  sn === 'pos'
) {
  return 'Direct';
}
if (
  r &&
  !r.includes('thermalmaster.com') &&
  !r.includes('www.thermalmaster.com')
) {
  return 'Referral';
}

return 'Other';
}
function normalizeChannelName(channel) {
  const c = String(channel || '').trim();
  const v = c.toLowerCase();

  if (!v) return 'Direct';
  if (
  v === 'no conversion details' ||
  v === 'no attribution' ||
  v === 'unknown attribution'
) {
  return 'No Conversion Details';
}

if (
  v === 'pending attribution' ||
  v === 'journey pending'
) {
  return 'Pending Attribution';
}
if (
  v === 'thermalmaster.com' ||
  v === 'www.thermalmaster.com' ||
  v.includes('thermal-master')
) {
  return 'Direct';
}
  if (
    v === 'meta ads' ||
    v === 'facebook ads' ||
    v === 'fb' ||
    v === 'facebook' ||
    v === 'instagram' ||
    v === 'ig' ||
    v === 'an'
  ) {
    return 'Facebook';
  }

  if (
    v === 'google' ||
    v === 'google organic' ||
    v === 'organic google'
  ) {
    return 'Google Organic';
  }

  if (
    v === 'google ads' ||
    v === 'google cpc' ||
    v === 'paid search'
  ) {
    return 'Google Ads';
  }

  if (
    v === 'bing ads' ||
    v === 'microsoft ads' ||
    v === 'bing'
  ) {
    return 'Bing';
  }

  if (
    v === 'brave' ||
    v === 'brave organic' ||
    v === 'search.brave.com'
  ) {
    return 'Brave Organic';
  }

  if (
    v === 'tiktok ads' ||
    v === 'tiktok'
  ) {
    return 'TikTok';
  }

  if (
    v === 'shopify_email' ||
    v === 'omnisend' ||
    v === 'klaviyo' ||
    v === 'email'
  ) {
    return 'Email';
  }

  if (
    v === 'chatgpt.com' ||
    v === 'chatgpt' ||
    v === 'openai'
  ) {
    return 'AI Referral';
  }
if (
  v === 'youtube' ||
  v === 'youtube referral'
) {
  return 'YouTube';
}

if (
  v === 'shop app' ||
  v === 'shop.app'
) {
  return 'Shop App';
}

if (
  v === 'internal app' ||
  v.includes('merchantly')
) {
  return 'Internal App';
}

if (
  v === 'referral'
) {
  return 'Referral';
}
  return c;
}
// ============================================
// HMAC Verification
// ============================================

async function verifyShopifyHmac(body, hmac, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === hmac;
}
