// Nhật ký nhập liệu (20261013100000): chạy thật SQL trong database tạm (PGlite).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261013100000_nhat_ky_nhap.sql'),'utf8');
const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b', KHOA='00000000-0000-0000-0000-00000000000c';
(async()=>{
  const db=await PGlite.create(), q=(s,p)=>db.query(s,p);
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table public.khsx_profiles(user_id uuid primary key, display_name text, active boolean);
    insert into public.khsx_profiles values('${A}','Anh Tùng',true),('${B}','Thế Quyền',true),('${KHOA}','Đã khóa',false);
    create function private.khsx_is_active() returns boolean language sql as $$select coalesce((select active from public.khsx_profiles where user_id=auth.uid()),false)$$;
    create table public.khsx_workers(id text primary key, display_name text);
    insert into public.khsx_workers values('w1','Bảo Chăm'),('w2','Tấn Lộc');
    create table public.khsx_orders(id text primary key, product_code text, product_name text, width_mm int, length_mm int);
    insert into public.khsx_orders values('O1','LAGO10-6','Latex Gold',160,200),('O2','KH17-6','KingHome',160,200);
    create table public.khsx_stage_progress(order_id text, work_date date, stage text, quantity int, kpi_team text, completed_by_worker_id text);
    create table public.khsx_stage_progress_audit(id bigserial primary key, order_id text, work_date date, stage text, old_quantity int, new_quantity int, kpi_team text, changed_by uuid, changed_at timestamptz, operation text);
  `);
  await db.exec(sql);
  // O1: Dán 0 -> 15 -> 12 (Tổ 2, do Thế Quyền); May 15 do Bảo Chăm; Đóng gói 5 rồi xóa. O2: Dán 3 (hệ thống, Tổ 4). Ngày 14/10 không được lẫn vào.
  await db.exec(`
    insert into public.khsx_stage_progress values('O1','2026-10-12','dan',12,'To 2',null),('O1','2026-10-12','may',15,'To 2','w1'),('O2','2026-10-12','dan',3,'To 4',null),('O1','2026-10-14','dan',9,'To 2',null);
    insert into public.khsx_stage_progress_audit(order_id,work_date,stage,old_quantity,new_quantity,kpi_team,changed_by,changed_at,operation) values
     ('O1','2026-10-12','dan',null,15,'To 2','${B}','2026-10-12 10:00+07','insert'),
     ('O1','2026-10-12','dan',15,12,'To 2','${B}','2026-10-12 11:00+07','update'),
     ('O1','2026-10-12','may',null,15,'To 2','${A}','2026-10-12 10:30+07','insert'),
     ('O1','2026-10-12','dong_goi',null,5,'To 2','${A}','2026-10-12 12:00+07','insert'),
     ('O1','2026-10-12','dong_goi',5,null,'To 2','${A}','2026-10-12 12:30+07','delete'),
     ('O2','2026-10-12','dan',null,3,'To 4',null,'2026-10-12 09:00+07','insert'),
     ('O1','2026-10-14','dan',null,9,'To 2','${B}','2026-10-14 08:00+07','insert');
  `);
  const goi=(uid,ngay)=>q("select set_config('test.uid',$1,false)",[uid||'']).then(()=>q('select public.khsx_nhat_ky_nhap_v1($1::date) r',[ngay]));
  await assert.rejects(()=>goi(null,'2026-10-12'),/NHAT_KY_FORBIDDEN/);          // khách chưa đăng nhập
  await assert.rejects(()=>goi(KHOA,'2026-10-12'),/NHAT_KY_FORBIDDEN/);          // tài khoản không hoạt động
  await assert.rejects(()=>goi(B,null),/NHAT_KY_DATE_INVALID/);
  console.log('PASS quyền: khách và tài khoản khóa bị chặn, ngày trống bị từ chối');
  const r=(await goi(B,'2026-10-12')).rows[0].r;
  assert.equal(r.dong.length,6,'chỉ 6 dòng của ngày 12/10, không lẫn 14/10');
  assert.deepEqual(r.dong.map(x=>x.stage),['dan','dan','dan','may','dong_goi','dong_goi'],'xếp Dán, May, Đóng gói');
  const dan=r.dong.filter(x=>x.stage==='dan');
  assert.deepEqual(dan.map(x=>x.kpi_team),['To 2','To 2','To 4'],'trong công đoạn xếp Tổ 1 → 5');
  assert.equal(dan[0].nguoi,'Thế Quyền'); assert.equal(dan[2].nguoi,'(hệ thống)');
  assert.equal(dan[0].hoan_thanh??null,null,'Dán không có người hoàn thành');
  assert.equal(r.dong.find(x=>x.stage==='may').hoan_thanh,'Bảo Chăm');
  assert.equal(r.dong.find(x=>x.stage==='dan').ma,'LAGO10-6');
  console.log('PASS dòng nhật ký: đúng ngày, xếp công đoạn rồi tổ, có người nhập / người hoàn thành (May), hệ thống ghi rõ');
  assert.deepEqual(r.doi_soat,{dan:{nhat_ky:15,kpi:15},may:{nhat_ky:15,kpi:15},dong_goi:{nhat_ky:0,kpi:0}});
  console.log('PASS đối soát: tổng nhật ký (số mới nhất, bỏ dòng đã xóa) = tổng tiến độ KPI từng công đoạn');
  await db.exec("update public.khsx_stage_progress set quantity=99 where order_id='O2' and stage='dan'");
  const lech=(await goi(A,'2026-10-12')).rows[0].r.doi_soat.dan;
  assert.equal(lech.kpi-lech.nhat_ky,96,'cố tình làm lệch thì đối soát lộ ra');
  console.log('PASS đối soát bắt được lệch số (nhật ký 15 so với KPI 111)');
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
