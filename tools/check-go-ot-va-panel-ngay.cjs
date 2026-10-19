// Gỡ "Ghi nhận OT" và panel "Theo ngày" không còn tab (19/10/2026): giao diện, mã, truy vấn đều sạch; phần còn lại vẫn nguyên.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
for(const x of ['overtimeBtn','overtimePanel','overtimeWorkers','saveOvertimeBtn','khsx_overtime_records','overtimeRecords','renderOvertimePanel','gioCaTheoOT','maxOvertimeHoursForDay','capacityForOtHours','Ghi nhận OT','.overtime-'])
  assert.ok(!html.includes(x),'còn sót: '+x);
console.log('PASS không còn dấu vết chức năng Ghi nhận OT trong index.html');
for(const x of ['panel-daily','dayStageChart','dayTable','id="dayKpis"','id="daySelect"','renderDay(','populateDaySelect','id="searchBox"'])
  assert.ok(!html.includes(x),'còn sót: '+x);
console.log('PASS không còn panel "Theo ngày" (không có tab nào dẫn tới) và mã vẽ riêng của nó');
// không có tab nào trỏ tới panel không tồn tại
const tabs=[...html.matchAll(/data-tab="([a-z]+)"/g)].map(m=>m[1]);
for(const t of new Set(tabs)) assert.ok(html.includes('id="panel-'+t+'"'),'tab không có panel: '+t);
const panels=[...html.matchAll(/class="panel(?: active)?" id="panel-([a-z]+)"/g)].map(m=>m[1]);
for(const p of panels) assert.ok(tabs.includes(p),'panel không có tab: '+p);
console.log('PASS mọi tab đều có panel và mọi panel đều có tab ('+panels.join(', ')+')');
// tốc độ quý vẫn dùng năng lực mặc định 150
assert.match(html,/const NANG_LUC_NGAY_MAC_DINH=150;/); assert.match(html,/const availableCapacity=NANG_LUC_NGAY_MAC_DINH;/);
console.log('PASS năng lực cảnh báo tốc độ quý giữ 150 tấm/ngày');
// migration gỡ bảng OT
const m=fs.readFileSync(path.resolve(__dirname,'..','supabase/migrations/20261019090000_go_ghi_nhan_ot.sql'),'utf8');
assert.match(m,/drop table if exists public\.khsx_overtime_records;/); assert.match(m,/overtime_manage/);
console.log('PASS migration gỡ bảng và quyền overtime_manage');
