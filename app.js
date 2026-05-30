// ============================================
// Thermal Master Dashboard — app.js v3
// + Last Non-Click Top 10 渠道
// + AI 数据分析总结
// + ROI / ROAS / 退货率指标
// ============================================

var API_BASE = 'https://thermal-master-api.thermalmaster.workers.dev';

var _currentRange = 'today';
var _selectedDate = null;
var _dataStatus = null;
var _chartData = { today: new Array(24).fill(0), yesterday: new Array(24).fill(0), labels: [], mode: 'hourly' };
var _analysisSummary = null;

// ============================================
// API Fetchers
// ============================================

function getRangeQuery() {
  var query = '?range=' + encodeURIComponent(_currentRange);

  if (_selectedDate) {
    query += '&date=' + encodeURIComponent(_selectedDate);
  }

  return query;
}

function fetchDataStatus() {
  return fetch(API_BASE + '/api/data-status').then(function (r) {
    if (!r.ok) throw new Error('Data status API ' + r.status);
    return r.json();
  });
}

function fetchDashboard() {
  return fetch(API_BASE + '/api/dashboard' + getRangeQuery()).then(function (r) {
    if (!r.ok) throw new Error('Dashboard API ' + r.status);
    return r.json();
  });
}

function fetchChannels() {
  return fetch(API_BASE + '/api/channels' + getRangeQuery()).then(function (r) {
    if (!r.ok) throw new Error('Channels API ' + r.status);
    return r.json();
  });
}

function fetchFunnel() {
  return fetch(API_BASE + '/api/funnel' + getRangeQuery()).then(function (r) {
    if (!r.ok) throw new Error('Funnel API ' + r.status);
    return r.json();
  });
}

function fetchAgenticSummary() {
  return fetch(API_BASE + '/api/agentic-summary' + getRangeQuery()).then(function (r) {
    if (!r.ok) throw new Error('Agentic summary API ' + r.status);
    return r.json();
  });
}

function fetchSyncHealth() {
  return fetch(API_BASE + '/api/sync-health' + getRangeQuery()).then(function (r) {
    if (!r.ok) throw new Error('Sync health API ' + r.status);
    return r.json();
  });
}

function fetchAttributionAnomalies() {
  return fetch(API_BASE + '/api/attribution-anomalies' + getRangeQuery()).then(function (r) {
    if (!r.ok) throw new Error('Attribution anomalies API ' + r.status);
    return r.json();
  });
}

function fetchAttributionRules() {
  return fetch(API_BASE + '/api/attribution-rules').then(function (r) {
    if (!r.ok) throw new Error('Attribution rules API ' + r.status);
    return r.json();
  });
}

function fetchOrderDiagnostics(orderId) {
  return fetch(API_BASE + '/api/order-diagnostics?order_id=' + encodeURIComponent(orderId)).then(function (r) {
    if (!r.ok) throw new Error('Order diagnostics API ' + r.status);
    return r.json();
  });
}

function fetchProductPerformance() {
  return fetch(API_BASE + '/api/product-performance' + getRangeQuery()).then(function (r) {
    if (!r.ok) throw new Error('Product performance API ' + r.status);
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

function fmtSignedMoney(n) {
  var val = Number(n || 0);
  var sign = val > 0 ? '+' : val < 0 ? '-' : '';
  return sign + fmtMoney(Math.abs(val));
}

function fmtSignedPct(n) {
  if (n == null || !isFinite(Number(n))) return '—';
  var val = Number(n);
  var sign = val > 0 ? '+' : val < 0 ? '' : '';
  return sign + val.toFixed(1) + '%';
}

function fmtChangeCell(row) {
  var delta = Number(row && row.revenue_change != null ? row.revenue_change : 0);
  var pct = row && row.revenue_change_pct != null ? row.revenue_change_pct : null;

  if (!delta) return '—';

  return fmtSignedMoney(delta) + (pct == null ? '' : ' / ' + fmtSignedPct(pct));
}

function changeClass(row) {
  var delta = Number(row && row.revenue_change != null ? row.revenue_change : 0);

  if (delta > 0) return 'delta-up';
  if (delta < 0) return 'delta-down';

  return 'delta-flat';
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
  if (invertColor) diff = -diff;
  return diff >= 0 ? 'up' : 'down';
}

// ============================================
// KPI Rendering
// ============================================

function updateKPIs(kpi) {
  if (!kpi) return;

  setText('kpiRevenue', fmtMoney(kpi.revenue));
  setDelta('kpiRevenueDelta', kpi.revenue, kpi.revenue_yesterday);

  setText('kpiOrders', fmtNum(kpi.orders));
  setDelta('kpiOrdersDelta', kpi.orders, kpi.orders_yesterday);

  setText('kpiSessions', fmtNum(kpi.sessions));
  setDelta('kpiSessionsDelta', kpi.sessions, kpi.sessions_yesterday);

  setText('kpiCR', fmtPct(kpi.conversion_rate));

  setText('kpiAOV', fmtMoney(kpi.aov));
  setDelta('kpiAOVDelta', kpi.aov, kpi.aov_yesterday);

  setText('kpiAdSpend', fmtMoney(kpi.ad_spend));

  if (kpi.roas != null) {
    setText('kpiROAS', kpi.roas.toFixed(2) + 'x');
    var roasEl = document.getElementById('kpiROAS');
    if (roasEl) {
      roasEl.className = kpi.roas >= 3 ? 'kpi-value good' : kpi.roas >= 1 ? 'kpi-value warn' : 'kpi-value bad';
    }
  } else {
    setText('kpiROAS', '—');
  }

  setText('kpiRefundRate', fmtPct(kpi.refund_rate));
  var refundRateEl = document.getElementById('kpiRefundRate');
  if (refundRateEl) {
    refundRateEl.className = kpi.refund_rate <= 3 ? 'kpi-value good' : kpi.refund_rate <= 8 ? 'kpi-value warn' : 'kpi-value bad';
  }

  setText('kpiRefundCount', (kpi.refund_orders || 0) + ' 笔 / ' + fmtMoney(kpi.refund_amount));

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
// Channel Spend
// ============================================

function renderChannelSpend(channelSpend) {
  var container = document.getElementById('channelSpendList');
  if (!container) return;

  if (!channelSpend || !channelSpend.length) {
    container.innerHTML = '';
    return;
  }

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
// Sales Chart
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

  var todayData = _chartData.today || [];
  var ydayData = _chartData.yesterday || [];
  var labels = _chartData.labels || [];

  var pointCount = Math.max(todayData.length, ydayData.length, labels.length, 1);
  var maxVal = Math.max(1, Math.max.apply(null, todayData.concat(ydayData, [1])));

  var padL = 60;
  var padR = 20;
  var padT = 20;
  var padB = 30;

  var cW = W - padL - padR;
  var cH = H - padT - padB;

  function x(i) {
    if (pointCount <= 1) return padL;
    return padL + (i / (pointCount - 1)) * cW;
  }

  function y(val) {
    return padT + cH - ((val || 0) / maxVal) * cH;
  }

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;

  for (var g = 0; g <= 4; g++) {
    var gy = padT + (g / 4) * cH;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(W - padR, gy);
    ctx.stroke();

    ctx.fillStyle = ydayColor;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(fmtMoney(maxVal - (g / 4) * maxVal), padL - 8, gy + 3);
  }

  ctx.fillStyle = ydayColor;
  ctx.textAlign = 'center';
  ctx.font = '10px JetBrains Mono, monospace';

  var labelIndexes;

  if (pointCount <= 8) {
    labelIndexes = [];
    for (var li = 0; li < pointCount; li++) labelIndexes.push(li);
  } else {
    labelIndexes = [
      0,
      Math.floor(pointCount * 0.25),
      Math.floor(pointCount * 0.5),
      Math.floor(pointCount * 0.75),
      pointCount - 1
    ];
  }

  labelIndexes.forEach(function (idx) {
    var label = labels[idx] || (_chartData.mode === 'daily' ? String(idx + 1) : (idx + ':00'));
    ctx.fillText(label, x(idx), H - 5);
  });

  function lastDataIndex(data) {
    var last = data.length - 1;

    if (_chartData.mode === 'hourly') {
      last = 0;
      data.forEach(function (val, i) {
        if (val > 0) last = i;
      });
    }

    return Math.max(0, last);
  }

  function drawLine(data, color, dashed) {
    if (!data.length) return;

    if (dashed) ctx.setLineDash([4, 4]);

    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1.5 : 2.5;
    ctx.beginPath();

    for (var i = 0; i < data.length; i++) {
      i === 0 ? ctx.moveTo(x(i), y(data[i])) : ctx.lineTo(x(i), y(data[i]));
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawLine(ydayData, ydayColor, true);
  drawLine(todayData, shopifyColor, false);

  var lastIdx = lastDataIndex(todayData);

  if (todayData.length) {
    ctx.beginPath();
    ctx.arc(x(lastIdx), y(todayData[lastIdx]), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = shopifyColor;
    ctx.fill();
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function updateChartLegend(todayTotal, ydayTotal) {
  var currentLabel = _currentRange === 'today'
    ? formatShortDate(_selectedDate) + ' '
    : '当前 ';
  var previousLabel = _currentRange === 'today'
    ? '对比前日 '
    : '对比 ';

  setText('legendToday', currentLabel + fmtMoney(todayTotal));
  setText('legendYday', previousLabel + fmtMoney(ydayTotal));
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
    { key: 'checkout_completed', label: '完成购买' }
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
// Traffic Display
// ============================================

function getTrafficDisplayChannels(channels) {
  return (channels || []).slice(0, 10);
}

function renderTraffic(channels) {
  var container = document.getElementById('trafficDonut');
  if (!container) return;

  var displayChannels = getTrafficDisplayChannels(channels || []);
  var totalSessions = 0;

  displayChannels.forEach(function (c) {
    totalSessions += c.sessions || 0;
  });

  var colors = [
    '#96bf48',
    '#3b82f6',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899',
    '#a3a3a3'
  ];

  var html = '<div class="donut-chart">';

  displayChannels.forEach(function (c, i) {
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

// ============================================
// Channel Table
// ============================================

function renderTable(channels) {
  var tbody = document.getElementById('channelTableBody');
  if (!tbody) return;

  var rows = (channels || []).slice(0, 10);
  var html = '';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;opacity:0.5">暂无渠道数据</td></tr>';
    return;
  }

  rows.forEach(function (c) {
    var cr = c.sessions > 0 ? ((c.orders / c.sessions) * 100).toFixed(2) : '0';
    var insight = findTrendInsight(c.channel);

    html += '<tr>' +
      '<td>' + escHtml(c.channel || 'Direct') + '</td>' +
      '<td>' + fmtNum(c.sessions) + '</td>' +
      '<td>' + fmtNum(c.orders) + '</td>' +
      '<td>' + fmtMoney(c.revenue) + '</td>' +
      '<td class="' + changeClass(c) + '">' + escHtml(fmtChangeCell(c)) + '</td>' +
      '<td>' + fmtMoney(c.aov) + '</td>' +
      '<td>' + cr + '%</td>' +
      '<td>' + fmtMoney(c.spend) + '</td>' +
      '<td class="' + (c.roas != null ? (c.roas >= 3 ? 'good' : c.roas >= 1 ? 'warn' : 'bad') : '') + '">' +
      (c.roas != null ? c.roas + 'x' : '—') +
      '</td>' +
      '<td>' + (c.cpa != null ? fmtMoney(c.cpa) : '—') + '</td>' +
      '<td style="white-space:normal;min-width:220px;">' + escHtml(insight ? insight.reason : '—') + '</td>' +
      '</tr>';
  });

  tbody.innerHTML = html;
}


// ============================================
// Attribution
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

  data.forEach(function (d) {
    total += d.orders;
  });

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
// AI Analysis Rendering
// ============================================

function renderAIAnalysis(analysis) {
  var summary = analysis && analysis.ai_summary ? analysis.ai_summary : analysis;

  _analysisSummary = summary || null;

  var summaryEl = document.getElementById('aiSummaryText');
  var modelEl = document.getElementById('analysisModel');

  if (!summary) {
    if (summaryEl) summaryEl.textContent = '暂无 AI 分析数据。请确认 Worker 已部署 /api/ai-analysis 或 /api/dashboard analysis 字段。';
    renderDiagnosticList([]);
    renderTrendList('aiRisingList', [], 'up');
    renderTrendList('aiFallingList', [], 'down');
    renderActionList([]);
    return;
  }

  if (summaryEl) {
    summaryEl.textContent = summary.summary || '暂无明显上涨或下降趋势。';
  }

  if (modelEl) {
    var modelText = summary.attribution_model || 'last_non_click';
    modelEl.textContent = modelText.replace(/_/g, ' ') + ' · Top 10';
  }

  renderDiagnosticList(summary.diagnostics || []);
  renderTrendList('aiRisingList', summary.rising_channels || [], 'up');
  renderTrendList('aiFallingList', summary.falling_channels || [], 'down');
  renderActionList(summary.actions || []);
}

function renderDiagnosticList(rows) {
  var container = document.getElementById('aiDiagnosticList');
  if (!container) return;

  var list = (rows || []).slice(0, 6);

  if (!list.length) {
    container.innerHTML = '<div class="analysis-empty">暂无高优先级异常</div>';
    return;
  }

  container.innerHTML = list.map(function (item) {
    var severity = String(item.severity || 'info').toLowerCase();
    var checks = (item.checks || []).slice(0, 3).join('；');
    var fixes = (item.fixes || []).slice(0, 3).join('；');

    return '<div class="diagnostic-card">' +
      '<div class="diagnostic-head">' +
      '<div class="diagnostic-title">' + escHtml(item.title || '诊断项') + '</div>' +
      '<div class="diagnostic-severity ' + escHtml(severity) + '">' + escHtml(severity) + '</div>' +
      '</div>' +
      '<div class="diagnostic-line"><strong>影响：</strong>' + escHtml(item.impact || '-') + '</div>' +
      '<div class="diagnostic-line"><strong>证据：</strong>' + escHtml(item.evidence || '-') + '</div>' +
      '<div class="diagnostic-line"><strong>排查：</strong>' + escHtml(checks || '-') + '</div>' +
      '<div class="diagnostic-line"><strong>修复：</strong>' + escHtml(fixes || '-') + '</div>' +
      '</div>';
  }).join('');
}

function renderTrendList(containerId, rows, type) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var list = (rows || []).slice(0, 5);

  if (!list.length) {
    container.innerHTML = '<div class="analysis-empty">暂无明显' + (type === 'up' ? '上涨' : '下降') + '渠道</div>';
    return;
  }

  var html = '';

  list.forEach(function (row) {
    html += '<div class="analysis-item ' + (type === 'up' ? 'up' : 'down') + '">' +
      '<div class="analysis-item-head">' +
      '<span class="analysis-channel">' + escHtml(row.channel || 'Unknown') + '</span>' +
      '<span class="analysis-change ' + (type === 'up' ? 'up' : 'down') + '">' +
      escHtml(fmtSignedMoney(row.revenue_change || 0)) +
      (row.revenue_change_pct == null ? '' : ' / ' + escHtml(fmtSignedPct(row.revenue_change_pct))) +
      '</span>' +
      '</div>' +
      '<div class="analysis-detail">当前 ' + escHtml(fmtMoney(row.revenue)) +
      '，上期 ' + escHtml(fmtMoney(row.previous_revenue)) +
      '；订单 ' + escHtml(fmtNum(row.orders)) +
      '，上期 ' + escHtml(fmtNum(row.previous_orders)) + '。</div>' +
      '<div class="analysis-detail">原因：' + escHtml(row.reason || '暂无原因判断') + '</div>' +
      '<div class="analysis-detail">建议：' + escHtml(row.action || '继续观察该渠道的订单、AOV 与流量变化。') + '</div>' +
      '</div>';
  });

  container.innerHTML = html;
}

function renderActionList(actions) {
  var list = document.getElementById('aiActionList');
  if (!list) return;

  var rows = (actions || []).slice(0, 6);

  if (!rows.length) {
    list.innerHTML = '<li>暂无明显异常，继续观察 Top 10 渠道变化。</li>';
    return;
  }

  list.innerHTML = rows.map(function (item) {
    return '<li>' + escHtml(item) + '</li>';
  }).join('');
}

// ============================================
// Shopify Agentic Summary
// ============================================

function renderAgenticSummary(data) {
  if (!data) return;

  setText('agenticSummaryText', data.summary || '暂无 Shopify 智能体渠道总结。');

  var kpi = data.kpi || {};

  setText('agenticSales', fmtMoney(kpi.revenue || 0));
  setText('agenticOrders', fmtNum(kpi.orders || 0));
  setText('agenticSessions', fmtNum(kpi.sessions || 0));
  setText('agenticAOV', fmtMoney(kpi.aov || 0));
  setText('agenticCVR', fmtPct(kpi.conversion_rate || 0));
  setText('agenticCustomers', fmtNum(kpi.acquired_customers || 0));

  var aovNote = document.getElementById('agenticAOVNote');
  if (aovNote) {
    if (!kpi.orders) {
      aovNote.textContent = 'AI AOV 暂无订单';
      aovNote.className = 'agentic-note';
    } else if (kpi.aov_vs_direct_pct == null) {
      aovNote.textContent = 'Direct AOV 暂无基准';
      aovNote.className = 'agentic-note';
    } else {
      var pct = Number(kpi.aov_vs_direct_pct || 0);
      aovNote.textContent = '较 Direct ' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      aovNote.className = 'agentic-note ' + (pct >= 0 ? 'up' : 'down');
    }
  }

  renderAgenticReportLocations(data.report_locations || []);
  renderAgenticPlatformRows(data.platforms || []);
  renderAgenticOrders(data.orders || []);
  renderAgenticCustomers(data.acquired_customers || []);
  renderAgenticCatalogLogs(data.catalog_logs || []);
}

function renderAgenticReportLocations(rows) {
  var tbody = document.getElementById('agenticReportBody');
  if (!tbody) return;

  tbody.innerHTML = (rows || []).map(function (row) {
    return '<tr>' +
      '<td>' + escHtml(row.location) + '</td>' +
      '<td>' + escHtml(row.data) + '</td>' +
      '<td>' + escHtml(row.granularity) + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="3" style="text-align:center;opacity:0.5">暂无报表映射</td></tr>';
}

function renderAgenticPlatformRows(rows) {
  var container = document.getElementById('agenticPlatformList');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<div class="analysis-empty">暂无 AI 智能体平台数据</div>';
    return;
  }

  container.innerHTML = rows.slice(0, 5).map(function (row) {
    return '<div class="agentic-platform-row">' +
      '<div><strong>' + escHtml(row.platform || 'AI Agent') + '</strong><span>' +
      fmtNum(row.sessions || 0) + ' sessions / ' + fmtNum(row.orders || 0) + ' 单</span></div>' +
      '<div>' + fmtMoney(row.revenue || 0) + '</div>' +
      '</div>';
  }).join('');
}

function renderAgenticOrders(rows) {
  var tbody = document.getElementById('agenticOrdersBody');
  if (!tbody) return;

  tbody.innerHTML = rows.slice(0, 10).map(function (row) {
    return '<tr>' +
      '<td>' + escHtml(row.order_name || row.order_id || '-') + '</td>' +
      '<td>' + escHtml(row.platform || 'AI Agent') + '</td>' +
      '<td>' + fmtMoney(row.total_price || 0) + '</td>' +
      '<td>' + escHtml(row.campaign || 'None') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="4" style="text-align:center;opacity:0.5">暂无 AI 渠道订单</td></tr>';
}

function renderAgenticCustomers(rows) {
  var tbody = document.getElementById('agenticCustomersBody');
  if (!tbody) return;

  tbody.innerHTML = rows.slice(0, 10).map(function (row) {
    return '<tr>' +
      '<td>' + escHtml(row.customer_email || row.customer_id || '-') + '</td>' +
      '<td>' + escHtml(row.platform || 'AI Agent') + '</td>' +
      '<td>' + escHtml(row.first_order_name || row.first_order_id || '-') + '</td>' +
      '<td>' + fmtMoney(row.first_order_value || 0) + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="4" style="text-align:center;opacity:0.5">暂无 AI 首单获客</td></tr>';
}

function renderAgenticCatalogLogs(rows) {
  var tbody = document.getElementById('agenticCatalogBody');
  if (!tbody) return;

  tbody.innerHTML = rows.slice(0, 10).map(function (row) {
    return '<tr>' +
      '<td>' + escHtml(row.agent_name || 'AI Agent') + '</td>' +
      '<td>' + escHtml(row.sku || row.product_id || '-') + '</td>' +
      '<td>' + escHtml(row.product_title || '-') + '</td>' +
      '<td>' + fmtNum(row.requests || 0) + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="4" style="text-align:center;opacity:0.5">暂无 Catalog API logs</td></tr>';
}

// ============================================
// Sync Health / Attribution Anomalies / Product
// ============================================

function healthStatusLabel(status) {
  if (status === 'action_required') return '需要处理';
  if (status === 'watch') return '观察中';
  return '正常';
}

function renderSyncHealth(data) {
  if (!data) return;

  setText('syncHealthStatus', healthStatusLabel(data.status));
  setText('syncLatestOrder', data.latest_order_date || '-');
  setText('syncLatestPixel', data.latest_pixel_date || '-');
  setText('syncPendingAttribution', fmtNum(data.pending_attribution_count || 0));
  setText('syncAnomalyOrders', fmtNum(data.attribution_anomalies ? data.attribution_anomalies.orders : 0));
  setText('syncAnomalyRevenue', fmtMoney(data.attribution_anomalies ? data.attribution_anomalies.revenue : 0));
  setText('syncSkuEnabled', data.product_sku_enabled ? '已启用' : '待迁移/待新事件');

  var statusEl = document.getElementById('syncHealthStatus');
  if (statusEl) {
    statusEl.className = 'health-status ' + (data.status || 'ok');
  }

  var list = document.getElementById('syncHealthChecks');
  if (!list) return;

  var checks = (data.checks || []).slice(0, 6);

  if (!checks.length) {
    list.innerHTML = '<div class="analysis-empty">暂无需要处理的数据同步问题</div>';
    return;
  }

  list.innerHTML = checks.map(function (row) {
    return '<div class="health-check ' + escHtml(row.severity || 'info') + '">' +
      '<strong>' + escHtml(row.title || '-') + '</strong>' +
      '<span>' + escHtml(row.detail || '-') + '</span>' +
      '</div>';
  }).join('');
}

function renderAttributionAnomalies(data) {
  var tbody = document.getElementById('attributionAnomalyBody');
  if (!tbody) return;

  var totals = data && data.totals ? data.totals : {};

  setText('anomalyTotalOrders', fmtNum(totals.orders || 0));
  setText('anomalyTotalRevenue', fmtMoney(totals.revenue || 0));
  setText('anomalyOtherCount', fmtNum(totals.other_orders || 0));
  setText('anomalyNoConversionCount', fmtNum(totals.no_conversion_orders || 0));
  setText('anomalyOpenCount', fmtNum((data.status_summary && data.status_summary.open) || 0));
  setText('anomalyRulesCount', fmtNum(data.rules_count || 0));

  var rows = data && data.orders ? data.orders.slice(0, 12) : [];

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;opacity:0.5">暂无 Other / No Conversion Details 异常订单</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function (row) {
    var source = row.utm_source || row.referring_site || row.source_name || row.landing_site || '-';
    var diagnosis = row.diagnosis || {};
    var rule = row.suggested_rule || null;

    return '<tr>' +
      '<td>' + escHtml(row.order_name || row.order_id || '-') + '</td>' +
      '<td>' + escHtml(row.handling_status || 'open') + '</td>' +
      '<td>' + escHtml(row.bucket_label || '-') + '</td>' +
      '<td>' + fmtMoney(row.total_price || 0) + '</td>' +
      '<td>' + escHtml(row.effective_channel || '-') + '<br><span class="mini-muted">' + escHtml(row.effective_source || '-') + '</span></td>' +
      '<td style="white-space:normal;min-width:180px;">' + escHtml(String(source).slice(0, 120)) + '</td>' +
      '<td style="white-space:normal;min-width:220px;"><strong>' + escHtml(diagnosis.title || '-') + '</strong><br>' + escHtml(diagnosis.summary || '-') + '</td>' +
      '<td style="white-space:normal;min-width:200px;">' + (rule ? escHtml(rule.name + ' -> ' + rule.target_channel) : '-') + '</td>' +
      '<td><button class="mini-btn" data-order-id="' + escHtml(row.order_id) + '" onclick="showOrderDiagnostics(this.getAttribute(\'data-order-id\'))">详情</button></td>' +
      '</tr>';
  }).join('');
}

function renderAttributionRules(data) {
  var tbody = document.getElementById('attributionRuleBody');
  if (!tbody) return;

  var rules = data && data.rules ? data.rules.slice(0, 12) : [];

  if (!rules.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:0.5">暂无归因规则</td></tr>';
    return;
  }

  tbody.innerHTML = rules.map(function (rule) {
    return '<tr>' +
      '<td>' + fmtNum(rule.priority || 0) + '</td>' +
      '<td>' + escHtml(rule.name || '-') + '</td>' +
      '<td>' + escHtml((rule.match_field || 'all') + ' / ' + (rule.match_type || 'contains')) + '</td>' +
      '<td style="white-space:normal;min-width:180px;">' + escHtml(rule.pattern || '-') + '</td>' +
      '<td>' + escHtml(rule.target_channel || '-') + '</td>' +
      '</tr>';
  }).join('');
}

function showOrderDiagnostics(orderId) {
  var panel = document.getElementById('orderDiagnosticsPanel');
  if (!panel) return;

  panel.innerHTML = '<div class="analysis-empty">正在加载订单诊断...</div>';

  fetchOrderDiagnostics(orderId)
    .then(function (data) {
      var order = data.order || {};
      var effective = data.effective || {};
      var diagnosis = data.diagnosis || {};
      var override = data.override || {};
      var pixels = data.related_pixel_events || [];
      var catalog = data.catalog_matches || [];

      panel.innerHTML = '<div class="diagnostic-card">' +
        '<div class="diagnostic-head">' +
        '<div class="diagnostic-title">' + escHtml(order.order_name || order.order_id || '-') + ' · ' + fmtMoney(order.total_price || 0) + '</div>' +
        '<div class="diagnostic-severity ' + escHtml(diagnosis.severity || 'info') + '">' + escHtml(diagnosis.severity || 'info') + '</div>' +
        '</div>' +
        '<div class="diagnostic-line"><strong>有效归因：</strong>' + escHtml(effective.channel || '-') + ' / ' + escHtml(effective.source || '-') + '</div>' +
        '<div class="diagnostic-line"><strong>原始归因：</strong>' + escHtml(order.channel || '-') + ' · FT ' + escHtml(order.first_touch_channel || '-') + ' · LT ' + escHtml(order.last_touch_channel || '-') + '</div>' +
        '<div class="diagnostic-line"><strong>来源信号：</strong>' + escHtml([order.utm_source, order.utm_medium, order.utm_campaign, order.referring_site, order.source_name].filter(Boolean).join(' / ') || '-') + '</div>' +
        '<div class="diagnostic-line"><strong>处理状态：</strong>' + escHtml(override.status || 'open') + (override.override_channel ? ' -> ' + escHtml(override.override_channel) : '') + '</div>' +
        '<div class="diagnostic-line"><strong>问题：</strong>' + escHtml(diagnosis.title || '-') + '；' + escHtml(diagnosis.summary || '-') + '</div>' +
        '<div class="diagnostic-line"><strong>排查：</strong>' + escHtml((diagnosis.checks || []).slice(0, 3).join('；') || '-') + '</div>' +
        '<div class="diagnostic-line"><strong>修复：</strong>' + escHtml((diagnosis.fixes || []).slice(0, 3).join('；') || '-') + '</div>' +
        '<div class="diagnostic-line"><strong>商品：</strong>' + escHtml((order.line_items || []).map(function (item) { return (item.sku || '-') + ' ' + (item.title || ''); }).join('；') || '-') + '</div>' +
        '<div class="diagnostic-line"><strong>Pixel 相关事件：</strong>' + fmtNum(pixels.length) + ' 条；Catalog 匹配：' + fmtNum(catalog.length) + ' 条</div>' +
        '</div>';
    })
    .catch(function (err) {
      panel.innerHTML = '<div class="analysis-empty">订单诊断加载失败：' + escHtml(err.message) + '</div>';
    });
}

function renderProductPerformance(data) {
  var tbody = document.getElementById('productPerformanceBody');
  var aiBody = document.getElementById('aiProductInterestBody');
  if (!tbody) return;

  var totals = data && data.totals ? data.totals : {};

  setText('productCount', fmtNum(totals.product_count || 0));
  setText('productRevenue', fmtMoney(totals.revenue || 0));
  setText('productUnits', fmtNum(totals.units || 0));
  setText('productSkuCoverage', fmtPct(totals.sku_coverage_pct || 0));

  var rows = data && data.products ? data.products.slice(0, 12) : [];

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;opacity:0.5">暂无商品 / SKU 销售数据</td></tr>';
  } else {
    tbody.innerHTML = rows.map(function (row) {
      return '<tr>' +
        '<td>' + escHtml(row.sku || '-') + '</td>' +
        '<td style="white-space:normal;min-width:220px;">' + escHtml(row.product_title || '-') + '</td>' +
        '<td>' + fmtNum(row.orders || 0) + '</td>' +
        '<td>' + fmtNum(row.units || 0) + '</td>' +
        '<td>' + fmtMoney(row.revenue || 0) + '</td>' +
        '<td>' + escHtml(row.top_channel || '-') + '</td>' +
        '<td>' + fmtNum(row.views || 0) + '</td>' +
        '<td>' + fmtNum(row.add_to_cart || 0) + '</td>' +
        '<td>' + fmtNum(row.ai_requests || 0) + '</td>' +
        '</tr>';
    }).join('');
  }

  if (!aiBody) return;

  var aiRows = data && data.ai_interest ? data.ai_interest.slice(0, 8) : [];

  if (!aiRows.length) {
    aiBody.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:0.5">暂无 AI 商品兴趣数据</td></tr>';
    return;
  }

  aiBody.innerHTML = aiRows.map(function (row) {
    return '<tr>' +
      '<td>' + escHtml(row.sku || row.product_id || '-') + '</td>' +
      '<td style="white-space:normal;min-width:220px;">' + escHtml(row.product_title || '-') + '</td>' +
      '<td>' + fmtNum(row.ai_requests || 0) + '</td>' +
      '<td>' + fmtNum(row.views || 0) + '</td>' +
      '<td>' + fmtNum(row.add_to_cart || 0) + '</td>' +
      '</tr>';
  }).join('');
}

function findTrendInsight(channel) {
  if (!_analysisSummary) return null;

  var target = String(channel || '').toLowerCase();
  var rows = []
    .concat(_analysisSummary.rising_channels || [])
    .concat(_analysisSummary.falling_channels || []);

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].channel || '').toLowerCase() === target) {
      return rows[i];
    }
  }

  return null;
}

// ============================================
// Utils
// ============================================

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  setTimeout(renderSalesChart, 50);
}

// ============================================
// Range Toggle
// ============================================

function setChartRange(el, range) {
  var normalized = range === '24h' ? 'today' : range;

  _currentRange = normalized;

  el.parentElement.querySelectorAll('.chip').forEach(function (c) {
    c.classList.remove('active');
  });

  el.classList.add('active');

  loadAllData();
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
// Load All Data
// ============================================

function resolveDashboardDate() {
  return fetchDataStatus()
    .then(function (status) {
      _dataStatus = status || null;
      _selectedDate = status && status.default_date ? status.default_date : null;
      updateDateDisplay();
    })
    .catch(function (e) {
      console.warn('Data status fetch failed:', e);
      updateDateDisplay();
    });
}

function loadAllData() {
  return resolveDashboardDate().then(function () {
    return Promise.all([
      fetchDashboard().catch(function (e) {
        console.warn('Dashboard fetch failed:', e);
        return null;
      }),
      fetchChannels().catch(function (e) {
        console.warn('Channels fetch failed:', e);
        return null;
      }),
      fetchFunnel().catch(function (e) {
        console.warn('Funnel fetch failed:', e);
        return null;
      }),
      fetchAgenticSummary().catch(function (e) {
        console.warn('Agentic summary fetch failed:', e);
        return null;
      }),
      fetchSyncHealth().catch(function (e) {
        console.warn('Sync health fetch failed:', e);
        return null;
      }),
      fetchAttributionAnomalies().catch(function (e) {
        console.warn('Attribution anomalies fetch failed:', e);
        return null;
      }),
      fetchAttributionRules().catch(function (e) {
        console.warn('Attribution rules fetch failed:', e);
        return null;
      }),
      fetchProductPerformance().catch(function (e) {
        console.warn('Product performance fetch failed:', e);
        return null;
      })
    ]);
  }).then(function (results) {
    var dashboard = results[0];
    var channels = results[1];
    var funnel = results[2];
    var agentic = results[3];
    var syncHealth = results[4];
    var anomalies = results[5];
    var rules = results[6];
    var productPerformance = results[7];

    if (dashboard) {
      updateKPIs(dashboard.kpi);
      renderAIAnalysis(dashboard.analysis || null);

      if (dashboard.chart) {
        _chartData.today = dashboard.chart.today || new Array(24).fill(0);
        _chartData.yesterday = dashboard.chart.yesterday || new Array(_chartData.today.length).fill(0);
        _chartData.labels = dashboard.chart.labels || [];
        _chartData.mode = dashboard.chart.mode || (_currentRange === 'today' ? 'hourly' : 'daily');

        renderSalesChart();

        var todayTotal = dashboard.chart.current_total != null
          ? dashboard.chart.current_total
          : (_chartData.mode === 'hourly'
            ? (_chartData.today[_chartData.today.length - 1] || 0)
            : _chartData.today.reduce(function (s, n) { return s + (n || 0); }, 0));

        var ydayTotal = dashboard.chart.previous_total != null
          ? dashboard.chart.previous_total
          : (_chartData.mode === 'hourly'
            ? (_chartData.yesterday[_chartData.yesterday.length - 1] || 0)
            : _chartData.yesterday.reduce(function (s, n) { return s + (n || 0); }, 0));

        updateChartLegend(todayTotal, ydayTotal);
      }
    }

    if (funnel) {
      renderFunnel(funnel);
    }

    if (agentic) {
      renderAgenticSummary(agentic);
    }

    if (syncHealth) {
      renderSyncHealth(syncHealth);
    }

    if (anomalies) {
      renderAttributionAnomalies(anomalies);
    }

    if (rules) {
      renderAttributionRules(rules);
    }

    if (productPerformance) {
      renderProductPerformance(productPerformance);
    }

    if (channels) {
      if ((!dashboard || !_analysisSummary) && channels.ai_summary) {
        renderAIAnalysis({
          ai_summary: channels.ai_summary,
          channels_top10: channels.channels || [],
          totals: channels.totals || {},
          previous_totals: channels.previous_totals || {}
        });
      }

      if (channels.channels) {
        renderTraffic(channels.channels.slice(0, 10));
        renderTable(channels.channels.slice(0, 10));
      }

      renderAttributionData(channels.attribution || { first_touch: [], last_touch: [] });
    } else {
      renderAttributionData({ first_touch: [], last_touch: [] });
    }

    var syncEl = document.getElementById('lastSync');

    if (syncEl) {
      syncEl.textContent =
        String(new Date().getHours()).padStart(2, '0') + ':' +
        String(new Date().getMinutes()).padStart(2, '0') + ':' +
        String(new Date().getSeconds()).padStart(2, '0');
    }

    document.querySelectorAll('.loading-placeholder').forEach(function (el) {
      el.remove();
    });
  });
}

// ============================================
// Date Display
// ============================================

function updateDateDisplay() {
  var el = document.getElementById('dateDisplay');
  if (!el) return;

  if (_selectedDate) {
    var prefix = _dataStatus && _dataStatus.is_showing_latest_order_date
      ? '最新数据 '
      : '数据日期 ';

    el.textContent = prefix + formatLongDate(_selectedDate);
    return;
  }

  var now = new Date();
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  el.textContent = months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
}

function formatShortDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
    return '当前';
  }

  return dateStr.slice(5);
}

function formatLongDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
    return '';
  }

  var parts = dateStr.split('-').map(Number);
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return months[parts[1] - 1] + ' ' + parts[2] + ', ' + parts[0];
}

// ============================================
// Attribution Tab
// ============================================

function switchAttrTab(el, tab) {
  document.querySelectorAll('.attr-tab-btn').forEach(function (b) {
    b.classList.remove('active');
  });

  el.classList.add('active');

  document.querySelectorAll('.attr-tab-panel').forEach(function (p) {
    p.style.display = 'none';
  });

  var panel = document.getElementById('attrPanel_' + tab);

  if (panel) panel.style.display = 'block';
}

// ============================================
// Inject CSS
// ============================================

var styleEl = document.createElement('style');

styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.8s linear infinite; }';

document.head.appendChild(styleEl);

// ============================================
// Init
// ============================================

window.addEventListener('DOMContentLoaded', function () {
  updateDateDisplay();
  renderSalesChart();

  var savedTheme = localStorage.getItem('tm-theme');
  if (savedTheme) setTheme(savedTheme);

  loadAllData();

  setInterval(loadAllData, 5 * 60 * 1000);
});

window.addEventListener('resize', function () {
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(renderSalesChart, 200);
});
