-- Sửa lương (rà soát 25/09/2026, anh Tùng duyệt "gom lại sửa 1 lần"):
-- 1. Số liệu lương (khsx_wage_report) bỏ đơn đã huỷ. Trước đây cộng cả Dán và công May /
--    Đóng gói của đơn đã huỷ — tháng 9 thừa Dán 22, May 18, Đóng gói 8 tấm (vd CAST10-3
--    09/09: đơn huỷ và đơn khôi phục cùng ghi Loan Anh may 4 → lương tính 8).
-- 2. View khsx_cong_hieu_luc: công của đơn còn hiệu lực, cho ô "Tổng của tôi".
-- 3. khsx_apply_stage_progress_v2: công của một dòng tiến độ (đơn, ngày, công đoạn, tổ) luôn
--    khớp dòng đó — biết người thì chỉ người đó nhận đúng số tấm của dòng; số về 0 thì xoá
--    công; không biết người thì giữ công cũ nhưng không để tổng vượt số tấm. Trước đây chỉ
--    xoá công của đúng người đang ghi, nên đổi người / bấm Hoàn thành gửi lại người mặc
--    định làm một tấm có 2 người nhận (PRE20-2022 24/09: Bảo Chăm 1 + Thảo Vy 1).
-- 4. Dọn dữ liệu: công lệch người / lệch số so với dòng tiến độ có người (1 chỗ: PRE20-2022);
--    huỷ đơn tách thừa ZONE12-8 (1 tấm đã ghi ở đơn 21/09) và đơn gốc LAEZ15-8 19/09 (tồn ảo,
--    5 tấm đã làm xong ở đơn phát sinh 21/09).

create or replace function public.khsx_wage_report(p_from date, p_to date) returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.khsx_has_permission('payroll_view', v_actor) then
    raise exception using errcode='42501', message='PAYROLL_VIEW_FORBIDDEN';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception using errcode='22023', message='INVALID_RANGE';
  end if;
  return jsonb_build_object(
    'dan', (select coalesce(jsonb_agg(jsonb_build_object('kpi_team',p.kpi_team,'work_date',p.work_date,'quantity',p.quantity)),'[]'::jsonb)
      from public.khsx_stage_progress p join public.khsx_orders o on o.id=p.order_id and o.deleted_at is null
      where p.stage='dan' and p.work_date between p_from and p_to),
    'workers', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'stage',stage)),'[]'::jsonb)
      from public.khsx_workers where active=true),
    'credits', (select coalesce(jsonb_agg(jsonb_build_object('worker_id',c.worker_id,'work_date',c.work_date,'quantity',c.quantity,'stage',c.stage)),'[]'::jsonb)
      from public.khsx_stage_credits c join public.khsx_orders o on o.id=c.order_id and o.deleted_at is null
      where c.stage in ('may','dong_goi') and c.work_date between p_from and p_to)
  );
end;
$function$;

create or replace view public.khsx_cong_hieu_luc with (security_invoker = true) as
select c.order_id, c.work_date, c.stage, c.worker_id, c.quantity, c.kpi_team
from public.khsx_stage_credits c
join public.khsx_orders o on o.id=c.order_id and o.deleted_at is null;
revoke all on public.khsx_cong_hieu_luc from anon, authenticated;
grant select on public.khsx_cong_hieu_luc to authenticated;

create or replace function public.khsx_apply_stage_progress_v2(
  p_operation_id uuid, p_order_id text, p_work_date date, p_stage public.khsx_stage, p_quantity integer,
  p_kpi_team public.khsx_unit default null, p_worker_id text default null, p_device_id text default ''
) returns table(operation_id uuid, applied_quantity integer, duplicate boolean, normalized_upstream boolean)
language plpgsql security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '8s'
as $function$
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
  v_final_worker text;
  v_final_qty integer;
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
    into v_plan,v_legacy_order_team,v_progress_locked
  from public.khsx_orders o
  left join public.khsx_order_assignments a on a.order_id=o.id
  left join public.khsx_daily_assignments sup on sup.order_id=o.id and sup.work_date=p_work_date and sup.assignment_kind='support'
  left join public.khsx_daily_assignments own on own.order_id=o.id and own.work_date=p_work_date and own.assignment_kind='owner'
  left join public.khsx_day_locks l on l.work_date=p_work_date
  where o.id=p_order_id and o.deleted_at is null;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if v_progress_locked and not private.khsx_is_full_manager() then raise exception using errcode='42501',message='PROGRESS_LOCKED'; end if;
  if p_quantity<0 or p_quantity>v_plan then raise exception using errcode='22023',message='PLAN_LIMIT_EXCEEDED'; end if;

  select count(*) into v_assigned_count from public.khsx_order_team_assignments where order_id=p_order_id;

  if v_assigned_count <= 1 then
    v_credit_team := case when v_is_manager and p_kpi_team in ('To 1','To 2','To 3','To 4','To 5') then p_kpi_team else v_legacy_order_team end;
    if v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED'; end if;
    if not v_is_manager and p_stage='dan' and v_actor_unit<>v_credit_team then raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN'; end if;
  else
    v_credit_team := coalesce(p_kpi_team, v_actor_unit);
    if v_credit_team is null or v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then
      raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED';
    end if;
    if not exists(select 1 from public.khsx_order_team_assignments t where t.order_id=p_order_id and t.team_name=v_credit_team) then
      raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN';
    end if;
    if not v_is_manager and p_stage='dan' and v_actor_unit<>v_credit_team then
      raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN';
    end if;
  end if;

  if p_stage in ('may','dong_goi') then
    v_worker := case when v_can_enter_for_other then nullif(pg_catalog.btrim(p_worker_id),'') else v_profile_worker end;
    if v_worker is not null and not exists(select 1 from public.khsx_workers w where w.id=v_worker and w.stage=p_stage and w.active) then
      if v_can_enter_for_other then
        v_worker := null;
      else
        raise exception using errcode='22023',message='WORKER_REQUIRED';
      end if;
    end if;
  end if;

  select coalesce(sum(quantity) filter(where stage='dan'),0),coalesce(sum(quantity) filter(where stage='may'),0),coalesce(sum(quantity) filter(where stage='dong_goi'),0)
    into v_dan,v_may,v_pack from public.khsx_stage_progress where order_id=p_order_id;
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
  on conflict(order_id,work_date,stage,team_key) do update set
    quantity=excluded.quantity,
    kpi_team=excluded.kpi_team,
    entered_by=excluded.entered_by,
    completed_by_worker_id=case
      when excluded.completed_by_worker_id is null
       and excluded.quantity=public.khsx_stage_progress.quantity
       and public.khsx_stage_progress.completed_by_worker_id is not null
      then public.khsx_stage_progress.completed_by_worker_id
      else excluded.completed_by_worker_id
    end,
    updated_at=now();

  if p_stage in ('may','dong_goi') then
    -- Công của dòng này phải khớp chính dòng tiến độ vừa ghi (một dòng = một người).
    select sp.completed_by_worker_id,sp.quantity into v_final_worker,v_final_qty
    from public.khsx_stage_progress sp
    where sp.order_id=p_order_id and sp.work_date=p_work_date and sp.stage=p_stage and sp.team_key=v_credit_team::text;
    if coalesce(v_final_qty,0)<=0 then
      delete from public.khsx_stage_credits c
      where c.order_id=p_order_id and c.work_date=p_work_date and c.stage=p_stage and c.kpi_team=v_credit_team;
    elsif v_final_worker is not null then
      delete from public.khsx_stage_credits c
      where c.order_id=p_order_id and c.work_date=p_work_date and c.stage=p_stage and c.kpi_team=v_credit_team;
      insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source,kpi_team)
      values(p_order_id,p_work_date,p_stage,v_final_worker,v_final_qty,'actual',v_credit_team);
    else
      -- Không biết người (vd quản lý giảm số mà không chọn người, hoặc công ghi bù từ trước):
      -- giữ công cũ, người ghi gần nhất giữ trước, tổng không vượt số tấm của dòng.
      update public.khsx_stage_credits c set quantity=r.duoc, updated_at=now()
      from (
        select x.worker_id, x.quantity,
          least(x.quantity, greatest(0, v_final_qty-(sum(x.quantity) over (order by x.updated_at desc, x.worker_id)-x.quantity))) as duoc
        from public.khsx_stage_credits x
        where x.order_id=p_order_id and x.work_date=p_work_date and x.stage=p_stage and x.kpi_team=v_credit_team
      ) r
      where c.order_id=p_order_id and c.work_date=p_work_date and c.stage=p_stage and c.kpi_team=v_credit_team
        and c.worker_id=r.worker_id and r.duoc<>r.quantity;
      delete from public.khsx_stage_credits c
      where c.order_id=p_order_id and c.work_date=p_work_date and c.stage=p_stage and c.kpi_team=v_credit_team and c.quantity<=0;
    end if;
  end if;
  return query select p_operation_id,v_applied,false,false;
end;
$function$;
revoke all on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) from public, anon;
grant execute on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) to authenticated;

-- ---- Dọn dữ liệu ----
-- Công lệch với dòng tiến độ đã có người: đưa về đúng người và đúng số của dòng.
drop table if exists pg_temp.khsx_cong_lech;
create temporary table khsx_cong_lech as
select p.order_id,p.work_date,p.stage,p.kpi_team,p.completed_by_worker_id w,p.quantity q
from public.khsx_stage_progress p
join public.khsx_orders o on o.id=p.order_id and o.deleted_at is null
where p.stage in ('may','dong_goi') and p.completed_by_worker_id is not null and p.quantity>0
  and exists(select 1 from public.khsx_stage_credits c
             where c.order_id=p.order_id and c.work_date=p.work_date and c.stage=p.stage and c.kpi_team=p.kpi_team
               and (c.worker_id<>p.completed_by_worker_id or c.quantity<>p.quantity));
delete from public.khsx_stage_credits c using khsx_cong_lech l
where c.order_id=l.order_id and c.work_date=l.work_date and c.stage=l.stage and c.kpi_team=l.kpi_team;
insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source,kpi_team)
select order_id,work_date,stage,w,q,'actual',kpi_team from khsx_cong_lech;
drop table khsx_cong_lech;

update public.khsx_orders set deleted_at=now(), cancelled_by=null, updated_at=now(),
  cancel_reason='Trùng đơn: 1 tấm này đã ghi ở đơn ZONE12-8 ngày 21/09 (dọn 25/09/2026)'
where id='m1790316793103olfzg' and deleted_at is null;
update public.khsx_orders set deleted_at=now(), cancelled_by=null, updated_at=now(),
  cancel_reason='Đơn dời sang 21/09; 5 tấm đã làm xong ở đơn phát sinh m1789951626518nlygq (dọn 25/09/2026)'
where id='r_19_09_2026_LAEZ15_8_180_200_15_5_1' and deleted_at is null
  and not exists(select 1 from public.khsx_stage_progress p where p.order_id='r_19_09_2026_LAEZ15_8_180_200_15_5_1' and p.quantity>0);
