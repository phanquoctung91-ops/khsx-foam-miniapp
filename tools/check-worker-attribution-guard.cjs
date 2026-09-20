// Kiem tra rieng doan CASE moi them vao upsert khsx_stage_progress trong
// migration 20260920100000_guard_worker_attribution_replay.sql: patch
// worker_id=null "replay" cung so luong khong duoc de mat worker cu da ghi
// dung; so luong THAT SU doi thi van ghi binh thuong (ke ca worker null).
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');

(async()=>{
  const db=await PGlite.create();
  await db.exec(`
    create table khsx_stage_progress(
      order_id text, work_date date, stage text, quantity integer,
      kpi_team text, entered_by text, completed_by_worker_id text, team_key text,
      updated_at timestamptz default now(),
      primary key(order_id,work_date,stage,team_key)
    );
    create function upsert_progress(p_order_id text,p_work_date date,p_stage text,p_quantity integer,p_kpi_team text,p_entered_by text,p_worker text,p_team_key text) returns void language plpgsql as $$
    begin
      insert into khsx_stage_progress(order_id,work_date,stage,quantity,kpi_team,entered_by,completed_by_worker_id,team_key)
      values(p_order_id,p_work_date,p_stage,p_quantity,p_kpi_team,p_entered_by,p_worker,p_team_key)
      on conflict(order_id,work_date,stage,team_key) do update set
        quantity=excluded.quantity,
        kpi_team=excluded.kpi_team,
        entered_by=excluded.entered_by,
        completed_by_worker_id=case
          when excluded.completed_by_worker_id is null
           and excluded.quantity=khsx_stage_progress.quantity
           and khsx_stage_progress.completed_by_worker_id is not null
          then khsx_stage_progress.completed_by_worker_id
          else excluded.completed_by_worker_id
        end,
        updated_at=now();
    end;
    $$;
  `);
  const q=(...a)=>db.query(...a);
  const row=async()=>(await q("select quantity,completed_by_worker_id from khsx_stage_progress where order_id='o1' and work_date='2026-09-17' and stage='may' and team_key='To 1'")).rows[0];

  await q("select upsert_progress('o1','2026-09-17','may',9,'To 1','u1','w1','To 1')");
  assert.deepEqual(await row(),{quantity:9,completed_by_worker_id:'w1'});
  console.log('PASS ghi lan dau co worker: luu dung');

  await q("select upsert_progress('o1','2026-09-17','may',9,'To 1','u1',null,'To 1')");
  assert.deepEqual(await row(),{quantity:9,completed_by_worker_id:'w1'});
  console.log('PASS replay cung so luong, worker null: GIU nguyen worker cu (chan mat KPI)');

  await q("select upsert_progress('o1','2026-09-17','may',5,'To 1','u1',null,'To 1')");
  assert.deepEqual(await row(),{quantity:5,completed_by_worker_id:null});
  console.log('PASS so luong THAT SU doi, worker null: van ghi binh thuong (khong khoa nham)');

  await q("select upsert_progress('o1','2026-09-17','may',5,'To 1','u1','w2','To 1')");
  assert.deepEqual(await row(),{quantity:5,completed_by_worker_id:'w2'});
  console.log('PASS nhap lai co worker moi: ghi de binh thuong');

  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
