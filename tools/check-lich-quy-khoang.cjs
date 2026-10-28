// Lịch ngày làm việc theo khoảng của quý (bản 257): Quý 4 kéo hết tháng 1, Quý 1 tự bắt đầu sau đó.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/const NGAY_LE_QUOC_GIA_THEO_NAM=\{[\s\S]*?\n\};\n/,/function isoDateLocal\([^\n]*\n/,/const ngayLeSet=[^\n]*\n/,/const macDinhLamViec=[^\n]*\n/,
  /function defaultQuarterWorkDates\([\s\S]*?\n\}\n/,/function lichQuyDaLuu\([^\n]*\n/,/function rangesDaLuu\([\s\S]*?\n\}\n/,/function quyCuaIso\([\s\S]*?\n\}\n/,
  /function khoangQuy\([\s\S]*?\n\}\n/,/function quyCuaNgay\([^\n]*\n/,/function workDatesForQuarter\([\s\S]*?\n\}\n/].map(lay).join('\n');
const ctx={quarterCalendars:{}}; vm.createContext(ctx);
vm.runInContext(code+';this.f={quyCuaIso,khoangQuy,quyCuaNgay,workDatesForQuarter,defaultQuarterWorkDates,rangesDaLuu};',ctx);
const F=ctx.f, dat=(a,b)=>{ const o=[]; for(let d=new Date(a+'T00:00:00');d<=new Date(b+'T00:00:00');d.setDate(d.getDate()+1)){ if(d.getDay()!==0) o.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); } return o; };

// 1) Chưa quý nào lưu lịch: y như cũ theo quý lịch
assert.deepEqual({...F.quyCuaIso('2027-01-15')},{nam:2027,quy:1,key:'2027_Q1'});
assert.deepEqual({...F.quyCuaIso('2026-12-31')},{nam:2026,quy:4,key:'2026_Q4'});
assert.deepEqual({...F.khoangQuy(2026,4)},{from:'2026-10-01',to:'2026-12-31'});
assert.deepEqual(F.workDatesForQuarter(2027,1),F.defaultQuarterWorkDates(2027,1));
assert.equal(F.quyCuaNgay(new Date(2026,9,28)).key,'2026_Q4');
console.log('PASS chưa quý nào lưu lịch: ngày thuộc quý lịch, khoảng = 3 tháng, lịch mặc định không đổi');

// 2) Quý 4/2026 lưu lịch kéo hết tháng 1/2027 (có cả Chủ nhật 31/01 được tick)
const q4=dat('2026-10-01','2027-01-31').filter(x=>x!=='2026-12-25');
ctx.quarterCalendars['2026_Q4']=q4;
assert.deepEqual({...F.khoangQuy(2026,4)},{from:'2026-10-01',to:'2026-12-30'.replace('12-30','12-31').replace('2026-12-31','2027-01-30')},'khoảng = ngày đăng ký đầu → cuối (30/01 là Thứ 7 cuối cùng không phải CN)');
assert.equal(F.quyCuaIso('2027-01-20').key,'2026_Q4','tháng 1 thuộc Quý 4');
assert.equal(F.quyCuaIso('2027-01-31').key,'2027_Q1','31/01 (CN) không đăng ký, nằm ngoài khoảng → quý lịch');
assert.equal(F.quyCuaIso('2027-02-02').key,'2027_Q1','tháng 2 thuộc Quý 1');
assert.equal(F.workDatesForQuarter(2026,4).length,q4.length,'Quý 4 giữ đủ ngày kể cả tháng 1');
const q1=F.workDatesForQuarter(2027,1);
assert.ok(q1.length>0&&q1.every(d=>d>='2027-01-31'),'Quý 1 không còn ngày nào của tháng 1 (đã thuộc Quý 4)');
assert.ok(q1.includes('2027-02-01')&&q1.includes('2027-03-31'),'Quý 1 từ tháng 2 tới hết tháng 3');
assert.equal(F.khoangQuy(2027,1).from,'2027-01-31','Quý 1 chưa lưu: bắt đầu ngay sau ngày cuối của Quý 4');
console.log('PASS Quý 4 kéo hết tháng 1: tháng 1 thuộc Quý 4, Quý 1 tự bắt đầu sau đó, lịch Quý 1 không lấy ngày tháng 1');

// 3) Quý 1 đã lưu lịch cũ có chứa ngày tháng 1: những ngày thuộc Quý 4 bị lọc khỏi Quý 1; quý trước không bị ảnh hưởng bởi quý sau
ctx.quarterCalendars['2027_Q1']=dat('2027-01-02','2027-03-31');
assert.ok(F.workDatesForQuarter(2027,1).every(d=>d>'2027-01-30'),'Quý 1 đã lưu vẫn bị lọc ngày tháng 1');
assert.equal(F.workDatesForQuarter(2026,4).length,q4.length,'Quý 4 không bị Quý 1 lấy ngày');
assert.equal(F.quyCuaIso('2027-01-10').key,'2026_Q4','chồng nhau: quý đứng trước giữ');
assert.equal(F.quyCuaIso('2027-03-10').key,'2027_Q1');
console.log('PASS chồng nhau: quý đứng trước giữ ngày; quý sau tự bỏ ngày trùng');

// 4) Giao diện: ô Từ ngày / Đến ngày, ngày thuộc quý trước bị khóa, lưu chỉ nhận ô đã tick
assert.match(html,/id="quarterTuNgay"/); assert.match(html,/id="quarterDenNgay"/);
assert.match(html,/Đã thuộc Quý \$\{chuQuy\.quy\}\/\$\{chuQuy\.nam\}/);
assert.match(html,/\.quarter-workday:checked/);

// 5) SQL: khsx_lich_lam_viec theo khoảng (PGlite)
const mig=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20261028090000_lich_quy_khoang_tuy_chinh.sql'),'utf8');
assert.match(mig,/v_lich := private\.khsx_lich_lam_viec\(v_hn\)/,'nhắc điểm danh 7h tra lịch theo khoảng');
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create schema private; create table public.khsx_quarter_targets(year int, quarter int, target_qty int, work_dates date[]);`);
  await db.exec(mig.slice(0,mig.indexOf('-- 7h sáng')));
  const lich=async d=>(await db.query(`select private.khsx_lich_lam_viec($1::date)::text l`,[d])).rows[0].l;
  assert.equal(await lich('2027-01-20'),null,'chưa lưu lịch quý nào: null');
  await db.exec(`insert into public.khsx_quarter_targets values(2026,4,11500,array['2026-10-12','2026-12-30','2027-01-20']::date[])`);
  assert.ok(await lich('2027-01-20'),'tháng 1 nằm trong khoảng Quý 4: lấy lịch Quý 4');
  assert.ok(await lich('2026-11-01'),'trong quý: lấy lịch Quý 4');
  assert.equal(await lich('2027-02-02'),null,'ngoài khoảng, Quý 1 chưa lưu: null');
  await db.exec(`insert into public.khsx_quarter_targets values(2027,1,9000,array['2027-02-02','2027-03-31']::date[])`);
  const l=await lich('2027-02-10'); assert.equal(l,'{2027-02-02,2027-03-31}','tháng 2: lấy lịch Quý 1');
  await db.exec(`insert into public.khsx_quarter_targets values(2027,1,9000,array['2027-01-05','2027-03-31']::date[])`);
  assert.equal(await lich('2027-01-20'),'{2026-10-12,2026-12-30,2027-01-20}','chồng nhau: quý đứng trước (Quý 4/2026) giữ');
  console.log('PASS SQL khsx_lich_lam_viec: tra theo khoảng của quý, chồng nhau quý trước giữ, chưa lưu thì null');
})().catch(e=>{ console.error(e); process.exit(1); });
