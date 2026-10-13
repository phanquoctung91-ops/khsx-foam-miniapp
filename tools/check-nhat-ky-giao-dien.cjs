// Nhật ký nhập liệu (bản 243): dựng bảng từ index.html trong node:vm, kiểm nhóm Tổ 1→5, lọc, cột người, đối soát.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const a=html.indexOf('const NK_CD='), b=html.indexOf('function nkVe(){'); assert.ok(a>0&&b>a,'không thấy khối nhật ký');
const code=html.slice(a,b);
const thoat=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ctx={thoatHtml:thoat,document:{getElementById:()=>null},supabaseDb:null,currentUser:null,PUBLIC_VIEW_MODE:false,dmyToIso:x=>x,homNayIso:()=>'2026-10-12'};
vm.createContext(ctx); vm.runInContext(code+';this.nkSt=nkSt;this.nkVeMotBang=nkVeMotBang;this.nkDongDaLoc=nkDongDaLoc;this.nkNhieu=nkNhieu;',ctx);
const R=(stage,to,gio,cu,moi,op,nguoi,extra={})=>({id:Math.random(),changed_at:`2026-10-12T${gio}:00+07:00`,order_id:'O1',stage,kpi_team:to,cu,moi,op,nguoi,ma:'LAGO10-6',ten:'Latex Gold',rong:160,dai:200,...extra});
ctx.nkSt.ngay='2026-10-12';
ctx.nkSt.dong=[
  R('dan','To 2','10:00',null,15,'insert','Thế Quyền'),
  R('dan','To 2','11:00',15,12,'update','Thế Quyền'),
  R('dan','To 4','09:00',null,3,'insert','(hệ thống)'),
  R('dan','To 3','09:30',null,0,'insert','Duy Khương'),                       // về 0: ẩn mặc định
  R('may','To 2','10:30',null,15,'insert','Phan Quốc Tùng - Trưởng nhóm',{hoan_thanh:'Bảo Chăm'}),
  R('dong_goi','To 2','12:00',5,null,'delete','Phan Quốc Tùng - Trưởng nhóm',{hoan_thanh:'Tấn Lộc'})];
ctx.nkSt.doiSoat={dan:{nhat_ky:12,kpi:12},may:{nhat_ky:15,kpi:15},dong_goi:{nhat_ky:0,kpi:0}};
const dem=(h,re)=>(h.match(re)||[]).length;
// bảng đóng: chỉ có tiêu đề + tóm tắt, chưa xổ
ctx.nkSt.mo.dan=false; let h=ctx.nkVeMotBang('dan');
assert.ok(!h.includes('<table'),'mặc định đóng: chưa xổ bảng'); assert.match(h,/<b>4<\/b> lần ghi/); assert.match(h,/gần nhất <b>11:00<\/b> · Thế Quyền/);
console.log('PASS bảng mặc định đóng, chỉ hiện tóm tắt (số lần ghi, giờ và người gần nhất)');
// xổ ra: Tổ 1 → 5 từ trên xuống, đủ 5 nhóm kể cả tổ chưa nhập
ctx.nkSt.mo.dan=true; h=ctx.nkVeMotBang('dan');
const nhom=[...h.matchAll(/<tr class="to"><td colspan="\d">(Tổ \d)/g)].map(x=>x[1]); assert.deepEqual(nhom,['Tổ 1','Tổ 2','Tổ 3','Tổ 4','Tổ 5']);
assert.ok(h.includes('Chưa có nhập trong ngày'),'tổ chưa nhập vẫn hiện dòng báo');
assert.ok(h.indexOf('Tổ 2<span>')<h.indexOf('Tổ 4<span>'));
assert.equal(dem(h,/<td class="gio"/g),2,'ẩn mặc định: chỉ còn 2 dòng của Thế Quyền (ẩn dòng hệ thống và dòng về 0)');
assert.ok(!h.includes('Người hoàn thành'),'Dán không có cột người hoàn thành');
console.log('PASS Dán: nhóm Tổ 1→5 đủ 5 nhóm, ẩn dòng về 0, không có cột người hoàn thành');
// trong tổ: cũ → mới theo giờ; đảo bằng công tắc
let g=[...h.matchAll(/class="gio" title="[^"]*">(\d\d:\d\d)/g)].map(x=>x[1]); assert.deepEqual(g,['10:00','11:00'],'Tổ 2: 10:00 rồi 11:00 (cũ → mới)');
ctx.nkSt.loc.dan.moiTruoc=true; h=ctx.nkVeMotBang('dan'); g=[...h.matchAll(/class="gio" title="[^"]*">(\d\d:\d\d)/g)].map(x=>x[1]); assert.deepEqual(g,['11:00','10:00']); ctx.nkSt.loc.dan.moiTruoc=false;
// lọc nhanh
ctx.nkSt.loc.dan.to='To 4'; assert.equal(ctx.nkDongDaLoc('dan').length,0,'Tổ 4 chỉ có dòng hệ thống: bị ẩn mặc định'); ctx.nkSt.loc.dan.an=false; assert.equal(ctx.nkDongDaLoc('dan').length,1); ctx.nkSt.loc.dan.an=true; ctx.nkSt.loc.dan.to='';
ctx.nkSt.loc.dan.an=false; assert.equal(ctx.nkDongDaLoc('dan').length,4,'tắt ẩn: thấy cả dòng về 0'); ctx.nkSt.loc.dan.an=true;
ctx.nkSt.loc.dan.loai='update'; assert.equal(ctx.nkDongDaLoc('dan').length,1); ctx.nkSt.loc.dan.loai='';
ctx.nkSt.loc.dan.q='quyền'; assert.equal(ctx.nkDongDaLoc('dan').length,2,'tìm theo tên người'); ctx.nkSt.loc.dan.q='';
console.log('PASS lọc nhanh: theo tổ, loại, ẩn dòng 0/hệ thống, tìm tên; đảo thứ tự giờ');
// May / Đóng gói có thêm cột người hoàn thành
ctx.nkSt.mo.may=true; ctx.nkSt.mo.dong_goi=true;
const may=ctx.nkVeMotBang('may'), dg=ctx.nkVeMotBang('dong_goi');
assert.ok(may.includes('Người hoàn thành')&&may.includes('Bảo Chăm')); assert.ok(dg.includes('Tấn Lộc'));
assert.match(dg,/<span class="giam">xóa<\/span>/,'dòng xóa hiện rõ');
console.log('PASS May và Đóng gói: có cột người hoàn thành; dòng xóa hiện rõ');
// đối soát
assert.match(h,/✓ Tổng nhật ký 12 = tổng tiến độ đã lưu 12/);
ctx.nkSt.doiSoat.dan={nhat_ky:12,kpi:20}; h=ctx.nkVeMotBang('dan'); assert.match(h,/⚠ Lệch: nhật ký 12, tiến độ đã lưu 20/);
console.log('PASS đối soát: khớp hiện ✓, lệch hiện ⚠ đỏ');
// chống chèn mã: tên người có ký tự đặc biệt được thoát
ctx.nkSt.dong.push(R('dan','To 1','08:00',null,2,'insert','<b>x</b>')); h=ctx.nkVeMotBang('dan'); assert.ok(!h.includes('<b>x</b>')&&h.includes('&lt;b&gt;x&lt;/b&gt;'));
console.log('PASS tên người được thoát HTML (không chèn mã được)');
