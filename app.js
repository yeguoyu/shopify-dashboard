/* ============================================
   Thermal Master Dashboard — App Logic v2
   Real API Integration
   ============================================ */

const CONFIG = {
  API_BASE: 'https://thermal-master-api.thermalmaster.workers.dev',
  REFRESH_INTERVAL: 60000,
  CURRENCY: '¥',
};

// ---- Channel color map ----
const CH_COLORS = {
  'Facebook':       { color: '#1877f2', light: '#64b5f6', icon: 'f' },
  'Google Ads':     { color: '#ea4335', light: '#ef9a9a', icon: 'G' },
  'Google Organic': { color: '#34a853', light: '#81c784', icon: 'G' },
  'TikTok':         { color: '#ff004f', light: '#ff80ab', icon: 'T' },
  'Bing':           { color: '#00809d', light: '#4dd0e1', icon: 'B' },
  'Email':          { color: '#96bf48', light: '#c5e17a', icon: '✉' },
  'Instagram':      { color: '#e4405f', light: '#f48fb1', icon: 'I' },
  'Direct':         { color: '#8b8da3', light: '#bdbdbd', icon: '→' },
  'Other':          { color: '#78909c', light: '#b0bec5', icon: '?' },
};

function getChColor(channel) {
  return CH_COLORS[channel] || CH_COLORS['Other'];
}

// ---- Utility ----
function fmt(num) {
  return Number(num || 0).toLocaleString('zh-CN');
}

function fmtMoney(num) {
  return CONFIG.CURRENCY + fmt(Math.round(num || 0));
}

function changeTag(val) {
  if (val === null || val === undefined) return '';
  var n = parseFloat(val);
  if (isNaN(n)) return '';
  var cls = n >= 0 ? 'up' : 'down';
  var arrow = n >= 0 ? '↑' : '↓';
  return '<span class="kpi-tag ' + cls + '">' + arrow + ' ' + Math.abs(n).toFixed(1) + '%</span>';
}

function deltaTag(val) {
  if (val === null || val === undefined) return '<span class="delta" style="color:var(--text-muted)">—</span>';
  var n = parseFloat(val);
  if (isNaN(n)) return '';
  var cls = n >= 0 ? 'up' : 'down';
  var arrow = n >= 0 ? '↑' : '↓';
  return '<span class="delta ' + cls + '">' + arrow + ' ' + Math.abs(n).toFixed(1) + '%</span>';
}

function ppTag(today, yesterday, label) {
  var diff = parseFloat(today) - parseFloat(yesterday);
  if (isNaN(diff)) return '<span class="fm-val" style="color:var(--text-muted)">' + today + '%</span>';
  var cls = diff >= 0 ? 'up' : 'down';
  var arrow = diff >= 0 ? '↑' : '↓';
  return '<span class="fm-val ' + cls + '">' + today + '% <small>' + arrow + Math.abs(diff).toFixed(1) + 'pp</small></span>';
}

// ---- Date Display ----
(function initDate() {
  var now = new Date();
  var days = ['周日','周一','周二','周三','周四','周五','周六'];
  document.getElementById('dateDisplay').textContent =
    now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0') + ' ' + days[now.getDay()];
})();

// ---- Theme ----
function setTheme(t) {
  document.body.setAttribute('data-theme', t);
  document.querySelectorAll('.theme-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-t') === t);
  });
  localStorage.setItem('tm-theme', t);
  renderSalesChart();
}

(function restoreTheme() {
  var saved = localStorage.getItem('tm-theme');
  if (saved) setTheme(saved);
})();

// ---- Feishu Sync ----
function syncFeishu() {
  var btn = document.getElementById('syncBtn');
  btn.classList.add('syncing');
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> 推送中...';

  fetch(CONFIG.API_BASE + '/api/sync-feishu', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function() {
      btn.classList.remove('syncing');
      btn.classList.add('done');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 已推送';
    })
    .catch(function() {
      btn.classList.remove('syncing');
      btn.innerHTML = '推送失败';
    })
    .finally(function() {
      setTimeout(function() {
        btn.classList.remove('done');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> 推送飞书';
      }, 3000);
    });
}

// ---- Global state ----
var _chartData = { today: new Array(24).fill(0), yesterday: new Array(24).fill(0) };

// ============================================
// API Fetching
// ============================================

function fetchDashboard() {
  return fetch(CONFIG.API_BASE + '/api/dashboard')
    .then(function(r) {
      if (!r.ok) throw new Error('Dashboard API ' + r.status);
      return r.json();
    });
}

function fetchChannels() {
  return fetch(CONFIG.API_BASE + '/api/channels')
    .then(function(r) {
      if (!r.ok) throw new Error('Channels API ' + r.status);
      return r.json();
    });
}

function fetchFunnel() {
  return fetch(CONFIG.API_BASE + '/api/funnel')
    .then(function(r) {
      if (!r.ok) throw new Error('Funnel API ' + r.status);
      return r.json();
    });
}

// ============================================
// Render Functions
// ============================================

function updateKPIs(kpi) {
  document.getElementById('kpiRevenue').textContent = fmtMoney(kpi.revenue);
  document.getElementById('kpiOrders').textContent = fmt(kpi.orders);
  document.getElementById('kpiAOV').textContent = fmtMoney(kpi.aov);
  document.getElementById('kpiCVR').textContent = kpi.cvr + '%';

  document.getElementById('kpiRevenueChange').innerHTML = changeTag(kpi.revenue_change);
  document.getElementById('kpiOrdersChange').innerHTML = changeTag(kpi.orders_change);
  document.getElementById('kpiAOVChange').innerHTML = changeTag(kpi.aov_change);
  // CVR change calculated from funnel
}

function updateChartLegend(todayTotal, yesterdayTotal) {
  var el = document.querySelector('.chart-legend-row');
  if (!el) return;
  el.innerHTML =
    '<span class="legend-item"><span class="legend-line" style="background:var(--shopify)"></span>今日 ' + fmtMoney(todayTotal) + '</span>' +
    '<span class="legend-item"><span class="legend-line dashed" style="background:var(--text-muted)"></span>昨日 ' + fmtMoney(yesterdayTotal) + '</span>';
}

function renderFunnel(data) {
  var t = data.today;
  var y = data.yesterday;
  var maxSessions = Math.max(t.sessions, 1);

  // Funnel bars
  var steps = [
    { name: '浏览', num: t.sessions, pct: '100%', barH: '100%', color: 'var(--shopify)' },
    { name: '加购', num: t.add_to_cart, pct: t.atc_rate + '%', barH: Math.max(t.add_to_cart / maxSessions * 100, 5) + '%', color: 'var(--blue)' },
    { name: '结账', num: t.checkout_started, pct: t.checkout_rate + '%', barH: Math.max(t.checkout_started / maxSessions * 100, 5) + '%', color: 'var(--orange)' },
    { name: '付款', num: t.checkout_completed, pct: t.payment_rate + '%', barH: Math.max(t.checkout_completed / maxSessions * 100, 5) + '%', color: 'var(--purple)' },
  ];

  var arrow = '<div class="funnel-arrow"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg></div>';

  var html = '';
  steps.forEach(function(s, i) {
    if (i > 0) html += arrow;
    html += '<div class="funnel-step" style="--step-color:' + s.color + ';--bar-h:' + s.barH + '">' +
      '<div class="funnel-bar-col"><span class="funnel-pct">' + s.pct + '</span><div class="funnel-bar"></div></div>' +
      '<div class="funnel-info"><span class="funnel-name">' + s.name + '</span><span class="funnel-num">' + fmt(s.num) + '</span></div></div>';
  });

  document.getElementById('funnelChart').innerHTML = html;

  // Funnel metrics
  var metricsEl = document.getElementById('funnelMetrics');
  if (metricsEl) {
    metricsEl.innerHTML =
      '<div class="fm"><span class="fm-label">加购率</span>' + ppTag(t.atc_rate, y.atc_rate) + '</div>' +
      '<div class="fm"><span class="fm-label">结账率</span>' + ppTag(t.checkout_rate, y.checkout_rate) + '</div>' +
      '<div class="fm"><span class="fm-label">付款率</span>' + ppTag(t.payment_rate, y.payment_rate) + '</div>' +
      '<div class="fm"><span class="fm-label">加购→付款</span>' + ppTag(t.atc_to_payment, y.atc_to_payment) + '</div>';
  }

  // Update CVR change in KPI
  var cvrDiff = parseFloat(t.payment_rate) - parseFloat(y.payment_rate);
  if (!isNaN(cvrDiff)) {
    var el = document.getElementById('kpiCVRChange');
    if (el) {
      var cls = cvrDiff >= 0 ? 'up' : 'down';
      var arr = cvrDiff >= 0 ? '↑' : '↓';
      el.innerHTML = '<span class="kpi-tag ' + cls + '">' + arr + ' ' + Math.abs(cvrDiff).toFixed(2) + 'pp</span>';
    }
  }
}

function renderTraffic(channels) {
  var container = document.getElementById('trafficList');
  if (!container || !channels.length) return;

  var maxSessions = Math.max.apply(null, channels.map(function(c) { return c.sessions || 0; })) || 1;

  var html = '';
  channels.forEach(function(c) {
    var ch = getChColor(c.channel);
    var pct = Math.max((c.sessions / maxSessions) * 100, 4);
    html += '<div class="traffic-item">' +
      '<div class="traffic-source"><span class="source-dot" style="background:' + ch.color + '"></span>' + c.channel + '</div>' +
      '<div class="traffic-bar-wrap"><div class="traffic-fill" style="width:' + pct + '%;background:linear-gradient(90deg,' + ch.color + ',' + ch.light + ')" data-v="' + fmt(c.sessions) + '"></div></div>' +
      '<div class="traffic-rates">' +
        '<span class="rate-tag atc">ATC ' + c.atc_rate + '%</span>' +
        '<span class="rate-tag cvr">CVR ' + c.cvr + '%</span>' +
      '</div></div>';
  });

  container.innerHTML = html;
}

function renderAttribution(channels) {
  var container = document.getElementById('attrCards');
  if (!container || !channels.length) return;

  var totalRevenue = channels.reduce(function(sum, c) { return sum + (c.revenue || 0); }, 0) || 1;
  var sorted = channels.slice().sort(function(a, b) { return (b.revenue || 0) - (a.revenue || 0); });

  var models = [
    { label: 'FIRST TOUCH', varColor: 'var(--shopify)', item: sorted[0] },
    { label: 'LAST TOUCH',  varColor: 'var(--blue)',    item: sorted[1] || sorted[0] },
    { label: 'LINEAR',      varColor: 'var(--orange)',  item: sorted[2] || sorted[0] },
  ];

  var html = '';
  models.forEach(function(m) {
    var pct = ((m.item.revenue / totalRevenue) * 100).toFixed(1);
    var barW = Math.max(pct, 5);
    html += '<div class="attr-item" style="--ac:' + m.varColor + '">' +
      '<div class="attr-model">' + m.label + '</div>' +
      '<div class="attr-channel">' + (m.item.channel || 'N/A') + '</div>' +
      '<div class="attr-bar-bg"><div class="attr-bar" style="width:' + barW + '%;background:' + m.varColor + '"></div></div>' +
      '<div class="attr-meta">' + fmtMoney(m.item.revenue) + ' <span class="attr-pct">' + pct + '%</span></div></div>';
  });

  container.innerHTML = html;

  // Insight
  var insightEl = document.getElementById('attrInsight');
  if (insightEl && sorted.length >= 2) {
    var top = sorted[0];
    var second = sorted[1];
    var topPct = ((top.revenue / totalRevenue) * 100).toFixed(1);
    var secPct = ((second.revenue / totalRevenue) * 100).toFixed(1);
    insightEl.innerHTML = '<div class="insight-icon">💡</div><div class="insight-text"><strong>归因判断</strong><br>' +
      top.channel + ' 贡献最高（' + topPct + '%），' +
      second.channel + ' 位列第二（' + secPct + '%）。' +
      '建议持续优化 ' + top.channel + ' 的投放效率，关注 ' + second.channel + ' 的增长潜力。</div>';
  }
}

function renderTable(channels) {
  var tbody = document.getElementById('campaignTableBody');
  if (!tbody) return;

  if (!channels.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px">暂无数据，等待订单和事件积累</td></tr>';
    return;
  }

  var html = '';
  channels.forEach(function(c) {
    var ch = getChColor(c.channel);
    html += '<tr>' +
      '<td><div class="ch-cell">' +
        '<span class="ch-icon" style="background:' + ch.color + '15;color:' + ch.color + '">' + ch.icon + '</span>' +
        '<div><span class="ch-name">' + (c.utm_campaign || c.channel) + '</span>' +
        '<span class="ch-platform">' + c.channel + '</span></div></div></td>' +
      '<td class="num-cell">' + fmtMoney(c.revenue) + '</td>' +
      '<td class="num-cell">' + fmt(c.orders) + '</td>' +
      '<td class="num-cell">' + fmt(c.sessions) + '</td>' +
      '<td class="num-cell">' + c.atc_rate + '%</td>' +
      '<td class="num-cell">' + c.cvr + '%</td>' +
      '<td>' + deltaTag(c.revenue_change) + '</td></tr>';
  });

  tbody.innerHTML = html;
}

// ---- Sales Chart (Canvas) ----
function renderSalesChart() {
  var canvas = document.getElementById('salesChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.parentElement.getBoundingClientRect();
  var W = rect.width;
  var H = 220;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  var pad = { top: 20, right: 16, bottom: 32, left: 58 };
  var chartW = W - pad.left - pad.right;
  var chartH = H - pad.top - pad.bottom;

  var todayData = _chartData.today;
  var yesterdayData = _chartData.yesterday;
  var allVals = todayData.concat(yesterdayData);
  var maxVal = Math.max.apply(null, allVals) * 1.1 || 1;

  function x(i) { return pad.left + (i / 23) * chartW; }
  function y(v) { return pad.top + chartH - (v / maxVal) * chartH; }

  var cs = getComputedStyle(document.body);
  var gridColor = cs.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.04)';
  var textColor = cs.getPropertyValue('--text-muted').trim() || '#555';
  var shopifyColor = cs.getPropertyValue('--shopify').trim() || '#96bf48';
  var bgColor = cs.getPropertyValue('--bg-2').trim() || '#1e2030';

  ctx.clearRect(0, 0, W, H);

  // Grid
  var gridSteps = 5;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (var i = 0; i <= gridSteps; i++) {
    var gy = pad.top + (chartH / gridSteps) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    var val = maxVal - (maxVal / gridSteps) * i;
    ctx.fillStyle = textColor;
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val >= 10000 ? (val/10000).toFixed(0) + 'w' : Math.round(val).toLocaleString(), pad.left - 8, gy + 3);
  }

  // X labels
  ctx.textAlign = 'center'; ctx.fillStyle = textColor;
  for (var h = 0; h < 24; h += 3) {
    ctx.fillText(h + ':00', x(h), H - 8);
  }

  // Find last non-zero index for today
  var lastIdx = 23;
  for (var j = 23; j >= 0; j--) {
    if (todayData[j] > 0) { lastIdx = j; break; }
  }

  // Yesterday dashed line
  ctx.setLineDash([5, 4]); ctx.strokeStyle = textColor; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4;
  ctx.beginPath();
  yesterdayData.forEach(function(v, i) { i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)); });
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;

  // Today area fill
  var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  grad.addColorStop(0, shopifyColor + '30'); grad.addColorStop(1, shopifyColor + '00');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(x(0), y(0));
  for (var k = 0; k <= lastIdx; k++) ctx.lineTo(x(k), y(todayData[k]));
  ctx.lineTo(x(lastIdx), pad.top + chartH); ctx.lineTo(x(0), pad.top + chartH); ctx.closePath(); ctx.fill();

  // Today line
  ctx.strokeStyle = shopifyColor; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  for (var m = 0; m <= lastIdx; m++) { m === 0 ? ctx.moveTo(x(m), y(todayData[m])) : ctx.lineTo(x(m), y(todayData[m])); }
  ctx.stroke();

  // End dot
  ctx.beginPath(); ctx.arc(x(lastIdx), y(todayData[lastIdx]), 4.5, 0, Math.PI * 2);
  ctx.fillStyle = shopifyColor; ctx.fill();
  ctx.strokeStyle = bgColor; ctx.lineWidth = 2.5; ctx.stroke();
}

// ---- Chip range toggle ----
function setChartRange(el, range) {
  el.parentElement.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
  el.classList.add('active');
  // TODO: fetch different ranges when API supports it
}

// ============================================
// Main: Load All Data
// ============================================

function loadAllData() {
  // Parallel fetch all endpoints
  Promise.all([
    fetchDashboard().catch(function(e) { console.warn('Dashboard fetch failed:', e); return null; }),
    fetchChannels().catch(function(e) { console.warn('Channels fetch failed:', e); return null; }),
    fetchFunnel().catch(function(e) { console.warn('Funnel fetch failed:', e); return null; }),
  ]).then(function(results) {
    var dashboard = results[0];
    var channels = results[1];
    var funnel = results[2];

    // Dashboard: KPIs + Chart
    if (dashboard) {
      updateKPIs(dashboard.kpi);

      if (dashboard.chart) {
        _chartData.today = dashboard.chart.today || new Array(24).fill(0);
        _chartData.yesterday = dashboard.chart.yesterday || new Array(24).fill(0);
        renderSalesChart();

        var todayTotal = _chartData.today[_chartData.today.length - 1] || 0;
        var ydayTotal = _chartData.yesterday[_chartData.yesterday.length - 1] || 0;
        updateChartLegend(todayTotal, ydayTotal);
      }
    }

    // Funnel
    if (funnel) {
      renderFunnel(funnel);
    }

    // Channels
    if (channels && channels.channels) {
      renderTraffic(channels.channels);
      renderAttribution(channels.channels);
      renderTable(channels.channels);
    }

    // Update sync time
    document.getElementById('lastSync').textContent =
      String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0') + ':' + String(new Date().getSeconds()).padStart(2, '0');

    // Remove loading state
    document.querySelectorAll('.loading-placeholder').forEach(function(el) { el.remove(); });
  });
}

// ---- Spin CSS ----
var styleEl = document.createElement('style');
styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.8s linear infinite; }';
document.head.appendChild(styleEl);

// ---- Init ----
window.addEventListener('DOMContentLoaded', function() {
  renderSalesChart();
  loadAllData();

  // Auto-refresh every minute
  setInterval(loadAllData, CONFIG.REFRESH_INTERVAL);
  window.addEventListener('resize', renderSalesChart);
});
