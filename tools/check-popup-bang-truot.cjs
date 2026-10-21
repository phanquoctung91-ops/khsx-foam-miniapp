// Đợt 1 giao diện điện thoại (21/10/2026): 7 popup nhóm capacity-modal thành bảng trượt từ đáy; máy tính giữ hộp giữa trang.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const ids=['stageChoiceModal','chonToModal','suaDonModal','donKiemTraModal','sheetXemTruocModal','thongKeModal','speedDetailModal'];
for(const id of ids) assert.match(html,new RegExp('<div id="'+id+'" class="capacity-modal"'),'popup không còn dùng lớp capacity-modal: '+id);
console.log('PASS cả 7 popup (Chọn công đoạn, Chọn tổ, Sửa đơn, Đơn cần kiểm tra, Xem trước Sheet, Chi tiết thống kê, Chi tiết tốc độ quý) cùng dùng lớp capacity-modal');
for(const x of ['body.mobile-view .capacity-modal .capacity-dialog{','position:absolute;left:0;right:0;bottom:0;width:100%;max-width:none!important','border-radius:22px 22px 0 0','max-height:90%','@keyframes bangTruotLen',
  '.capacity-dialog::before{content:\'\';display:block;width:42px;height:5px','min-height:44px;min-width:76px','input[type="date"],input[type="search"],select,textarea){min-height:46px;font-size:16px;}','.sua-don-luoi{grid-template-columns:repeat(6,minmax(0,1fr))'])
  assert.ok(html.includes(x),'thiếu: '+x);
console.log('PASS bảng trượt từ đáy: rộng đủ màn, bo góc trên, cao tối đa 90%, thanh nắm, nút Đóng 44px, ô nhập 46px chữ 16px, lưới Sửa đơn 6 cột');
// mọi luật mới nằm trong phạm vi điện thoại
const a=html.indexOf('/* ---- Đợt 1: popup nhóm capacity-modal'), b=html.indexOf('/* Nút "Thêm" nằm chung trong thanh dưới cho khỏi lạc chỗ */',a);
for(const l of html.slice(a,b).split('\n').filter(l=>l.includes('{')&&!l.trim().startsWith('/*')&&!l.trim().startsWith('position:')&&!l.trim().startsWith('max-height')&&!l.trim().startsWith('padding:')))
  assert.ok(l.trim().startsWith('body.mobile-view')||l.trim().startsWith('@keyframes bangTruotLen')||/^@(supports|starting-style|media \(prefers-reduced-motion)/.test(l.trim())||l.trim().startsWith('body.mobile-view'),'luật không nằm trong phạm vi điện thoại: '+l.slice(0,100));
console.log('PASS luật mới chỉ áp trong chế độ điện thoại, máy tính không đổi');
// Hiệu ứng mượt (21/10/2026): nền mờ dần, hộp trượt cả chiều cao với đường cong êm, CÓ hiệu ứng lúc đóng; máy chưa hỗ trợ thì giữ hiệu ứng ngắn cũ.
for(const x of ['@supports (transition-behavior:allow-discrete){','transition:opacity .28s ease,display .3s allow-discrete;','transition:transform .34s cubic-bezier(.32,.72,0,1)','@starting-style{','transform:translateY(100%);transition-duration:.26s','@media (prefers-reduced-motion:reduce){'])
  assert.ok(html.includes(x),'thiếu: '+x);
// đủ 4 nhóm nền và 4 loại hộp được phủ hiệu ứng
const khoi=html.slice(html.indexOf('@supports (transition-behavior:allow-discrete){'));
for(const x of ['.capacity-modal','#tachDonModal','.more-sheet-bg','.don-sheet-bg','.capacity-modal .capacity-dialog','#tachDonModal > div','.more-sheet','.don-sheet']) assert.ok(khoi.includes('body.mobile-view '+x),'chưa phủ hiệu ứng: '+x);
// bẫy độ ưu tiên: :is() lấy độ ưu tiên của id mạnh nhất, không được gộp #tachDonModal vào :is() cùng các lớp ở luật nền/đóng (làm hỏng hiệu ứng đóng của các bảng khác)
assert.ok(!/:is\([^)]*#tachDonModal[^)]*\)\s*\{opacity:1/.test(khoi),'gộp #tachDonModal vào :is() ở luật nền');
assert.ok(/body\.mobile-view \.more-sheet-bg:not\(\.on\),body\.mobile-view \.don-sheet-bg:not\(\.on\)\{opacity:0;pointer-events:none;\}/.test(khoi));
console.log('PASS hiệu ứng mượt: nền mờ dần, hộp trượt từ đáy với đường cong êm, có hiệu ứng khi đóng, tôn trọng chế độ giảm chuyển động, không dính bẫy độ ưu tiên');
