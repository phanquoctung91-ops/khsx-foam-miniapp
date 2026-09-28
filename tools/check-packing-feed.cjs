// Feed đóng gói + đơn KHSX theo ngày (2026-09-28): chạy thật 2 hàm SQL trong database tạm (PGlite).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260928120000_khsx_packing_feed_plan_orders.sql'),'utf8');
(async()=>{
  const db=await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated;
    create type public.khsx_stage as enum ('dan','may','dong_goi');
    create table public.khsx_orders(id text primary key,production_date date,product_code text,product_name text,
      width_mm int,length_mm int,thickness_mm int,plan_qty int,source_order_id text,is_manual boolean default false,
      is_drop boolean default false,is_ghost boolean default false,is_warranty boolean default false,
      is_lot boolean default false,lot_label text,deleted_at timestamptz);
    create table public.khsx_stage_progress(order_id text,work_date date,stage public.khsx_stage,quantity int,team_key text);
    create table public.khsx_stage_operations(operation_id text primary key,stage public.khsx_stage,received_at timestamptz);
    insert into public.khsx_orders(id,production_date,product_code,plan_qty,source_order_id,deleted_at) values
      ('goc','2026-09-26','SP1',10,null,null),
      ('giua','2026-09-27','SP1',10,'goc',null),
      ('ngon','2026-09-28','SP1',10,'giua',null),
      ('le','2026-09-28','SP2',5,null,null),
      ('xoa','2026-09-28','SP3',5,null,'2026-09-28'),
      ('mai1','2026-09-29','SP4',3,null,null),
      ('mai_xoa','2026-09-29','SP5',3,null,'2026-09-28');
    insert into public.khsx_stage_progress values
      ('ngon','2026-09-28','dong_goi',4,'to1'),('ngon','2026-09-28','dong_goi',3,'to2'),
      ('le','2026-09-28','dong_goi',2,'to1'),('le','2026-09-28','may',9,'to1'),
      ('xoa','2026-09-28','dong_goi',5,'to1'),('le','2026-09-27','dong_goi',8,'to1');
    insert into public.khsx_stage_operations values('o1','dong_goi','2026-09-28 04:00Z'),('o2','may','2026-09-28 05:00Z');
  `);
  await db.exec(sql);
  const feed=async(since)=>(await db.query(`select public.khsx_packing_feed($1,'2026-09-28') f`,[since])).rows[0].f;
  const f=await feed(null);
  const by=Object.fromEntries(f.rows.map(r=>[r.order_id,r]));
  assert.equal(by.ngon.quantity,7,'Không cộng dồn nhiều team_key'); console.log('PASS  cộng dồn nhiều team_key');
  assert.equal(by.ngon.root_order_id,'goc'); assert.equal(by.ngon.root_production_date,'2026-09-26');
  assert.equal(by.le.root_order_id,'le'); console.log('PASS  lần ngược đơn gốc qua 2 tầng');
  assert.equal(by.xoa,undefined,'Đơn đã xoá bị lộ'); assert.equal(by.le.quantity,2,'Lẫn công đoạn/ngày khác');
  assert.equal(f.rows.length,2); console.log('PASS  đơn đã xoá không xuất hiện, chỉ dong_goi đúng ngày');
  assert.equal(new Date(f.cursor).toISOString(),'2026-09-28T04:00:00.000Z','cursor phải là thao tác dong_goi mới nhất');
  assert.deepEqual((await feed(f.cursor)).rows,[],'p_since = cursor mà vẫn có rows');
  assert.equal((await feed('2026-09-28 03:00Z')).rows.length,2); console.log('PASS  p_since = cursor → rỗng, p_since cũ → có rows');
  const plan=(await db.query(`select public.khsx_plan_orders_for_date('2026-09-29') p`)).rows[0].p;
  assert.deepEqual(plan.map(o=>o.id),['mai1']); console.log('PASS  đơn KHSX theo ngày bỏ đơn đã xoá');
  for(const fn of ['public.khsx_packing_feed(timestamptz,date)','public.khsx_plan_orders_for_date(date)'])
    assert.equal((await db.query(`select has_function_privilege('anon','${fn}','EXECUTE') a`)).rows[0].a,true,fn);
  console.log('PASS  anon gọi được 2 hàm');
})().catch(e=>{console.error(e);process.exit(1);});
