// Bảng đặt áo có quyền riêng ao_board_use (29/09/2026): nút + hàm mở bảng áo không còn dùng quyền phôi;
// migration cấp quyền áo cho đúng những người đang có quyền phôi.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(html,/aoBtn:\['ao_board_use'\]/);
assert.match(html,/phoiBtn:\['phoi_board_use'\]/);
assert.match(html,/async function moBangDatAo\(\)\{\n  if\(!hasPermOrOwner\('ao_board_use'\)\) return;/);
console.log('PASS nút và hàm mở Bảng đặt áo dùng quyền ao_board_use, bảng phôi giữ quyền phôi');
(async()=>{
  const db=await PGlite.create();
  const A='00000000-0000-0000-0000-00000000000a',B='00000000-0000-0000-0000-00000000000b',C='00000000-0000-0000-0000-00000000000c',O='00000000-0000-0000-0000-0000000000ff';
  await db.exec(`create table public.khsx_permissions(permission_key text primary key, display_name text, group_name text, description text, sort_order int);
    create table public.khsx_account_permissions(user_id uuid, permission_key text references public.khsx_permissions, granted_by uuid not null, granted_at timestamptz default now(), primary key(user_id,permission_key));
    insert into public.khsx_permissions values('phoi_board_use','Dùng bảng đặt phôi','KHSX','',38),('hr_view','x','Nhân sự','',30);
    insert into public.khsx_account_permissions(user_id,permission_key,granted_by) values('${A}','phoi_board_use','${O}'),('${B}','phoi_board_use','${O}'),('${C}','hr_view','${O}');`);
  const sql=fs.readFileSync(path.join(root,'supabase','migrations','20260928090200_quyen_bang_dat_ao.sql'),'utf8');
  await db.exec(sql); await db.exec(sql);   // chạy lại không lỗi, không nhân đôi
  const r=(await db.query(`select user_id::text u from public.khsx_account_permissions where permission_key='ao_board_use' order by 1`)).rows.map(x=>x.u);
  assert.deepEqual(r,[A,B]);
  const g=(await db.query(`select group_name,display_name from public.khsx_permissions where permission_key='ao_board_use'`)).rows[0];
  assert.deepEqual(g,{group_name:'KHSX',display_name:'Dùng bảng đặt áo'});
  console.log('PASS người đang có quyền phôi được cấp luôn quyền áo; người khác không bị cấp; chạy lại an toàn');
  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
