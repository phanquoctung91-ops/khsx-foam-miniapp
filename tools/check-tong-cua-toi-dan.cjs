// Ô "Tháng này / Tất cả" ở đầu màn hình nhân viên (bản 258): khớp tab Năng lực (cộng bảo hành), có cả Dán.
// Test này kiểm cách nối: ô phải gọi đúng hàm của tab Năng lực và lấy đúng cột; bản thân hàm tính của tab đã có test riêng.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..'.concat('/index.html')),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/let employeeMyTotalCtx=[^\n]*\n/,/function toTongCuaToiDan\([\s\S]*?\n\}\n/,/function tinhTongCuaToi\([\s\S]*?\n\}\n/,/function veTongCuaToiHtml\([\s\S]*?\n\}\n/].map(lay).join('\n');

let toHienTai=null,boxHtml='',goi=[],duLieuCaNhan,rowsDan;
const box={set innerHTML(v){boxHtml=v;},get innerHTML(){return boxHtml;}};
const ctx={thoatHtml:s=>String(s),toCuaToi:()=>toHienTai,normHeaderText:s=>String(s||'').trim().toLowerCase(),
  KhsxCapacityCore:{vietnamToday:()=>'2026-10-28'},
  supabaseWorkers:[{id:'W1',display_name:'Nguyễn Thị A'}],
  document:{getElementById:id=>id==='employeeMyTotal'?box:null},
  tinhNangLucToDan:(tu,den,opt)=>{ goi.push(['dan',tu,den,!!(opt&&opt.xuat)]); return rowsDan(tu,den,opt); },
  duLieuNangLucCaNhan:(cd,tu,den)=>{ goi.push([cd,tu,den]); return duLieuCaNhan; }};
vm.createContext(ctx); vm.runInContext(code+';this.f={toTongCuaToiDan,tinhTongCuaToi,veTongCuaToiHtml,set:c=>{employeeMyTotalCtx=c;}};',ctx);
const F=ctx.f;

// 1) Tổ của tài khoản Dán
toHienTai='Tổ 2'; assert.equal(F.toTongCuaToiDan(),'Tổ 2');
toHienTai='Tổ may'; assert.equal(F.toTongCuaToiDan(),null);
toHienTai=null; assert.equal(F.toTongCuaToiDan(),null);
console.log('PASS toTongCuaToiDan: chỉ nhận Tổ 1–5');

// 2) Dán: lấy cột tong (đã gồm bảo hành) của tab Năng lực; tất cả = toàn lịch sử, tháng = 01–31 tháng này, xuat:true
const bang=[{team:'Tổ 1',tong:100},{team:'Tổ 2',tong:250},{team:'Tổ 3',tong:30}];
rowsDan=(tu,den,opt)=>opt&&opt.xuat?bang.map(r=>({...r,tong:r.tong/10})):bang;
let c=F.tinhTongCuaToi({stage:'dan',to:'Tổ 2'});
assert.equal(c.allQty,250); assert.equal(c.monthQty,25); assert.equal(c.nhan,'Tổ 2');
assert.deepEqual(goi[0],['dan',0,99991231,false]); assert.deepEqual(goi[1],['dan',20261001,20261031,true]);
c=F.tinhTongCuaToi({stage:'dan',to:null}); assert.equal(c.allQty,380); assert.equal(c.nhan,'Cả Dán');
console.log('PASS Dán: cột tong của tab Năng lực; tất cả toàn lịch sử, tháng 01–31; không gắn tổ thì cộng 3 tổ');

// 3) May/Đóng gói: dòng của đúng người (khớp tên), tất cả = tong, tháng = sản lượng + bảo hành tháng
duLieuCaNhan={rows:[{name:'Trần B',soLuong:7,baoHanh:1,tong:70},{name:'nguyễn thị a',soLuong:40,baoHanh:5,tong:900}]};
c=F.tinhTongCuaToi({stage:'may',workerId:'W1'});
assert.equal(c.allQty,900); assert.equal(c.monthQty,45);
assert.deepEqual(goi[goi.length-1],['may',20261001,20261031]);
c=F.tinhTongCuaToi({stage:'dong_goi',workerId:'W9'}); assert.equal(c.allQty,0); assert.equal(c.monthQty,0);
console.log('PASS May/Đóng gói: tong của tab Năng lực, tháng = sản lượng + bảo hành, người chưa có công = 0');

// 4) Bảng công chưa về → "Đang tải…", không hiện 0
duLieuCaNhan={rows:[],chuaCoDuLieu:true};
F.set({stage:'may',workerId:'W1'}); F.veTongCuaToiHtml(); assert.match(boxHtml,/Đang tải/);
duLieuCaNhan={rows:[{name:'Nguyễn Thị A',soLuong:40,baoHanh:5,tong:900}]};
F.veTongCuaToiHtml(); assert.match(boxHtml,/Tháng này/); assert.match(boxHtml,/>45</); assert.match(boxHtml,/>900</); assert.doesNotMatch(boxHtml,/employee-my-total-to/);
F.set({stage:'dan',to:'Tổ 2'}); F.veTongCuaToiHtml(); assert.match(boxHtml,/employee-my-total-to">Tổ 2</);
console.log('PASS hiển thị: Đang tải khi chưa có bảng công, nhãn tổ chỉ ở Dán');

// 5) Nối giao diện: không còn tải riêng từ bảng công; ô dựng cho Dán; vẽ lại khi bảng công về
assert.doesNotMatch(html,/taiTongCuaToi|employeeMyTotalCache/,'phải bỏ đường tải riêng (nguồn lệch tab Năng lực)');
assert.match(html,/myTotalWorkerId\|\|myTotalDan\?'<div id="employeeMyTotal"/);
assert.match(html,/employeeMyTotalCtx=myTotalWorkerId\?\{stage,workerId:myTotalWorkerId\}:\(myTotalDan\?\{stage,to:toTongCuaToiDan\(\)\}:null\)/);
assert.match(html,/supabaseStageCredits=credits;[\s\S]{0,400}veTongCuaToiHtml\(\)/);
assert.match(html,/\.employee-my-total-to\{/);
console.log('PASS nối giao diện');
