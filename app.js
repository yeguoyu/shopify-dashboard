/* ============================================
   Thermal Master Dashboard — App Logic
   ============================================ */

// ---- Config ----
const CONFIG = {
  // TODO: Replace with your Cloudflare Worker API URL
  API_BASE: '',
  // TODO: Replace with your Feishu webhook
  FEISHU_WEBHOOK: '',
  REFRESH_INTERVAL: 60000, // 1 min
};

// ---- Date Display ----
(function initDate() {
  const now = new Date();
  const days = ['周日','周一','周二','周三','周四','周五','周六'];
  document.getElementById('dateDisplay').textContent =
    `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${days[now.getDay()]}`;
  document.getElementById('lastSync').textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
})();

// ---- Theme ----
function setTheme(t) {
  document.body.setAttribute('data-theme', t);
  document.querySelectorAll('.theme-btn').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-t') === t)
  );
  localStorage.setItem('tm-theme', t);
  // Re-render chart with new colors
  if (window._salesChart) renderSalesChart();
}

// Restore saved theme
(function restoreTheme() {
  const saved = localStorage.getItem('tm-theme');
  if (saved) setTheme(saved);
})();

// ---- Feishu Sync ----
function syncFeishu() {
  const btn = document.getElementById('syncBtn');
  btn.classList.add('syncing');
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> 推送中...`;

  // TODO: Replace with real API call
  // fetch(CONFIG.API_BASE + '/sync-feishu', { method: 'POST' })
  setTimeout(() => {
    btn.classList.remove('syncing');
    btn.classList.add('done');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 已推送`;
    setTimeout(() => {
      btn.classList.remove('done');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> 推送飞书`;
    }, 2500);
  }, 1500);
}

// ---- Spin Animation (for sync button) ----
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
`;
document.head.appendChild(styleEl);

// ---- Sales Chart (Canvas) ----
const HOURS = ['0:00','2:00','4:00','6:00','8:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00','24:00'];

// Demo data — will be replaced by API data
const DEMO_DATA = {
  today: [0, 2100, 3800, 6200, 18500, 32400, 52800, 68200, 82400, 96300, 110800, 121500, 128460],
  yesterday: [0, 1800, 4200, 7100, 16200, 28600, 45300, 58900, 72100, 84600, 98200, 108400, 114380],
};

function renderSalesChart() {
  const canvas = document.getElementById('salesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width;
  const H = 220;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const pad = { top: 20, right: 16, bottom: 32, left: 58 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const allVals = [...DEMO_DATA.today, ...DEMO_DATA.yesterday];
  const maxVal = Math.max(...allVals) * 1.1;

  function x(i) { return pad.left + (i / (HOURS.length - 1)) * chartW; }
  function y(v) { return pad.top + chartH - (v / maxVal) * chartH; }

  // Get computed colors
  const cs = getComputedStyle(document.body);
  const gridColor = cs.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.04)';
  const textColor = cs.getPropertyValue('--text-muted').trim() || '#555';
  const shopifyColor = cs.getPropertyValue('--shopify').trim() || '#96bf48';
  const mutedColor = cs.getPropertyValue('--text-muted').trim() || '#666';

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  const gridSteps = 5;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSteps; i++) {
    const gy = pad.top + (chartH / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(W - pad.right, gy);
    ctx.stroke();

    // Y labels
    const val = maxVal - (maxVal / gridSteps) * i;
    ctx.fillStyle = textColor;
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val >= 10000 ? (val/10000).toFixed(0) + 'w' : Math.round(val).toLocaleString(), pad.left - 8, gy + 3);
  }

  // X labels
  ctx.textAlign = 'center';
  ctx.fillStyle = textColor;
  HOURS.forEach((label, i) => {
    if (i % 2 === 0) {
      ctx.fillText(label, x(i), H - 8);
    }
  });

  // Yesterday line (dashed)
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = mutedColor;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  DEMO_DATA.yesterday.forEach((v, i) => {
    i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v));
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Today area fill
  const todayLen = DEMO_DATA.today.length;
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  grad.addColorStop(0, shopifyColor + '30');
  grad.addColorStop(1, shopifyColor + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  DEMO_DATA.today.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(todayLen - 1), pad.top + chartH);
  ctx.lineTo(x(0), pad.top + chartH);
  ctx.closePath();
  ctx.fill();

  // Today line
  ctx.strokeStyle = shopifyColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  DEMO_DATA.today.forEach((v, i) => {
    i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v));
  });
  ctx.stroke();

  // End dot
  const lastI = todayLen - 1;
  ctx.beginPath();
  ctx.arc(x(lastI), y(DEMO_DATA.today[lastI]), 4.5, 0, Math.PI * 2);
  ctx.fillStyle = shopifyColor;
  ctx.fill();
  ctx.strokeStyle = cs.getPropertyValue('--bg-2').trim() || '#1e2030';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  window._salesChart = true;
}

// Chip range toggle (visual only for demo)
function setChartRange(el, range) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  // TODO: Fetch data for range and re-render
}

// ---- Init ----
window.addEventListener('DOMContentLoaded', () => {
  renderSalesChart();
  window.addEventListener('resize', renderSalesChart);
});

// ---- Data Layer (for future API integration) ----
/*
  When ready to connect real data, implement these functions:

  async function fetchDashboardData() {
    const res = await fetch(CONFIG.API_BASE + '/dashboard');
    return res.json();
  }

  async function fetchChannelData() {
    const res = await fetch(CONFIG.API_BASE + '/channels');
    return res.json();
  }

  async function fetchFunnelData() {
    const res = await fetch(CONFIG.API_BASE + '/funnel');
    return res.json();
  }

  function updateKPIs(data) {
    document.getElementById('kpiRevenue').textContent = `¥${data.revenue.toLocaleString()}`;
    document.getElementById('kpiOrders').textContent = data.orders.toLocaleString();
    document.getElementById('kpiAOV').textContent = `¥${data.aov}`;
    document.getElementById('kpiCVR').textContent = `${data.cvr}%`;
  }

  // Auto-refresh
  setInterval(async () => {
    const data = await fetchDashboardData();
    updateKPIs(data);
    renderSalesChart();
  }, CONFIG.REFRESH_INTERVAL);
*/
