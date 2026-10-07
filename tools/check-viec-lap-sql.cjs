// Giao việc LẶP LẠI (migration 20261007120000) trên PGlite: kiểu lặp, ngày nghỉ (bỏ qua / dời hằng tháng), tạm dừng, từ-đến, không tạo trùng, nhắc 17:00 cả hai bên.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const mig=f=>fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations',f),'utf8');
const A='00000000-0000-0000-0000-00000000000a', P='00000000-0000-0000-0000-00000000000b', M='00000000-0000-0000-0000-00000000000d', X='00000000-0000-0000-0000-00000000000e';
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table public.khsx_permissions(permission_key text primary key, display_name text, group_name text, description text, sort_order int);
    create table public.khsx_profiles(user_id uuid, telegram_user_id bigint, display_name text, active boolean);
    create table public.khsx_account_permissions(user_id uuid, permission_key text);
    create function private.khsx_is_permission_owner(p_user uuid default auth.uid()) returns boolean language sql security definer as $$ select p_user='${A}'::uuid $$;
    create function private.khsx_has_permission(p_key text, p_user uuid default auth.uid()) returns boolean language sql security definer as
      $$ select p_user='${A}'::uuid or exists(select 1 from public.khsx_account_permissions where user_id=p_user and permission_key=p_key) $$;
    revoke all on function private.khsx_has_permission(text,uuid), private.khsx_is_permission_owner(uuid) from public;
    grant usage on schema private, auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table public.khsx_quarter_targets(year int, quarter int, target_qty int, work_dates date[]);
    create table public.khsx_orders(id text primary key, production_date date, deleted_at timestamptz, is_warranty boolean default false, is_drop boolean default false, is_ghost boolean default false);
    insert into public.khsx_profiles values('${A}',111,'Tùng',true),('${P}',222,'Phước',true),('${M}',444,'Không quyền',true),('${X}',555,'Đã nghỉ',false);`);
  for(const f of ['20260928090000_giao_viec.sql','20260929090000_giao_viec_quyen_bot.sql','20260930090000_giao_viec_doc_so_viec.sql',
                  '20261002090000_giao_viec_tieu_de_sua_viec.sql','20261002120000_sua_viec_dang_lam.sql','20261005090000_diem_danh_phat_sua.sql',
                  '20261007120000_viec_lap.sql']) await db.exec(mig(f));
  await db.exec(`create or replace function private.khsx_hom_nay_vn() returns date language sql stable as $$ select current_setting('test.hn')::date $$;`);
  const q=(s,p)=>db.query(s,p), la=u=>db.exec(`set test.uid='${u}'`), hn=d=>db.exec(`set test.hn='${d}'`);
  const loi=async f=>{ try{ await f(); return ''; }catch(e){ return e.message; } };
  // Lịch quý 4/2026: mọi ngày trừ Chủ nhật, 14/10 (lễ giả định) và 20/10
  await db.exec(`insert into public.khsx_quarter_targets select 2026,4,11500, array(select d::date from generate_series('2026-10-01'::date,'2026-12-31'::date,'1 day') d
    where extract(isodow from d)<>7 and d::date not in ('2026-10-14','2026-10-20'))`);
  hn('2026-10-12');
  const giao=(td,kieu,thu,ngay,tu,den,ai=P)=>q(`select public.khsx_giao_viec_lap_v1($1,$2,'chi tiết',$3,$4,$5,$6,$7) id`,[ai,td,kieu,thu,ngay,tu,den]).then(r=>r.rows[0].id);

  // --- quyền + kiểm tra đầu vào
  await la(M); assert.match(await loi(()=>giao('x','ngay',[],[],'2026-10-12',null)),/TASK_ASSIGN_FORBIDDEN/);
  await la(A);
  assert.match(await loi(()=>giao('  ','ngay',[],[],'2026-10-12',null)),/TASK_TEXT_INVALID/);
  assert.match(await loi(()=>giao('x','ngay',[],[],'2026-10-12',null,X)),/TASK_ASSIGNEE_INVALID/);
  assert.match(await loi(()=>giao('x','nam',[],[],'2026-10-12',null)),/TASK_REPEAT_INVALID/);
  assert.match(await loi(()=>giao('x','tuan',[],[],'2026-10-12',null)),/TASK_REPEAT_DAYS_REQUIRED/);
  assert.match(await loi(()=>giao('x','tuan',[8,0],[],'2026-10-12',null)),/TASK_REPEAT_DAYS_REQUIRED/);
  assert.match(await loi(()=>giao('x','thang',[],[32],'2026-10-12',null)),/TASK_REPEAT_DAYS_REQUIRED/);
  assert.match(await loi(()=>giao('x','ngay',[],[],'2026-10-11',null)),/TASK_REPEAT_RANGE_INVALID/);
  assert.match(await loi(()=>giao('x','ngay',[],[],'2026-10-12','2026-10-11')),/TASK_REPEAT_RANGE_INVALID/);
  console.log('PASS chỉ người có quyền Giao việc tạo được; tiêu đề trống, người nhận đã nghỉ, kiểu lạ, thiếu thứ / ngày, ngày quá khứ, đến < từ đều bị chặn');

  // --- 6 quy tắc; vừa giao hôm nay (Thứ 2 12/10) đến lượt thì tạo luôn
  const R1=await giao('Dọn kho mỗi ngày','ngay',[],[],'2026-10-12',null);
  const R2=await giao('Kiểm kho T2 + T5','tuan',[4,1,1],[],'2026-10-12',null);
  const R3=await giao('Báo cáo ngày 14','thang',[],[14],'2026-10-12',null);
  const R4=await giao('Việc ngày 20','thang',[],[20],'2026-10-12',null);
  const R5=await giao('Việc ngày 31','thang',[],[31],'2026-10-12',null);
  const R6=await giao('Việc ngày 18 (Chủ nhật)','thang',[],[18],'2026-10-12',null);
  const dem=async()=>(await q(`select tu_dong,ngay_tu_dong::text d from public.khsx_tasks where tu_dong like 'lap-%' order by 2`)).rows;
  assert.deepEqual((await dem()).map(r=>r.tu_dong.slice(4)+' '+r.d).sort(),[R1+' 2026-10-12',R2+' 2026-10-12'].sort());
  assert.deepEqual((await q(`select thu::text t from public.khsx_viec_lap where id=$1`,[R2])).rows[0].t,'{1,4}');
  console.log('PASS giao xong hôm nay đến lượt thì tạo việc luôn (hằng ngày + Thứ 2 hằng tuần), thứ trùng lặp được gọn lại');

  // --- chạy 7h từng ngày, mỗi ngày chạy 2 lần (không tạo trùng)
  const ngayTao={};
  const chay=async d=>{ await hn(d); await q(`select private.khsx_tao_viec_lap()`); await q(`select private.khsx_tao_viec_lap()`); };
  const ds=[]; for(let d=new Date('2026-10-12T00:00:00Z');d<=new Date('2026-10-31T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)) ds.push(d.toISOString().slice(0,10));
  for(const d of ds) await chay(d);
  await chay('2026-11-30');
  (await dem()).forEach(r=>{ const k=r.tu_dong.slice(4); (ngayTao[k]||(ngayTao[k]=[])).push(r.d); });
  const ngay=k=>(ngayTao[k]||[]).map(x=>x.slice(5));
  assert.deepEqual(ngay(R1),['10-12','10-13','10-15','10-16','10-17','10-19','10-21','10-22','10-23','10-24','10-26','10-27','10-28','10-29','10-30','10-31','11-30']);
  console.log('PASS hằng ngày: chạy mọi ngày trong lịch, bỏ Chủ nhật, lễ 14/10 và 20/10; không tạo trùng khi chạy lại');
  assert.deepEqual(ngay(R2),['10-12','10-15','10-19','10-22','10-26','10-29','11-30']);   // 30/11 là Thứ 2
  console.log('PASS hằng tuần: Thứ 2 và Thứ 5; Thứ 5 mà là ngày thường thì tạo, ngày nghỉ bị bỏ qua');
  assert.deepEqual(ngay(R3),['10-15']);   // 14/10 là ngày nghỉ -> dời sang 15/10
  assert.deepEqual(ngay(R4),['10-21']);   // 20/10 nghỉ -> 21/10
  assert.deepEqual(ngay(R6),['10-19']);   // 18/10 Chủ nhật -> Thứ 2 19/10
  console.log('PASS hằng tháng: ngày rơi vào ngày nghỉ thì dời sang ngày làm việc kế tiếp');
  assert.deepEqual(ngay(R5),['10-31','11-30']);   // tháng 11 không có ngày 31 -> lấy ngày cuối tháng 30/11
  console.log('PASS hằng tháng ngày 31: tháng không có ngày 31 thì lấy ngày cuối tháng');

  // --- nội dung việc + tin + nhắc 17:00 cả hai bên
  const t=(await q(`select tieu_de,nguoi_giao,nguoi_nhan,trang_thai,han::text han from public.khsx_tasks where tu_dong=$1 and ngay_tu_dong='2026-10-12'`,['lap-'+R1])).rows[0];
  assert.deepEqual(t,{tieu_de:'Dọn kho mỗi ngày',nguoi_giao:A,nguoi_nhan:P,trang_thai:'dang_lam',han:'2026-10-12'});
  const tin=(await q(`select noi_dung from public.khsx_tin_nhan_cho where chat_id=222 and noi_dung like '🔁 Việc lặp: Dọn kho mỗi ngày%' limit 1`)).rows[0];
  assert.ok(tin&&/Hạn hôm nay/.test(tin.noi_dung));
  await db.exec(`truncate public.khsx_tin_nhan_cho`); await hn('2026-10-12');
  await q(`select private.khsx_nhac_viec_tre()`);
  const l=(await q(`select loai,chat_id::int c from public.khsx_tin_nhan_cho order by id`)).rows;
  assert.equal(l.filter(r=>r.loai==='nhac'&&r.c===222).length,2);       // 2 việc lặp 12/10 chưa xong: nhắc người nhận
  assert.equal(l.filter(r=>r.loai==='bao_tre'&&r.c===111).length,2);    // và báo người giao
  console.log('PASS việc lặp: người giao ≠ người nhận, đang làm, hạn trong ngày, bot nhắn; 17:00 chưa xong nhắc cả người nhận lẫn báo người giao');
  await la(P); await q(`select public.khsx_xong_viec_v1(id) from public.khsx_tasks where tu_dong=$1 and ngay_tu_dong='2026-10-12'`,['lap-'+R1]);
  assert.equal((await q(`select count(*)::int n from public.khsx_tin_nhan_cho where loai='xong' and chat_id=111`)).rows[0].n,1);
  console.log('PASS người nhận bấm Xong thì báo người giao');

  // --- tạm dừng / tiếp tục / từ - đến / quý chưa có lịch
  await la(M); assert.match(await loi(()=>q(`select public.khsx_viec_lap_tam_dung_v1($1,true)`,[R1])),/TASK_ASSIGN_FORBIDDEN/);
  await db.exec(`insert into public.khsx_account_permissions values('${P}','task_assign')`); await la(P);
  await q(`select public.khsx_viec_lap_tam_dung_v1($1,true)`,[R1]);
  await hn('2026-11-02'); await q(`select private.khsx_tao_viec_lap()`);
  assert.equal((await q(`select count(*)::int n from public.khsx_tasks where tu_dong=$1 and ngay_tu_dong='2026-11-02'`,['lap-'+R1])).rows[0].n,0);
  await q(`select public.khsx_viec_lap_tam_dung_v1($1,false)`,[R1]);
  await hn('2026-11-03'); await q(`select private.khsx_tao_viec_lap()`);
  assert.equal((await q(`select count(*)::int n from public.khsx_tasks where tu_dong=$1 and ngay_tu_dong='2026-11-03'`,['lap-'+R1])).rows[0].n,1);
  console.log('PASS tạm dừng thì không tạo, tiếp tục thì tạo lại');
  await hn('2026-11-04'); await la(A);
  const R7=await giao('Có hạn kết thúc','ngay',[],[],'2026-11-04','2026-11-05');
  const R8=await giao('Chưa tới ngày bắt đầu','ngay',[],[],'2026-11-10',null);
  await hn('2026-11-06'); await q(`select private.khsx_tao_viec_lap()`);
  assert.equal((await q(`select count(*)::int n from public.khsx_tasks where tu_dong in ($1,$2) and ngay_tu_dong='2026-11-06'`,['lap-'+R7,'lap-'+R8])).rows[0].n,0);
  assert.equal((await q(`select count(*)::int n from public.khsx_tasks where tu_dong=$1 and ngay_tu_dong='2026-11-04'`,['lap-'+R7])).rows[0].n,1);
  console.log('PASS từ ngày / đến ngày: trước ngày bắt đầu và sau ngày kết thúc không tạo');
  await hn('2027-01-04'); assert.equal((await q(`select private.khsx_tao_viec_lap() n`)).rows[0].n,0);
  console.log('PASS quý chưa lưu lịch ngày làm việc thì không tạo');

  // --- xóa quy tắc, quyền đọc
  const truoc=(await q(`select count(*)::int n from public.khsx_tasks where tu_dong=$1`,['lap-'+R7])).rows[0].n;
  await q(`select public.khsx_viec_lap_xoa_v1($1)`,[R7]);
  assert.equal((await q(`select count(*)::int n from public.khsx_tasks where tu_dong=$1`,['lap-'+R7])).rows[0].n,truoc);
  assert.match(await loi(()=>q(`select public.khsx_viec_lap_xoa_v1($1)`,[R7])),/TASK_NOT_FOUND/);
  const doc=async u=>{ await db.exec(`set test.uid='${u}'; set role authenticated`); try{ return (await q(`select count(*)::int n from public.khsx_viec_lap`)).rows[0].n; } finally { await db.exec('reset role'); } };
  assert.equal(await doc(M),0); assert.equal(await doc(A)>0,true); assert.equal(await doc(P)>0,true);
  await db.exec('set role authenticated'); await la(P);
  assert.match(await loi(()=>q(`insert into public.khsx_viec_lap(tieu_de,nguoi_giao,nguoi_nhan,kieu,tu_ngay) values('x',$1,$1,'ngay','2026-11-01')`,[P])),/permission denied/);
  await db.exec('reset role');
  console.log('PASS xóa quy tắc thì việc đã tạo giữ nguyên; người không có quyền không đọc được; ghi thẳng vào bảng bị chặn');
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
