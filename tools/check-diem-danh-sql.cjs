// Điểm danh + Phát sữa + việc nhắc điểm danh 7h (migration 20261005090000) trên PGlite.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const mig=f=>fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations',f),'utf8');
const A='00000000-0000-0000-0000-00000000000a', P='00000000-0000-0000-0000-00000000000b', P2='00000000-0000-0000-0000-00000000000c',
      M='00000000-0000-0000-0000-00000000000d', X='00000000-0000-0000-0000-00000000000e';
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table public.khsx_permissions(permission_key text primary key, display_name text, group_name text, description text, sort_order int);
    create table public.khsx_profiles(user_id uuid, telegram_user_id bigint, display_name text, active boolean);
    create table public.khsx_account_permissions(user_id uuid, permission_key text);
    -- A = chủ tài khoản (anh Tùng, đủ mọi quyền); người khác chỉ có quyền được cấp
    create function private.khsx_is_permission_owner(p_user uuid default auth.uid()) returns boolean language sql security definer as $$ select p_user='${A}'::uuid $$;
    create function private.khsx_has_permission(p_key text, p_user uuid default auth.uid()) returns boolean language sql security definer as
      $$ select p_user='${A}'::uuid or exists(select 1 from public.khsx_account_permissions where user_id=p_user and permission_key=p_key) $$;
    revoke all on function private.khsx_has_permission(text,uuid), private.khsx_is_permission_owner(uuid) from public;
    grant usage on schema private, auth to authenticated; grant execute on function auth.uid() to authenticated;
    -- Giống production: authenticated KHÔNG được gọi trực tiếp khsx_has_permission / khsx_is_permission_owner (chỉ hàm bọc không tham số).
    create table public.khsx_quarter_targets(year int, quarter int, target_qty int, work_dates date[]);
    create table public.khsx_orders(id text primary key, production_date date, deleted_at timestamptz, is_warranty boolean default false, is_drop boolean default false, is_ghost boolean default false);
    insert into public.khsx_profiles values('${A}',111,'Tùng',true),('${P}',222,'Phước',true),('${P2}',333,'Phước 2',true),('${M}',444,'Không quyền',true),('${X}',555,'Đã nghỉ',false);`);
  for(const f of ['20260928090000_giao_viec.sql','20260929090000_giao_viec_quyen_bot.sql','20260930090000_giao_viec_doc_so_viec.sql',
                  '20261002090000_giao_viec_tieu_de_sua_viec.sql','20261002120000_sua_viec_dang_lam.sql']) await db.exec(mig(f));
  await db.exec(mig('20261005090000_diem_danh_phat_sua.sql'));
  await db.exec(mig('20261005120000_diem_danh_chuc_vu.sql'));
  await db.exec(mig('20261005140000_diem_danh_sua_quyen_doc.sql'));
  await db.exec(mig('20261005160000_diem_danh_to_phu_kho_ho_tro.sql'));
  await db.exec(mig('20261007090000_diem_danh_ghi_chu.sql'));
  await db.exec(mig('20261008090000_phat_sua_hoan_tac.sql'));
  await db.exec(mig('20261009090000_phat_sua_khoang_chua.sql'));
  await db.exec(mig('20261009120000_diem_danh_tang_ca.sql'));
  // Hôm nay giả lập: đặt được bằng test.hn
  await db.exec(`create or replace function private.khsx_hom_nay_vn() returns date language sql stable as $$ select current_setting('test.hn')::date $$;`);
  const q=(s,p)=>db.query(s,p), la=u=>db.exec(`set test.uid='${u}'`), hn=d=>db.exec(`set test.hn='${d}'`);
  const loi=async f=>{ try{ await f(); return ''; }catch(e){ return e.message; } };
  hn('2026-10-12');

  assert.equal((await q(`select count(*)::int n from public.khsx_permissions where permission_key in ('diem_danh','phat_sua')`)).rows[0].n,2);
  console.log('PASS 2 quyền mới (Điểm danh, Phát sữa) có trong danh mục phân quyền');

  // Danh sách người
  await la(P); await db.exec(`insert into public.khsx_account_permissions values('${P}','diem_danh')`);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_them_nguoi_v1('Lan')`)),/ATTENDANCE_LIST_FORBIDDEN/);
  await la(A);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_them_nguoi_v1('   ')`)),/ATTENDEE_NAME_INVALID/);
  const lan=(await q(`select public.khsx_diem_danh_them_nguoi_v1('  Lan ') id`)).rows[0].id;
  const hoa=(await q(`select public.khsx_diem_danh_them_nguoi_v1('Hoa') id`)).rows[0].id;
  const nghi=(await q(`select public.khsx_diem_danh_them_nguoi_v1('Mai') id`)).rows[0].id;
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_them_nguoi_v1('lan')`)),/ATTENDEE_EXISTS/);
  assert.equal((await q(`select ten from public.khsx_diem_danh_nguoi where id=$1`,[lan])).rows[0].ten,'Lan');
  console.log('PASS chỉ chủ tài khoản thêm người; tên trống / trùng bị chặn; tên được cắt khoảng trắng');

  // Chức vụ + tổ: chỉ chủ tài khoản đặt; tổ chỉ đi với Công nhân
  const cv=async id=>(await q(`select chuc_vu,to_lam from public.khsx_diem_danh_nguoi where id=$1`,[id])).rows[0];
  assert.deepEqual(await cv(lan),{chuc_vu:null,to_lam:null});
  await la(P); assert.match(await loi(()=>q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','Tổ may')`,[lan])),/ATTENDANCE_LIST_FORBIDDEN/);
  await la(A);
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','Tổ dán 3')`,[lan]);
  assert.deepEqual(await cv(lan),{chuc_vu:'Công nhân',to_lam:'Tổ dán 3'});
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Thủ kho','Tổ may')`,[lan]);          // chức vụ khác: tổ tự xóa
  assert.deepEqual(await cv(lan),{chuc_vu:'Thủ kho',to_lam:null});
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','')`,[hoa]);             // Công nhân chưa chọn tổ vẫn được
  assert.deepEqual(await cv(hoa),{chuc_vu:'Công nhân',to_lam:null});
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Giám đốc','')`,[lan])),/ATTENDEE_ROLE_INVALID/);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','Tổ dán 9')`,[lan])),/ATTENDEE_TEAM_INVALID/);
  assert.match(await loi(()=>q(`update public.khsx_diem_danh_nguoi set to_lam='Tổ may' where id=$1`,[lan])),/violates check constraint/);   // ghi thẳng cũng bị chặn
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'','')`,[lan]);                       // xóa trống
  assert.deepEqual(await cv(lan),{chuc_vu:null,to_lam:null});
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','Tổ đóng gói')`,[lan]);
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','Phụ kho')`,[lan]); assert.deepEqual(await cv(lan),{chuc_vu:'Công nhân',to_lam:'Phụ kho'});
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','Hỗ trợ')`,[lan]); assert.deepEqual(await cv(lan),{chuc_vu:'Công nhân',to_lam:'Hỗ trợ'});
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Thủ kho','Phụ kho')`,[lan]); assert.deepEqual(await cv(lan),{chuc_vu:'Thủ kho',to_lam:null});   // Phụ kho / Hỗ trợ chỉ là tổ của Công nhân
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','Tổ đóng gói')`,[lan]);
  console.log('PASS chức vụ + tổ: chỉ chủ đặt được; tổ chỉ đi với Công nhân, đổi chức vụ thì tổ tự xóa; giá trị lạ bị chặn');

  // Tick điểm danh
  await la(M); assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-12',true,true)`,[lan])),/ATTENDANCE_FORBIDDEN/);
  await la(P);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-13',true,true)`,[lan])),/ATTENDANCE_DATE_INVALID/);
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-08',true,true)`,[lan]);    // cả ngày
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-09',true,false)`,[lan]);   // chỉ sáng
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-10',false,true)`,[lan]);   // chỉ chiều
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-11',true,true)`,[lan]);
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-11',false,false)`,[lan]);  // bỏ hết = xóa
  assert.equal((await q(`select count(*)::int n from public.khsx_diem_danh where nguoi_id=$1`,[lan])).rows[0].n,3);
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-08',true,true)`,[hoa]);
  await la(A); await q(`select public.khsx_diem_danh_xoa_nguoi_v1($1)`,[nghi]);
  await la(P); assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-12',true,true)`,[nghi])),/ATTENDEE_NOT_FOUND/);
  console.log('PASS tick sáng / chiều / cả ngày, sửa ngày cũ được, bỏ cả hai thì xóa dòng, ngày tương lai và người đã xóa bị chặn');

  // Bảng sữa
  await la(P2); await db.exec(`insert into public.khsx_account_permissions values('${P2}','phat_sua')`);
  const bang=async(tu,den)=>(await q(`select ten,ngay_chua_nhan,hop_chua_nhan,hop_da_nhan from public.khsx_phat_sua_bang_v1($1,$2)`,[tu,den])).rows;
  assert.deepEqual(await bang('2026-10-08','2026-10-12'),[{ten:'Hoa',ngay_chua_nhan:1,hop_chua_nhan:2,hop_da_nhan:0},{ten:'Lan',ngay_chua_nhan:3,hop_chua_nhan:4,hop_da_nhan:0}]);
  assert.deepEqual((await q(`select chuc_vu,to_lam from public.khsx_phat_sua_bang_v1('2026-10-08','2026-10-12') where ten='Lan'`)).rows,[{chuc_vu:'Công nhân',to_lam:'Tổ đóng gói'}]);
  assert.deepEqual(await bang('2026-10-09','2026-10-10'),[{ten:'Lan',ngay_chua_nhan:2,hop_chua_nhan:2,hop_da_nhan:0}]);
  await la(P); assert.match(await loi(()=>q(`select * from public.khsx_phat_sua_bang_v1('2026-10-08','2026-10-12')`)),/MILK_FORBIDDEN/);
  await la(P2); assert.match(await loi(()=>q(`select * from public.khsx_phat_sua_bang_v1('2026-10-12','2026-10-08')`)),/MILK_RANGE_INVALID/);
  console.log('PASS đếm hộp: cả ngày = 2, một buổi = 1; lọc theo khoảng ngày; quyền Phát sữa riêng với quyền Điểm danh');

  // Phát sữa: loại ngày đã nhận
  assert.equal((await q(`select public.khsx_phat_sua_v1($1,'2026-10-08','2026-10-09') h`,[lan])).rows[0].h,3);
  assert.deepEqual(await bang('2026-10-08','2026-10-12'),[{ten:'Hoa',ngay_chua_nhan:1,hop_chua_nhan:2,hop_da_nhan:0},{ten:'Lan',ngay_chua_nhan:1,hop_chua_nhan:1,hop_da_nhan:3}]);
  assert.match(await loi(()=>q(`select public.khsx_phat_sua_v1($1,'2026-10-08','2026-10-09')`,[lan])),/MILK_NOTHING_TO_GIVE/);
  assert.equal((await q(`select public.khsx_phat_sua_v1($1,'2026-10-08','2026-10-12') h`,[lan])).rows[0].h,1);   // chỉ ngày 10/10 còn chưa nhận
  const dp=(await q(`select ngay::text, so_hop, phat_boi from public.khsx_phat_sua where nguoi_id=$1 order by ngay`,[lan])).rows;
  assert.deepEqual(dp.map(r=>[r.ngay,r.so_hop]),[['2026-10-08',2],['2026-10-09',1],['2026-10-10',1]]); assert.equal(dp[0].phat_boi,P2);
  await la(P); assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-08',true,false)`,[lan])),/ATTENDANCE_LOCKED/);
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-12',true,false)`,[lan]);   // ngày mới vẫn tick được
  await la(P2); assert.equal((await q(`select public.khsx_phat_sua_v1($1,'2026-10-08','2026-10-12') h`,[lan])).rows[0].h,1);
  console.log('PASS tick đã phát: ghi số hộp từng ngày + người bấm, ngày đã nhận không tính lại, ngày đã phát khóa điểm danh');

  // Phát sữa v2 (không hộp xác nhận) + Hoàn tác theo lô, chỉ chủ tài khoản
  const hoaSua=async()=>(await bang('2026-10-08','2026-10-12')).find(r=>r.ten==='Hoa');
  await la(P2);
  const l1=(await q(`select public.khsx_phat_sua_v2($1,'2026-10-08','2026-10-12') r`,[hoa])).rows[0].r;
  assert.equal(l1.hop,2); assert.ok(l1.lo);
  assert.deepEqual(await hoaSua(),{ten:'Hoa',ngay_chua_nhan:0,hop_chua_nhan:0,hop_da_nhan:2});
  assert.match(await loi(()=>q(`select public.khsx_phat_sua_v2($1,'2026-10-08','2026-10-12')`,[hoa])),/MILK_NOTHING_TO_GIVE/);
  await la(P); assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-08',true,false)`,[hoa])),/ATTENDANCE_LOCKED/);
  assert.match(await loi(()=>q(`select public.khsx_phat_sua_hoan_tac_v1($1)`,[l1.lo])),/MILK_UNDO_FORBIDDEN/);       // Phước (Điểm danh) không hoàn tác được
  await la(P2); assert.match(await loi(()=>q(`select public.khsx_phat_sua_hoan_tac_v1($1)`,[l1.lo])),/MILK_UNDO_FORBIDDEN/);   // người có quyền Phát sữa cũng không
  await la(A);
  assert.deepEqual((await q(`select public.khsx_phat_sua_hoan_tac_v1($1) r`,[l1.lo])).rows[0].r,{hop:2,ngay:1});
  assert.deepEqual(await hoaSua(),{ten:'Hoa',ngay_chua_nhan:1,hop_chua_nhan:2,hop_da_nhan:0});
  assert.match(await loi(()=>q(`select public.khsx_phat_sua_hoan_tac_v1($1)`,[l1.lo])),/MILK_UNDO_NOTHING/);              // hoàn tác lần hai
  assert.match(await loi(()=>q(`select public.khsx_phat_sua_hoan_tac_v1('00000000-0000-0000-0000-0000000000ff')`)),/MILK_UNDO_NOTHING/);
  assert.match(await loi(()=>q(`select public.khsx_phat_sua_hoan_tac_v1(null)`)),/MILK_UNDO_NOTHING/);
  await la(P); await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-08',true,true)`,[hoa]);                                // mở khóa: sửa điểm danh lại được
  // hai lô độc lập: hoàn tác lô sau không đụng lô trước
  await la(P2); const l2=(await q(`select public.khsx_phat_sua_v2($1,'2026-10-08','2026-10-08') r`,[hoa])).rows[0].r;
  await la(P); await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-09',true,false)`,[hoa]);
  await la(P2); const l3=(await q(`select public.khsx_phat_sua_v2($1,'2026-10-09','2026-10-09') r`,[hoa])).rows[0].r;
  await la(A); await q(`select public.khsx_phat_sua_hoan_tac_v1($1)`,[l3.lo]);
  assert.deepEqual((await q(`select ngay::text n from public.khsx_phat_sua where nguoi_id=$1 order by 1`,[hoa])).rows.map(r=>r.n),['2026-10-08']);
  await q(`select public.khsx_phat_sua_hoan_tac_v1($1)`,[l2.lo]);
  await la(P); await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-09',false,false)`,[hoa]);                              // trả lại trạng thái cũ cho các bài sau
  console.log('PASS Phát sữa v2 + Hoàn tác: gỡ đúng lô vừa bấm (không đụng lô khác), mở khóa điểm danh, chỉ chủ tài khoản hoàn tác, hoàn tác lần hai / mã lạ báo không còn gì');

  // Quyền đọc bảng khi đăng nhập thật
  const doc=async u=>{ await db.exec(`set test.uid='${u}'; set role authenticated`); try{ return (await q(`select count(*)::int n from public.khsx_diem_danh`)).rows[0].n; } finally { await db.exec('reset role'); } };
  assert.equal(await doc(M),0); assert.equal(await doc(P)>0,true); assert.equal(await doc(P2)>0,true);
  await db.exec('set role authenticated'); await la(P);
  assert.match(await loi(()=>q(`insert into public.khsx_diem_danh values($1,'2026-10-01',true,true)`,[lan])),/permission denied/);
  await db.exec('reset role');
  console.log('PASS tài khoản không quyền không đọc được; ghi thẳng vào bảng bị chặn (chỉ qua hàm)');

  // Ghi chú theo người + ngày
  const gc=async(id,ngay)=>(await q(`select ghi_chu from public.khsx_diem_danh_ghi_chu where nguoi_id=$1 and ngay=$2`,[id,ngay])).rows[0]?.ghi_chu;
  await la(M); assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-11','x')`,[hoa])),/ATTENDANCE_FORBIDDEN/);
  await la(P2); assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-11','x')`,[hoa])),/ATTENDANCE_FORBIDDEN/);   // chỉ có quyền Phát sữa
  await la(P);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-13','x')`,[hoa])),/ATTENDANCE_DATE_INVALID/);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-11','x')`,[nghi])),/ATTENDEE_NOT_FOUND/);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-11',$2)`,[hoa,'a'.repeat(201)])),/ATTENDANCE_NOTE_INVALID/);
  await q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-11','  Nghỉ phép  ')`,[hoa]);     // người không đi làm hôm đó vẫn ghi chú được, cắt khoảng trắng
  assert.equal(await gc(hoa,'2026-10-11'),'Nghỉ phép');
  await q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-11','Nghỉ ốm')`,[hoa]);            // ghi lại = thay
  assert.equal(await gc(hoa,'2026-10-11'),'Nghỉ ốm');
  await q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-08','Đi trễ 15 phút')`,[lan]);      // ngày đã phát sữa: ghi chú vẫn sửa được
  assert.equal(await gc(lan,'2026-10-08'),'Đi trễ 15 phút');
  assert.equal((await q(`select count(*)::int n from public.khsx_diem_danh where nguoi_id=$1 and ngay='2026-10-08'`,[lan])).rows[0].n,1);   // không đụng điểm danh
  await q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-10-11','   ')`,[hoa]);                 // rỗng = xóa
  assert.equal(await gc(hoa,'2026-10-11'),undefined);
  const docGc=async u=>{ await db.exec(`set test.uid='${u}'; set role authenticated`); try{ return (await q(`select count(*)::int n from public.khsx_diem_danh_ghi_chu`)).rows[0].n; } finally { await db.exec('reset role'); } };
  assert.equal(await docGc(M),0); assert.equal(await docGc(P2),1); assert.equal(await docGc(P),1);
  await db.exec('set role authenticated'); await la(P);
  assert.match(await loi(()=>q(`insert into public.khsx_diem_danh_ghi_chu(nguoi_id,ngay,ghi_chu) values($1,'2026-10-01','x')`,[lan])),/permission denied/);
  await db.exec('reset role');
  console.log('PASS ghi chú: cần quyền Điểm danh; ngày tương lai / người đã xóa / quá 200 ký tự bị chặn; rỗng = xóa; ngày đã phát vẫn sửa được; đọc theo quyền, ghi thẳng bị chặn');

  // Việc nhắc 7h
  await db.exec(`insert into public.khsx_account_permissions values('${P2}','diem_danh'),('${X}','diem_danh')`);   // X đã nghỉ (không active)
  const tao=async d=>{ await hn(d); return Number((await q(`select private.khsx_tao_viec_diem_danh() n`)).rows[0].n); };
  assert.equal(await tao('2026-10-12'),0);   // quý chưa lưu lịch
  await db.exec(`insert into public.khsx_quarter_targets values(2026,4,11500,array['2026-10-12','2026-10-13']::date[])`);
  assert.equal(await tao('2026-10-14'),0);   // ngày không trong lịch, không có KHSX
  await db.exec(`insert into public.khsx_orders(id,production_date,is_drop) values('r','2026-10-14',true)`);
  await db.exec(`insert into public.khsx_orders(id,production_date,is_warranty) values('w','2026-10-14',true)`);
  await db.exec(`insert into public.khsx_orders(id,production_date,deleted_at) values('d','2026-10-14',now())`);
  await db.exec(`insert into public.khsx_orders(id,production_date,is_ghost) values('g','2026-10-14',true)`);
  assert.equal(await tao('2026-10-14'),0);   // đơn rớt / bảo hành / đã xóa / ma không tính
  assert.equal(await tao('2026-10-12'),2);   // trong lịch: Phước + Phước 2 (P có diem_danh, P2 có diem_danh); X nghỉ, M không quyền
  assert.equal(await tao('2026-10-12'),0);   // chạy lại cùng ngày không tạo trùng
  const v=(await q(`select nguoi_nhan,tieu_de,trang_thai,han::text han,nguoi_giao from public.khsx_tasks where tu_dong='diem_danh' order by nguoi_nhan`)).rows;
  assert.deepEqual(v.map(r=>[r.nguoi_nhan,r.tieu_de,r.trang_thai,r.han]),[[P,'Điểm danh tổ 12/10','dang_lam','2026-10-12'],[P2,'Điểm danh tổ 12/10','dang_lam','2026-10-12']]);
  assert.equal((await q(`select count(*)::int n from public.khsx_tin_nhan_cho where loai='giao' and chat_id in (222,333)`)).rows[0].n,2);
  await db.exec(`insert into public.khsx_orders(id,production_date) values('ok','2026-10-18')`);   // Chủ nhật có KHSX, ngoài lịch
  assert.equal(await tao('2026-10-18'),2);   // Chủ nhật ngoài lịch nhưng có đơn KHSX: vẫn tạo
  console.log('PASS 7h: quý chưa lưu lịch không tạo; ngoài lịch không KHSX không tạo; đơn rớt/bảo hành/đã xóa không tính; trong lịch hoặc có KHSX thì tạo cho người có quyền, không trùng');

  // Việc tự giao cho chính mình: bấm Xong / nhắc trễ không gửi tin báo người giao (chính mình); việc giao thường vẫn báo
  await db.exec(`truncate public.khsx_tin_nhan_cho`);
  const mine=(await q(`select id from public.khsx_tasks where tu_dong='diem_danh' and nguoi_nhan=$1 and ngay_tu_dong='2026-10-12'`,[P])).rows[0].id;
  await hn('2026-10-12'); await la(P); await q(`select public.khsx_xong_viec_v1($1)`,[mine]);
  assert.equal((await q(`select count(*)::int n from public.khsx_tin_nhan_cho`)).rows[0].n,0);
  await hn('2026-10-12'); await la(A);
  const thuong=(await q(`select public.khsx_giao_viec_v2($1,'Việc thường',''::text) id`,[P])).rows[0].id;
  await la(P); await q(`select public.khsx_nhan_viec_v1($1,'2026-10-12')`,[thuong]);
  await db.exec(`truncate public.khsx_tin_nhan_cho`);
  await hn('2026-10-13'); await q(`select private.khsx_nhac_viec_tre()`);
  const loai=(await q(`select loai,chat_id::int c from public.khsx_tin_nhan_cho order by id`)).rows;
  // Tới hạn mà chưa xong ngày 13/10: việc điểm danh 12/10 của P2 (chỉ 'nhac') + việc thường của P (nhac + bao_tre); việc 18/10 chưa tới hạn
  assert.equal(loai.filter(r=>r.loai==='bao_tre').length,1);
  assert.equal(loai.filter(r=>r.loai==='nhac').length,2);
  await la(P); await q(`select public.khsx_xong_viec_v1($1)`,[thuong]);
  assert.equal((await q(`select count(*)::int n from public.khsx_tin_nhan_cho where loai='xong'`)).rows[0].n,1);
  console.log('PASS việc tự giao cho chính mình không báo xong/trễ cho chính mình; việc giao thường vẫn báo như cũ');
  // Khoảng ngày chưa phát sữa (nút "Ngày chưa phát" tự đặt Từ ngày / Đến ngày)
  await la(P2);
  const kh=(await q(`select tu::text tu, den::text den from public.khsx_phat_sua_chua_v1()`)).rows[0];
  const tay=(await q(`select min(ngay)::text tu, max(ngay)::text den from public.khsx_diem_danh d where not exists(select 1 from public.khsx_phat_sua s where s.nguoi_id=d.nguoi_id and s.ngay=d.ngay)`)).rows[0];
  assert.ok(kh.tu&&kh.den); assert.equal(kh.tu,tay.tu);
  assert.equal(kh.den,(await q(`select max(ngay)::text d from public.khsx_diem_danh`)).rows[0].d);
  await la(M); assert.match(await loi(()=>q(`select * from public.khsx_phat_sua_chua_v1()`)),/MILK_FORBIDDEN/);
  await la(P); assert.match(await loi(()=>q(`select * from public.khsx_phat_sua_chua_v1()`)),/MILK_FORBIDDEN/);      // chỉ có quyền Điểm danh
  await la(P2);
  for(const n of (await q(`select distinct nguoi_id id from public.khsx_diem_danh`)).rows) await q(`select public.khsx_phat_sua_v2($1,'2026-01-01','2026-12-31')`,[n.id]).catch(()=>{});   // phát hết
  const het=(await q(`select tu::text tu, den::text den from public.khsx_phat_sua_chua_v1()`)).rows[0];
  assert.equal(het.tu,null); assert.ok(het.den);
  console.log('PASS khoảng chưa phát: Từ ngày = ngày điểm danh đầu tiên còn chưa phát, Đến ngày = điểm danh mới nhất; phát hết thì Từ ngày rỗng; cần quyền Phát sữa');

  // Tăng ca (20261009120000): chỉ báo được khi đã tick sáng/chiều; chọn một 1-2-3 giờ; bỏ hết tick thì tăng ca mất; ngày đã phát sữa khóa
  await hn('2026-10-12'); await la(A);
  const tc=(await q(`select public.khsx_diem_danh_them_nguoi_v1('Tăng Ca Test') id`)).rows[0].id;
  const tcv=async d=>(await q(`select tang_ca from public.khsx_diem_danh where nguoi_id=$1 and ngay=$2`,[tc,d])).rows[0]?.tang_ca??null;
  await la(M); assert.match(await loi(()=>q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',2::smallint)`,[tc])),/ATTENDANCE_FORBIDDEN/);
  await la(P);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',2::smallint)`,[tc])),/ATTENDANCE_OT_NEEDS_CHECKIN/);   // chưa tick = không báo được
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-12',false,true)`,[tc]);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',4::smallint)`,[tc])),/ATTENDANCE_OT_INVALID/);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-13',1::smallint)`,[tc])),/ATTENDANCE_DATE_INVALID/);
  await q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',1::smallint)`,[tc]); assert.equal(await tcv('2026-10-12'),1);
  await q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',3::smallint)`,[tc]); assert.equal(await tcv('2026-10-12'),3);   // chọn một: 3h thay 1h
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-12',true,true)`,[tc]); assert.equal(await tcv('2026-10-12'),3);   // đổi sáng/chiều vẫn giữ tăng ca
  await q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',null)`,[tc]); assert.equal(await tcv('2026-10-12'),null);   // bỏ tăng ca
  await q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',2::smallint)`,[tc]);
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-12',false,false)`,[tc]);
  assert.equal((await q(`select count(*)::int n from public.khsx_diem_danh where nguoi_id=$1`,[tc])).rows[0].n,0);   // bỏ hết tick = xóa dòng, tăng ca mất theo
  await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-10-12',true,false)`,[tc]); assert.equal(await tcv('2026-10-12'),null,'tick lại không còn tăng ca cũ');
  await la(A); await q(`insert into public.khsx_phat_sua(nguoi_id,ngay,so_hop,phat_boi) values($1,'2026-10-12',1,$2)`,[tc,A]);
  await la(P); assert.match(await loi(()=>q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-10-12',2::smallint)`,[tc])),/ATTENDANCE_LOCKED/);
  assert.equal((await q(`select count(*)::int n from public.khsx_phat_sua where nguoi_id=$1`,[tc])).rows[0].n,1);   // tăng ca không đụng số hộp sữa
  console.log('PASS tăng ca: cần tick sáng/chiều, chọn một 1-3h, bỏ hết tick thì mất, giữ khi đổi sáng/chiều, ngày đã phát khóa, quyền điểm danh');
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
