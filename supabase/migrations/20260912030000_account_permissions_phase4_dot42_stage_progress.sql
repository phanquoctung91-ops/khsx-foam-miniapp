-- Phan quyen tai khoan - Giai doan 4, Dot 4.2: bat hieu luc that cho quyen nhap
-- tien do cong doan (TDSX co ban) trong khsx_apply_stage_progress_v2.
--
-- Doi 3 cho tu kiem tra theo ROLE sang kiem tra theo PERMISSION_KEY that (khong
-- doi hanh vi cho tai khoan dang hoat dong that - da doi chieu du lieu truoc khi
-- viet migration nay):
--
-- 1) MOI: bat buoc phai co dung quyen progress_enter_dan/progress_enter_may/
--    progress_enter_dong_goi tuong ung p_stage moi duoc ghi. Truoc day KHONG co
--    gate nao ca cho cong doan may/dong_goi (chi 'dan' bi so to) - day la lo ho
--    duoc bit lai. Da xac nhan ca 8 nhan vien active deu da co dung 1 quyen
--    progress_enter_* khop to cua ho (backfill Giai doan 3), va deu dang dung
--    that (4-14 luot/nguoi trong 90 ngay qua) - khong ai bi khoa nham.
-- 2) "Nhap ho nguoi khac" (chon worker_id thay vi bat buoc dung worker cua chinh
--    minh): doi tu `v_is_manager` sang quyen progress_enter_for_other.
-- 3) "Giam san luong" (duoc ghi so thap hon so da co, thay vi server tu kep ve
--    max hien co): doi tu `v_is_manager` sang quyen progress_reduce.
--
-- Le Huu Phuoc (quan_ly_2) da co du ca 5 quyen tren (dan/may/dong_goi/
-- for_other/reduce). Chu tai khoan (Phan Quoc Tung) khong co dong cap quyen
-- tuong minh nao nhung da dang ky trong private.khsx_permission_owner nen moi
-- kiem tra deu tu qua (private.khsx_has_permission da co san co che bypass nay
-- tu Giai doan 1) - khong can backfill rieng.
--
-- CO Y KHONG doi trong dot nay (thuoc Dot 4.3, khong phai pham vi lan nay):
--   - v_is_manager van dung nguyen cho: doi to nhan KPI (kpi_team override),
--     Quan ly duoc ghi de Dan khac to (ORDER_TEAM_FORBIDDEN).
--   - private.khsx_is_full_manager() cho mo khoa ngay da chot (PROGRESS_LOCKED)
--     khong doi.
--
-- Khong can sua gi o client index.html: co che bao loi hien co
-- (KhsxDataCore.classifyWriteError) da coi moi loi ma 42501 la khong thu lai,
-- bao loi ro (dung hanh vi mong muon - khong xoa mat so da nhap).

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
  v_order_team public.khsx_unit;
  v_credit_team public.khsx_unit;
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

  select o.plan_qty,coalesce(sup.team_name,own.team_name,a.current_team,a.plan_team),coalesce(l.progress_locked,false)
    into v_plan,v_order_team,v_progress_locked
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

  v_credit_team := case when v_is_manager and p_kpi_team in ('To 1','To 2','To 3','To 4','To 5') then p_kpi_team else v_order_team end;
  if v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED'; end if;
  if not v_is_manager and p_stage='dan' and v_actor_unit<>v_order_team then raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN'; end if;

  if p_stage in ('may','dong_goi') then
    v_worker := case when v_can_enter_for_other then nullif(pg_catalog.btrim(p_worker_id),'') else v_profile_worker end;
    -- Khong co worker catalogue van duoc ghi san luong; khi co worker hop le
    -- thi he thong tiep tuc ghi nhan KPI ca nhan nhu truoc.
    if v_worker is not null and not exists(select 1 from public.khsx_workers w where w.id=v_worker and w.stage=p_stage and w.active) then
      if v_can_enter_for_other then
        -- Giu quy uoc "chua xac dinh" nhu truoc 2026-09-05: nguoi co quyen
        -- nhap ho nhung chon worker khong hop le thi de NULL, khong gan sang
        -- chinh minh (actor_user_id da ghi dung nguoi xac nhan roi).
        v_worker := null;
      else
        raise exception using errcode='22023',message='WORKER_REQUIRED';
      end if;
    end if;
  end if;

  select coalesce(sum(quantity) filter(where stage='dan'),0),coalesce(sum(quantity) filter(where stage='may'),0),coalesce(sum(quantity) filter(where stage='dong_goi'),0)
    into v_dan,v_may,v_pack from public.khsx_stage_progress where order_id=p_order_id;
  select coalesce(quantity,0) into v_existing from public.khsx_stage_progress where order_id=p_order_id and work_date=p_work_date and stage=p_stage for update;
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
  insert into public.khsx_stage_progress(order_id,work_date,stage,quantity,kpi_team,entered_by,completed_by_worker_id)
  values(p_order_id,p_work_date,p_stage,v_applied,v_credit_team,v_actor,v_worker)
  on conflict(order_id,work_date,stage) do update set quantity=excluded.quantity,kpi_team=excluded.kpi_team,entered_by=excluded.entered_by,completed_by_worker_id=excluded.completed_by_worker_id,updated_at=now();
  delete from public.khsx_stage_credits where order_id=p_order_id and work_date=p_work_date and stage=p_stage;
  if v_worker is not null and v_applied>0 then
    insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source)
    values(p_order_id,p_work_date,p_stage,v_worker,v_applied,'actual');
  end if;
  return query select p_operation_id,v_applied,false,false;
end;
$$;
revoke all on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) from public,anon,authenticated,service_role;
grant execute on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) to authenticated;
