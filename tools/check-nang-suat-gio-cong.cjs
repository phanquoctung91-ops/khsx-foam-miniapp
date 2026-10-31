// v261: khối "Năng suất theo giờ công" ở tab Năng lực (cả khách xem được) + dải KPI không còn đếm số từ 0 mỗi lần chuyển tab.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/const NS_GIO_SANG=[^\n]*\n/,/const NS_TO_DAN=[^\n]*\n/,/const NS_MOI_TO=[^\n]*\n/,/function nsGioCong\([^\n]*\n/,/function nsGom\([\s\S]*?\n\}\n/,
  /function nsNgayTruoc\([^\n]*\n/,/function nsKhoangHieuLuc\([\s\S]*?\n\}\n/,/function nsTinhBang\([\s\S]*?\n\}\n/,/function nsSanLuong\([\s\S]*?\n\}\n/].map(lay).join('\n');
let chuaCo=false;
const ctx={duLieuNangLucCaNhan:cd=>chuaCo?{rows:[],chuaCoDuLieu:true}:{rows:[{soLuong:cd==='may'?100:90},{soLuong:cd==='may'?20:10}]},
  tinhNangLucToDan:()=>['Tổ 1','Tổ 2','Tổ 3','Tổ 4','Tổ 5'].map((t,i)=>({team:t,sanLuongTong:10*(i+1),tong:999}))};
vm.createContext(ctx); vm.runInContext(code+';this.f={nsGioCong,nsGom,nsKhoangHieuLuc,nsTinhBang,nsSanLuong};',ctx);
const F=ctx.f, gần=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' ≠ '+b);

// 1) Giờ công: sáng 4,25 + chiều 3,75 + tăng ca
gần(F.nsGioCong({sang:1,chieu:1,tang_ca:0}),8); gần(F.nsGioCong({sang:2,chieu:1,tang_ca:3}),8.5+3.75+3); gần(F.nsGioCong({sang:0,chieu:0}),0);
console.log('PASS giờ công: sáng 4,25 · chiều 3,75 · cộng tăng ca');

// 2) Gộp nhóm: người bình quân = người-ngày / số ngày có điểm danh; lọc theo khoảng ngày
const rows=[
  {ngay:'2026-10-27',nhom:'Tổ dán 1',nguoi:2,sang:2,chieu:2,tang_ca:3},
  {ngay:'2026-10-28',nhom:'Tổ dán 1',nguoi:2,sang:2,chieu:2,tang_ca:0},
  {ngay:'2026-10-28',nhom:'Tổ may',nguoi:3,sang:3,chieu:3,tang_ca:0},
  {ngay:'2026-10-28',nhom:'Tổ đóng gói',nguoi:2,sang:2,chieu:2,tang_ca:0},
  {ngay:'2026-10-28',nhom:'Ngoài 6 tổ',nguoi:7,sang:7,chieu:7,tang_ca:6},
  {ngay:'2026-10-20',nhom:'Tổ dán 1',nguoi:9,sang:9,chieu:9,tang_ca:0}];
let g=F.nsGom(rows,['Tổ dán 1'],'2026-10-27','2026-10-28');
assert.equal(g.nguoiNgay,4); assert.equal(g.soNgay,2); gần(g.nguoiBq,2); gần(g.gio,2*8*2+3);
console.log('PASS gộp nhóm: người bình quân, giờ công, bỏ ngày ngoài khoảng');

// 3) Bảng: từng tổ chỉ người của tổ; Toàn xưởng = thành phẩm đóng gói / mọi giờ công kể cả Ngoài 6 tổ
const sl={'Tổ dán 1':38,'Tổ dán 2':0,'Tổ dán 3':0,'Tổ dán 4':0,'Tổ may':127,'Tổ đóng gói':127};
const bang=F.nsTinhBang(rows,sl,'2026-10-28','2026-10-28'), t=Object.fromEntries(bang.map(r=>[r.ten,r]));
gần(t['Tổ dán 1'].gio,16); gần(t['Tổ dán 1'].slNguoiGio,38/16); gần(t['Tổ dán 1'].slNguoiNgay,19); gần(t['Tổ dán 1'].slGioTo,38/8);
gần(t['Tổ may'].slNguoiGio,127/24); gần(t['Tổ đóng gói'].slNguoiGio,127/16);
assert.equal(t['Tổ dán 2'].coDuLieu,false); assert.equal(t['Tổ dán 2'].slNguoiGio,null,'tổ không có điểm danh: không chia cho 0');
gần(t['Dán (4 tổ gộp)'].sl,38); assert.equal(t['Dán (4 tổ gộp)'].slGioTo,null);
const tx=t['Toàn xưởng']; gần(tx.gio,16+24+16+(7*8+6)); gần(tx.slNguoiGio,127/tx.gio); gần(tx.sl,127); gần(tx.gioNgoai,62); assert.equal(tx.slGioTo,null);
assert.deepEqual(Array.from(bang,r=>r.ten),['Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Dán (4 tổ gộp)','Tổ may','Tổ đóng gói','Toàn xưởng']);
console.log('PASS bảng: từng tổ chỉ người của tổ, Toàn xưởng tính cả Ngoài 6 tổ, tổ trống không chia cho 0');

// 3b) Sản lượng lấy từ hàm của tab Năng lực: tổ dán gọi là 'Tổ 1'… ở đó, 'Tổ dán 1'… ở đây; Tổ 5 không vào; May/Đóng gói cộng từng người; bảo hành không cộng
const slThat=F.nsSanLuong(20261006,20261030);
assert.deepEqual({...slThat},{'Tổ may':120,'Tổ đóng gói':100,'Tổ dán 1':10,'Tổ dán 2':20,'Tổ dán 3':30,'Tổ dán 4':40});
chuaCo=true; assert.equal(F.nsSanLuong(1,2),null,'bảng công chưa về thì hiện Đang tải, không hiện 0'); chuaCo=false;
console.log('PASS sản lượng: nối đúng tên tổ dán, Tổ 5 không vào, chưa có bảng công thì chờ');

// 4) Hôm nay chưa có điểm danh chiều thì bỏ; có rồi thì giữ; ngày đã qua giữ nguyên
let k=F.nsKhoangHieuLuc([{ngay:'2026-10-30',nhom:'Tổ may',nguoi:3,sang:3,chieu:0,tang_ca:0}],'2026-10-30','2026-10-30');
assert.deepEqual({...k},{den:'2026-10-29',boHomNay:true});
k=F.nsKhoangHieuLuc([{ngay:'2026-10-30',nhom:'Tổ may',nguoi:3,sang:3,chieu:3,tang_ca:0}],'2026-10-30','2026-10-30'); assert.deepEqual({...k},{den:'2026-10-30',boHomNay:false});
k=F.nsKhoangHieuLuc([{ngay:'2026-10-30',nhom:'Tổ may',nguoi:3,sang:3,chieu:0,tang_ca:0},{ngay:'2026-10-30',nhom:'Ngoài 6 tổ',nguoi:6,sang:6,chieu:3,tang_ca:9}],'2026-10-30','2026-10-30'); assert.deepEqual({...k},{den:'2026-10-29',boHomNay:true},'người Ngoài 6 tổ điểm danh chiều không làm hôm nay thành đủ ngày');
k=F.nsKhoangHieuLuc([],'2026-10-29','2026-10-30'); assert.deepEqual({...k},{den:'2026-10-29',boHomNay:false});
k=F.nsKhoangHieuLuc([],'2026-11-02','2026-10-30'); assert.deepEqual({...k},{den:'2026-10-29',boHomNay:true},'khoảng kéo qua hôm nay vẫn cắt về hôm qua');
console.log('PASS hôm nay chưa đủ điểm danh chiều thì chưa tính');

// 5) Giao diện + KPI không đếm từ 0
assert.match(html,/id="nangSuatGioCong"/); assert.match(html,/id="nangSuatBody"/);
assert.match(html,/capacityPackBody'\)\.innerHTML=htmlDongNangLucCaNhan\(pack,'dong_goi'\);\n  veNangSuatGioCong\(\);\n\}/,'renderCapacityStats gọi vẽ khối năng suất');
assert.ok(html.includes("cl.rpc('khsx_gio_cong_theo_to_v1'")&&html.includes('PUBLIC_VIEW_MODE\n    ?(guestDashboardClient'),'khách đọc qua đường công khai');
assert.ok(!html.includes('chayDemSo'),'không còn hiệu ứng đếm từ 0 của dải KPI');
assert.ok(Number(html.match(/const APP_VERSION = (\d+);/)[1])>=261,'từ bản 261 trở lên');
console.log('PASS nối giao diện, bỏ chayDemSo');

// 5b) Khách thấy tab Năng lực (v262), không có nút bấm không ra gì
assert.ok(html.includes("PUBLIC_VIEW_MODE?(tab==='monthly'||tab==='autoplan'||tab==='capacity'):keys.some(hasPermOrOwner)"),'khách thấy Thống kê + KHSX + Năng lực');
assert.ok(html.includes('body.public-view-mode #exportCapacityStatsBtn{display:none !important;}'),'khách không có nút xuất Excel (cần quyền quản lý)');
const ct=fs.readFileSync(path.resolve(__dirname,'..','js','khsx-capacity-details.js'),'utf8');
assert.ok(ct.includes("function capacityDetailButton(stage,who){if(typeof PUBLIC_VIEW_MODE!=='undefined'&&PUBLIC_VIEW_MODE)return '—';"),'khách không có nút Chi tiết năng lực (cần quyền quản lý)');
console.log('PASS khách thấy tab Năng lực, ẩn nút xuất Excel và Chi tiết năng lực');

// 6) SQL (PGlite): gom theo (ngày, nhóm), người ngoài 6 tổ gộp, không lộ tên, bỏ ngày tương lai
const mig=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20261030100000_gio_cong_theo_to.sql'),'utf8');
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated;
    create table public.khsx_diem_danh_nguoi(id uuid primary key default gen_random_uuid(), ten text, chuc_vu text, to_lam text, con_dung boolean default true);
    create table public.khsx_diem_danh(nguoi_id uuid, ngay date, sang boolean, chieu boolean, tang_ca smallint);`);
  await db.exec(mig);
  const ins=async(ten,cv,to)=>(await db.query(`insert into public.khsx_diem_danh_nguoi(ten,chuc_vu,to_lam) values($1,$2,$3) returning id`,[ten,cv,to])).rows[0].id;
  const a=await ins('Bí Mật A','Công nhân','Tổ dán 1'),b=await ins('Bí Mật B','Công nhân','Tổ dán 1'),c=await ins('Bí Mật C','Thủ kho',null),d=await ins('Bí Mật D','Công nhân','Phụ kho'),e=await ins('Bí Mật E','Công nhân','Tổ may');
  const dd=(id,ngay,s,c2,tc)=>db.query(`insert into public.khsx_diem_danh values($1,$2::date,$3,$4,$5)`,[id,ngay,s,c2,tc]);
  await dd(a,'2026-10-28',true,true,2); await dd(b,'2026-10-28',true,false,null); await dd(c,'2026-10-28',true,true,3); await dd(d,'2026-10-28',true,true,1); await dd(e,'2026-10-28',true,true,null);
  await dd(a,'2026-10-27',true,true,null); await dd(a,'2099-01-01',true,true,3);
  const goi=async(x,y)=>(await db.query(`select public.khsx_gio_cong_theo_to_v1($1::date,$2::date) j`,[x,y])).rows[0].j;
  let r=await goi('2026-10-01','2026-12-31');
  const kq=Object.fromEntries(r.map(x=>[x.ngay+'|'+x.nhom,x]));
  assert.deepEqual({...kq['2026-10-28|Tổ dán 1']},{ngay:'2026-10-28',nhom:'Tổ dán 1',nguoi:2,sang:2,chieu:1,tang_ca:2});
  assert.deepEqual({...kq['2026-10-28|Ngoài 6 tổ']},{ngay:'2026-10-28',nhom:'Ngoài 6 tổ',nguoi:2,sang:2,chieu:2,tang_ca:4},'Thủ kho + Phụ kho + chưa gắn tổ gộp một dòng');
  assert.equal(kq['2026-10-28|Tổ may'].nguoi,1); assert.ok(kq['2026-10-27|Tổ dán 1']);
  assert.ok(!r.some(x=>x.ngay>='2099'),'không trả ngày tương lai');
  const chuoi=JSON.stringify(r); assert.ok(!/Bí Mật|Thủ kho|Phụ kho/.test(chuoi),'không lộ tên, chức vụ, tổ phụ');
  assert.deepEqual(Object.keys(r[0]).sort(),['chieu','ngay','nguoi','nhom','sang','tang_ca']);
  assert.deepEqual(await goi(null,'2026-10-30'),[],'thiếu ngày thì rỗng');
  assert.equal((await goi('2026-10-28','2026-10-28')).length,3,'khoảng 1 ngày: Tổ dán 1, Tổ may, Ngoài 6 tổ');
  console.log('PASS SQL: gom theo (ngày, nhóm), Ngoài 6 tổ gộp, không lộ tên/chức vụ, bỏ ngày tương lai');
})().catch(e=>{ console.error(e); process.exit(1); });
