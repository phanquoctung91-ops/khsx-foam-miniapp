// Sửa tay đơn kế hoạch (2026-09-24): chạy thật hàm PL/pgSQL trong database tạm trong bộ nhớ
// (PGlite), không đụng database thật. Kiểm: giữ id, nạp lại file cũ không đè bản sửa, file
// đổi thì đơn sửa tay không bị tự hủy, chặn số lượng < số đã làm, chặn dời ngày khi đã làm,
// ảnh chụp ngày đã chốt được sửa theo.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260924100000_sua_don_tay.sql'),'utf8');
const manager='00000000-0000-0000-0000-000000000001';
let db;
const q=(s,p)=>db.query(s,p);
const pass=s=>console.log('PASS  '+s);
const src=(id,ma,qty,date='2026-09-25')=>({id,production_date:date,product_code:ma,product_name:'SORA',width_mm:160,length_mm:200,thickness_mm:10,plan_qty:qty,source_payload:{source:'sheet_live_sync_v123',live_row:{id}}});
const sync=rows=>q(`select public.khsx_reconcile_sheet_plan($1::jsonb,now(),'{}'::text[]) r`,[JSON.stringify(rows)]).then(x=>x.rows[0].r);
const sua=edits=>q('select public.khsx_edit_order_v1($1::jsonb) r',[JSON.stringify(edits)]).then(x=>x.rows[0].r);
const don=id=>q('select * from public.khsx_orders where id=$1',[id]).then(x=>x.rows[0]);
const anh=d=>q('select rows_json from public.khsx_plan_snapshots where work_date=$1',[d]).then(x=>x.rows[0]?.rows_json);

(async()=>{
  db=await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table public.khsx_profiles(user_id uuid primary key,role text,active boolean);
    insert into public.khsx_profiles values('${manager}','quan_ly',true);
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
    create table public.khsx_order_assignments(order_id text,spinoff_order_id text);
  `);
  await db.exec(sql);
  await db.exec(`create function public.khsx_reconcile_sheet_plan(a jsonb,b timestamptz,c text[]) returns jsonb language sql as $$select private.khsx_reconcile_sheet_plan_impl(a,b,c)$$;`);

  await assert.rejects(()=>sua([{id:'x',ma:'A'}]),/FULL_MANAGER_REQUIRED/);
  await q("select set_config('test.uid',$1,false)",[manager]);
  await db.exec("update public.khsx_profiles set role='quan_ly_2'");
  await assert.rejects(()=>sua([{id:'x',ma:'A'}]),/FULL_MANAGER_REQUIRED/);
  await db.exec("update public.khsx_profiles set role='quan_ly'");
  pass('chỉ quản lý chính được sửa');

  // Nạp file có mã sai: SORA10-9 (đúng phải là SORA10-6)
  const SAI='r_25_09_2026_SORA10_9_160_200_10_15_1';
  await sync([src(SAI,'SORA10-9',15)]);
  await sua([{id:SAI,ma:'SORA10-6',dong:'SORA'}]);
  let a=await don(SAI);
  assert.equal(a.product_code,'SORA10-6'); assert.equal(a.id,SAI);
  assert.equal(a.source_payload.manual_edit.before.ma,'SORA10-9');
  await sua([{id:SAI,ghi_chu:'Hàng đẹp'}]);
  a=await don(SAI);
  assert.equal(a.source_payload.manual_edit.before.ma,'SORA10-9','Lần sửa thứ hai làm mất giá trị lúc nạp');
  assert.equal(a.source_payload.manual_edit.count,2);
  pass('sửa mã giữ nguyên id đơn, nhớ giá trị lúc nạp');

  // Nạp lại đúng file cũ (vẫn mã sai) -> không đè, không sinh đơn mới
  let r=await sync([src(SAI,'SORA10-9',15)]);
  a=await don(SAI);
  assert.equal(a.product_code,'SORA10-6','Nạp lại file cũ đè mất mã đã sửa');
  assert.equal(r.inserted,0); assert.equal(r.cancelled,0);
  assert.equal((await q('select count(*)::int n from public.khsx_orders where deleted_at is null')).rows[0].n,1);
  pass('nạp lại file cũ: giữ bản đã sửa, không thêm đơn');

  // File mới đổi số lượng 15 -> 22 => id mới; đơn sửa tay CHƯA làm vẫn không bị tự hủy
  const MOI='r_25_09_2026_SORA10_9_160_200_10_22_1';
  r=await sync([src(MOI,'SORA10-9',22)]);
  a=await don(SAI);
  assert.equal(a.deleted_at,null,'Đơn sửa tay bị tự hủy khi file đổi — mất đơn để hợp nhất');
  assert.equal(a.source_payload.sheet_sync_review.reason,'manual_edit');
  assert.ok((await don(MOI)) && r.inserted===1);
  pass('file đổi số lượng: đơn sửa tay được giữ, gắn cần kiểm tra; dòng mới được thêm');

  // Đơn sửa tay đã hủy mà dòng cũ xuất hiện lại -> sống lại nhưng giữ bản sửa
  await db.exec(`update public.khsx_orders set deleted_at=now() where id='${SAI}'`);
  await sync([src(SAI,'SORA10-9',15),src(MOI,'SORA10-9',22)]);
  a=await don(SAI);
  assert.equal(a.deleted_at,null); assert.equal(a.product_code,'SORA10-6','Sống lại nhưng lấy lại mã sai của file');
  pass('đơn sửa tay sống lại vẫn giữ mã đã sửa');

  // Đơn thường (không sửa tay) vẫn tự hủy như cũ
  await sync([src('r_thuong','STD10-4',9,'2026-09-26')]);
  await sync([src('r_khac','STD10-4',5,'2026-09-26')]);
  assert.notEqual((await don('r_thuong')).deleted_at,null);
  pass('đơn không sửa tay vẫn tự hủy như trước');

  // Chặn số lượng nhỏ hơn số đã làm; chặn dời ngày khi đã làm
  await db.exec(`insert into public.khsx_stage_progress values('${MOI}','dan',12),('${MOI}','may',5)`);
  await assert.rejects(()=>sua([{id:MOI,so_luong:10}]),/PLAN_BELOW_PROGRESS/);
  await sua([{id:MOI,so_luong:12}]);
  await assert.rejects(()=>sua([{id:MOI,date:'2026-09-27'}]),/ORDER_HAS_PROGRESS/);
  pass('chặn số lượng nhỏ hơn số đã Dán, chặn dời ngày khi đã làm');

  // Đơn phát sinh không sửa ở đây
  await db.exec(`insert into public.khsx_orders(id,production_date,product_code,product_name,plan_qty,is_manual) values('m_1','2026-09-25','X','X',1,true)`);
  await assert.rejects(()=>sua([{id:'m_1',ma:'Y'}]),/ORDER_NOT_EDITABLE/);
  await assert.rejects(()=>sua([{id:SAI,ma:' '}]),/INVALID_ORDER_EDIT/);
  pass('không sửa đơn phát sinh, không cho để trống mã');

  // Ngày đang chốt: sửa ảnh chụp tại chỗ; dời ngày thì chuyển dòng sang ảnh ngày mới
  await sync([src('r_c1','LUN10-4',5,'2026-09-28'),src('r_c2','LUN10-6',5,'2026-09-28')]);
  await db.exec(`insert into public.khsx_day_locks values('2026-09-28',true,false),('2026-09-29',true,false);
    insert into public.khsx_plan_snapshots(work_date,rows_json) values
     ('2026-09-28','[{"id":"r_c1","date":"28/09/2026","ma":"LUN10-4","dong":"LUNA","ngang":"160","dai":"200","day":"10","so_luong":5,"is_lot":false},{"id":"r_c2","date":"28/09/2026","ma":"LUN10-6","so_luong":5}]'),
     ('2026-09-29','[{"id":"r_x","ma":"X","so_luong":1}]');`);
  await sua([{id:'r_c1',ma:'LUN12-4',day:12,so_luong:4}]);
  let s=await anh('2026-09-28');
  const c1=s.find(x=>x.id==='r_c1');
  assert.equal(c1.ma,'LUN12-4'); assert.equal(c1.day,'12'); assert.equal(c1.so_luong,4); assert.equal(c1.is_lot,false);
  assert.equal(s.length,2);
  await sua([{id:'r_c2',date:'2026-09-29'}]);
  s=await anh('2026-09-28'); assert.deepEqual(s.map(x=>x.id),['r_c1']);
  s=await anh('2026-09-29'); assert.deepEqual(s.map(x=>x.id),['r_x','r_c2']); assert.equal(s[1].date,'29/09/2026');
  pass('ngày đã chốt: ảnh chụp sửa theo, dời ngày thì chuyển dòng sang ảnh ngày mới');

  // Sửa cả lô trong một lần gọi, lỗi một dòng thì không dòng nào đổi
  await sync([src('r_l__lo1','CLS10-6',15,'2026-09-30'),src('r_l__lo2','CLS10-6',5,'2026-09-30')]);
  await assert.rejects(()=>sua([{id:'r_l__lo1',ma:'CLS10-8'},{id:'r_l__lo2',ma:''}]));
  assert.equal((await don('r_l__lo1')).product_code,'CLS10-6','Lỗi giữa chừng mà dòng đầu vẫn bị đổi');
  await sua([{id:'r_l__lo1',ma:'CLS10-8'},{id:'r_l__lo2',ma:'CLS10-8'}]);
  assert.equal((await don('r_l__lo2')).product_code,'CLS10-8');
  pass('sửa nhiều lô một lần, lỗi thì không đổi dòng nào');
})().catch(e=>{console.error(e);process.exit(1);});
