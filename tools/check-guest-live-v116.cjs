const { chromium } = require('playwright');

const baseUrl = process.argv[2] || 'http://127.0.0.1:8877/index.html';
const executablePath = process.env.KHSX_BROWSER_PATH || undefined;

function assert(ok, message) {
  if (!ok) throw new Error(message);
  console.log(`PASS  ${message}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}?view=guest&source=supabase`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.primarySource === 'supabase-public', null, { timeout: 30000 });

  const state = await page.evaluate(() => {
    const visible = el => !!el && getComputedStyle(el).display !== 'none';
    const tabs = Array.from(document.querySelectorAll('.tab-btn')).filter(visible).map(el => el.textContent.trim());
    const orders = typeof getOrders === 'function' ? getOrders() : [];
    return {
      tabs,
      orderCount: orders.length,
      publicCompact: document.body.classList.contains('public-view-mode'),
      role: document.getElementById('userBarRole')?.textContent.trim(),
      progressTabVisible: visible(document.querySelector('.tab-btn[data-tab="progress"]')),
      editVisible: visible(document.getElementById('unlockEditBtn')),
      deleteColumnVisible: visible(document.querySelector('#autoPlanTable .col-action.only-manager')),
      monthlyKpis: document.getElementById('monthlyKpis')?.innerText.trim() || ''
    };
  });

  assert(state.publicCompact, 'guest PC compact mode is active');
  assert(state.tabs.length === 2 && state.tabs[0].includes('Thống kê') && state.tabs[1].includes('KHSX'), 'guest sees exactly Statistics and KHSX tabs');
  assert(state.orderCount > 0, `guest receives live Supabase orders (${state.orderCount})`);
  assert(state.role === 'Chỉ xem', 'guest role is read-only');
  assert(!state.progressTabVisible && !state.editVisible && !state.deleteColumnVisible, 'all edit/progress controls are hidden');
  assert(state.monthlyKpis.length > 0, 'statistics KPI cards contain live data');
  console.log(`INFO  KPI text: ${state.monthlyKpis.replace(/\n+/g, ' | ')}`);
  assert(/3[.,]016/.test(state.monthlyKpis) && /2[.,]921/.test(state.monthlyKpis), 'live KPI matches reconciled plan 3,016 and capped completion 2,921');

  await page.click('.tab-btn[data-tab="autoplan"]');
  await page.waitForFunction(() => document.querySelectorAll('#autoPlanTable tbody tr').length > 0, null, { timeout: 10000 });
  const khsxRows = await page.locator('#autoPlanTable tbody tr').count();
  assert(khsxRows > 0, `KHSX table renders live rows (${khsxRows})`);
  assert(pageErrors.length === 0, `no page errors (${pageErrors.join(' | ')})`);
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
