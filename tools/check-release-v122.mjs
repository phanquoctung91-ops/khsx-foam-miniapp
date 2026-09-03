import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const checks=[
  ['Bản phát hành được nâng lên 122',/const APP_VERSION = 122;/],
  ['KHSX live chỉ đồng bộ dưới vai Quản lý',/syncMissingSheetOrdersToSupabase[\s\S]{0,500}!canManage\(\)/],
  ['Đơn Sheet chỉ chèn ID còn thiếu và bỏ qua xung đột',/knownIds[\s\S]{0,500}filter\(o=>!knownIds\.has[\s\S]{0,900}ignoreDuplicates:true/],
  ['Bootstrap và polling đều gọi đồng bộ Sheet Supabase',(html.match(/syncMissingSheetOrdersToSupabase/g)||[]).length>=4&&/jobs\.push\(syncMissingSheetOrdersToSupabase/.test(html)],
  ['Bảo hành live không bị tập ID Supabase loại',/supabaseOrdersLoaded&&!o\.is_warranty&&!supabaseActiveOrderIds/],
  ['KPI chọn nguồn sản xuất và bảo hành độc lập',/foamProduction/.test(html)&&/foamWarranty/.test(html)&&/const production=/.test(html)],
  ['OT là panel tĩnh và tự suy ra công đoạn từ tổ',(html.match(/id="overtimePanel"/g)||[]).length===1&&/function overtimeStageFromUnit/.test(html)],
  ['OT không còn bắt chọn công đoạn thủ công',!html.includes('id="overtimeStage"')],
  ['Bảng desktop có bề rộng cuộn, không ép chồng cột',/#autoPlanTable\{min-width:1320px[\s\S]{0,100}#progressTable\{min-width:1480px/],
  ['KHSX và TDSX chỉ lấy ngày thuộc tháng header',/filter\(ngayThuocThangHeader\)/.test(html)&&/ngayThuocThangHeader\(d\)/.test(html)&&(html.match(/dayVal === 'all' && !ngayThuocThangHeader\(r\.date\)/g)||[]).length===2],
  ['Đổi tháng header vẽ lại cả KHSX và TDSX',/function onHeaderMonthYearChanged\(\)[\s\S]{0,250}refreshOperationalTabsForHeader\(\)/.test(html)],
  ['Thẻ Tổng hoàn thành có câu báo cáo tuần và nút sao chép',/taoCauBaoCaoKrTuan/.test(html)&&/id="weeklyKrReport"/.test(html)&&/id="copyWeeklyKrBtn"/.test(html)],
  ['Tuần chốt Thứ 7 hoặc Chủ nhật đã đăng ký',/d\.getDay\(\)===6\|\|\(d\.getDay\(\)===0&&registeredSet\.has\(iso\)\)/.test(html)],
  ['Tháng hiện tại vẫn hiển thị kế hoạch tương lai',/dayKeys = allDayKeys\.filter\(k=>\{[\s\S]*?return p\.m === m && p\.y === y;[\s\S]*?elapsedDayKeys = dayKeys\.filter/],
  ['KPI thực tế tách khỏi ngày kế hoạch tương lai',/const metricDayKeys = elapsedDayKeys;[\s\S]*?tongKpiTuRowsTheoKeys\(metricDayKeys\)/],
  ['Dải KPI không đảo ngày khi chỉ có kế hoạch tương lai',/const elapsedDataDates = currentMonth[\s\S]*?const first = elapsedDataDates\[0\] \|\| todayIso;/],
];

let failed=0;
for(const [name,rule] of checks){
  const ok=rule instanceof RegExp?rule.test(html):Boolean(rule);
  if(!ok)failed++;
  console.log(`${ok?'PASS':'FAIL'}  ${name}`);
}
if(failed)process.exit(1);
console.log('\nRelease v122 wiring checks passed.');
