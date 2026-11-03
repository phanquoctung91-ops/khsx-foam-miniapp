// v266: Điểm danh chia 4 nhóm xếp tự động theo chức vụ/tổ + quyền điểm danh theo nhóm (migration 20261103100000) trên PGlite.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const mig=f=>fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations',f),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const A='00000000-0000-0000-0000-00000000000a', P='00000000-0000-0000-0000-00000000000b', K='00000000-0000-0000-0000-00000000000c',
      T='00000000-0000-0000-0000-00000000000d', N='00000000-0000-0000-0000-00000000000e', S='00000000-0000-0000-0000-00000000000f';
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table public.khsx_permissions(permission_key text primary key, display_name text, group_name text, description text, sort_order int);
    create table public.khsx_profiles(user_id uuid, telegram_user_id bigint, display_name text, active boolean);
    create table public.khsx_account_permissions(user_id uuid, permission_key text, granted_by uuid, granted_at timestamptz default now());
    create function private.khsx_is_permission_owner(p_user uuid default auth.uid()) returns boolean language sql security definer as $$ select p_user='${A}'::uuid $$;
    create function private.khsx_has_permission(p_key text, p_user uuid default auth.uid()) returns boolean language sql security definer as
      $$ select p_user='${A}'::uuid or exists(select 1 from public.khsx_account_permissions where user_id=p_user and permission_key=p_key) $$;
    grant usage on schema private, auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table public.khsx_quarter_targets(year int, quarter int, target_qty int, work_dates date[]);
    create table public.khsx_orders(id text primary key, production_date date, deleted_at timestamptz, is_warranty boolean default false, is_drop boolean default false, is_ghost boolean default false);
    insert into public.khsx_profiles values('${A}',1,'Tùng',true),('${P}',2,'Phước',true),('${K}',3,'Triều',true),('${T}',4,'Thanh',true),('${N}',5,'Không quyền',true),('${S}',6,'Chỉ phát sữa',true);`);
  for(const f of ['20260928090000_giao_viec.sql','20260929090000_giao_viec_quyen_bot.sql','20260930090000_giao_viec_doc_so_viec.sql',
                  '20261002090000_giao_viec_tieu_de_sua_viec.sql','20261002120000_sua_viec_dang_lam.sql',
                  '20261005090000_diem_danh_phat_sua.sql','20261005120000_diem_danh_chuc_vu.sql','20261005140000_diem_danh_sua_quyen_doc.sql',
                  '20261005160000_diem_danh_to_phu_kho_ho_tro.sql','20261007090000_diem_danh_ghi_chu.sql','20261008090000_phat_sua_hoan_tac.sql',
                  '20261009090000_phat_sua_khoang_chua.sql','20261009120000_diem_danh_tang_ca.sql','20261012180000_diem_danh_bo_khoa_phat_sua.sql',
                  '20261028090000_lich_quy_khoang_tuy_chinh.sql','20261030100000_gio_cong_theo_to.sql']) await db.exec(mig(f));
  await db.exec(`create or replace function private.khsx_hom_nay_vn() returns date language sql stable as $$ select current_setting('test.hn')::date $$;`);
  const q=(s,p)=>db.query(s,p), la=u=>db.exec(`set test.uid='${u}'`);
  const loi=async f=>{ try{ await f(); return ''; }catch(e){ return e.message; } };
  await db.exec(`set test.hn='2026-11-03'`);
  // quyền cũ + người mẫu trước khi chạy migration mới
  await db.exec(`insert into public.khsx_account_permissions(user_id,permission_key) values('${P}','diem_danh')`);
  await db.exec(mig('20261103100000_diem_danh_nhom_quyen.sql'));
  await db.exec(mig('20261103100000_diem_danh_nhom_quyen.sql'));   // chạy lại không nhân đôi, không lỗi

  // 1) Xếp nhóm theo chức vụ / tổ
  const nhom=async(cv,to)=>(await q(`select private.khsx_dd_nhom($1,$2) n`,[cv,to])).rows[0].n;
  assert.equal(await nhom('Trưởng Nhóm',null),'quan_ly'); assert.equal(await nhom('Tổ trưởng sản xuất',null),'quan_ly'); assert.equal(await nhom('Thủ kho',null),'quan_ly');
  assert.equal(await nhom('Công nhân','Phụ kho'),'kho');
  for(const t of ['Tổ dán 1','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói','Hỗ trợ']) assert.equal(await nhom('Công nhân',t),'mut',t);
  assert.equal(await nhom('Tổ trưởng may',null),'may');
  for(const t of ['May mẫu & cắt hàng','May áo niệm','May áo gối']) assert.equal(await nhom('Công nhân',t),'may',t);
  assert.equal(await nhom('Công nhân',null),'chua'); assert.equal(await nhom(null,null),'chua');
  console.log('PASS xếp nhóm tự động: quản lý / kho / mút / tổ may / chưa phân nhóm (Tổ may của mút khác Tổ May xưởng may)');

  // 2) Nạp 11 người Tổ may, không nhân đôi khi chạy lại
  const may=(await q(`select ten,chuc_vu,to_lam,viec_lam from public.khsx_diem_danh_nguoi where private.khsx_dd_nhom(chuc_vu,to_lam)='may' order by ten`)).rows;
  assert.equal(may.length,11);
  const o=Object.fromEntries(may.map(r=>[r.ten,r]));
  assert.deepEqual({...o['Nguyễn Thanh']},{ten:'Nguyễn Thanh',chuc_vu:'Tổ trưởng may',to_lam:null,viec_lam:null});
  assert.equal(o['Đỗ Sơn'].viec_lam,'Cắt hàng'); assert.equal(o['Dương Nhật Qui'].viec_lam,'Hỗ trợ'); assert.equal(o['Hồ Thành Tuấn'].viec_lam,'Hỗ trợ');
  assert.equal(may.filter(r=>r.to_lam==='May áo niệm').length,4); assert.equal(may.filter(r=>r.to_lam==='May áo gối').length,3);
  console.log('PASS nạp 11 người Tổ may đúng chức vụ, tổ, việc làm; chạy lại không nhân đôi');

  // 3) Quyền: danh mục mới, quyền chung cũ được chuyển/bỏ
  assert.equal((await q(`select count(*)::int n from public.khsx_permissions where permission_key in ('diem_danh_mut','diem_danh_kho','diem_danh_may')`)).rows[0].n,3);
  assert.equal((await q(`select count(*)::int n from public.khsx_permissions where permission_key='diem_danh'`)).rows[0].n,0);
  assert.equal((await q(`select count(*)::int n from public.khsx_account_permissions where permission_key='diem_danh'`)).rows[0].n,0,'quyền chung cũ bị gỡ');
  await db.exec(`insert into public.khsx_account_permissions(user_id,permission_key) values('${P}','diem_danh_mut'),('${K}','diem_danh_kho'),('${T}','diem_danh_may'),('${S}','phat_sua')`);

  // 4) Người mẫu mỗi nhóm
  await la(A);
  const them=async(ten,cv,to)=>{ const id=(await q(`select public.khsx_diem_danh_them_nguoi_v1($1) id`,[ten])).rows[0].id; await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,$2,$3)`,[id,cv,to]); return id; };
  const mut=await them('Mút 1','Công nhân','Tổ dán 1'), kho=await them('Kho 1','Công nhân','Phụ kho'), ql=await them('Quản lý 1','Thủ kho',''), chua=await them('Chưa 1','','');
  const thanh=(await q(`select id from public.khsx_diem_danh_nguoi where ten='Nguyễn Thanh'`)).rows[0].id, son=(await q(`select id from public.khsx_diem_danh_nguoi where ten='Đỗ Sơn'`)).rows[0].id;
  const ghi=(u,id)=>loi(async()=>{ await la(u); await q(`select public.khsx_diem_danh_ghi_v1($1,'2026-11-03',true,true)`,[id]); });
  const ok=async(u,id)=>assert.equal(await ghi(u,id),'',`${u} phải tick được ${id}`);
  const cam=async(u,id)=>assert.match(await ghi(u,id),/ATTENDANCE_FORBIDDEN/,`${u} không được tick ${id}`);
  await ok(A,mut); await ok(A,kho); await ok(A,ql); await ok(A,chua); await ok(A,son);           // chủ: mọi nhóm
  await ok(P,mut); await cam(P,kho); await cam(P,ql); await cam(P,chua); await cam(P,son);        // Phước: chỉ Sản xuất mút
  await ok(K,kho); await cam(K,mut); await cam(K,ql); await cam(K,son);                           // Triều: chỉ Kho
  await ok(T,son); await ok(T,thanh); await cam(T,mut); await cam(T,kho); await cam(T,ql);        // Thanh: chỉ Tổ may
  await cam(N,mut); await cam(N,son); await cam(S,mut);                                           // không quyền / chỉ phát sữa: không tick
  console.log('PASS máy chủ chỉ cho tick đúng nhóm: chủ mọi nhóm; mút/kho/tổ may chỉ nhóm của mình; quản lý và chưa phân nhóm chỉ chủ');

  // tăng ca + ghi chú cùng luật
  await la(P); await q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-11-03',2::smallint)`,[mut]);
  await la(P); assert.match(await loi(()=>q(`select public.khsx_diem_danh_tang_ca_v1($1,'2026-11-03',2::smallint)`,[kho])),/ATTENDANCE_FORBIDDEN/);
  await la(K); await q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-11-03','đi trễ')`,[kho]);
  await la(K); assert.match(await loi(()=>q(`select public.khsx_diem_danh_ghi_chu_v1($1,'2026-11-03','x')`,[mut])),/ATTENDANCE_FORBIDDEN/);
  console.log('PASS tăng ca và ghi chú kiểm quyền theo nhóm như lưu điểm danh');

  // 5) Đọc theo nhóm (RLS): mỗi tài khoản chỉ thấy người nhóm mình; chỉ phát sữa thấy mọi nhóm
  const thay=async u=>{ await db.exec(`set test.uid='${u}'; set role authenticated`); try{ return (await q(`select ten from public.khsx_diem_danh_nguoi order by ten`)).rows.map(r=>r.ten); } finally{ await db.exec('reset role'); } };
  const nP=await thay(P), nK=await thay(K), nT=await thay(T), nN=await thay(N), nS=await thay(S), nA=await thay(A);
  assert.deepEqual(nP,['Mút 1']); assert.deepEqual(nK,['Kho 1']); assert.equal(nT.length,11); assert.ok(nT.includes('Nguyễn Thanh')&&!nT.includes('Mút 1'));
  assert.deepEqual(nN,[]); assert.equal(nS.length,nA.length); assert.ok(nA.length>=15);
  const ddThay=async u=>{ await db.exec(`set test.uid='${u}'; set role authenticated`); try{ return (await q(`select count(*)::int n from public.khsx_diem_danh`)).rows[0].n; } finally{ await db.exec('reset role'); } };
  assert.equal(await ddThay(P),1); assert.equal(await ddThay(K),1); assert.equal(await ddThay(N),0); assert.equal(await ddThay(A),6);
  console.log('PASS danh sách và điểm danh chỉ trả đúng nhóm được phép xem; không quyền thì rỗng');

  // 6) Chức vụ / việc làm / thêm người: chỉ chủ
  await la(P);
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_dat_viec_lam_v1($1,'x')`,[mut])),/ATTENDANCE_LIST_FORBIDDEN/);
  await la(A); await q(`select public.khsx_diem_danh_dat_viec_lam_v1($1,'May mẫu')`,[son]);
  assert.equal((await q(`select viec_lam from public.khsx_diem_danh_nguoi where id=$1`,[son])).rows[0].viec_lam,'May mẫu');
  assert.match(await loi(()=>q(`select public.khsx_diem_danh_dat_viec_lam_v1($1,$2)`,[son,'x'.repeat(101)])),/ATTENDEE_JOB_INVALID/);
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Tổ trưởng may','')`,[chua]);
  assert.equal((await q(`select private.khsx_dd_nhom(chuc_vu,to_lam) n from public.khsx_diem_danh_nguoi where id=$1`,[chua])).rows[0].n,'may','chọn xong tổ thì tự sang nhóm');
  await q(`select public.khsx_diem_danh_dat_chuc_vu_v1($1,'Công nhân','May áo gối')`,[chua]);
  console.log('PASS đặt chức vụ / tổ / việc làm chỉ chủ tài khoản; chọn tổ xong người tự sang nhóm');

  // 7) Việc nhắc 7h theo nhóm được điểm danh
  await db.exec(`insert into public.khsx_quarter_targets values(2026,4,11500,array['2026-11-03']::date[])`);
  const n=(await q(`select private.khsx_tao_viec_diem_danh() n`)).rows[0].n; assert.equal(n,3,'Phước, Triều, Thanh mỗi người một việc');
  const td=Object.fromEntries((await q(`select nguoi_nhan, tieu_de from public.khsx_tasks where tu_dong='diem_danh'`)).rows.map(r=>[r.nguoi_nhan,r.tieu_de]));
  assert.equal(td[P],'Điểm danh Sản xuất mút 03/11'); assert.equal(td[K],'Điểm danh Kho 03/11'); assert.equal(td[T],'Điểm danh Tổ may 03/11');
  console.log('PASS việc nhắc 7h: mỗi tài khoản nhận việc theo nhóm mình điểm danh');

  // 8) Giờ công khối Năng suất loại hẳn nhóm Tổ may
  await la(A); await db.exec(`set test.hn='2026-11-03'`);
  const gc=(await q(`select public.khsx_gio_cong_theo_to_v1('2026-11-01','2026-11-03') j`)).rows[0].j;
  const tong=gc.reduce((a,r)=>a+r.nguoi,0);
  assert.ok(gc.length>0&&tong===3,'6 người đã tick: Sơn, Thanh và Chưa 1 (đã chuyển sang Tổ may) bị loại, còn Mút 1, Kho 1, Quản lý 1; đếm '+tong);
  assert.ok(!gc.some(r=>r.nhom!=='Ngoài 6 tổ'&&r.nhom!=='Tổ dán 1'),'Tổ may mới không lọt vào các nhóm giờ công');
  console.log('PASS giờ công Năng suất không tính nhóm Tổ may (xưởng may)');

  // 9) Giao diện: nhóm, quyền theo nhóm, chip lọc theo nhóm, Việc làm, Phát sữa/giấy tăng ca/Excel theo nhóm
  for(const k of ["const DD_NHOM=['Sản xuất mút','Kho','Quản lý','Tổ may','Chưa phân nhóm'];","function ddNhomCua(p){","const ddDuocNhom=n=>","['diem_danh_mut','diem_danh_kho','diem_danh_may'].some(hasPermOrOwner)",
    "staff:['hr_view','diem_danh_mut','diem_danh_kho','diem_danh_may','phat_sua']","id=\"ddNhom\"","id=\"ddNhomPS\"","<th>Việc làm</th>","khsx_diem_danh_dat_viec_lam_v1",
    "const sua=duocDiemDanh()&&ddDuocNhom(ddNhom);","ddSuaDong.filter(r=>ddNhomCua(r)===ddNhom)","ddNhomCua(p)===ddNhom&&(ddDong[p.id]||{}).tc>0",
    "(n.data||[]).filter(p=>ddNhomCua(p)===ddNhom)","ddNhom==='Tổ may'?'Tổ May':'Tổ Nệm Foam'","select('id,ten,chuc_vu,to_lam,viec_lam')"]) assert.ok(html.includes(k),'thiếu: '+k);
  assert.ok(!/hasPermOrOwner\('diem_danh'\)/.test(html),'không còn quyền chung diem_danh');
  assert.ok(Number(html.match(/const APP_VERSION = (\d+);/)[1])>=266);
  console.log('PASS giao diện: chip nhóm, quyền theo nhóm, Việc làm, Phát sữa / giấy tăng ca / Excel theo nhóm');

  // 10) Êm tay (v267): tick / tăng ca chỉ đổi tại chỗ, không vẽ lại cả danh sách; ghi chú tự lưu sau khi ngừng gõ, không mất chữ
  const tick=html.slice(html.indexOf('async function ghiDiemDanh('),html.indexOf('async function ghiTangCa('));
  assert.ok(tick.includes('veTickDiemDanh(id)')&&!tick.includes('veDiemDanh()'),'tick không vẽ lại cả danh sách');
  const tc=html.slice(html.indexOf('async function ghiTangCa('),html.indexOf('button[data-dd-tc-mo]'));
  assert.ok(tc.includes('veTickDiemDanh(id)')&&!tc.includes('veDiemDanh()'),'tăng ca không vẽ lại cả danh sách');
  for(const k of ['function veTickDiemDanh(id){','data-dd-tc-cell="${p.id}"','function ddTcKhoi(p,r,tat){','async function ddLuuGhiChu(c){','setTimeout(()=>ddLuuGhiChu(c),900)',
    'if(i!==document.activeElement) i.value=v;','if(o.innerHTML!==h) o.innerHTML=h;','id="ddNhom" style="margin-bottom:8px;min-height:34px;"']) assert.ok(html.includes(k),'thiếu: '+k);
  assert.ok(Number(html.match(/const APP_VERSION = (\d+);/)[1])>=267);
  console.log('PASS êm tay: tick và tăng ca cập nhật tại chỗ; ghi chú tự lưu sau 0,9 giây, ô đang gõ không bị ghi đè; chip chỉ vẽ lại khi đổi');
})().catch(e=>{ console.error(e); process.exit(1); });
