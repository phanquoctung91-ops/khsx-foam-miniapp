// Bảng đặt áo (26/09/2026): mã áo lấy từ BOM (dòng tên bắt đầu "Áo"), số áo = số tấm kế hoạch × định mức;
// nệm cỡ lẻ ghi riêng không cộng vào bảng; mã chưa có BOM ghi riêng; bỏ đơn đã bỏ / phần thiếu tách / bảo hành.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('const laDongAo='), b=html.indexOf('const nhanNgayAo=');
const ctx={
  RONG_CHUAN:[100,120,140,160,180,200,220],
  parseDMY:s=>{const m=String(s).match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m?{d:+m[1],m:+m[2],y:+m[3]}:null;},
  formatDMY:d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,
  khoaNgayDMY:s=>Number(String(s).split('/').reverse().join('')),
  maHangBom:m=>String(m||'').trim().toUpperCase(),
  boDauBom:s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase(),
  lamTronBom:x=>Math.round((Number(x)||0)*1000)/1000,
  formatKichThuoc:o=>`${o.ngang}x${o.dai}x${o.day}`,
  bomTheoMa:{
    'HYB20-6':[{ma_vt:'AL20-3',ten_vt:'ÁO LƯỚI 20CM-1m6',dinh_muc:1},{ma_vt:'ANHYB20-6',ten_vt:'Áo nệm Thuần Việt Hybrid (20cm/160cmx200cm)',dinh_muc:1},{ma_vt:'MD30Đ-1016',ten_vt:'MÚT D30 ĐEN',dinh_muc:1}],
    'STD20-4':[{ma_vt:'ANSTD20-4',ten_vt:'Áo nệm Thuần Việt Standard (20cm/140cmx200cm)',dinh_muc:1},{ma_vt:'TN5z20-3',ten_vt:'Túi PVC',dinh_muc:1}],
    'LAGO10-6':[{ma_vt:'ANLAGO10-6',ten_vt:'Áo nệm Việt Nhật Latex Gold (10cm/160cmx200cm)',dinh_muc:1}]
  },
  _don:[
    {date:'26/09/2026',ma:'HYB20-6',ngang:'160',dai:'200',day:'20',so_luong:2},
    {date:'26/09/2026',ma:'STD20-4',ngang:'140',dai:'200',day:'20',so_luong:5},
    {date:'28/09/2026',ma:'STD20-4',ngang:'140',dai:'200',day:'20',so_luong:3},
    {date:'26/09/2026',ma:'LAGO10-6',ngang:'143',dai:'197',day:'10',so_luong:1},
    {date:'26/09/2026',ma:'KH12-2',ngang:'120',dai:'200',day:'12',so_luong:1},
    {date:'26/09/2026',ma:'STD20-4',ngang:'140',dai:'200',day:'20',so_luong:4,is_drop:true},
    {date:'26/09/2026',ma:'STD20-4',ngang:'140',dai:'200',day:'20',so_luong:9,is_ghost:true}
  ]
};
ctx.getOrders=()=>ctx._don;
vm.createContext(ctx); vm.runInContext(html.slice(a,b),ctx);
const kq=JSON.parse(JSON.stringify(ctx.tinhDonDatAo('26/09/2026','28/09/2026')));
assert.deepEqual(kq.ngayCot,['26/09/2026','28/09/2026'],'Cột ngày phải bỏ Chủ nhật 27/09');
assert.deepEqual(kq.dongHang.map(r=>[r.ma,r.ten,r.theoNgay,r.tong]),[
  ['AL20-3','ÁO LƯỚI 160x20',{'26/09/2026':2},2],['ANHYB20-6','Áo Hybrid 160x20',{'26/09/2026':2},2],['ANSTD20-4','Áo Standard 140x20',{'26/09/2026':5,'28/09/2026':3},8]]);
console.log('PASS tên áo rút gọn "loại áo + rộng x dày"; mã áo lấy từ BOM (cả áo lưới + áo nệm), không lấy túi / mút; số áo theo từng ngày; bỏ phần thiếu tách và đơn đã bỏ');
assert.deepEqual(kq.coLe.map(r=>[r.ma,r.ten,r.tong]),[['ANLAGO10-6','Áo Latex Gold 143x197x10',1]]);
console.log('PASS nệm cỡ lẻ 143x197 ghi riêng, không cộng vào bảng');
assert.deepEqual(kq.thieuBom,{'KH12-2':1});
console.log('PASS mã chưa có BOM ghi riêng');
assert.equal(kq.tongChung,12);
console.log('PASS tổng 12 áo');
