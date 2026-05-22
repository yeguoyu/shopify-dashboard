// ============================================
// Thermal Master Dashboard — app.js v2
// + ROI / ROAS 卡片
// + 退货率指标
// + 归因数据（first/last touch）
// ============================================

var API_BASE = 'https://thermal-master-api.thermalmaster.workers.dev';

var _chartData = { today: new Array(24).fill(0), yesterday: new Array(24).fill(0) };

// ============================================
// API Fetchers
// ============================================

function fetchDashboard() {
  return fetch(API_BASE + '/api/dashboard').then(function (r) {
    if (!r.ok) throw new Error('Dashboard API ' + r.status);
    return r.json();
  });
}

function fetchChannels() {
  return fetch(API_BASE + '/api/channels').then(function (r) {
    if (!r.ok) throw new Error('Channels API ' + r.status);
    return r.json();
  });
}

function fetchFunnel() {
  return fetch(API_BASE + '/api/funnel').then(function (r) {
    if (!r.ok) throw new Error('Funnel API ' + r.status);
    return r.json();
  });
}

// ============================================
// Formatters
// ============================================

function fmtMoney(n) {
  if (n == null) return '$0';
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + parseFloat(n).toFixed(2);
}

function fmtNum(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

function fmtPct(n) {
  if (n == null) return '0%';
  return parseFloat(n).toFixed(2) + '%';
}

function calcDelta(current, previous) {
  if (!previous || previous === 0) return current > 0 ? '+100%' : '—';
  var pct = ((current - previous) / previous) * 100;
  var sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(1) + '%';
}

function deltaClass(current, previous, invertColor) {
  if (!previous || previous === 0) return 'up';
  var diff = current - previous;
  if (invertColor) diff = -diff; // 退货率越低越好
  return diff >= 0 ? 'up' : 'down';
}

// ============================================
// KPI Rendering
// ============================================

function updateKPIs(kpi) {
  if (!kpi) return;

  // 销售额
  setText('kpiRevenue', fmtMoney(kpi.revenue));
  setDelta('kpiRevenueDelta', kpi.revenue, kpi.revenue_yesterday);

  // 订单
  setText('kpiOrders', fmtNum(kpi.orders));
  setDelta('kpiOrdersDelta', kpi.orders, kpi.orders_yesterday);

  // Sessions
  setText('kpiSessions', fmtNum(kpi.sessions));
  setDelta('kpiSessionsDelta', kpi.sessions, kpi.sessions_yesterday);

  // 转化率
  setText('kpiCR', fmtPct(kpi.conversion_rate));

  // AOV
  setText('kpiAOV', fmtMoney(kpi.aov));
  setDelta('kpiAOVDelta', kpi.aov, kpi.aov_yesterday);

  // ---- 新增 KPI ----

  // 广告花费
  setText('kpiAdSpend', fmtMoney(kpi.ad_spend));

  // ROAS
  if (kpi.roas != null) {
    setText('kpiROAS', kpi.roas.toFixed(2) + 'x');
    var roasEl = document.getElementById('kpiROAS');
    if (roasEl) {
      roasEl.className = kpi.roas >= 3 ? 'kpi-value good' : kpi.roas >= 1 ? 'kpi-value warn' : 'kpi-value bad';
    }
  } else {
    setText('kpiROAS', '—');
  }

  // 退货率
  setText('kpiRefundRate', fmtPct(kpi.refund_rate));
  var refundRateEl = document.getElementById('kpiRefundRate');
  if (refundRateEl) {
    refundRateEl.className = kpi.refund_rate <= 3 ? 'kpi-value good' : kpi.refund_rate <= 8 ? 'kpi-value warn' : 'kpi-value bad';
  }
  setText('kpiRefundCount', (kpi.refund_orders || 0) + ' 笔 / ' + fmtMoney(kpi.refund_amount));

  // 渠道花费明细
  renderChannelSpend(kpi.channel_spend);
}

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setDelta(id, current, previous) {
  var el = document.getElementById(id);
  if (!el) return;
  var delta = calcDelta(current, previous);
  el.textContent = delta;
  el.className = 'kpi-delta ' + deltaClass(current, previous);
}

// ============================================
// Channel Spend 渠道花费小表
// ============================================

function renderChannelSpend(channelSpend) {
  var container = document.getElementById('channelSpendList');
  if (!container || !channelSpend || !channelSpend.length) return;

  var html = '';
  channelSpend.forEach(function (item) {
    html += '<div class="spend-row">' +
      '<span class="spend-channel">' + escHtml(item.channel) + '</span>' +
      '<span class="spend-amount">' + fmtMoney(item.spend) + '</span>' +
      '</div>';
  });
  container.innerHTML = html;
}

// ============================================
// Sales Chart (Canvas)
// ============================================

function renderSalesChart() {
  var canvas = document.getElementById('salesChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width = canvas.parentElement.clientWidth;
  var H = canvas.height = 220;

  var cs = getComputedStyle(document.documentElement);
  var shopifyColor = cs.getPropertyValue('--accent') || '#96bf48';
  var ydayColor = cs.getPropertyValue('--text-tertiary') || '#555';
  var gridColor = cs.getPropertyValue('--border') || '#333';
  var bgColor = cs.getPropertyValue('--bg-primary') || '#111';

  ctx.clearRect(0, 0, W, H);

  var todayData = _chartData.today;
  var ydayData = _chartData.yesterday;
  var maxVal = Math.max(1, Math.max.apply(null, todayData.concat(ydayData)));

  var padL = 60, padR = 20, padT = 20, padB = 30;
  var cW = W - padL - padR;
  var cH = H - padT - padB;

  function x(i) { return padL + (i / 23) * cW; }
  function y(val) { return padT + cH - (val / maxVal) * cH; }

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (var g = 0; g <= 4; g++) {
    var gy = padT + (g / 4) * cH;
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
    ctx.fillStyle = ydayColor;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(fmtMoney(maxVal - (g / 4) * maxVal), padL - 8, gy + 3);
  }

  // X axis labels
  ctx.fillStyle = ydayColor;
  ctx.textAlign = 'center';
  ctx.font = '10px JetBrains Mono, monospace';
  [0, 6, 12, 18, 23].forEach(function (h) {
    ctx.fillText(h + ':00', x(h), H - 5);
  });

  // Find last non-zero index for today
  var lastIdx = 0;
  todayData.forEach(function (val, i) { if (val > 0) lastIdx = i; });

  // Yesterday line (dashed)
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = ydayColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (var m = 0; m < 24; m++) { m === 0 ? ctx.moveTo(x(m), y(ydayData[m])) : ctx.lineTo(x(m), y(ydayData[m])); }
  ctx.stroke();
  ctx.setLineDash([]);

  // Today line (solid)
  ctx.strokeStyle = shopifyColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (var m = 0; m <= lastIdx; m++) { m === 0 ? ctx.moveTo(x(m), y(todayData[m])) : ctx.lineTo(x(m), y(todayData[m])); }
  ctx.stroke();

  // End dot
  ctx.beginPath();
  ctx.arc(x(lastIdx), y(todayData[lastIdx]), 4.5, 0, Math.PI * 2);
  ctx.fillStyle = shopifyColor;
  ctx.fill();
  ctx.strokeStyle = bgColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function updateChartLegend(todayTotal, ydayTotal) {
  setText('legendToday', '今天 ' + fmtMoney(todayTotal));
  setText('legendYday', '昨天 ' + fmtMoney(ydayTotal));
}

// ============================================
// Funnel Rendering
// ============================================

function renderFunnel(data) {
  if (!data) return;
  var today = data.today || {};
  var yday = data.yesterday || {};

  var steps = [
    { key: 'sessions', label: '访问' },
    { key: 'product_viewed', label: '浏览商品' },
    { key: 'add_to_cart', label: '加入购物车' },
    { key: 'checkout_started', label: '开始结算' },
    { key: 'checkout_completed', label: '完成购买' },
  ];

  var container = document.getElementById('funnelBars');
  if (!container) return;

  var maxVal = today.sessions || 1;
  var html = '';

  steps.forEach(function (step) {
    var val = today[step.key] || 0;
    var ydayVal = yday[step.key] || 0;
    var pct = maxVal > 0 ? ((val / maxVal) * 100).toFixed(1) : 0;
    var delta = calcDelta(val, ydayVal);
    var cls = deltaClass(val, ydayVal);

    html += '<div class="funnel-step">' +
      '<div class="funnel-label">' + step.label + '</div>' +
      '<div class="funnel-bar-wrap">' +
        '<div class="funnel-bar" style="width:' + Math.max(pct, 2) + '%"></div>' +
      '</div>' +
      '<div class="funnel-stats">' +
        '<span class="funnel-count">' + fmtNum(val) + '</span>' +
        '<span class="funnel-pct">' + pct + '%</span>' +
        '<span class="kpi-delta ' + cls + '">' + delta + '</span>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

// ============================================
// Traffic & Attribution — 渠道表格（含 ROI 列）
// ============================================

function renderTraffic(channels) {
  var container = document.getElementById('trafficDonut');
  if (!container) return;

  var totalSessions = 0;
  channels.forEach(function (c) { totalSessions += (c.sessions || 0); });

  var colors = ['#96bf48', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
  var html = '<div class="donut-chart">';

  // Simple bar-style visualization
  channels.forEach(function (c, i) {
    var pct = totalSessions > 0 ? ((c.sessions || 0) / totalSessions * 100) : 0;
    var color = colors[i % colors.length];
    html += '<div class="traffic-row">' +
      '<span class="traffic-dot" style="background:' + color + '"></span>' +
      '<span class="traffic-name">' + escHtml(c.channel || 'Direct') + '</span>' +
      '<span class="traffic-bar-wrap"><span class="traffic-bar" style="width:' + Math.max(pct, 1) + '%;background:' + color + '"></span></span>' +
      '<span class="traffic-pct">' + pct.toFixed(1) + '%</span>' +
    '</div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderAttribution(channels) {
  // 这个在 channels API 返回 attribution 数据时使用
  // 暂时由渠道表格统一展示
}

function renderTable(channels) {
  var tbody = document.getElementById('channelTableBody');
  if (!tbody) return;

  var html = '';
  channels.forEach(function (c) {
    var cr = c.sessions > 0 ? ((c.orders / c.sessions) * 100).toFixed(2) : '0';
    html += '<tr>' +
      '<td>' + escHtml(c.channel || 'Direct') + '</td>' +
      '<td>' + fmtNum(c.sessions) + '</td>' +
      '<td>' + fmtNum(c.orders) + '</td>' +
      '<td>' + fmtMoney(c.revenue) + '</td>' +
      '<td>' + fmtMoney(c.aov) + '</td>' +
      '<td>' + cr + '%</td>' +
      '<td>' + fmtMoney(c.spend) + '</td>' +
      '<td class="' + (c.roas != null ? (c.roas >= 3 ? 'good' : c.roas >= 1 ? 'warn' : 'bad') : '') + '">' +
        (c.roas != null ? c.roas + 'x' : '—') + '</td>' +
      '<td>' + (c.cpa != null ? fmtMoney(c.cpa) : '—') + '</td>' +
    '</tr>';
  });

  tbody.innerHTML = html;
}

// ============================================
// Attribution Tab (first/last touch)
// ============================================

function renderAttributionData(attribution) {
  if (!attribution) return;

  renderAttributionTable('firstTouchBody', attribution.first_touch);
  renderAttributionTable('lastTouchBody', attribution.last_touch);
}

function renderAttributionTable(tbodyId, data) {
  var tbody = document.getElementById(tbodyId);
  if (!tbody || !data) return;

  var total = 0;
  data.forEach(function (d) { total += d.orders; });

  var html = '';
  data.forEach(function (d) {
    var pct = total > 0 ? ((d.orders / total) * 100).toFixed(1) : '0';
    html += '<tr>' +
      '<td>' + escHtml(d.channel) + '</td>' +
      '<td>' + d.orders + '</td>' +
      '<td>' + fmtMoney(d.revenue) + '</td>' +
      '<td>' + pct + '%</td>' +
    '</tr>';
  });

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;opacity:0.5">暂无归因数据</td></tr>';
}

// ============================================
// Escape HTML
// ============================================

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================
// Theme
// ============================================

function setTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-t') === theme);
  });
  localStorage.setItem('tm-theme', theme);
  setTimeout(renderSalesChart, 50); // redraw with new colors
}

// ============================================
// Chip range toggle (placeholder)
// ============================================

function setChartRange(el, range) {
  el.parentElement.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
  el.classList.add('active');
  // TODO: 支持 7d/30d 范围查询
}

// ============================================
// Refresh
// ============================================

function refreshDashboard() {
  var icon = document.querySelector('.refresh-icon');
  if (icon) icon.classList.add('spin');
  loadAllData().finally(function () {
    if (icon) icon.classList.remove('spin');
  });
}

// ============================================
// Main: Load All Data
// ============================================

function loadAllData() {
  return Promise.all([
    fetchDashboard().catch(function (e) { console.warn('Dashboard fetch failed:', e); return null; }),
    fetchChannels().catch(function (e) { console.warn('Channels fetch failed:', e); return null; }),
    fetchFunnel().catch(function (e) { console.warn('Funnel fetch failed:', e); return null; }),
  ]).then(function (results) {
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
    if (channels) {
      if (channels.channels) {
        renderTraffic(channels.channels);
        renderTable(channels.channels);
      }
      // Always render attribution (even empty) to clear "加载中..."
      renderAttributionData(channels.attribution || { first_touch: [], last_touch: [] });
    } else {
      // API failed entirely — still clear loading
      renderAttributionData({ first_touch: [], last_touch: [] });
    }

    // Update sync time
    var syncEl = document.getElementById('lastSync');
    if (syncEl) {
      syncEl.textContent =
        String(new Date().getHours()).padStart(2, '0') + ':' +
        String(new Date().getMinutes()).padStart(2, '0') + ':' +
        String(new Date().getSeconds()).padStart(2, '0');
    }

    // Remove loading placeholders
    document.querySelectorAll('.loading-placeholder').forEach(function (el) { el.remove(); });
  });
}

// ============================================
// Date Display
// ============================================

function updateDateDisplay() {
  var el = document.getElementById('dateDisplay');
  if (!el) return;
  var now = new Date();
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.textContent = months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
}

// ============================================
// Attribution Tab Switcher
// ============================================

function switchAttrTab(el, tab) {
  document.querySelectorAll('.attr-tab-btn').forEach(function (b) { b.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.attr-tab-panel').forEach(function (p) { p.style.display = 'none'; });
  var panel = document.getElementById('attrPanel_' + tab);
  if (panel) panel.style.display = 'block';
}

// ---- Spin CSS ----
var styleEl = document.createElement('style');
styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.8s linear infinite; }';
document.head.appendChild(styleEl);

// ---- Init ----
window.addEventListener('DOMContentLoaded', function () {
  updateDateDisplay();
  renderSalesChart();

  var savedTheme = localStorage.getItem('tm-theme');
  if (savedTheme) setTheme(savedTheme);

  loadAllData();

  // Auto refresh every 5 min
  setInterval(loadAllData, 5 * 60 * 1000);
});

// Resize handler
window.addEventListener('resize', function () {
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(renderSalesChart, 200);
});
