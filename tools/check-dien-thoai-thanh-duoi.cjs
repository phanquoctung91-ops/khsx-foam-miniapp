// Thanh dưới và cửa sổ Telegram trên điện thoại (19/10/2026): khóa vuốt xuống, chặn nảy trang, ☰ Thêm mở bảng trượt, ẩn thanh khi gõ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
assert.match(html,/disableVerticalSwipes==='function'\) TELEGRAM_WEBAPP\.disableVerticalSwipes\(\)/,'chưa khóa vuốt xuống của Telegram');
assert.match(html,/html\{overflow-x:hidden;overscroll-behavior-y:none;\}/); assert.match(html,/body\{overflow-x:hidden;overscroll-behavior-y:none;\}/);
console.log('PASS khóa vuốt xuống của Telegram (có kiểm tra máy hỗ trợ) và chặn nảy trang');
assert.match(html,/touch-action:manipulation/);
assert.match(html,/--tg-safe-area-inset-bottom/); assert.match(html,/--tg-content-safe-area-inset-top/);
console.log('PASS dùng vùng an toàn của Telegram cho thanh dưới và đầu trang; bỏ độ trễ bấm');
// thanh dưới: cao 60px, chữ 11px; mục phụ không còn trong thanh, mở bằng bảng trượt
assert.match(html,/padding:6px 2px;height:60px;font-size:11px/);
assert.match(html,/\.tab-btn\.tab-extra:not\(\[data-tab="capacity"\]\)\{\s*display:inline-flex!important;position:absolute;width:0;height:0/);
assert.match(html,/id="moreSheetBg"/); assert.match(html,/function veBangThem\(\)/);
assert.match(html,/if\(document\.body\.classList\.contains\('mobile-view'\)\)\{\s*const bg=document\.getElementById\('moreSheetBg'\)/);
console.log('PASS ☰ Thêm trên điện thoại mở bảng trượt thay cho dải vuốt ngang; thanh dưới to hơn');
// ẩn thanh khi gõ
assert.match(html,/body\.mobile-view\.dang-go #mainTabs/); assert.match(html,/classList\.add\('dang-go'\)/);
console.log('PASS đang gõ thì hạ thanh dưới xuống');
// bản máy tính không bị đổi: mọi luật bảng trượt nằm trong body.mobile-view
for(const l of html.split('\n').filter(l=>/\.more-sheet|\.ms-it|dang-chon/.test(l)&&l.includes('{')&&!l.includes('const')&&!l.includes('classList')&&!l.includes('querySelector')&&!l.includes('innerHTML')))
  assert.ok(/body\.mobile-view|^\s*\.more-sheet-bg\{display:none;\}/.test(l),'luật không nằm trong phạm vi điện thoại: '+l.slice(0,90));
console.log('PASS luật bảng trượt chỉ áp trong chế độ điện thoại, máy tính không đổi');
