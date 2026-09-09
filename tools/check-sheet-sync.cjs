// Actual PL/pgSQL execution in an isolated in-memory database. No live writes.
// Test dependency: @electric-sql/pglite@0.5.8, installed outside application deps.
// Set NODE_PATH to the test installation's node_modules directory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sqlFile=[path.join(__dirname,'../sheet-plan-sync.sql'),path.join(__dirname,'../supabase/schema/sheet_plan_sync.sql')].find(fs.existsSync);
const sql=fs.readFileSync(sqlFile,'utf8');
const manager='00000000-0000-0000-0000-000000000001';
let db,checks=0;
const q=(s,p)=>db.query(s,p);
const pass=s=>{checks++;console.log('PASS '+s)};
const source=(id,qty=1,date='2026-09-05')=>({id,production_date:date,product_code:'TEST',product_name:'LOCAL ONLY',plan_qty:qty,source_payload:{source:'sheet_live_sync_v123',live_row:{id}}});
async function seed(id,qty=1,date='2026-09-05',extra={}){
 const row={...source(id,qty,date),updated_at:'2026-01-01T00:00:00Z',...extra};
 await q(`insert into public.khsx_orders(id,production_date,product_code,product_name,plan_qty,source_payload,updated_at,is_manual,is_drop,is_ghost,is_warranty,source_order_id,deleted_at)
 select id,production_date,product_code,product_name,plan_qty,source_payload,updated_at,coalesce(is_manual,false),coalesce(is_drop,false),coalesce(is_ghost,false),coalesce(is_warranty,false),source_order_id,deleted_at
 from jsonb_populate_record(null::public.khsx_orders,$1::jsonb)`,[JSON.stringify(row)]);
}
async function reset(){await db.exec(`truncate public.khsx_orders,public.khsx_stage_progress,public.khsx_stage_operations,public.khsx_stage_progress_audit,public.khsx_stage_credits,public.khsx_order_assignments,public.khsx_day_locks;`)}
async function sync(rows,pending=[],at=new Date().toISOString()){
 return (await q(`select public.khsx_reconcile_sheet_plan($1::jsonb,$2::timestamptz,$3::text[]) result`,[JSON.stringify(rows),at,pending])).rows[0].result;
}
async function row(id){return (await q('select * from public.khsx_orders where id=$1',[id])).rows[0]}
(async()=>{
 db=await PGlite.create();
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema private;
 grant usage on schema private to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table public.khsx_profiles(user_id uuid primary key,role text,active boolean);
 insert into public.khsx_profiles values('${manager}','quan_ly',true);
 create table public.khsx_orders(
 id text primary key,production_date date not null,product_code text not null default '',product_name text not null default '',
 width_mm numeric,length_mm numeric,thickness_mm numeric,plan_qty integer not null default 0,note text not null default '',order_group text not null default '',
 source_order_id text,is_manual boolean not null default false,is_drop boolean not null default false,is_ghost boolean not null default false,is_warranty boolean not null default false,
 is_lot boolean not null default false,lot_label text not null default '',source_payload jsonb not null default '{}',deleted_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),cancel_reason text,cancelled_by uuid);
 create table public.khsx_day_locks(work_date date primary key,plan_locked boolean,progress_locked boolean);
 create table public.khsx_stage_progress(order_id text,quantity integer);
 create table public.khsx_stage_operations(order_id text,applied_quantity integer);
 create table public.khsx_stage_progress_audit(order_id text,old_quantity integer,new_quantity integer);
 create table public.khsx_stage_credits(order_id text,quantity integer);
 create table public.khsx_order_assignments(order_id text,spinoff_order_id text);
 `);
 await db.exec(sql);
 await assert.rejects(()=>sync([source('r_a')]),/FULL_MANAGER_REQUIRED/);
 await q("select set_config('test.uid',$1,false)",[manager]);
 for(const role of ['quan_ly_2','nhan_vien','chi_xem']){
  await q('update public.khsx_profiles set role=$1',[role]);
  await assert.rejects(()=>sync([source('r_a')]),/FULL_MANAGER_REQUIRED/);
 }
 await db.exec("update public.khsx_profiles set role='quan_ly',active=false");
 await assert.rejects(()=>sync([source('r_a')]),/FULL_MANAGER_REQUIRED/);
 await db.exec('update public.khsx_profiles set active=true');
 const acl=(await q(`select has_function_privilege('anon','public.khsx_reconcile_sheet_plan(jsonb,timestamptz,text[])','EXECUTE') anon,
 has_function_privilege('authenticated','public.khsx_reconcile_sheet_plan(jsonb,timestamptz,text[])','EXECUTE') authenticated,
 has_function_privilege('service_role','public.khsx_reconcile_sheet_plan(jsonb,timestamptz,text[])','EXECUTE') service_role`)).rows[0];
 assert.deepEqual(acl,{anon:false,authenticated:true,service_role:false});pass('only active full manager; public/service roles cannot execute');

 for(const rows of [[],{},null,[source('r_a'),source('r_a')],[source('r_a'),source('bad')],[source('r_a'),{...source('r_bad'),plan_qty:-1}],[source('r_a'),{...source('r_bad'),production_date:'invalid'}],[{...source('r_a'),is_manual:true}]]){
  await assert.rejects(()=>sync(rows));
  assert.equal((await q('select count(*)::int n from public.khsx_orders')).rows[0].n,0);
 }
 await assert.rejects(()=>sync([source('r_a')],[],'2000-01-01T00:00:00Z'),/STALE/);
 await assert.rejects(()=>sync([source('r_a')],[],'2099-01-01T00:00:00Z'),/STALE/);
 pass('invalid, duplicate, empty, stale batches reject atomically');

 // Sep 5 transition: retained 33 + obsolete 89 = old 122; new 33 + 34 = 67.
 await seed('r_retained',33);
 for(const [i,qty] of [15,15,15,15,9,15,5].entries())await seed('r_obsolete_'+i,qty);
 let result=await sync([source('r_retained',33),source('r_new',34)]);
 assert.equal(result.inserted,1);assert.equal(result.cancelled,7);
 assert.deepEqual((await q('select sum(plan_qty) filter(where deleted_at is null)::int active,sum(plan_qty) filter(where deleted_at is not null)::int cancelled from public.khsx_orders')).rows[0],{active:67,cancelled:89});
 assert.equal((await row('r_obsolete_0')).cancelled_by,manager);
 result=await sync([source('r_retained',33),source('r_new',34)]);assert.equal(result.changed,false);
 pass('Sep 5: soft cancel 7/89; retain 67; repeat has no writes');

 await reset();await seed('r_keep');
 for(const id of ['r_progress','r_audit','r_operations','r_credits','r_pending','r_link','r_spinoff','r_reverse'])await seed(id);
 await db.exec(`insert into public.khsx_stage_progress values('r_progress',67);
 insert into public.khsx_stage_progress_audit values('r_audit',2,0);
 insert into public.khsx_stage_operations values('r_operations',3);
 insert into public.khsx_stage_credits values('r_credits',4);
 insert into public.khsx_order_assignments values('r_spinoff','child'),('child2','r_reverse');`);
 await seed('child',1,'2026-09-05',{source_order_id:'r_link',is_manual:true});
 const before=JSON.stringify((await q('select * from public.khsx_stage_progress')).rows);
 result=await sync([source('r_keep')],['r_pending']);
 assert.equal(result.cancelled,0);assert.equal(result.review_count,8);assert.equal(result.review_updated,8);
 assert.equal((await row('r_progress')).source_payload.sheet_sync_review.removed,true);
 assert.equal(JSON.stringify((await q('select * from public.khsx_stage_progress')).rows),before);
 result=await sync([source('r_keep')],['r_pending']);assert.equal(result.changed,false);
 result=await sync([source('r_keep'),source('r_progress')],['r_pending']);
 assert.equal((await row('r_progress')).source_payload.sheet_sync_review,undefined);
 pass('current/past progress, credits, pending writes and linked orders preserved; review clears when source returns');

 await reset();await seed('r_locked');await seed('r_progress_locked',1,'2026-09-06');
 await db.exec(`insert into public.khsx_day_locks values('2026-09-05',true,false),('2026-09-06',false,true)`);
 result=await sync([source('r_new'),source('r_new2',1,'2026-09-06')]);
 assert.equal(result.changed,false);assert.equal(result.skipped_locked,4);
 assert.equal(await row('r_new'),undefined);assert.equal((await row('r_locked')).deleted_at,null);
 pass('both plan-locked and progress-locked days reject automatic changes');

 await reset();await seed('r_keep');await seed('r_history',5,'2026-08-01');
 for(const flag of ['is_manual','is_drop','is_ghost','is_warranty'])await seed('r_'+flag,1,'2026-09-05',{[flag]:true});
 await seed('r_unknown',1,'2026-09-05',{source_payload:{source:'manual_import'}});
 await seed('r_deleted',1,'2026-09-05',{deleted_at:'2026-01-02T00:00:00Z'});
 await seed('r_recent',1,'2026-09-05',{updated_at:'2099-01-01T00:00:00Z'});
 await seed('r_clone',1,'2026-09-05',{source_payload:{clone_run:'LOCAL'}});
 result=await sync([source('r_keep'),source('r_deleted')]);
 assert.equal(result.cancelled,1);assert.equal(result.skipped_recent,1);
 assert.ok((await row('r_clone')).deleted_at);assert.ok((await row('r_deleted')).deleted_at);
 for(const id of ['r_history','r_is_manual','r_is_drop','r_is_ghost','r_is_warranty','r_unknown','r_recent'])assert.equal((await row(id)).deleted_at,null,id);
 pass('no whole-day historical cleanup; preserve dynamic/unknown/recent rows; never restore tombstones');

 // Force an error after the insertion to prove the entire batch rolls back.
 await reset();await seed('r_z');
 await db.exec(`alter table public.khsx_orders add constraint local_reject_cancel check(deleted_at is null)`);
 await assert.rejects(()=>sync([source('r_a')]),/local_reject_cancel/);
 assert.equal(await row('r_a'),undefined);assert.equal((await row('r_z')).deleted_at,null);
 pass('failure during cancellation rolls back additions and cancellation together');
 console.log(`PASS ${checks} SQL test groups; no production data used or written`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(db)await db.close()});
