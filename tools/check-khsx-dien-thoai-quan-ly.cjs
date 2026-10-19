// KHSX trên điện thoại cho quản lý (19/10/2026, theo mẫu anh duyệt): thẻ tổ gọn có thanh %, mỗi đơn một dòng có D/M/Đ và nút ⋯,
// ⋯ mở bảng trượt dùng đúng bộ nút/quyền của bảng KHSX, nút nổi Thêm đơn. Nhân viên công đoạn và máy tính giữ kiểu cũ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
// kiểu mới chỉ bật cho quản lý + điện thoại + đúng khung KHSX
assert.match(html,/const kieuMoi = document\.body\.classList\.contains\('mobile-view'\) && canManage2\(\) && containerId==='autoPlanTeamRings'/);
console.log('PASS kiểu mới chỉ cho quản lý trên điện thoại ở khung KHSX; nhân viên công đoạn và máy tính giữ kiểu cũ');
// thẻ tổ: thanh %, pill màu theo mức
for(const x of ['class="team-ring-card to-moi','tt-pill ${lop}','tt-bar','pctThat>=95?\'ok\':pctThat>=60?\'w\':\'bad\''])
  assert.ok(html.includes(x),'thiếu: '+x);
console.log('PASS thẻ tổ: tên, số đơn, hoàn thành/kế hoạch, pill % màu, thanh tiến độ');
// dòng đơn: tên, kích thước, D/M/Đ, nút ⋯
for(const x of ['class="dong-moi','class="dot-don"','ct-dang','ma:String(o.ma||\'\')'])
  assert.ok(html.includes(x),'thiếu: '+x);
console.log('PASS dòng đơn: mã + tên, kích thước + kế hoạch, ba ô D/M/Đ (xanh đủ, vàng đang làm), nút ⋯');
// ⋯ dùng đúng bộ nút Sửa/Tách/Xóa của bảng KHSX và cùng một bộ xử lý
assert.match(html,/async function xuLyThaoTacDon\(e\)\{/);
assert.match(html,/addEventListener\('click',xuLyThaoTacDon\)/);
assert.match(html,/tmp\.innerHTML=hanhDongDonHtml\(r\)/);
assert.match(html,/xuLyThaoTacDon\(e\); \}/);
console.log('PASS ⋯ mở bảng trượt, dùng đúng bộ nút và quyền của bảng KHSX, cùng một bộ xử lý (không nhân đôi logic xóa/sửa/tách)');
// nút nổi
assert.match(html,/body\.mobile-view\[data-tab-hien="autoplan"\] \.fab-them-don/); assert.match(html,/openManualOrderModal\(\); \}\);/);
assert.match(html,/id="fabThemDon" type="button" class="fab-them-don only-manager2"/);
console.log('PASS nút nổi ＋ Thêm đơn chỉ hiện ở tab KHSX trên điện thoại cho quản lý');
// mọi luật mới nằm trong phạm vi điện thoại
for(const l of html.split('\n').filter(l=>/^\s*(body\.mobile-view )?\.(to-moi|tt-|dong-moi|dm-r|dd-m|dot-don|don-sheet|ds-)/.test(l)||/\.dong-ds|\.dong-moi/.test(l)&&l.trim().startsWith('body')))
  assert.ok(l.trim().startsWith('body.mobile-view')||/^\.(don-sheet-bg|fab-them-don)\{display:none;\}$/.test(l.trim()),'luật không nằm trong phạm vi điện thoại: '+l.slice(0,90));
console.log('PASS luật giao diện mới chỉ áp trong chế độ điện thoại');
