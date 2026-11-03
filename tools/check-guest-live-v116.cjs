const { chromium } = require('playwright');

const baseUrl = process.argv[2] || 'http://127.0.0.1:8877/index.html';
const executablePath = process.env.KHSX_BROWSER_PATH || require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe');   // Chrome có sẵn, không cần tải trình duyệt của Playwright

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
  assert(state.tabs.length === 3 && state.tabs[0].includes('Thống kê') && state.tabs[1].includes('KHSX') && state.tabs[2].includes('Năng lực'), 'guest sees exactly Statistics, KHSX and Capacity tabs');   // từ v262 khách xem được tab Năng lực
  assert(state.orderCount > 0, `guest receives live Supabase orders (${state.orderCount})`);
  assert(state.role === 'Chỉ xem', 'guest role is read-only');
  assert(!state.progressTabVisible && !state.editVisible && !state.deleteColumnVisible, 'all edit/progress controls are hidden');
  assert(state.monthlyKpis.length > 0, 'statistics KPI cards contain live data');
  console.log(`INFO  KPI text: ${state.monthlyKpis.replace(/\n+/g, ' | ')}`);
  // Số cố định 3.016 / 2.921 là của một tháng cũ trên dữ liệu thật, đổi theo tháng nên không dùng làm điều kiện; chỉ kiểm thẻ KPI có số và tỷ lệ.
  assert(/TỔNG KẾ HOẠCH[\s\S]*?\d/.test(state.monthlyKpis) && /TỶ LỆ HOÀN THÀNH[\s\S]*?\d+\s*%/.test(state.monthlyKpis), 'live KPI shows plan total and completion rate');

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
