// Giao việc (migration 20260928090000) trên PGlite: chỉ người có quyền giao; bot xếp tin cho người nhận;
// nhận việc phải chọn ngày hẹn, chỉ người nhận được nhận / bấm xong; xong thì báo người giao; 17:00 nhắc việc trễ 1 lần/ngày.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20260928090000_giao_viec.sql'),'utf8');
const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b', C='00000000-0000-0000-0000-00000000000c';
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function private.khsx_has_permission(p_key text, p_user uuid default auth.uid()) returns boolean language sql as $$ select p_user='${A}'::uuid $$;
    create table public.khsx_permissions(permission_key text primary key, display_name text, group_name text, description text, sort_order int);
    create table public.khsx_profiles(user_id uuid, telegram_user_id bigint, display_name text, active boolean);
    insert into public.khsx_profiles values('${A}',111,'Tùng',true),('${B}',222,'Minh Thuận',true),('${C}',null,'Mới đăng ký',true);`);
  await db.exec(sql);
  await db.exec(fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20260929090000_giao_viec_quyen_bot.sql'),'utf8'));
  for(const b of ['khsx_tin_nhan_cho','khsx_tasks']) for(const q of ['select','update'])
    assert.equal((await db.query(`select has_table_privilege('service_role','public.${b}','${q}') ok`)).rows[0].ok,true,`service_role ${q} ${b}`);
  console.log('PASS hàm gửi tin (service_role) đọc và ghi được sổ việc + sổ tin chờ');
  const q=(s,p)=>db.query(s,p), la=u=>db.exec(`set test.uid='${u}'`);
  const tin=async()=>(await q(`select loai,chat_id,noi_dung from public.khsx_tin_nhan_cho order by id`)).rows;
  const loi=async f=>{ try{ await f(); return ''; }catch(e){ return e.message; } };

  await la(B); assert.match(await loi(()=>q(`select public.khsx_giao_viec_v1($1,'x')`,[B])),/TASK_ASSIGN_FORBIDDEN/);
  console.log('PASS người không có quyền không giao được việc');
  await la(A); const id=(await q(`select public.khsx_giao_viec_v1($1,'Dọn kho mút cuối xưởng') id`,[B])).rows[0].id;
  let t=await tin(); assert.equal(t.length,1); assert.equal(t[0].loai,'giao'); assert.equal(Number(t[0].chat_id),222); assert.match(t[0].noi_dung,/Tùng giao việc cho bạn:\nDọn kho mút cuối xưởng/);
  console.log('PASS giao việc: bot xếp tin cho đúng Telegram ID người nhận');
  const id2=(await q(`select public.khsx_giao_viec_v1($1,'Việc cho người chưa có Telegram') id`,[C])).rows[0].id;
  assert.equal((await q(`select tin_giao_loi from public.khsx_tasks where id=$1`,[id2])).rows[0].tin_giao_loi,'Người này chưa có Telegram ID');
  console.log('PASS người chưa có Telegram ID: ghi rõ lý do chưa gửi được');

  await la(A); assert.match(await loi(()=>q(`select public.khsx_nhan_viec_v1($1,current_date+1)`,[id])),/TASK_NOT_YOURS/);
  await la(B); assert.match(await loi(()=>q(`select public.khsx_nhan_viec_v1($1,null)`,[id])),/TASK_DUE_INVALID/);
  assert.match(await loi(()=>q(`select public.khsx_nhan_viec_v1($1,private.khsx_hom_nay_vn()-1)`,[id])),/TASK_DUE_INVALID/);
  assert.match(await loi(()=>q(`select public.khsx_xong_viec_v1($1)`,[id])),/TASK_NOT_IN_PROGRESS/);
  await q(`select public.khsx_nhan_viec_v1($1,private.khsx_hom_nay_vn())`,[id]);
  console.log('PASS chỉ người nhận được nhận; bắt buộc ngày hẹn từ hôm nay; chưa nhận thì chưa bấm Xong được');

  const n1=(await q(`select private.khsx_nhac_viec_tre() n`)).rows[0].n, n2=(await q(`select private.khsx_nhac_viec_tre() n`)).rows[0].n;
  assert.equal(n1,1); assert.equal(n2,0);
  t=await tin(); assert.deepEqual(t.slice(1).map(x=>[x.loai,Number(x.chat_id)]),[['nhac',222],['bao_tre',111]]);
  console.log('PASS 17:00 ngày hẹn chưa xong: nhắc người nhận + báo người giao, mỗi ngày một lần');

  await q(`select public.khsx_xong_viec_v1($1)`,[id]);
  t=await tin(); const cuoi=t[t.length-1]; assert.equal(cuoi.loai,'xong'); assert.equal(Number(cuoi.chat_id),111); assert.match(cuoi.noi_dung,/Minh Thuận đã xong việc:\nDọn kho mút cuối xưởng/);
  assert.equal((await q(`select trang_thai from public.khsx_tasks where id=$1`,[id])).rows[0].trang_thai,'xong');
  assert.equal((await q(`select private.khsx_nhac_viec_tre() n`)).rows[0].n,0);
  console.log('PASS bấm Xong: báo người giao; việc xong không bị nhắc nữa');
  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
