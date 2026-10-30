// Biểu đồ "Lỗi bảo hành theo loại" ở tab Thống kê (bản 259-260): đếm theo số tấm, bỏ lỗi "May tay", lọc theo khoảng ngày,
// bấm cột mở popup chi tiết giống biểu đồ thành phẩm (có thêm cột Ngày).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/const LOI_BO_QUA_BIEU_DO=[^\n]*\n/,/function nhanLoiBaoHanh\([\s\S]*?\n\}\n/,/function demLoiBaoHanh\([\s\S]*?\n\}\n/,
  /function dongBaoHanhTheoLoi\([\s\S]*?\n\}\n/,/function openLoiBaoHanhDetail\([\s\S]*?\n\}\n/].map(lay).join('\n');
const dmyToIso=v=>{ const m=String(v||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null; };
const els={productDetailTitle:{textContent:''},productDetailBody:{innerHTML:''},productDetailModal:{style:{display:'none'}}};
const ctx={dmyToIso,baoHanhTheoNgay:{},thoatHtml:v=>String(v).split('&').join('&amp;').split('<').join('&lt;'),document:{getElementById:id=>els[id]}};
vm.createContext(ctx); vm.runInContext(code+';this.f={demLoiBaoHanh,dongBaoHanhTheoLoi,openLoiBaoHanhDetail};',ctx);
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

// 4) Popup khi bấm cột: các dòng có lỗi đó, ngày mới trước, không lọt May tay, không lọt ngoài khoảng ngày
ctx.baoHanhTheoNgay={
  '01/10/2026':{chiTiet:[{to:'Tổ 1',ten:'Sora',kich_thuoc:'180x15',so_luong:2,loi:['May tay','Bẩn áo'],nguyen_nhan:'Lưu kho',huong_xu_ly:'Thay áo'}]},
  '15/10/2026':{chiTiet:[{to:'Tổ 3',ten:'Luna',kich_thuoc:'160x10',so_luong:3,loi:['Bẩn áo','Rách bao bì'],nguyen_nhan:'Vận chuyển',huong_xu_ly:'Thay bao'},{to:'Tổ 2',ten:'X',kich_thuoc:'1x1',so_luong:1,loi:['May tay']}]},
  '05/11/2026':{chiTiet:[{to:'Tổ 4',ten:'Y',kich_thuoc:'2x2',so_luong:7,loi:['Bẩn áo']}]}
};
const dong=ctx.f.dongBaoHanhTheoLoi('Bẩn áo','2026-10-01','2026-10-31');
assert.deepEqual(Array.from(dong,d=>d.ngay),['15/10/2026','01/10/2026']);
assert.equal(ctx.f.dongBaoHanhTheoLoi('May tay','2026-10-01','2026-10-31').length,0,'May tay không có popup');
ctx.f.openLoiBaoHanhDetail('Bẩn áo','2026-10-01','2026-10-31');
assert.equal(els.productDetailTitle.textContent,'Bẩn áo · 5 tấm · 2 dòng');
assert.equal(els.productDetailModal.style.display,'block');
const b=els.productDetailBody.innerHTML;
assert.ok(b.includes('<th>Ngày</th><th>Tổ</th><th>Sản phẩm</th><th>Kích thước</th><th>SL</th><th>Lỗi</th><th>Nguyên nhân</th><th>Hướng xử lý</th>'),'đủ 8 cột, có Ngày');
assert.ok(b.indexOf('15/10/2026')>=0&&b.indexOf('15/10/2026')<b.indexOf('01/10/2026'),'ngày mới trước');
assert.ok(b.includes('Bẩn áo, Rách bao bì')); assert.ok(!b.includes('May tay')); assert.ok(!b.includes('05/11/2026'));
ctx.f.openLoiBaoHanhDetail('Gãy','2026-10-01','2026-10-31'); assert.ok(els.productDetailBody.innerHTML.includes('Không có dòng chi tiết'));
console.log('PASS popup bấm cột: tiêu đề tấm/dòng, đủ 8 cột có Ngày, ngày mới trước, bỏ May tay, đúng khoảng ngày');

// 5) Giao diện: thẻ, hàm vẽ nối vào renderMonthly, bấm cột mở popup dùng khung của biểu đồ thành phẩm, số phiên bản
assert.match(html,/id="loiBaoHanhCard"/); assert.match(html,/id="loiBaoHanhChart"/);
assert.match(html,/chartAnim\('dailyTrendChart'\)[\s\S]{0,400}\n  veBieuDoLoiBaoHanh\(\);\n\}/,'renderMonthly phải gọi vẽ biểu đồ lỗi ở cuối');
assert.ok(html.includes("onClick:(event,elements)=>{ if(elements.length) openLoiBaoHanhDetail(ds[elements[0].index][0],tuIso,denIso); }"),'bấm cột mở popup');
assert.ok(html.includes("event.native.target.style.cursor=elements.length?'pointer':'default'"));
assert.ok(Number(html.match(/const APP_VERSION = (\d+);/)[1])>=260,'từ bản 260 trở lên');
console.log('PASS nối giao diện + phiên bản');
