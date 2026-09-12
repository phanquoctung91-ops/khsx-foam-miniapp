-- Tick nhieu to / 1 don - Giai doan A: doi schema khsx_stage_progress/khsx_stage_credits
-- + RPC khsx_apply_stage_progress_v2 trong CUNG 1 migration (khong tach duoc thanh
-- "chi doi schema, khong doi hanh vi" nhu goi phan quyen - doi PK cua bang dang ghi
-- lien tuc bat buoc phai doi ca cach ghi cung luc, xem PLAN-multi-team-per-order.md).
--
-- Da chot voi anh Tung (2026-09-12):
--   1. Moi to duoc gan tu nhap so rieng cua minh; tong luy ke ca don khong duoc vuot
--      KH dau vao. KHONG chia han muc rieng tung to luc gan - chi canh tong ca don.
--   2. Bat ky to nao trong danh sach gan cho don cung nhap duoc (khong chi "to chinh").
--   3. Don da co san co che "to ho tro" (tach don phu) - GIU NGUYEN, khong gop lai.
--      Chi lan gan MOI tu nay dung tick nhieu to, thay the hoan toan luong gan-ho-tro cu.
--   4. Bo phan biet plan_team/current_team - chi con 1 danh sach to (bang moi
--      khsx_order_team_assignments).
--
-- Da prototype + test day du 3 cong doan (Dan->May->Dong goi) trong transaction
-- roi rollback voi du lieu that truoc khi viet migration nay (khong dung, khong
-- doan). Phat hien va sua 2 bug thuc su trong luc test:
--   a) khsx_stage_credits khoa (order_id,work_date,stage,worker_id) - thieu cot to.
--      1 nguoi BO PHAN (May/Dong goi) xu ly cho nhieu to khac nhau cung ngay cung
--      don se bi GHI DE MAT cong cua to truoc do. Da them cot kpi_team + doi khoa.
--   b) private.khsx_has_permission() da revoke khoi role authenticated (giong phat
--      hien o Dot 4.2/4.3) - RPC nay da la security definer tu truoc nen khong bi.
--
-- 108 dong khsx_stage_progress cu (28-29/8, du lieu khoi phuc tu dot hard-reload
-- truoc) thieu kpi_team, khong the suy ra dung to (da doi chieu voi anh Tung: danh
-- dau "khong ro to", KHONG bia to nao) - dung cot team_key rieng (text, khong bi
-- rang buoc enum 5 to) danh dau sentinel '_unknown_legacy' cho dung 108 dong nay,
-- kpi_team cua chung VAN GIU NULL (CHECK constraint hien co khong chan NULL).

-- ============================================================
-- 1) khsx_stage_progress: cho phep nhieu to cung 1 (order,date,stage)
-- ============================================================
alter table public.khsx_stage_progress add column team_key text;
update public.khsx_stage_progress set team_key = coalesce(kpi_team::text,'_unknown_legacy');
alter table public.khsx_stage_progress alter column team_key set not null;
alter table public.khsx_stage_progress drop constraint khsx_stage_progress_pkey;
alter table public.khsx_stage_progress add primary key (order_id, work_date, stage, team_key);

-- ============================================================
-- 2) khsx_stage_credits: them to vao khoa (fix bug xoa nham cong nguoi khac to)
-- ============================================================
alter table public.khsx_stage_credits add column kpi_team public.khsx_unit;
update public.khsx_stage_credits sc set kpi_team = sp.kpi_team
  from public.khsx_stage_progress sp
  where sp.order_id=sc.order_id and sp.work_date=sc.work_date and sp.stage=sc.stage;
-- Da xac minh truoc: khong co dong stage_credits nao ma stage_progress tuong ung
-- lai thieu kpi_team (108 dong cu thieu to khong keo theo cham cong ca nhan nao).
alter table public.khsx_stage_credits alter column kpi_team set not null;
alter table public.khsx_stage_credits drop constraint khsx_stage_credits_pkey;
alter table public.khsx_stage_credits add primary key (order_id, work_date, stage, worker_id, kpi_team);

-- ============================================================
-- 3) Bang lien ket nhieu-to cho 1 don, thay khai niem plan_team/current_team don-gia-tri
-- ============================================================
create table public.khsx_order_team_assignments(
  order_id text not null references public.khsx_orders(id),
  team_name public.khsx_unit not null,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  primary key(order_id, team_name)
);
alter table public.khsx_order_team_assignments enable row level security;
create policy khsx_order_team_assignments_select on public.khsx_order_team_assignments
  for select using (private.khsx_is_active());
insert into public.khsx_order_team_assignments(order_id, team_name, assigned_by, assigned_at)
select order_id, coalesce(current_team, plan_team), assigned_by, coalesce(assigned_at, now())
from public.khsx_order_assignments
where coalesce(current_team, plan_team) is not null
on conflict do nothing;
grant select on public.khsx_order_team_assignments to authenticated;

-- ============================================================
-- 4) RPC nhap tien do: nhieu to cung 1 don, moi to tu nhap so rieng, tong khong vuot KH.
--    Giu nguyen ten khsx_apply_stage_progress_v2 - wrapper
--    khsx_apply_stage_progress_timed va client khong doi gi.
-- ============================================================
create or replace function public.khsx_apply_stage_progress_v2(
  p_operation_id uuid,
  p_order_id text,
  p_work_date date,
  p_stage public.khsx_stage,
  p_quantity integer,
  p_kpi_team public.khsx_unit default null,
  p_worker_id text default null,
  p_device_id text default ''
)
returns table(operation_id uuid,applied_quantity integer,duplicate boolean,normalized_upstream boolean)
language plpgsql
security definer
set search_path=''
set lock_timeout='3s'
set statement_timeout='8s'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_unit public.khsx_unit;
  v_profile_worker text;
  v_is_manager boolean := false;
  v_can_enter_for_other boolean := false;
  v_can_reduce boolean := false;
  v_credit_team public.khsx_unit;
  v_assigned_count integer;
  v_legacy_order_team public.khsx_unit;
  v_progress_locked boolean := false;
  v_plan integer;
  v_existing integer := 0;
  v_existing_op public.khsx_stage_operations%rowtype;
  v_applied integer;
  v_dan integer := 0;
  v_may integer := 0;
  v_pack integer := 0;
  v_worker text;
begin
  if v_actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_operation_id is null or nullif(pg_catalog.btrim(p_order_id),'') is null or p_work_date is null or p_stage is null or p_quantity is null then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;

  select p.unit_name,p.role in ('quan_ly','quan_ly_2'),p.worker_id
    into v_actor_unit,v_is_manager,v_profile_worker
  from public.khsx_profiles p where p.user_id=v_actor and p.active;
  if not found then raise exception using errcode='42501',message='PROFILE_INACTIVE'; end if;

  if not private.khsx_has_permission('progress_enter_'||p_stage::text, v_actor) then
    raise exception using errcode='42501',message='PROGRESS_ENTER_FORBIDDEN';
  end if;
  v_can_enter_for_other := private.khsx_has_permission('progress_enter_for_other', v_actor);
  v_can_reduce := private.khsx_has_permission('progress_reduce', v_actor);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select op.* into v_existing_op
  from public.khsx_stage_operations op
  where op.operation_id=p_operation_id;
  if found then
    if v_existing_op.order_id<>p_order_id
      or v_existing_op.work_date<>p_work_date
      or v_existing_op.stage<>p_stage
      or v_existing_op.requested_quantity<>p_quantity
      or v_existing_op.actor_user_id<>v_actor then
      raise exception using errcode='22023',message='OPERATION_ID_REUSED';
    end if;
    return query select p_operation_id,v_existing_op.applied_quantity,true,false;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id,1));

  -- v_legacy_order_team: dung DUNG NGUYEN cong thuc cu (khong doi 1 ky tu) de giu
  -- 100% hanh vi hom nay cho MOI don dang chay, ke ca co che "to ho tro theo
  -- ngay" ghi thang vao khsx_daily_assignments tu client (sendSupabaseManagementItem
  -- kind='support') - thu duoc dau tien neu bo qua se lam vo tinh nang dang dung that.
  select o.plan_qty,coalesce(sup.team_name,own.team_name,a.current_team,a.plan_team),coalesce(l.progress_locked,false)
    into v_plan,v_legacy_order_team,v_progress_locked
  from public.khsx_orders o
  left join public.khsx_order_assignments a on a.order_id=o.id
  left join public.khsx_daily_assignments sup on sup.order_id=o.id and sup.work_date=p_work_date and sup.assignment_kind='support'
  left join public.khsx_daily_assignments own on own.order_id=o.id and own.work_date=p_work_date and own.assignment_kind='owner'
  left join public.khsx_day_locks l on l.work_date=p_work_date
  where o.id=p_order_id and o.deleted_at is null;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  -- Trigger v119 cung chan duong ghi vong qua RPC; giu kiem tra tai day cho ro loi.
  if v_progress_locked and not private.khsx_is_full_manager() then raise exception using errcode='42501',message='PROGRESS_LOCKED'; end if;
  if p_quantity<0 or p_quantity>v_plan then raise exception using errcode='22023',message='PLAN_LIMIT_EXCEEDED'; end if;

  select count(*) into v_assigned_count from public.khsx_order_team_assignments where order_id=p_order_id;

  if v_assigned_count <= 1 then
    -- Don CHUA duoc gan >=2 to qua co che tick moi (moi don dang chay hien nay,
    -- ke ca don da tach/gan ho tro kieu cu) - giu DUNG NGUYEN cong thuc/hanh vi
    -- cu 100%, khong doi 1 dong nao so voi truoc migration nay.
    v_credit_team := case when v_is_manager and p_kpi_team in ('To 1','To 2','To 3','To 4','To 5') then p_kpi_team else v_legacy_order_team end;
    if v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED'; end if;
    if not v_is_manager and p_stage='dan' and v_actor_unit<>v_credit_team then raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN'; end if;
  else
    -- Don THAT SU duoc tick nhieu to (>=2 dong trong khsx_order_team_assignments) -
    -- luat moi: uu tien p_kpi_team client gui (nguoi bo phan May/Dong goi luon phai
    -- chi ro vi ban than khong phai 1 To 1-5); neu khong gui thi thu dung don vi
    -- cua chinh actor (actor la thanh vien 1 To 1-5 that, tu nhap cho chinh to minh).
    v_credit_team := coalesce(p_kpi_team, v_actor_unit);
    if v_credit_team is null or v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then
      raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED';
    end if;
    -- Thuoc danh sach to duoc gan cho don (khong con so sanh bang 1 to duy nhat) -
    -- ap dung cho CA 3 cong doan.
    if not exists(select 1 from public.khsx_order_team_assignments t where t.order_id=p_order_id and t.team_name=v_credit_team) then
      raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN';
    end if;
    if not v_is_manager and p_stage='dan' and v_actor_unit<>v_credit_team then
      raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN';
    end if;
  end if;

  if p_stage in ('may','dong_goi') then
    v_worker := case when v_can_enter_for_other then nullif(pg_catalog.btrim(p_worker_id),'') else v_profile_worker end;
    -- Khong co worker catalogue van duoc ghi san luong; khi co worker hop le
    -- thi he thong tiep tuc ghi nhan KPI ca nhan nhu truoc.
    if v_worker is not null and not exists(select 1 from public.khsx_workers w where w.id=v_worker and w.stage=p_stage and w.active) then
      if v_can_enter_for_other then
        v_worker := null;
      else
        raise exception using errcode='22023',message='WORKER_REQUIRED';
      end if;
    end if;
  end if;

  -- Tong CA DON (moi to cong lai) - dung kiem tra KH/chuoi cong doan, KHONG doi so
  -- voi truoc day (khong loc theo to - ban chat van la 1 phep tinh tren toan don).
  select coalesce(sum(quantity) filter(where stage='dan'),0),coalesce(sum(quantity) filter(where stage='may'),0),coalesce(sum(quantity) filter(where stage='dong_goi'),0)
    into v_dan,v_may,v_pack from public.khsx_stage_progress where order_id=p_order_id;
  -- So hien co RIENG cua dung to nay (truoc day la ca don, vi truoc day moi don
  -- chi co 1 to nen 2 cach tinh nay tuong duong - gio moi to giu so rieng).
  select coalesce(quantity,0) into v_existing from public.khsx_stage_progress
    where order_id=p_order_id and work_date=p_work_date and stage=p_stage and kpi_team=v_credit_team for update;
  if not found then v_existing:=0; end if;
  v_applied := case when v_can_reduce then p_quantity else greatest(v_existing,p_quantity) end;

  if (case p_stage when 'dan' then v_dan when 'may' then v_may else v_pack end)-v_existing+v_applied>v_plan then
    raise exception using errcode='22023',message='PLAN_LIMIT_EXCEEDED';
  end if;
  if p_stage='dan' and (v_dan-v_existing+v_applied)<v_may then
    raise exception using errcode='22023',message='CHAIN_LIMIT_EXCEEDED';
  elsif p_stage='may' and ((v_may-v_existing+v_applied)>v_dan or (v_may-v_existing+v_applied)<v_pack) then
    raise exception using errcode='22023',message='CHAIN_LIMIT_EXCEEDED';
  elsif p_stage='dong_goi' and (v_pack-v_existing+v_applied)>v_may then
    raise exception using errcode='22023',message='CHAIN_LIMIT_EXCEEDED';
  end if;

  insert into public.khsx_stage_operations(operation_id,order_id,work_date,stage,requested_quantity,applied_quantity,kpi_team,actor_user_id,device_id,completed_by_worker_id)
  values(p_operation_id,p_order_id,p_work_date,p_stage,p_quantity,v_applied,v_credit_team,v_actor,left(coalesce(p_device_id,''),160),v_worker);
  insert into public.khsx_stage_progress(order_id,work_date,stage,quantity,kpi_team,entered_by,completed_by_worker_id,team_key)
  values(p_order_id,p_work_date,p_stage,v_applied,v_credit_team,v_actor,v_worker,v_credit_team::text)
  on conflict(order_id,work_date,stage,team_key) do update set quantity=excluded.quantity,kpi_team=excluded.kpi_team,entered_by=excluded.entered_by,completed_by_worker_id=excluded.completed_by_worker_id,updated_at=now();
  if v_worker is not null then
    -- Fix that: xoa/ghi theo CA worker LAN kpi_team - 1 nguoi bo phan (May/Dong
    -- goi) co the lam cho nhieu to trong cung 1 ngay, moi to phai la 1 dong cham
    -- cong rieng (phat hien khi test full chuoi 3 cong doan truoc migration nay).
    delete from public.khsx_stage_credits where order_id=p_order_id and work_date=p_work_date and stage=p_stage and worker_id=v_worker and kpi_team=v_credit_team;
    if v_applied>0 then
      insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source,kpi_team)
      values(p_order_id,p_work_date,p_stage,v_worker,v_applied,'actual',v_credit_team);
    end if;
  end if;
  return query select p_operation_id,v_applied,false,false;
end;
$$;
revoke all on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) from public,anon,authenticated,service_role;
grant execute on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) to authenticated;
