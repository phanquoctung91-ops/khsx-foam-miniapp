// Gỡ Xác nhận BOM (20261012200000): chạy thật SQL trong database tạm (PGlite), kiểm bảng/hàm/quyền mất, BOM chuẩn còn.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const mig=f=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8');
const QL='00000000-0000-0000-0000-000000000001', PH='00000000-0000-0000-0000-000000000002';
(async()=>{
  const db=await PGlite.create(), q=(s,p)=>db.query(s,p);
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key); insert into auth.users values('${QL}'),('${PH}');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table public.khsx_profiles(user_id uuid primary key,role text,active boolean,display_name text);
    insert into public.khsx_profiles values('${QL}','quan_ly',true,'Anh Tùng'),('${PH}','quan_ly_2',true,'Phước');
    create table public.khsx_permissions(permission_key text primary key,display_name text,group_name text,description text,sort_order int);
    create table public.khsx_account_permissions(user_id uuid,permission_key text references public.khsx_permissions(permission_key));
    create function private.khsx_is_active() returns boolean language sql as $$select true$$;
    create function private.khsx_has_permission(p_key text,p_user_id uuid default auth.uid()) returns boolean language sql as $$select true$$;
    create table public.khsx_orders(id text primary key,product_code text,plan_qty int,deleted_at timestamptz,is_warranty boolean default false,is_ghost boolean default false);
    create table public.khsx_stage_progress(order_id text,stage text,quantity int);
  `);
  await db.exec(mig('20260925090000_xac_nhan_bom.sql'));
  await db.exec(`insert into public.khsx_account_permissions values('${PH}','bom_confirm');
                 insert into public.khsx_bom_lines(ma_hang,stt,bom,ma_vt,dinh_muc) values('SORA10-6',1,'BOM-1','MTS716',1);`);
  const dem=async s=>(await q(s)).rows[0].n;
  assert.equal(await dem("select count(*)::int n from pg_tables where tablename='khsx_bom_confirmations'"),1,'trước khi gỡ: bảng xác nhận còn');
  await db.exec(mig('20261012200000_go_xac_nhan_bom.sql'));
  assert.equal(await dem("select count(*)::int n from pg_tables where schemaname='public' and tablename='khsx_bom_confirmations'"),0,'bảng xác nhận đã xóa');
  assert.equal(await dem("select count(*)::int n from pg_proc where proname in ('khsx_confirm_bom_v1','khsx_reopen_bom_v1')"),0,'2 hàm xác nhận đã xóa');
  assert.equal(await dem("select count(*)::int n from public.khsx_permissions where permission_key='bom_confirm'"),0,'quyền bom_confirm đã xóa khỏi danh mục');
  assert.equal(await dem("select count(*)::int n from public.khsx_account_permissions where permission_key='bom_confirm'"),0,'quyền của Phước đã thu hồi');
  console.log('PASS gỡ xác nhận BOM: bảng, 2 hàm, quyền (danh mục + tài khoản) đều mất');
  assert.equal(await dem("select count(*)::int n from public.khsx_bom_lines"),1,'BOM chuẩn còn nguyên');
  await q("insert into public.khsx_bom_lines(ma_hang,stt,bom,ma_vt,dinh_muc) values('SORA10-6',2,'BOM-1','AN',1)");
  assert.equal(await dem("select count(*)::int n from public.khsx_bom_lines"),2,'BOM chuẩn vẫn ghi/đọc được');
  await db.exec(mig('20261012200000_go_xac_nhan_bom.sql'));   // chạy lại không lỗi
  console.log('PASS BOM chuẩn (khsx_bom_lines) còn nguyên, chạy migration hai lần không lỗi');
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
