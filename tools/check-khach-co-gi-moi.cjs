// Link khách hỏi "có gì mới" (2026-09-24): chạy thật hàm SQL trong database tạm (PGlite).
// Dấu phải ĐỨNG YÊN khi không đổi gì, và PHẢI ĐỔI với mọi thay đổi link khách hiển thị —
// kể cả đổi người ghi công / đổi tên nhân viên / đổi tổ hỗ trợ mà số dòng, số lượng giữ nguyên.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260924110000_khach_hoi_co_gi_moi.sql'),'utf8');
(async()=>{
  const db=await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated;
    create table public.khsx_orders(id text primary key,plan_qty int,updated_at timestamptz default now());
    create table public.khsx_order_assignments(order_id text,updated_at timestamptz default now());
    create table public.khsx_daily_assignments(order_id text,work_date date,team_name text,assignment_kind text,updated_at timestamptz default now());
    create table public.khsx_stage_progress(order_id text,quantity int,updated_at timestamptz default now());
    create table public.khsx_stage_credits(order_id text,work_date date,stage text,worker_id text,quantity int,kpi_team text,updated_at timestamptz default '2026-09-01');
    create table public.khsx_plan_snapshots(work_date date,version bigint);
    create table public.khsx_day_locks(work_date date,updated_at timestamptz default now());
    create table public.khsx_quarter_targets(year int,updated_at timestamptz default now());
    create table public.khsx_workers(id text,display_name text,stage text,active boolean,updated_at timestamptz default '2026-09-01');
    insert into public.khsx_orders values('d1',15,'2026-09-01');
    insert into public.khsx_daily_assignments values('d1','2026-09-25','To 1','support','2026-09-01');
    insert into public.khsx_stage_credits values('d1','2026-09-25','may','thao_vy',15,'To 1');
    insert into public.khsx_workers values('thao_vy','Thảo Vy','may',true);
  `);
  await db.exec(sql);
  const dau=async()=>(await db.query('select public.khsx_guest_version_v1() d')).rows[0].d;
  const d0=await dau();
  assert.equal(await dau(),d0,'Không đổi gì mà dấu vẫn đổi — link khách sẽ tải lại cả gói liên tục');
  console.log('PASS  không đổi gì thì dấu đứng yên');

  const doi=async(cau,ten)=>{ const truoc=await dau(); await db.exec(cau); const sau=await dau(); assert.notEqual(sau,truoc,`${ten} mà dấu không đổi — khách thấy số cũ`); console.log('PASS  '+ten+' → dấu đổi'); };
  await doi(`update public.khsx_stage_credits set worker_id='bao_cham'`,'đổi người ghi công, số lượng giữ nguyên');
  await doi(`update public.khsx_workers set display_name='Thảo Vy (T1)'`,'đổi tên nhân viên');
  await doi(`update public.khsx_daily_assignments set team_name='To 2'`,'đổi tổ hỗ trợ');
  await doi(`update public.khsx_orders set plan_qty=16,updated_at=now()`,'sửa số lượng đơn');
  await doi(`delete from public.khsx_stage_credits`,'xoá dòng công');
  const quyen=(await db.query(`select has_function_privilege('anon','public.khsx_guest_version_v1()','EXECUTE') a`)).rows[0].a;
  assert.equal(quyen,true,'Khách không gọi được hàm hỏi "có gì mới"');
  console.log('PASS  khách gọi được hàm');
})().catch(e=>{console.error(e);process.exit(1);});
