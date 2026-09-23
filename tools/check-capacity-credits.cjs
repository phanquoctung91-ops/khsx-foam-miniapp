// Năng lực May/Đóng gói theo người: khi bảng công (khsx_stage_credits) chưa có trong bộ nhớ thì
// phải báo "chưa có dữ liệu", KHÔNG được rơi xuống nhánh dự phòng ra con số nửa đúng nửa sai.
// Lỗi thật 23/09/2026: tab Năng lực hiện May kỳ 0, lịch sử 2.682 — số đúng là 1.842 / 4.846.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');

const lay=(ten)=>{
  const i=html.indexOf(`function ${ten}(`);
  assert.ok(i>=0,`Không tìm thấy hàm ${ten}`);
  let sau=0,j=html.indexOf('){',i)+1;   // bo qua ngoac nhon cua tham so mac dinh
  for(let k=j;k<html.length;k++){ if(html[k]==='{')sau++; else if(html[k]==='}'){ sau--; if(!sau) return html.slice(i,k+1); } }
};

const don={id:'d1',date:'10/09/2026',is_warranty:false};
const ctx={
  SUPABASE_VARIANT:true,
  supabaseStageCredits:[],
  supabaseWorkers:[{id:'loan_anh',display_name:'Loan Anh'},{id:'minh_thuan',display_name:'Minh Thuận'}],
  WARRANTY_LEGACY_ACTOR_CUTOFF:20260826,
  WARRANTY_LEGACY_MAY_BY_TEAM:{'Tổ 1':'Thảo Vy'},
  baoHanhTheoNgay:{},
  KhsxCapacityCore:{vietnamToday:()=>'2026-09-23'},
  getOrderById:id=>id==='d1'?don:null,
  getOrders:()=>[don],
  soCongDoan:v=>Math.max(0,Number(v)||0),
  isoToDMY:iso=>{const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';},
  khoaNgayDMY:d=>{const m=String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?Number(m[3]+m[2]+m[1]):0;},
  lichSuCongDoanDeDoc:()=>({'10/09/2026':{may:7}}),   // dòng tiến độ KHÔNG mang tên người
  nguoiHoanThanhCongDoan:()=>null,
  toThucHienCongDoanNgay:()=>'Tổ 1',
  normHeaderText:s=>String(s||'').trim().toLowerCase(),
  laBaoHanh:o=>!!o.is_warranty,
  nguonBaoHanhChoNangLuc:()=>({}),
  dmyToIso:d=>{const m=String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';},
};
vm.createContext(ctx);
vm.runInContext(['namTrongKhoangNangLuc','tinhNangLucCaNhan','duLieuNangLucCaNhan'].map(lay).join('\n'),ctx);

// Ca 1: bảng công rỗng → phải báo chưa có dữ liệu, không được ra số
const rong=ctx.duLieuNangLucCaNhan('may',20260901,20260923);
assert.equal(rong.chuaCoDuLieu,true,'Bảng công rỗng mà vẫn trả số — sẽ hiện 0 hoặc số nửa đúng nửa sai trên thẻ');
assert.equal(rong.rows.length,0,'Bảng công rỗng thì không được có dòng nào');
console.log('PASS  bảng công rỗng → báo "chưa có dữ liệu", không ra số giả');

// Ca 2: có bảng công → cộng đúng theo người, đúng khoảng ngày
ctx.supabaseStageCredits=[
  {order_id:'d1',work_date:'2026-09-10',stage:'may',worker_id:'loan_anh',quantity:12},
  {order_id:'d1',work_date:'2026-09-11',stage:'may',worker_id:'loan_anh',quantity:3},
  {order_id:'d1',work_date:'2026-08-20',stage:'may',worker_id:'loan_anh',quantity:5},   // ngoài kỳ
  {order_id:'d1',work_date:'2026-09-10',stage:'dong_goi',worker_id:'minh_thuan',quantity:9},
];
const may=ctx.duLieuNangLucCaNhan('may',20260901,20260923);
assert.ok(!may.chuaCoDuLieu,'Đã có bảng công mà vẫn báo chưa có dữ liệu');
const loan=may.rows.find(r=>r.name==='Loan Anh');
assert.ok(loan,'Thiếu dòng Loan Anh');
assert.equal(loan.soLuong,15,'May trong kỳ phải là 12 + 3, không tính 5 tấm tháng 8');
assert.equal(loan.tong,20,'Tổng lịch sử phải gồm cả 5 tấm tháng 8');
console.log('PASS  có bảng công → cộng đúng theo người và đúng khoảng ngày');

const dg=ctx.duLieuNangLucCaNhan('dong_goi',20260901,20260923);
assert.equal(dg.rows.find(r=>r.name==='Minh Thuận')?.soLuong,9,'Đóng gói trong kỳ sai');
console.log('PASS  Đóng gói tách riêng, không lẫn công May');

// Ca 3: bản chạy Apps Script thuần vẫn dùng được nhánh dự phòng
ctx.SUPABASE_VARIANT=false; ctx.supabaseStageCredits=[];
assert.ok(!ctx.duLieuNangLucCaNhan('may',20260901,20260923).chuaCoDuLieu,'Bản Apps Script không có bảng công là bình thường, không được chặn');
console.log('PASS  bản Apps Script vẫn tính bằng nhánh dự phòng như cũ');

// Ca 4: thẻ Bảo hành không được khẳng định "chưa có" khi chưa tải xong
assert.match(html,/daTaiBaoHanh\(\) \? 'Tháng này chưa có hàng bảo hành' : 'Đang tải số liệu bảo hành…'/,'Thẻ Bảo hành vẫn khẳng định "chưa có" khi chưa tải');
console.log('PASS  thẻ Bảo hành ghi "đang tải" khi số chưa về');
