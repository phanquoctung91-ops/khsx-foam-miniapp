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
  assert.ok(l.trim().startsWith('body.mobile-view')||l.trim().startsWith('@keyframes bangTruotLen')||l.trim().startsWith('body.mobile-view'),'luật không nằm trong phạm vi điện thoại: '+l.slice(0,100));
console.log('PASS luật mới chỉ áp trong chế độ điện thoại, máy tính không đổi');
