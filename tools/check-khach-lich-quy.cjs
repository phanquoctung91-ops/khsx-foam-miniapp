// v264: khách thấy tiến độ Quý theo đúng lịch ngày làm việc anh đăng ký (Quý 4 kéo tới 30/01/2027), không tự tính theo lịch mặc định tháng 10-12.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const mig=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20261031100000_khach_xem_lich_quy.sql'),'utf8');

// 1) Migration: hàm khách trả thêm work_dates ở quarter_targets, giữ quyền gọi của khách
assert.match(mig,/CREATE OR REPLACE FUNCTION public\.khsx_guest_dashboard_v116\(\)/i,'tạo lại đúng hàm khách');
assert.ok(mig.includes('select t.year,t.quarter,t.target_qty,t.work_dates\n'),'quarter_targets có work_dates');
assert.ok(mig.includes('grant execute on function public.khsx_guest_dashboard_v116() to anon, authenticated;'),'khách vẫn gọi được');
for(const k of ["'orders'","'stage_progress'","'stage_credits'","'workers'","'day_locks'","'plan_snapshots'","'assignments'"]) assert.ok(mig.includes(k),'giữ nguyên phần '+k);
console.log('PASS migration: quarter_targets có work_dates, các phần khác giữ nguyên, khách vẫn gọi được');

// 2) App khách đã đọc work_dates nếu có (đường cũ, không cần sửa)
assert.ok(html.includes("if(x.work_dates?.length)quarterCalendars[k]=x.work_dates.map(String);"),'app khách dựng lịch quý từ work_dates');
assert.ok(Number(html.match(/const APP_VERSION = (\d+);/)[1])>=264);
console.log('PASS app khách dựng lịch quý từ work_dates');

// 3) Đúng dạng dữ liệu app đọc: mảng chuỗi ngày ISO (PGlite)
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create table public.khsx_quarter_targets(year int, quarter int, target_qty int, work_dates date[]);
    insert into public.khsx_quarter_targets values(2026,4,11500,array['2026-10-01','2027-01-30']::date[]);`);
  const m=mig.match(/select jsonb_agg\(to_jsonb\(q\)\) from \(\n\s+select t\.year,t\.quarter,t\.target_qty,t\.work_dates\n[\s\S]*?\) q/);
  assert.ok(m,'không thấy đoạn quarter_targets');
  const r=(await db.query(`select (${m[0]}) j`)).rows[0].j;
  assert.deepEqual(r[0].work_dates,['2026-10-01','2027-01-30']); assert.equal(r[0].target_qty,11500);
  console.log('PASS dữ liệu quý trả về có work_dates dạng chuỗi ngày ISO');
})().catch(e=>{ console.error(e); process.exit(1); });
