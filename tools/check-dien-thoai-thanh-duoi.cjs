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
assert.match(html,/body\.mobile-view\.dang-go #mainTabs/); assert.match(html,/function capNhatDangGo\(\)/); assert.match(html,/setInterval\(capNhatDangGo,800\)/);
console.log('PASS đang gõ thì hạ thanh dưới xuống');
// bản máy tính không bị đổi: mọi luật bảng trượt nằm trong body.mobile-view
for(const l of html.split('\n').filter(l=>/\.more-sheet|\.ms-it|dang-chon/.test(l)&&l.includes('{')&&!l.includes('const')&&!l.includes('classList')&&!l.includes('querySelector')&&!l.includes('innerHTML')))
  assert.ok(/body\.mobile-view|^\s*\.more-sheet-bg\{display:none;\}/.test(l),'luật không nằm trong phạm vi điện thoại: '+l.slice(0,90));
console.log('PASS luật bảng trượt chỉ áp trong chế độ điện thoại, máy tính không đổi');

// Lỗi 20/10/2026: nhập số vào ô D/M/Đ xong, thanh dưới biến mất mãi vì ô nhập bị xoá lúc rời ô nên sự kiện rời ô không tới được.
// Giờ dựa vào trạng thái (ô nào đang giữ con trỏ), có lưới an toàn 0,8 giây.
const vm=require('node:vm');
const a1=html.indexOf("const O_NHAP_GO="), b1=html.indexOf("function capNhatDangGo(){"), c1=html.indexOf("['focusin','focusout'",b1);
assert.ok(a1>0&&b1>a1&&c1>b1);
const cls=new Set(); let act=null;
const mk=(tag,type,conn=true)=>({tagName:tag,isConnected:conn,matches:sel=>{ if(sel===undefined) return false; return sel.includes('textarea')&&tag==='TEXTAREA'||(tag==='INPUT'&&!['checkbox','radio','button','submit','file','date','color'].includes(type)&&sel.startsWith('textarea,input')); }});
const body={classList:{toggle:(c,on)=>on?cls.add(c):cls.delete(c),contains:c=>c==='mobile-view'?true:cls.has(c)}};
const ctx={document:{body,get activeElement(){return act;}}};
vm.createContext(ctx); vm.runInContext(html.slice(a1,c1)+';this.cap=capNhatDangGo;',ctx);
act=mk('INPUT','number'); ctx.cap(); assert.ok(cls.has('dang-go'),'gõ số: phải hạ thanh dưới');
act=mk('INPUT','number',false); ctx.cap(); assert.ok(!cls.has('dang-go'),'ô đã bị xoá khỏi trang: phải hiện lại thanh dưới (lỗi 20/10)');
act=mk('INPUT','text'); ctx.cap(); assert.ok(cls.has('dang-go')); act=body; ctx.cap(); assert.ok(!cls.has('dang-go'),'bấm ra ngoài: phải hiện lại');
act=mk('BUTTON',''); ctx.cap(); assert.ok(!cls.has('dang-go'),'nút bấm không được hạ thanh dưới');
act=mk('INPUT','checkbox'); ctx.cap(); assert.ok(!cls.has('dang-go'),'ô tick không hạ thanh dưới');
console.log('PASS thanh dưới hiện lại khi ô nhập bị xoá lúc rời ô, bấm ra ngoài, hoặc con trỏ ở nút (lỗi 20/10 đã chặn)');
// Thanh "✓ Xong" trên bàn phím số: có cả cho ô gõ số D/M/Đ (ct-nhap) và tự ẩn khi ô đã bị xoá khỏi trang.
assert.match(html,/classList\.contains\('stage-qty-input'\)\|\|e\.target\.classList\.contains\('ct-nhap'\)/);
assert.match(html,/!cur \|\| !cur\.isConnected \|\| document\.activeElement!==cur/);
console.log('PASS thanh ✓ Xong hiện cả với ô D/M/Đ và tự ẩn khi ô không còn giữ con trỏ');
