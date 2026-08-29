-- Release 119: quyền Quản lý 2 và đăng ký Telegram tối giản.
-- Chạy sau miniapp_upgrade_v1.sql / release_v118_business_rules.sql.
-- Không tạo Worker ID khi duyệt Telegram; worker catalogue chỉ là dữ liệu KPI
-- riêng, không được là điều kiện chặn đăng nhập.

begin;

create or replace function private.khsx_is_full_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists(
    select 1 from public.khsx_profiles p
    where p.user_id = auth.uid() and p.active and p.role = 'quan_ly'
  );
$$;
revoke all on function private.khsx_is_full_manager() from public,anon,authenticated,service_role;

-- Ghi công đoạn vẫn giữ toàn bộ rule lũy kế. Khác biệt duy nhất của v119:
-- worker_id có thể rỗng khi tài khoản Telegram mới chưa có catalogue KPI.
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
  -- Trigger v119 cũng chặn đường ghi vòng qua RPC; giữ kiểm tra tại đây cho rõ lỗi.
  if v_progress_locked and not private.khsx_is_full_manager() then raise exception using errcode='42501',message='PROGRESS_LOCKED'; end if;
  if p_quantity<0 or p_quantity>v_plan then raise exception using errcode='22023',message='PLAN_LIMIT_EXCEEDED'; end if;

  v_credit_team := case when v_is_manager and p_kpi_team in ('To 1','To 2','To 3','To 4','To 5') then p_kpi_team else v_order_team end;
  if v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED'; end if;
  if not v_is_manager and p_stage='dan' and v_actor_unit<>v_order_team then raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN'; end if;

  if p_stage in ('may','dong_goi') then
    v_worker := case when v_is_manager then nullif(pg_catalog.btrim(p_worker_id),'') else v_profile_worker end;
    -- Không có worker catalogue vẫn được ghi sản lượng; khi có worker hợp lệ
    -- thì hệ thống tiếp tục ghi nhận KPI cá nhân như trước.
    if v_worker is not null and not exists(select 1 from public.khsx_workers w where w.id=v_worker and w.stage=p_stage and w.active) then
      raise exception using errcode='22023',message='WORKER_REQUIRED';
    end if;
  end if;

  select coalesce(sum(quantity) filter(where stage='dan'),0),coalesce(sum(quantity) filter(where stage='may'),0),coalesce(sum(quantity) filter(where stage='dong_goi'),0)
    into v_dan,v_may,v_pack from public.khsx_stage_progress where order_id=p_order_id;
  select coalesce(quantity,0) into v_existing from public.khsx_stage_progress where order_id=p_order_id and work_date=p_work_date and stage=p_stage for update;
  if not found then v_existing:=0; end if;
  v_applied := case when v_is_manager then p_quantity else greatest(v_existing,p_quantity) end;

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

-- QL2 chỉ được thêm ngày chốt tiến độ; không được bỏ ngày đã chốt. Các giá trị
-- false cho ngày vốn chưa chốt vẫn là no-op để giao diện có thể gửi cả danh sách.
create or replace function public.khsx_set_day_locks(
  p_lock_kind text,
  p_lock_changes jsonb default '{}'::jsonb,
  p_snapshot_rows jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, private, pg_catalog
as $$
declare
  v_count integer := 0;
  v_date date;
  v_locked boolean;
  v_existing_progress_locked boolean;
  v_entry record;
  v_actor_role public.khsx_role;
begin
  if not private.khsx_is_manager() then
    raise exception using errcode='42501',message='MANAGER_REQUIRED';
  end if;
  select p.role into v_actor_role
  from public.khsx_profiles p
  where p.user_id=auth.uid() and p.active;
  if p_lock_kind not in ('plan','progress') then
    raise exception using errcode='22023',message='INVALID_LOCK_KIND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khsx-day-locks',0));
  for v_entry in select * from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) loop
    v_date:=v_entry.key::date;
    v_locked:=v_entry.value::boolean;
    v_count:=v_count+1;
    select coalesce((select l.progress_locked from public.khsx_day_locks l where l.work_date=v_date),false)
      into v_existing_progress_locked;
    if v_actor_role='quan_ly_2' and (
      p_lock_kind='plan' or (not v_locked and v_existing_progress_locked)
    ) then
      raise exception using errcode='42501',message='LOCKED_NO_UNLOCK';
    end if;
    if p_lock_kind='plan' then
      if v_locked then
        insert into public.khsx_day_locks(work_date,plan_locked,locked_by)
          values(v_date,true,auth.uid())
          on conflict(work_date) do update set plan_locked=true,locked_by=auth.uid(),updated_at=now();
      else
        update public.khsx_day_locks
           set plan_locked=false,locked_by=auth.uid(),updated_at=now()
         where work_date=v_date;
      end if;
    else
      if v_locked then
        insert into public.khsx_day_locks(work_date,progress_locked,locked_by)
          values(v_date,true,auth.uid())
          on conflict(work_date) do update set progress_locked=true,locked_by=auth.uid(),updated_at=now();
      else
        update public.khsx_day_locks
           set progress_locked=false,locked_by=auth.uid(),updated_at=now()
         where work_date=v_date;
      end if;
    end if;
  end loop;
  if p_lock_kind='plan' and jsonb_typeof(coalesce(p_snapshot_rows,'{}'::jsonb))='object' then
    insert into public.khsx_plan_snapshots(work_date,rows_json,version,created_by)
      select (e.key)::date,e.value,extract(epoch from clock_timestamp())::bigint,auth.uid()
      from jsonb_each(coalesce(p_snapshot_rows,'{}'::jsonb)) e
      where exists (
        select 1 from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) c
        where c.key=e.key and c.value::boolean
      )
      on conflict(work_date) do update set rows_json=excluded.rows_json,version=excluded.version,
        created_by=excluded.created_by,created_at=now();
  end if;
  return v_count;
end;
$$;
revoke all on function public.khsx_set_day_locks(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.khsx_set_day_locks(text,jsonb,jsonb) to authenticated;

-- Các trigger này là lớp bảo vệ cuối cùng cho yêu cầu "đã chốt thì không sửa".
-- Security-definer RPC vẫn giữ auth.uid() của người bấm nên không thể lách quyền.
create or replace function private.khsx_guard_ql2_day_lock()
returns trigger language plpgsql security definer
set search_path=public,private,pg_catalog as $$
declare v_role public.khsx_role;
begin
  select p.role into v_role from public.khsx_profiles p where p.user_id=auth.uid() and p.active;
  if v_role='quan_ly_2' then
    if (tg_op='INSERT' and coalesce(new.plan_locked,false))
       or (tg_op='UPDATE' and (
         old.plan_locked is distinct from new.plan_locked
         or (coalesce(old.progress_locked,false) and not coalesce(new.progress_locked,false))
       ))
       or (tg_op='DELETE' and (coalesce(old.plan_locked,false) or coalesce(old.progress_locked,false))) then
      raise exception using errcode='42501',message='LOCKED_NO_UNLOCK';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists khsx_guard_ql2_day_lock on public.khsx_day_locks;
create trigger khsx_guard_ql2_day_lock before insert or update or delete on public.khsx_day_locks
for each row execute function private.khsx_guard_ql2_day_lock();

create or replace function private.khsx_guard_ql2_progress_write()
returns trigger language plpgsql security definer
set search_path=public,private,pg_catalog as $$
declare v_role public.khsx_role;
begin
  select p.role into v_role from public.khsx_profiles p where p.user_id=auth.uid() and p.active;
  if v_role='quan_ly_2' and exists(
    select 1 from public.khsx_day_locks l
    where l.work_date=(case when tg_op='DELETE' then old.work_date else new.work_date end) and l.progress_locked
  ) then
    raise exception using errcode='42501',message='PROGRESS_LOCKED';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists khsx_guard_ql2_progress_write on public.khsx_stage_progress;
create trigger khsx_guard_ql2_progress_write before insert or update or delete on public.khsx_stage_progress
for each row execute function private.khsx_guard_ql2_progress_write();

create or replace function private.khsx_guard_ql2_order_assignment()
returns trigger language plpgsql security definer
set search_path=public,private,pg_catalog as $$
declare v_role public.khsx_role; v_production_date date;
begin
  select p.role into v_role from public.khsx_profiles p where p.user_id=auth.uid() and p.active;
  if v_role='quan_ly_2' then
    select o.production_date into v_production_date
    from public.khsx_orders o
    where o.id=(case when tg_op='DELETE' then old.order_id else new.order_id end);
    if exists(select 1 from public.khsx_day_locks l where l.progress_locked and l.work_date>=v_production_date) then
      raise exception using errcode='42501',message='PROGRESS_LOCKED';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists khsx_guard_ql2_order_assignment on public.khsx_order_assignments;
create trigger khsx_guard_ql2_order_assignment before insert or update or delete on public.khsx_order_assignments
for each row execute function private.khsx_guard_ql2_order_assignment();

create or replace function private.khsx_guard_ql2_daily_assignment()
returns trigger language plpgsql security definer
set search_path=public,private,pg_catalog as $$
declare v_role public.khsx_role;
begin
  select p.role into v_role from public.khsx_profiles p where p.user_id=auth.uid() and p.active;
  if v_role='quan_ly_2' and exists(
    select 1 from public.khsx_day_locks l
    where l.work_date=(case when tg_op='DELETE' then old.work_date else new.work_date end) and l.progress_locked
  ) then
    raise exception using errcode='42501',message='PROGRESS_LOCKED';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists khsx_guard_ql2_daily_assignment on public.khsx_daily_assignments;
create trigger khsx_guard_ql2_daily_assignment before insert or update or delete on public.khsx_daily_assignments
for each row execute function private.khsx_guard_ql2_daily_assignment();

-- QL2 vẫn đọc yêu cầu đăng ký, nhưng chỉ Quản lý được sửa/thu hồi catalogue
-- nhân viên đã duyệt qua REST trực tiếp.
drop policy if exists khsx_worker_team_assignments_insert on public.khsx_worker_team_assignments;
drop policy if exists khsx_worker_team_assignments_update on public.khsx_worker_team_assignments;
drop policy if exists khsx_worker_team_assignments_delete on public.khsx_worker_team_assignments;
create policy khsx_worker_team_assignments_insert on public.khsx_worker_team_assignments
  for insert to authenticated with check ((select private.khsx_is_full_manager()));
create policy khsx_worker_team_assignments_update on public.khsx_worker_team_assignments
  for update to authenticated using ((select private.khsx_is_full_manager()))
  with check ((select private.khsx_is_full_manager()));
create policy khsx_worker_team_assignments_delete on public.khsx_worker_team_assignments
  for delete to authenticated using ((select private.khsx_is_full_manager()));

-- QL2 chỉ đọc yêu cầu để duyệt lần đầu. Việc sửa/thu hồi link Telegram là
-- quyền của Quản lý; Edge Function vẫn dùng service_role để tạo link sau khi
-- QL/QL2 bấm Duyệt.
drop policy if exists khsx_telegram_links_insert on public.khsx_telegram_links;
drop policy if exists khsx_telegram_links_update on public.khsx_telegram_links;
drop policy if exists khsx_telegram_links_delete on public.khsx_telegram_links;
create policy khsx_telegram_links_insert on public.khsx_telegram_links
  for insert to authenticated with check ((select private.khsx_is_full_manager()));
create policy khsx_telegram_links_update on public.khsx_telegram_links
  for update to authenticated
  using ((select private.khsx_is_full_manager()))
  with check ((select private.khsx_is_full_manager()));
create policy khsx_telegram_links_delete on public.khsx_telegram_links
  for delete to authenticated using ((select private.khsx_is_full_manager()));

drop policy if exists khsx_telegram_requests_delete on public.khsx_telegram_access_requests;
create policy khsx_telegram_requests_delete on public.khsx_telegram_access_requests
  for delete to authenticated using ((select private.khsx_is_full_manager()));

-- Hồ sơ đã duyệt chỉ được Edge Function/service_role hoặc Quản lý toàn quyền
-- thay đổi. QL2 không thể tự đổi vai, tổ hay active bằng REST vòng ngoài.
create or replace function private.khsx_guard_ql2_profile_write()
returns trigger language plpgsql security definer
set search_path=public,private,pg_catalog as $$
declare v_role public.khsx_role;
begin
  select p.role into v_role
  from public.khsx_profiles p
  where p.user_id=auth.uid() and p.active;
  if v_role='quan_ly_2' then
    raise exception using errcode='42501',message='PROFILE_READONLY';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists khsx_guard_ql2_profile_write on public.khsx_profiles;
create trigger khsx_guard_ql2_profile_write before insert or update or delete on public.khsx_profiles
for each row execute function private.khsx_guard_ql2_profile_write();

create or replace function private.khsx_guard_ql2_telegram_link_write()
returns trigger language plpgsql security definer
set search_path=public,private,pg_catalog as $$
declare v_role public.khsx_role;
begin
  select p.role into v_role
  from public.khsx_profiles p
  where p.user_id=auth.uid() and p.active;
  if v_role='quan_ly_2' then
    raise exception using errcode='42501',message='TELEGRAM_LINK_READONLY';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists khsx_guard_ql2_telegram_link_write on public.khsx_telegram_links;
create trigger khsx_guard_ql2_telegram_link_write before insert or update or delete on public.khsx_telegram_links
for each row execute function private.khsx_guard_ql2_telegram_link_write();

-- Tab KHSX là vùng xem đối với QL2: không hủy/khôi phục/sửa đơn gốc hoặc
-- đơn phát sinh đã tạo. TDSX vẫn cho QL2 tạo đơn phát sinh và dùng RPC hỗ
-- trợ để cập nhật dòng phần thiếu (is_drop=true) trước khi chốt.
create or replace function private.khsx_guard_ql2_order_write()
returns trigger language plpgsql security definer
set search_path=public,private,pg_catalog as $$
declare v_role public.khsx_role;
begin
  select p.role into v_role
  from public.khsx_profiles p
  where p.user_id=auth.uid() and p.active;
  if v_role='quan_ly_2' and (
    (case when tg_op='INSERT' then exists(
      select 1 from public.khsx_day_locks l
      where l.progress_locked and l.work_date >= new.production_date
    ) else false end)
    or tg_op='DELETE'
    or (case when tg_op='UPDATE' then not coalesce(old.is_drop,false) else false end)
  ) then
    raise exception using errcode='42501',message='KHSX_READONLY';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists khsx_guard_ql2_order_write on public.khsx_orders;
create trigger khsx_guard_ql2_order_write before insert or update or delete on public.khsx_orders
for each row execute function private.khsx_guard_ql2_order_write();

commit;
