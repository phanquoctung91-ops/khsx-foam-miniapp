// Tách đơn (2026-10-15): chạy thật hàm PL/pgSQL trong database tạm (PGlite), không đụng database thật.
// Kiểm: quyền, tổng phải đúng bằng phần còn lại, đơn chưa tiến độ bị thay bằng đơn con, đơn có tiến độ giữ số đã làm,
// ảnh chụp ngày chốt đổi theo đúng thứ tự, đồng bộ Sheet không hồi sinh đơn gốc, tổng kế hoạch của ngày không đổi.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261015090000_tach_don.sql'),'utf8');
const manager='00000000-0000-0000-0000-000000000001', ql2='00000000-0000-0000-0000-000000000002';
let db;
const q=(s,p)=>db.query(s,p);
const pass=s=>console.log('PASS  '+s);
const as=uid=>q("select set_config('test.uid',$1,false)",[uid]);
const tach=(id,parts)=>q('select public.khsx_split_order_v1($1,$2::jsonb) r',[id,JSON.stringify(parts)]).then(x=>x.rows[0].r);
const don=id=>q('select * from public.khsx_orders where id=$1',[id]).then(x=>x.rows[0]);
const tongNgay=()=>q("select coalesce(sum(plan_qty),0)::int t from public.khsx_orders where production_date='2026-10-16' and deleted_at is null").then(x=>x.rows[0].t);
const src=(id,ma,qty)=>({id,production_date:'2026-10-16',product_code:ma,product_name:'SORA',width_mm:160,length_mm:200,thickness_mm:10,plan_qty:qty,source_payload:{source:'sheet_live_sync_v123',live_row:{}}});
const sync=rows=>q(`select public.khsx_reconcile_sheet_plan($1::jsonb,now(),'{}'::text[]) r`,[JSON.stringify(rows)]).then(x=>x.rows[0].r);
(async()=>{
  db=await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create type public.khsx_unit as enum ('To 1','To 2','To 3','To 4','To 5','To may','To dong goi');
    create table public.khsx_profiles(user_id uuid primary key,role text,active boolean);
    insert into public.khsx_profiles values('${manager}','quan_ly',true),('${ql2}','quan_ly_2',true);
    create table public.khsx_permissions(permission_key text primary key,display_name text,group_name text,description text,sort_order int);
    create table public.khsx_account_permissions(user_id uuid,permission_key text,granted_by uuid,primary key(user_id,permission_key));
    create function private.khsx_is_permission_owner(u uuid) returns boolean language sql as $$select u='${manager}'::uuid$$;
    create function private.khsx_has_permission(p_key text,p_user_id uuid default auth.uid()) returns boolean language sql as
      $$select private.khsx_is_permission_owner(p_user_id) or exists(select 1 from public.khsx_account_permissions where user_id=p_user_id and permission_key=p_key)$$;
    create table public.khsx_orders(
      id text primary key,production_date date not null,product_code text not null default '',product_name text not null default '',
      width_mm numeric,length_mm numeric,thickness_mm numeric,plan_qty integer not null default 0,note text not null default '',order_group text not null default '',
      source_order_id text,is_manual boolean not null default false,is_drop boolean not null default false,is_ghost boolean not null default false,is_warranty boolean not null default false,
      is_lot boolean not null default false,lot_label text not null default '',source_payload jsonb not null default '{}',deleted_at timestamptz,
      created_at timestamptz not null default now(),updated_at timestamptz not null default now(),cancel_reason text,cancelled_by uuid);
    create table public.khsx_day_locks(work_date date primary key,plan_locked boolean default false,progress_locked boolean default false);
    create table public.khsx_plan_snapshots(work_date date primary key,rows_json jsonb,version bigint,created_by uuid,created_at timestamptz default now());
    create table public.khsx_stage_progress(order_id text,stage text,quantity integer);
    create table public.khsx_stage_operations(order_id text,applied_quantity integer);
    create table public.khsx_stage_progress_audit(order_id text,old_quantity integer,new_quantity integer);
    create table public.khsx_stage_credits(order_id text,quantity integer);
    create table public.khsx_order_assignments(order_id text,plan_team public.khsx_unit,current_team public.khsx_unit,spinoff_order_id text,
      change_note text not null default '',priority boolean not null default false,assigned_by uuid,assigned_at timestamptz,updated_at timestamptz not null default now());
  `);
  await db.exec(sql);
  await db.exec(`create function public.khsx_reconcile_sheet_plan(a jsonb,b timestamptz,c text[]) returns jsonb language sql as $$select private.khsx_reconcile_sheet_plan_impl(a,b,c)$$;`);
  assert.equal((await q("select count(*)::int n from public.khsx_permissions where permission_key='khsx_split_order'")).rows[0].n,1);
  pass('quyền khsx_split_order có trong danh sách quyền');

  const A='r_16_10_2026_SORA10_6_160_200_10_100_1', B='r_16_10_2026_STD10_4_140_200_10_50_1';
  await as(manager);
  await sync([src(A,'SORA10-6',100),src(B,'STD10-4',50)]);
  await db.exec(`insert into public.khsx_order_assignments(order_id,plan_team,current_team) values('${A}','To 1','To 1'),('${B}','To 2','To 2')`);

  // quyền
  await as(ql2);
  await assert.rejects(()=>tach(A,[{to:'To 1',qty:100}]),/SPLIT_PERMISSION_REQUIRED/);
  await as(manager);
  await db.exec(`insert into public.khsx_account_permissions values('${ql2}','khsx_split_order',null)`);
  await as(ql2);
  const ok2=await tach(B,[{to:'To 2',qty:20},{to:'To 4',qty:30}]);
  assert.equal(ok2.ok,true);
  await db.exec(`delete from public.khsx_account_permissions`);
  await as(manager);
  pass('chủ tách được; quản lý 2 chỉ tách khi được cấp quyền');

  // dữ liệu vào sai
  const C='r_16_10_2026_LAGO15_6_160_200_15_100_1';
  await sync([src(A,'SORA10-6',100),src(C,'LAGO15-6',100)]);
  await db.exec(`insert into public.khsx_order_assignments(order_id,plan_team,current_team) values('${C}','To 3','To 3')`);
  await assert.rejects(()=>tach(C,[{to:'To 3',qty:99}]),/SPLIT_SUM_MISMATCH/);
  await assert.rejects(()=>tach(C,[{to:'To 3',qty:60},{to:'To 4',qty:60}]),/SPLIT_SUM_MISMATCH/);
  await assert.rejects(()=>tach(C,[{to:'To 3',qty:50},{to:'To 3',qty:50}]),/INVALID_SPLIT/);
  await assert.rejects(()=>tach(C,[{to:'To 3',qty:0},{to:'To 4',qty:100}]),/INVALID_SPLIT/);
  await assert.rejects(()=>tach(C,[{to:'To may',qty:100}]),/INVALID_SPLIT/);
  await assert.rejects(()=>tach(C,[]),/INVALID_SPLIT/);
  await assert.rejects(()=>tach('khong-co',[{to:'To 1',qty:1}]),/ORDER_NOT_FOUND/);
  assert.equal((await don(C)).plan_qty,100); assert.equal((await don(C)).deleted_at,null);
  pass('tổng lệch, tổ trùng, số 0, tổ lạ, mảng rỗng, đơn không có: đều bị từ chối và không ghi dở');

  // đơn chưa tiến độ: A 100 -> 60/40, ảnh chụp ngày chốt thay tại chỗ
  await db.exec(`insert into public.khsx_day_locks values('2026-10-16',true,false)`);
  await db.exec(`insert into public.khsx_plan_snapshots(work_date,rows_json) values('2026-10-16','[{"id":"x1","so_luong":5},{"id":"${A}","ma":"SORA10-6","so_luong":100},{"id":"x2","so_luong":7}]')`);
  const before=await tongNgay();
  const r=await tach(A,[{to:'To 1',qty:60},{to:'To 3',qty:40}]);
  assert.deepEqual(r.children,[A+'__t1',A+'__t2']); assert.equal(r.kept,false);
  const g=await don(A); assert.ok(g.deleted_at); assert.ok(g.source_payload.split); assert.equal(g.source_payload.split.qty_before,100);
  const c1=await don(A+'__t1'), c2=await don(A+'__t2');
  assert.equal(c1.plan_qty,60); assert.equal(c2.plan_qty,40); assert.equal(c1.product_code,'SORA10-6');
  assert.equal(c1.is_manual,false); assert.equal(c1.source_order_id,null); assert.equal(c1.production_date.toISOString().slice(0,10),'2026-10-16');
  assert.match(c1.note,/Tách từ đơn 100 tấm/);
  const asg=await q(`select order_id,current_team::text t,plan_team::text p from public.khsx_order_assignments where order_id like '${A}__t%' order by order_id`);
  assert.deepEqual(asg.rows.map(x=>x.t),['To 1','To 3']); assert.deepEqual(asg.rows.map(x=>x.p),['To 1','To 3']);
  assert.equal(await tongNgay(),before,'tổng kế hoạch ngày đổi sau khi tách');
  const snap=(await q("select rows_json from public.khsx_plan_snapshots where work_date='2026-10-16'")).rows[0].rows_json;
  assert.deepEqual(snap.map(x=>x.id),['x1',A+'__t1',A+'__t2','x2']); assert.deepEqual(snap.map(x=>x.so_luong),[5,60,40,7]);
  pass('đơn chưa tiến độ: gốc bị thay bằng 2 đơn con, đúng tổ, tổng ngày không đổi, ảnh chụp thay đúng chỗ');

  // đồng bộ Sheet: dòng gốc vẫn còn trong file nhưng không hồi sinh
  const s=await sync([src(A,'SORA10-6',100),src(C,'LAGO15-6',100)]);
  assert.ok((await don(A)).deleted_at,'đồng bộ Sheet đã hồi sinh đơn gốc đã tách');
  assert.equal(await tongNgay(),before);
  await sync([src(C,'LAGO15-6',100)]);
  assert.ok((await don(A)).deleted_at);
  assert.equal((await don(A+'__t1')).deleted_at,null,'đồng bộ Sheet hủy nhầm đơn con');
  pass('đồng bộ Sheet (còn dòng gốc / mất dòng gốc) không hồi sinh gốc, không đụng đơn con');

  // đơn có tiến độ: C 100, đã làm Dán 30 / May 20
  await db.exec(`insert into public.khsx_stage_progress values('${C}','dan',30),('${C}','may',20)`);
  await assert.rejects(()=>tach(C,[{to:'To 3',qty:50},{to:'To 4',qty:50}]),/SPLIT_SUM_MISMATCH/);
  const r2=await tach(C,[{to:'To 4',qty:50},{to:'To 5',qty:20}]);
  assert.equal(r2.kept,true); assert.equal(r2.done,30); assert.equal(r2.left,70);
  const cg=await don(C); assert.equal(cg.plan_qty,30); assert.equal(cg.deleted_at,null);
  assert.equal((await q(`select sum(quantity)::int s from public.khsx_stage_progress where order_id='${C}' and stage='dan'`)).rows[0].s,30);
  assert.equal((await don(C+'__t1')).plan_qty,50); assert.equal((await don(C+'__t2')).plan_qty,20);
  await assert.rejects(()=>tach(C,[{to:'To 1',qty:1}]),/NOTHING_TO_SPLIT/);
  pass('đơn có tiến độ: gốc giữ lại với số đã làm, chỉ chia phần còn lại, tiến độ không đổi, không tách tiếp phần đã làm');

  // đơn con tách tiếp: id không trùng
  const r3=await tach(C+'__t1',[{to:'To 4',qty:10},{to:'To 5',qty:40}]);
  assert.deepEqual(r3.children,[C+'__t1__t1',C+'__t1__t2']);
  pass('đơn con tách tiếp được, id không trùng');

  // làm đủ hoặc đơn phát sinh không tách
  await db.exec(`insert into public.khsx_orders(id,production_date,product_code,product_name,plan_qty,is_manual) values('m1','2026-10-16','X','X',10,true)`);
  await assert.rejects(()=>tach('m1',[{to:'To 1',qty:10}]),/ORDER_NOT_SPLITTABLE/);
  const D='r_16_10_2026_D'; await db.exec(`insert into public.khsx_orders(id,production_date,product_code,product_name,plan_qty) values('${D}','2026-10-16','D','D',40)`);
  await db.exec(`insert into public.khsx_stage_progress values('${D}','dan',40)`);
  await assert.rejects(()=>tach(D,[{to:'To 1',qty:40}]),/NOTHING_TO_SPLIT/);
  pass('đơn phát sinh và đơn đã làm đủ không tách được');
  console.log('OK');
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
