// Xác nhận BOM (bộ khung 2026-09-25): chạy thật SQL chờ duyệt trong database tạm (PGlite).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260925090000_xac_nhan_bom.sql'),'utf8');
const QL='00000000-0000-0000-0000-000000000001', QL2='00000000-0000-0000-0000-000000000002', NV='00000000-0000-0000-0000-000000000003';
(async()=>{
  const db=await PGlite.create();
  const q=(s,p)=>db.query(s,p);
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${QL}'),('${QL2}'),('${NV}');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table public.khsx_profiles(user_id uuid primary key,role text,active boolean,display_name text);
    insert into public.khsx_profiles values('${QL}','quan_ly',true,'Anh Tùng'),('${QL2}','quan_ly_2',true,'Quản lý 2'),('${NV}','nhan_vien',true,'NV');
    create table public.khsx_permissions(permission_key text primary key,display_name text,group_name text,description text,sort_order int);
    create table public.khsx_account_permissions(user_id uuid,permission_key text);
    create function private.khsx_is_active() returns boolean language sql as $$select true$$;
    create function private.khsx_has_permission(p_key text,p_user_id uuid default auth.uid()) returns boolean language sql as
      $$select exists(select 1 from public.khsx_profiles p where p.user_id=p_user_id and p.role='quan_ly')
         or exists(select 1 from public.khsx_account_permissions a where a.user_id=p_user_id and a.permission_key=p_key)$$;
    create table public.khsx_orders(id text primary key,product_code text,plan_qty int,deleted_at timestamptz,is_warranty boolean default false,is_ghost boolean default false);
    create table public.khsx_stage_progress(order_id text,stage text,quantity int);
    insert into public.khsx_orders(id,product_code,plan_qty) values('A','sora10-6',15),('B','SORA10-6',9);
    insert into public.khsx_orders(id,product_code,plan_qty,is_warranty) values('W','SORA10-6',3,true);
    insert into public.khsx_stage_progress values('A','dong_goi',10),('A','dong_goi',5),('A','may',15),('B','dong_goi',4),('W','dong_goi',3);
  `);
  await db.exec(sql);
  const dung=[{ma_vt:'MTS716',thuc_dung:15},{ma_vt:'ANSORA10-6',thuc_dung:15}];
  const xn=(uid,id,tt,dong,lyDo='')=>q("select set_config('test.uid',$1,false)",[uid])
    .then(()=>q('select public.khsx_confirm_bom_v1($1,$2,$3::jsonb,$4) r',[id,tt,JSON.stringify(dong),lyDo]));

  assert.equal((await q("select count(*)::int n from public.khsx_permissions where permission_key='bom_confirm'")).rows[0].n,1);
  await assert.rejects(()=>xn(QL2,'A','dung_bom',dung),/BOM_PERMISSION_REQUIRED/);
  await assert.rejects(()=>xn(NV,'A','dung_bom',dung),/BOM_PERMISSION_REQUIRED/);
  console.log('PASS  chưa được cấp quyền thì không xác nhận được (có quyền mới trong danh mục)');

  await assert.rejects(()=>xn(QL,'B','dung_bom',dung),/LOT_NOT_COMPLETE/);
  await assert.rejects(()=>xn(QL,'W','dung_bom',dung),/ORDER_NOT_FOUND/);
  console.log('PASS  lô chưa đóng gói đủ, hoặc hàng bảo hành, không xác nhận được');

  await assert.rejects(()=>xn(QL,'A','co_thay_doi',dung,''),/BOM_REASON_REQUIRED/);
  await assert.rejects(()=>xn(QL,'A','co_thay_doi',[{ma_vt:'',thuc_dung:1}],'x'),/INVALID_BOM_LINE/);
  await assert.rejects(()=>xn(QL,'A','co_thay_doi',[{ma_vt:'X',thuc_dung:-1}],'x'),/INVALID_BOM_LINE/);
  console.log('PASS  có thay đổi phải ghi lý do; dòng thiếu mã hoặc số âm bị chặn');

  await db.exec(`insert into public.khsx_account_permissions values('${QL2}','bom_confirm')`);
  await xn(QL2,'A','co_thay_doi',[{ma_vt:'MTS716',thuc_dung:14},{ma_vt:'MTS715',thuc_dung:1}],'Hết MTS716');
  const r=(await q("select * from public.khsx_bom_confirmations where order_id='A'")).rows[0];
  assert.equal(r.ma_hang,'SORA10-6'); assert.equal(r.so_tam,15); assert.equal(r.xac_nhan_ten,'Quản lý 2'); assert.equal(r.dong.length,2);
  await assert.rejects(()=>xn(QL,'A','dung_bom',dung),/BOM_ALREADY_CONFIRMED/);
  console.log('PASS  quản lý 2 được cấp quyền thì xác nhận được; mỗi lô xác nhận một lần');

  await q("select set_config('test.uid',$1,false)",[QL2]);
  await assert.rejects(()=>q("select public.khsx_reopen_bom_v1('A')"),/FULL_MANAGER_REQUIRED/);
  await q("select set_config('test.uid',$1,false)",[QL]);
  await q("select public.khsx_reopen_bom_v1('A')");
  assert.equal((await q("select count(*)::int n from public.khsx_bom_confirmations")).rows[0].n,0);
  await xn(QL,'A','dung_bom',dung);
  console.log('PASS  chỉ quản lý chính mở lại được; mở xong xác nhận lại được');

  const quyen=(await q(`select has_function_privilege('anon','public.khsx_confirm_bom_v1(text,text,jsonb,text)','EXECUTE') a,
    has_table_privilege('authenticated','public.khsx_bom_lines','INSERT') b`)).rows[0];
  assert.deepEqual(quyen,{a:false,b:false});
  console.log('PASS  khách không gọi được; app không tự ghi bảng BOM (chỉ hàm đồng bộ ghi)');
})().catch(e=>{console.error(e);process.exit(1);});
