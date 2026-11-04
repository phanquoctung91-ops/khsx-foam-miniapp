// Thu hồi tài khoản: người điểm danh hết hiện từ an_tu_ngay, lịch sử (ngày có điểm danh/ghi chú) vẫn hiện.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
assert.ok(html.includes("select('id,ten,chuc_vu,to_lam,viec_lam,con_dung,an_tu_ngay')"),'phải tải cột an_tu_ngay');
const m=html.match(/  const dangDung=p=>[^\n]*\n  ddNguoi=[^\n]*\n/); assert.ok(m,'không thấy bộ lọc người điểm danh');
const chay=(ngay,ddDong,ddGhiChu)=>{ const ctx={ngay,ddDong,ddGhiChu,n:{data:[{id:'a',con_dung:true,an_tu_ngay:'2026-11-05'},{id:'b',con_dung:true,an_tu_ngay:null},{id:'c',con_dung:false,an_tu_ngay:null}]},ddNguoi:null}; vm.runInNewContext(m[0],ctx); return ctx.ddNguoi.map(p=>p.id+(p.nghi?'*':'')).join(','); };
assert.equal(chay('2026-11-04',{},{}),'a,b','trước an_tu_ngay vẫn hiện, người đã ẩn (c) không hiện');
assert.equal(chay('2026-11-05',{},{}),'b','từ an_tu_ngay không hiện');
assert.equal(chay('2026-11-09',{},{}),'b');
assert.equal(chay('2026-11-09',{a:{}},{}),'a*,b','ngày có điểm danh thì vẫn hiện (chỉ xem, nghi)');
assert.equal(chay('2026-11-09',{},{a:'x'}),'a*,b','ngày có ghi chú thì vẫn hiện');
const sql=fs.readFileSync(path.resolve(__dirname,'..','supabase/migrations/20261104100000_diem_danh_an_theo_tai_khoan.sql'),'utf8');
assert.match(sql,/after update of active on public\.khsx_profiles/); assert.match(sql,/Asia\/Ho_Chi_Minh/); assert.match(sql,/an_tu_ngay = null/);
console.log('PASS điểm danh ẩn theo tài khoản thu hồi: từ an_tu_ngay hết hiện, lịch sử còn, khôi phục thì hiện lại');
