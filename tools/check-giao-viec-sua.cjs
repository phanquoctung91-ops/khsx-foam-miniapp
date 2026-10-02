// Giao việc có tiêu đề + chi tiết, sửa việc khi chưa nhận (migration 20261002090000) trên PGlite.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const mig=f=>fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations',f),'utf8');
const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b', C='00000000-0000-0000-0000-00000000000c', Q='00000000-0000-0000-0000-00000000000d';
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    -- A (anh Tùng) và Q (quản lý 2 được tích quyền) đều có quyền giao việc
    create function private.khsx_has_permission(p_key text, p_user uuid default auth.uid()) returns boolean language sql security definer as $$ select p_user in ('${A}'::uuid,'${Q}'::uuid) $$;
    create table public.khsx_permissions(permission_key text primary key, display_name text, group_name text, description text, sort_order int);
    create table public.khsx_profiles(user_id uuid, telegram_user_id bigint, display_name text, active boolean);
    insert into public.khsx_profiles values('${A}',111,'Tùng',true),('${B}',222,'Phi Khanh',true),('${C}',333,'Văn Thảo',true),('${Q}',444,'Phước',true);`);
  await db.exec(mig('20260928090000_giao_viec.sql'));
  await db.exec(mig('20260929090000_giao_viec_quyen_bot.sql'));
  await db.exec(mig('20260930090000_giao_viec_doc_so_viec.sql'));
  const q=(s,p)=>db.query(s,p), la=u=>db.exec(`set test.uid='${u}'`);
  const loi=async f=>{ try{ await f(); return ''; }catch(e){ return e.message; } };
  // Việc cũ giao trước khi có tiêu đề
  await la(A);
  const cu=(await q(`select public.khsx_giao_viec_v1($1,$2) id`,[B,'Theo dõi hàng trả về\n1. MTS716 · 1 Tấm\n2. MTS710 · 4 Tấm'])).rows[0].id;
  await db.exec(mig('20261002090000_giao_viec_tieu_de_sua_viec.sql'));
  let t=(await q(`select tieu_de,noi_dung from public.khsx_tasks where id=$1`,[cu])).rows[0];
  assert.deepEqual(t,{tieu_de:'Theo dõi hàng trả về',noi_dung:'1. MTS716 · 1 Tấm\n2. MTS710 · 4 Tấm'});
  console.log('PASS việc cũ: dòng đầu thành tiêu đề, phần còn lại thành chi tiết');

  const tin=async()=>(await q(`select loai,chat_id::int c,noi_dung,gui_luc from public.khsx_tin_nhan_cho order by id`)).rows;
  await q(`delete from public.khsx_tin_nhan_cho`);
  const id=(await q(`select public.khsx_giao_viec_v2($1,'Cắt hàng Enzo đang chờ','') id`,[B])).rows[0].id;
  let m=await tin(); assert.equal(m.length,1); assert.equal(m[0].c,222); assert.match(m[0].noi_dung,/Tùng giao việc cho bạn:\nCắt hàng Enzo đang chờ\n\nMở app/);
  console.log('PASS giao việc có tiêu đề: bot nhắn tiêu đề (không có chi tiết thì không thêm dòng trống)');

  await la(Q); assert.match(await loi(()=>q(`select public.khsx_sua_viec_v1($1,'x','',null)`,[id])),/TASK_EDIT_FORBIDDEN/);
  await la(B); assert.match(await loi(()=>q(`select public.khsx_sua_viec_v1($1,'x','',null)`,[id])),/TASK_EDIT_FORBIDDEN/);
  console.log('PASS chỉ người giao việc đó được sửa (người khác có quyền giao cũng không sửa được)');

  await la(A); await q(`delete from public.khsx_tin_nhan_cho`);
  await q(`select public.khsx_sua_viec_v1($1,'Cắt hàng Enzo đang chờ','Ưu tiên 5 tấm 180x20 trước',null)`,[id]);
  m=await tin(); assert.equal(m.length,1); assert.equal(m[0].loai,'sua'); assert.equal(m[0].c,222);
  assert.equal(m[0].noi_dung,'📝 Tùng bổ sung việc giao cho bạn:\nCắt hàng Enzo đang chờ\n➕ Bổ sung: Ưu tiên 5 tấm 180x20 trước');
  console.log('PASS viết thêm vào cuối: bot nhắn đúng phần bổ sung');

  await q(`delete from public.khsx_tin_nhan_cho`);
  await q(`select public.khsx_sua_viec_v1($1,'Cắt hàng Luna','5 tấm 160x20',null)`,[id]);
  m=await tin(); assert.match(m[0].noi_dung,/^📝 Tùng sửa việc giao cho bạn:\nCắt hàng Luna\n5 tấm 160x20\n\nTrước đó ghi: Cắt hàng Enzo đang chờ\nƯu tiên 5 tấm 180x20 trước$/);
  await q(`delete from public.khsx_tin_nhan_cho`);
  await q(`select public.khsx_sua_viec_v1($1,'Cắt hàng Luna','5 tấm 160x20',null)`,[id]);
  assert.equal((await tin()).length,0);
  console.log('PASS viết lại hẳn: bot nhắn nội dung mới kèm "Trước đó ghi"; lưu y nguyên thì không nhắn');

  await q(`delete from public.khsx_tin_nhan_cho`);
  await q(`insert into public.khsx_tin_nhan_cho(task_id,loai,chat_id,noi_dung) values($1,'giao',222,'tin cũ chưa gửi')`,[id]);
  await q(`select public.khsx_sua_viec_v1($1,'Cắt hàng Luna','5 tấm 160x20',$2)`,[id,C]);
  m=await tin(); assert.deepEqual(m.map(x=>[x.loai,x.c]),[['chuyen',222],['giao',333]]);
  assert.match(m[0].noi_dung,/Việc "Cắt hàng Luna" Tùng đã chuyển cho người khác, bạn không cần làm\./);
  assert.match(m[1].noi_dung,/Tùng giao việc cho bạn:\nCắt hàng Luna\n5 tấm 160x20/);
  assert.equal((await q(`select nguoi_nhan from public.khsx_tasks where id=$1`,[id])).rows[0].nguoi_nhan,C);
  console.log('PASS đổi người nhận: người cũ được báo đã chuyển (tin cũ chưa gửi bị bỏ), người mới nhận tin giao việc');

  await la(C); await q(`select public.khsx_nhan_viec_v1($1,private.khsx_hom_nay_vn())`,[id]);
  await la(A); assert.match(await loi(()=>q(`select public.khsx_sua_viec_v1($1,'y','',null)`,[id])),/TASK_ALREADY_TAKEN/);
  console.log('PASS người nhận đã bấm Nhận việc thì không sửa được nữa');

  await q(`delete from public.khsx_tin_nhan_cho`);
  await la(C); await q(`select public.khsx_xong_viec_v1($1)`,[id]);
  m=await tin(); assert.match(m[0].noi_dung,/Văn Thảo đã xong việc:\nCắt hàng Luna\nHẹn/);
  console.log('PASS báo xong dùng tiêu đề cho gọn');
  assert.match(await loi(()=>q(`select public.khsx_giao_viec_v2($1,'','abc')`,[B])),/TASK_ASSIGN_FORBIDDEN|TASK_TEXT_INVALID/);
  await la(A); assert.match(await loi(()=>q(`select public.khsx_giao_viec_v2($1,'  ','abc')`,[B])),/TASK_TEXT_INVALID/);
  console.log('PASS thiếu tiêu đề thì không giao được');
  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
