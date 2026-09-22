// Kiem tra migration 20260922150000_backfill_kpi_theo_rule_thang_9.sql: chay NGUYEN VAN
// cau update/insert cua migration tren PGlite, khong chep tay lai logic.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

const sql=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20260922150000_backfill_kpi_theo_rule_thang_9.sql'),'utf8');
// Bo dong comment TRUOC khi tach cau: comment tieng Viet co chua dau ';'.
const cauLenh=sql.split('\n').filter(d=>!d.trim().startsWith('--')).join('\n')
  .split(';').map(s=>s.trim()).filter(Boolean);
assert.equal(cauLenh.length,2,'Migration phai gom dung 2 cau: update roi insert');
const [cauUpdate,cauInsert]=cauLenh;

(async()=>{
  const db=await PGlite.create();
  await db.exec(`
    create table public.khsx_stage_progress(
      order_id text, work_date date, stage text, quantity integer,
      kpi_team text, completed_by_worker_id text, team_key text,
      primary key(order_id,work_date,stage,team_key)
    );
    create table public.khsx_stage_credits(
      order_id text, work_date date, stage text, worker_id text,
      quantity integer, source text, kpi_team text,
      primary key(order_id,work_date,stage,worker_id,kpi_team)
    );
  `);
  const them=(id,ngay,stage,so,to,nguoi=null)=>db.query(
    "insert into public.khsx_stage_progress values($1,$2,$3,$4,$5,$6,$5)",[id,ngay,stage,so,to,nguoi]);

  await them('d1','2026-09-15','may',14,'To 1');
  await them('d2','2026-09-15','may',39,'To 2');
  await them('d3','2026-09-15','may',8,'To 3');
  await them('d4','2026-09-15','may',32,'To 4');
  await them('d5','2026-09-15','dong_goi',30,'To 1');
  await them('d6','2026-09-15','dong_goi',46,'To 4');
  // Cac dong TUYET DOI khong duoc dung toi:
  await them('g1','2026-09-15','may',10,'To 1','thao_vy');   // da co nguoi dung
  await them('g2','2026-08-20','may',99,'To 2');             // thang 8 da chot bo qua
  await them('g3','2026-09-15','may',7,'To 5');              // To 5 khong co mac dinh
  await them('g4','2026-09-15','dong_goi',0,'To 3');         // so luong 0
  await them('g5','2026-09-15','dan',50,'To 1');             // Dan khong tinh KPI ca nhan

  const chay=async()=>{ await db.query(cauUpdate); await db.query(cauInsert); };
  const nguoi=async id=>(await db.query("select completed_by_worker_id w from public.khsx_stage_progress where order_id=$1",[id])).rows[0].w;

  await chay();

  assert.equal(await nguoi('d1'),'thao_vy');
  assert.equal(await nguoi('d2'),'bao_cham');
  assert.equal(await nguoi('d3'),'loan_anh');
  assert.equal(await nguoi('d4'),'loan_anh');
  console.log('PASS May gan dung nguoi theo to: To 1 Thao Vy, To 2 Bao Cham, To 3/4 Loan Anh');

  assert.equal(await nguoi('d5'),'minh_thuan');
  assert.equal(await nguoi('d6'),'minh_thuan');
  console.log('PASS Dong goi luon gan Minh Thuan, khong chia theo to');

  assert.equal(await nguoi('g1'),'thao_vy','Dong da co nguoi bi ghi de');
  assert.equal(await nguoi('g2'),null,'Da dung vao du lieu thang 8');
  assert.equal(await nguoi('g3'),null,'Da gan nguoi cho don To 5');
  assert.equal(await nguoi('g4'),null,'Da gan nguoi cho dong so luong 0');
  assert.equal(await nguoi('g5'),null,'Da gan nguoi cho cong doan Dan');
  console.log('PASS khong dung: dong da co nguoi, thang 8, To 5, so luong 0, cong doan Dan');

  const tong=async()=>(await db.query("select coalesce(sum(quantity),0)::int s, count(*)::int n from public.khsx_stage_credits")).rows[0];
  const lan1=await tong();
  assert.deepEqual(lan1,{s:179,n:7},'Credit sinh ra khong dung (6 dong backfill + 1 dong da co nguoi san)');

  await chay();
  assert.deepEqual(await tong(),lan1,'Chay lan hai lam doi du lieu - migration khong idempotent');
  console.log('PASS chay lai lan hai khong doi gi (idempotent)');

  await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
