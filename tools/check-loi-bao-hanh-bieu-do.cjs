// Biểu đồ "Lỗi bảo hành theo loại" ở tab Thống kê (bản 259): đếm theo số tấm, bỏ lỗi "May tay", lọc theo khoảng ngày.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/const LOI_BO_QUA_BIEU_DO=[^\n]*\n/,/function demLoiBaoHanh\([\s\S]*?\n\}\n/].map(lay).join('\n');
const dmyToIso=v=>{ const m=String(v||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null; };
const ctx={dmyToIso,baoHanhTheoNgay:{}}; vm.createContext(ctx); vm.runInContext(code+';this.f={demLoiBaoHanh};',ctx);
const dem=(a,b)=>{ const r=ctx.f.demLoiBaoHanh(a,b); return {ds:Object.fromEntries(r.ds),tam:r.tam,chuaGhi:r.chuaGhi,thuTu:Array.from(r.ds,x=>x[0])}; };

ctx.baoHanhTheoNgay={
  '01/10/2026':{chiTiet:[{so_luong:2,loi:['May tay','Bẩn áo','Rách bao bì']},{so_luong:1,loi:['May tay']},{so_luong:3,loi:['Bẩn áo']}]},
  '15/10/2026':{chiTiet:[{so_luong:4,loi:'May tay, Rách áo'},{so_luong:2,loi:[]},{so_luong:0,loi:['Gãy']}]},
  '30/11/2026':{chiTiet:[{so_luong:9,loi:['Gãy']}]}
};
// 1) Đếm theo số tấm, mỗi nhãn một lần cho mỗi tấm; bỏ May tay; số tấm vẫn là tổng bảo hành thật
let r=dem('2026-10-01','2026-10-31');
assert.deepEqual(r.ds,{'Bẩn áo':5,'Rách bao bì':2,'Rách áo':4}); assert.equal(r.tam,12); assert.equal(r.chuaGhi,2);
assert.deepEqual(r.thuTu,['Bẩn áo','Rách áo','Rách bao bì']);   // nhiều → ít
assert.ok(!('May tay' in r.ds));
console.log('PASS đếm theo số tấm, bỏ May tay, nhãn chuỗi hoặc mảng, tấm chưa ghi lỗi tách riêng');

// 2) May tay bỏ cả khi viết khác hoa thường / dấu cách thừa
ctx.baoHanhTheoNgay={'01/10/2026':{chiTiet:[{so_luong:3,loi:['  MAY TAY ','Gãy']}]}};
r=dem('2026-10-01','2026-10-01'); assert.deepEqual(r.ds,{'Gãy':3});
console.log('PASS bỏ May tay không phân biệt hoa thường');

// 3) Lọc theo khoảng ngày (gồm cả hai đầu), ngoài khoảng không tính; không có bảo hành thì rỗng
ctx.baoHanhTheoNgay={'01/10/2026':{chiTiet:[{so_luong:1,loi:['Gãy']}]},'31/10/2026':{chiTiet:[{so_luong:2,loi:['Gãy']}]},'01/11/2026':{chiTiet:[{so_luong:5,loi:['Gãy']}]}};
assert.equal(dem('2026-10-01','2026-10-31').ds['Gãy'],3); assert.equal(dem('2026-10-02','2026-10-30').tam,0);
console.log('PASS lọc theo khoảng ngày');

// 4) Giao diện: thẻ, hàm vẽ nối vào renderMonthly, số phiên bản
assert.match(html,/id="loiBaoHanhCard"/); assert.match(html,/id="loiBaoHanhChart"/);
assert.match(html,/chartAnim\('dailyTrendChart'\)[\s\S]{0,400}\n  veBieuDoLoiBaoHanh\(\);\n\}/,'renderMonthly phải gọi vẽ biểu đồ lỗi ở cuối');
assert.match(html,/const APP_VERSION = 259;/); assert.match(html,/raw-data\.js\?v=259/);
console.log('PASS nối giao diện + phiên bản');
