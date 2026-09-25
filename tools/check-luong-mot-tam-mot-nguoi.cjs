// Kiểm migration 20260925120000_luong_bo_don_huy_mot_tam_mot_nguoi.sql trên PGlite:
// một dòng tiến độ May/Đóng gói chỉ một người nhận đúng số tấm; số về 0 thì hết công;
// không biết người thì giữ công cũ nhưng không vượt số tấm; lương bỏ đơn đã huỷ; dọn công lệch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20260925120000_luong_bo_don_huy_mot_tam_mot_nguoi.sql'),'utf8');

(async()=>{
  const db=await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function private.khsx_has_permission(text,uuid) returns boolean language sql as $$ select true $$;
    create function private.khsx_is_full_manager() returns boolean language sql as $$ select true $$;
    create type public.khsx_stage as enum('dan','may','dong_goi');
    create type public.khsx_unit as enum('To 1','To 2','To 3','To 4','To 5');
    create table public.khsx_orders(id text primary key, plan_qty int, deleted_at timestamptz, cancelled_by uuid, cancel_reason text, updated_at timestamptz);
    create table public.khsx_order_assignments(order_id text, current_team public.khsx_unit, plan_team public.khsx_unit);
    create table public.khsx_daily_assignments(order_id text, work_date date, assignment_kind text, team_name public.khsx_unit);
    create table public.khsx_day_locks(work_date date, progress_locked boolean);
    create table public.khsx_order_team_assignments(order_id text, team_name public.khsx_unit);
    create table public.khsx_profiles(user_id uuid, unit_name public.khsx_unit, role text, worker_id text, active boolean);
    create table public.khsx_workers(id text, stage public.khsx_stage, active boolean, display_name text);
    create table public.khsx_stage_operations(operation_id uuid primary key, order_id text, work_date date, stage public.khsx_stage, requested_quantity int, applied_quantity int, kpi_team public.khsx_unit, actor_user_id uuid, device_id text, completed_by_worker_id text);
    create table public.khsx_stage_progress(order_id text, work_date date, stage public.khsx_stage, quantity int, kpi_team public.khsx_unit, entered_by uuid, completed_by_worker_id text, team_key text, updated_at timestamptz default now(), primary key(order_id,work_date,stage,team_key));
    create table public.khsx_stage_credits(order_id text not null, work_date date not null, stage public.khsx_stage not null, worker_id text not null, quantity int not null check(quantity>=0), source text not null default 'actual', updated_at timestamptz not null default now(), kpi_team public.khsx_unit not null, primary key(order_id,work_date,stage,worker_id,kpi_team));
    insert into public.khsx_profiles values('00000000-0000-0000-0000-000000000001','To 1','quan_ly',null,true);
    insert into public.khsx_workers values('bao_cham','may',true,'Bảo Chăm'),('thao_vy','may',true,'Thảo Vy'),('minh_thuan','dong_goi',true,'Minh Thuận');
    insert into public.khsx_orders values('o1',15,null,null,null,now()),('huy',4,now(),null,'x',now()),('lech',1,null,null,null,now());
    insert into public.khsx_order_assignments values('o1','To 1','To 1'),('lech','To 2','To 2');
    -- dữ liệu cũ: PRE20-2022 kiểu 24/09 (dòng ghi Thảo Vy, công 2 người) + đơn huỷ còn công
    insert into public.khsx_stage_progress values('lech','2026-09-24','dan',1,'To 2',null,null,'To 2'),('lech','2026-09-24','may',1,'To 2',null,'thao_vy','To 2');
    insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,kpi_team) values('lech','2026-09-24','may','bao_cham',1,'To 2'),('lech','2026-09-24','may','thao_vy',1,'To 2');
    insert into public.khsx_stage_progress values('huy','2026-09-09','dan',4,'To 3',null,null,'To 3'),('huy','2026-09-09','may',4,'To 3',null,'bao_cham','To 3');
    insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,kpi_team) values('huy','2026-09-09','may','bao_cham',4,'To 3');
  `);
  await db.exec(sql);
  await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001'`);
  const q=(...a)=>db.query(...a);
  const cong=async(o,st)=>(await q(`select worker_id,quantity from public.khsx_stage_credits where order_id=$1 and stage=$2 order by worker_id`,[o,st])).rows;
  let n=0; const ghi=(st,sl,w)=>q(`select * from public.khsx_apply_stage_progress_v2($1::uuid,'o1','2026-09-25',$2::public.khsx_stage,$3,null,$4,'')`,
    [`00000000-0000-0000-0000-${String(++n).padStart(12,'0')}`,st,sl,w]);

  assert.deepEqual(await cong('lech','may'),[{worker_id:'thao_vy',quantity:1}]);
  console.log('PASS dọn dữ liệu: PRE20-2022 chỉ còn Thảo Vy (người ghi sau cùng), bỏ công trùng của Bảo Chăm');

  await ghi('dan',15,null); await ghi('may',15,'bao_cham');
  assert.deepEqual(await cong('o1','may'),[{worker_id:'bao_cham',quantity:15}]);
  await ghi('may',15,'thao_vy');
  assert.deepEqual(await cong('o1','may'),[{worker_id:'thao_vy',quantity:15}]);
  console.log('PASS đổi người nhận công: chỉ người mới nhận 15, người cũ hết công (không còn 2 người 30 tấm)');

  await ghi('may',15,null);
  assert.deepEqual(await cong('o1','may'),[{worker_id:'thao_vy',quantity:15}]);
  console.log('PASS gửi lại cùng số, không kèm người: giữ nguyên người cũ');

  await ghi('may',10,null);
  assert.deepEqual(await cong('o1','may'),[{worker_id:'thao_vy',quantity:10}]);
  console.log('PASS quản lý giảm 15 → 10 không chọn người: công giảm theo, không vượt số tấm');

  await ghi('may',0,null);
  assert.deepEqual(await cong('o1','may'),[]);
  console.log('PASS xoá số (về 0): xoá luôn công, nhập lại không bị cộng 2 lần');

  await ghi('may',12,'thao_vy');
  assert.deepEqual(await cong('o1','may'),[{worker_id:'thao_vy',quantity:12}]);
  console.log('PASS nhập lại sau khi xoá: đúng 12');

  const w=(await q(`select public.khsx_wage_report('2026-09-01','2026-09-30') r`)).rows[0].r;
  assert.equal(w.credits.filter(c=>c.worker_id==='bao_cham').length,0,'Lương còn công của đơn đã huỷ');
  assert.ok(!w.dan.some(d=>d.kpi_team==='To 3'),'Lương còn số Dán của đơn đã huỷ');
  const v=(await q(`select count(*)::int n from public.khsx_cong_hieu_luc where order_id='huy'`)).rows[0].n;
  assert.equal(v,0);
  console.log('PASS số liệu lương và "Tổng của tôi" bỏ đơn đã huỷ');
  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
