// Đợt 3 + 4 giao diện điện thoại cho quản lý (20/10/2026): Tổng thống kê hiện số ngay, lọc nhanh một hàng; các tab quản trị dạng thẻ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
// Đợt 3
for(const x of ['body.mobile-view #panel-monthly #monthlyKpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))','body.mobile-view #moThongKeBtn{display:none;}',
  '#panel-monthly #monthlyKpis{order:2;}','#thanhTienDoQuy{order:3;}','id="nutChonNgayTk"','.capacity-filters.hien-ngay'])
  assert.ok(html.includes(x),'thiếu: '+x);
assert.match(html,/#mainContent:not\(\[style\*="display: none"\]\):has\(#panel-monthly\.active\)\{display:flex!important/);
console.log('PASS Tổng thống kê: số chính hiện ngay (2 cột), thứ tự lọc nhanh → số → tiến độ quý → biểu đồ, ô ngày ẩn sau nút Chọn ngày');
// Đợt 4
for(const x of ['function ganNhanBang()','table.bang-the','table.bang-ngang','data-label','o-tim-nhanh','new MutationObserver(()=>{ clearTimeout(henGanNhan)'])
  assert.ok(html.includes(x),'thiếu: '+x);
assert.match(html,/if\(t\.closest\('\.dd-bang-ngang'\)\) return;/);
console.log('PASS các tab quản trị: bảng ≤6 cột thành thẻ, bảng ma trận cuộn ngang cột đầu dính, danh sách dài có ô tìm nhanh; Điểm danh/Phát sữa giữ thẻ riêng');
// mọi luật mới chỉ trong phạm vi điện thoại
const doan=html.slice(html.indexOf('/* ---- Đợt 3'),html.indexOf('/* Nút "Thêm" nằm chung trong thanh dưới cho khỏi lạc chỗ */',html.indexOf('/* ---- Đợt 3')));
for(const l of doan.split('\n').filter(l=>l.includes('{')&&!l.trim().startsWith('/*')))
  assert.ok(l.trim().startsWith('body.mobile-view')||/^\.(nut-chon-ngay|o-tim-nhanh)\{display:none;\}$/.test(l.trim())||/^\.toast-vuong|^@keyframes (toastVuong|bangTruotLen)/.test(l.trim()),'luật không nằm trong phạm vi điện thoại: '+l.slice(0,100));
console.log('PASS luật mới chỉ áp trong chế độ điện thoại, máy tính không đổi');
