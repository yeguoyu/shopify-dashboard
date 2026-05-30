// ============================================
// Thermal Master — Shopify Custom Pixel
// 
// 安装位置：Shopify 后台 → Settings → Customer events → Add custom pixel
// 名称：TM Analytics Pixel
// ============================================

// ⚠️ 替换为你的 Cloudflare Worker URL
const WORKER_URL = 'https://thermal-master-api.thermalmaster.workers.dev/api/pixel-event';

// ---- Session ID ----
// 生成一个唯一的 session ID，用于关联同一用户的多个事件
function getSessionId() {
  // Custom Pixel 在 sandbox 中运行，无法访问 localStorage
  // 使用随机 ID + 时间戳作为 session 标识
  if (!window.__tm_session_id) {
    window.__tm_session_id = 'ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  return window.__tm_session_id;
}

// ---- UTM 参数提取 ----
function getUTMParams(url) {
  try {
    const u = new URL(url);
    return {
      utm_source: u.searchParams.get('utm_source') || '',
      utm_medium: u.searchParams.get('utm_medium') || '',
      utm_campaign: u.searchParams.get('utm_campaign') || '',
      utm_content: u.searchParams.get('utm_content') || '',
      utm_term: u.searchParams.get('utm_term') || '',
    };
  } catch (e) {
    return { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' };
  }
}

// ---- 发送事件 ----
function sendEvent(eventName, extraData = {}) {
  const pageUrl = document.location.href || '';
  const referrer = document.referrer || '';
  const utmParams = getUTMParams(pageUrl);

  const payload = {
    event_name: eventName,
    timestamp: new Date().toISOString(),
    session_id: getSessionId(),
    page_url: pageUrl,
    referrer: referrer,
    ...utmParams,
    ...extraData,
  };

  // 使用 sendBeacon 确保页面跳转时事件不丢失
  if (navigator.sendBeacon) {
    navigator.sendBeacon(WORKER_URL, JSON.stringify(payload));
  } else {
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }
}

// ---- 订阅 Shopify 标准事件 ----

// 1. 页面浏览
analytics.subscribe('page_viewed', (event) => {
  sendEvent('page_viewed');
});

// 2. 商品详情页浏览
analytics.subscribe('product_viewed', (event) => {
  const product = event.data?.productVariant;
  sendEvent('product_viewed', {
    product_id: product?.product?.id || '',
    product_title: product?.product?.title || '',
    product_sku: product?.sku || product?.product?.sku || '',
    product_price: product?.price?.amount || 0,
    variant_id: product?.id || '',
  });
});

// 3. 加入购物车
analytics.subscribe('product_added_to_cart', (event) => {
  const item = event.data?.cartLine;
  sendEvent('product_added_to_cart', {
    product_id: item?.merchandise?.product?.id || '',
    product_title: item?.merchandise?.product?.title || '',
    product_sku: item?.merchandise?.sku || item?.merchandise?.product?.sku || '',
    product_price: item?.merchandise?.price?.amount || 0,
    variant_id: item?.merchandise?.id || '',
    quantity: item?.quantity || 1,
  });
});

// 4. 发起结账
analytics.subscribe('checkout_started', (event) => {
  const checkout = event.data?.checkout;
  sendEvent('checkout_started', {
    cart_total: checkout?.totalPrice?.amount || 0,
    currency: checkout?.totalPrice?.currencyCode || 'USD',
  });
});

// 5. 完成结账（付款成功）
analytics.subscribe('checkout_completed', (event) => {
  const checkout = event.data?.checkout;
  sendEvent('checkout_completed', {
    order_id: checkout?.order?.id || '',
    order_total: checkout?.totalPrice?.amount || 0,
    currency: checkout?.totalPrice?.currencyCode || 'USD',
    customer_id: checkout?.order?.customer?.id || '',
  });
});

// 6. 搜索（可选，用于分析站内搜索行为）
analytics.subscribe('search_submitted', (event) => {
  sendEvent('search_submitted', {
    search_query: event.data?.searchResult?.query || '',
  });
});

console.log('[TM Pixel] Analytics pixel loaded');
