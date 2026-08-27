-- MiniApp upgrade v1: workforce credits + transactional stage writes.

create table if not exists public.khsx_workers (
  id text primary key,
  display_name text not null,
  stage public.khsx_stage not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.khsx_workers(id,display_name,stage) values
  ('loan_anh','Loan Anh','may'),
  ('thao_vy','Thảo Vy','may'),
  ('bao_cham','Bảo Chăm','may'),
  ('minh_thuan','Minh Thuận','dong_goi')
on conflict(id) do update set display_name=excluded.display_name,stage=excluded.stage,active=true,updated_at=now();

alter table public.khsx_profiles add column if not exists worker_id text references public.khsx_workers(id);
alter table public.khsx_stage_progress add column if not exists completed_by_worker_id text references public.khsx_workers(id);
alter table public.khsx_stage_operations add column if not exists completed_by_worker_id text references public.khsx_workers(id);
-- Dữ liệu lịch sử có thể đã hoàn thành nhưng nguồn cũ chưa ghi tổ. Cho phép giữ
-- sản lượng với KPI tổ rỗng thay vì đoán tổ hoặc làm phát sinh đơn rớt giả.
alter table public.khsx_stage_progress alter column kpi_team drop not null;

create index if not exists khsx_profiles_worker_idx on public.khsx_profiles(worker_id);
create index if not exists khsx_stage_progress_worker_idx on public.khsx_stage_progress(completed_by_worker_id);
create index if not exists khsx_stage_operations_worker_idx on public.khsx_stage_operations(completed_by_worker_id);

create table if not exists public.khsx_stage_credits (
  order_id text not null references public.khsx_orders(id) on delete cascade,
  work_date date not null,
  stage public.khsx_stage not null,
  worker_id text not null references public.khsx_workers(id),
  quantity integer not null check(quantity>=0),
  source text not null default 'actual',
  updated_at timestamptz not null default now(),
  primary key(order_id,work_date,stage,worker_id)
);

create index if not exists khsx_stage_credits_worker_date_idx
  on public.khsx_stage_credits(worker_id,work_date,stage);

alter table public.khsx_workers enable row level security;
alter table public.khsx_stage_credits enable row level security;
grant select on public.khsx_workers,public.khsx_stage_credits to authenticated;
revoke insert,update,delete on public.khsx_workers,public.khsx_stage_credits from anon,authenticated;

drop policy if exists khsx_workers_select on public.khsx_workers;
create policy khsx_workers_select on public.khsx_workers for select to authenticated using(true);
drop policy if exists khsx_stage_credits_select on public.khsx_stage_credits;
create policy khsx_stage_credits_select on public.khsx_stage_credits for select to authenticated using(true);

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
  if v_progress_locked and not v_is_manager then raise exception using errcode='42501',message='PROGRESS_LOCKED'; end if;
  if p_quantity<0 or p_quantity>v_plan then raise exception using errcode='22023',message='PLAN_LIMIT_EXCEEDED'; end if;

  v_credit_team := case when v_is_manager and p_kpi_team in ('To 1','To 2','To 3','To 4','To 5') then p_kpi_team else v_order_team end;
  if v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED'; end if;
  if not v_is_manager and p_stage='dan' and v_actor_unit<>v_order_team then raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN'; end if;

  if p_stage in ('may','dong_goi') then
    v_worker := case when v_is_manager then nullif(pg_catalog.btrim(p_worker_id),'') else v_profile_worker end;
    if v_worker is null or not exists(select 1 from public.khsx_workers w where w.id=v_worker and w.stage=p_stage and w.active) then
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

  -- Không tự tạo sản lượng công đoạn trước. Nếu chuỗi Dán -> May -> Đóng gói
  -- không hợp lệ thì từ chối toàn bộ giao dịch để người quản lý sửa đúng nguồn.
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

-- Quản lý chốt/mở khóa ngày trực tiếp trên Supabase. Bản cũ gọi storageSet()
-- (chỉ dành cho Apps Script), nên ở chế độ Supabase thao tác luôn báo thất bại.
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
  v_entry record;
begin
  if not private.khsx_is_manager() then
    raise exception using errcode='42501', message='MANAGER_REQUIRED';
  end if;
  if p_lock_kind not in ('plan','progress') then
    raise exception using errcode='22023', message='INVALID_LOCK_KIND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khsx-day-locks', 0));
  for v_entry in select * from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) loop
    v_date := v_entry.key::date;
    v_locked := v_entry.value::boolean;
    v_count := v_count + 1;
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
      where exists (select 1 from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) c where c.key=e.key and c.value::boolean)
      on conflict(work_date) do update set rows_json=excluded.rows_json,version=excluded.version,created_by=excluded.created_by,created_at=now();
  end if;
  return v_count;
end;
$$;

revoke all on function public.khsx_set_day_locks(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.khsx_set_day_locks(text,jsonb,jsonb) to authenticated;

-- Phân tổ mặc định của nhân viên được lưu riêng, không lẫn với unit công đoạn
-- trong khsx_profiles.
create unique index if not exists khsx_profiles_worker_unique_idx
  on public.khsx_profiles(worker_id) where worker_id is not null;

create table if not exists public.khsx_worker_team_assignments (
  worker_id text primary key references public.khsx_workers(id) on delete cascade,
  team_name public.khsx_unit not null check (team_name in (
    'To 1'::public.khsx_unit, 'To 2'::public.khsx_unit, 'To 3'::public.khsx_unit,
    'To 4'::public.khsx_unit, 'To 5'::public.khsx_unit
  )),
  assigned_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.khsx_worker_team_assignments enable row level security;
revoke all on public.khsx_worker_team_assignments from anon,authenticated;
grant select,insert,update,delete on public.khsx_worker_team_assignments to authenticated;
drop policy if exists khsx_worker_team_assignments_select on public.khsx_worker_team_assignments;
drop policy if exists khsx_worker_team_assignments_insert on public.khsx_worker_team_assignments;
drop policy if exists khsx_worker_team_assignments_update on public.khsx_worker_team_assignments;
drop policy if exists khsx_worker_team_assignments_delete on public.khsx_worker_team_assignments;
create policy khsx_worker_team_assignments_select on public.khsx_worker_team_assignments
  for select to authenticated using (true);
create policy khsx_worker_team_assignments_insert on public.khsx_worker_team_assignments
  for insert to authenticated with check ((select private.khsx_is_manager()));
create policy khsx_worker_team_assignments_update on public.khsx_worker_team_assignments
  for update to authenticated using ((select private.khsx_is_manager()))
  with check ((select private.khsx_is_manager()));
create policy khsx_worker_team_assignments_delete on public.khsx_worker_team_assignments
  for delete to authenticated using ((select private.khsx_is_manager()));

-- Khi quản lý đổi phân tổ, các thiết bị đang mở nhận ngay thay đổi thay vì
-- phải chờ lần polling kế tiếp.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'khsx_worker_team_assignments'
  ) then
    alter publication supabase_realtime add table public.khsx_worker_team_assignments;
  end if;
end $$;

-- Gán tổ hỗ trợ theo một giao dịch duy nhất. Một đơn chỉ có một dòng hỗ trợ;
-- các ngày khác nhau chỉ tạo thêm lịch gán cho cùng dòng đó, không ghi đè tổ.
alter table public.khsx_order_assignments add column if not exists updated_at timestamptz not null default now();
alter table public.khsx_daily_assignments add column if not exists updated_at timestamptz not null default now();

-- Lưu phân tổ có khóa phiên bản phía máy chủ. Gói cũ không được phép ghi đè
-- thay đổi mới hơn từ thiết bị khác, nên không còn rollback im lặng sau reload.
create or replace function private.khsx_save_order_assignment_impl(
  p_operation_id uuid,
  p_order_id text,
  p_plan_team public.khsx_unit,
  p_current_team public.khsx_unit,
  p_spinoff_order_id text,
  p_change_note text,
  p_priority boolean,
  p_client_updated_at timestamptz
)
returns table(order_id text, plan_team public.khsx_unit, current_team public.khsx_unit, spinoff_order_id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_catalog
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.khsx_order_assignments%rowtype;
  v_updated timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.khsx_is_manager() then raise exception using errcode='42501',message='MANAGER_REQUIRED'; end if;
  if p_operation_id is null or nullif(pg_catalog.btrim(p_order_id),'') is null then
    raise exception using errcode='22023',message='INVALID_ASSIGNMENT_INPUT';
  end if;
  if p_plan_team is not null and p_plan_team not in ('To 1'::public.khsx_unit,'To 2'::public.khsx_unit,'To 3'::public.khsx_unit,'To 4'::public.khsx_unit,'To 5'::public.khsx_unit) then
    raise exception using errcode='22023',message='INVALID_PLAN_TEAM';
  end if;
  if p_current_team is not null and p_current_team not in ('To 1'::public.khsx_unit,'To 2'::public.khsx_unit,'To 3'::public.khsx_unit,'To 4'::public.khsx_unit,'To 5'::public.khsx_unit) then
    raise exception using errcode='22023',message='INVALID_CURRENT_TEAM';
  end if;
  perform 1 from public.khsx_orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  select * into v_existing from public.khsx_order_assignments where order_id=p_order_id for update;
  if found and v_existing.updated_at is not null and p_client_updated_at is not null and v_existing.updated_at>p_client_updated_at then
    raise exception using errcode='40001',message='ASSIGNMENT_CONFLICT';
  end if;
  insert into public.khsx_order_assignments(order_id,plan_team,current_team,spinoff_order_id,change_note,priority,assigned_by,assigned_at,updated_at)
    values(p_order_id,p_plan_team,p_current_team,p_spinoff_order_id,coalesce(p_change_note,''),coalesce(p_priority,false),v_actor,now(),v_updated)
    on conflict(order_id) do update set plan_team=excluded.plan_team,current_team=excluded.current_team,
      spinoff_order_id=excluded.spinoff_order_id,change_note=excluded.change_note,priority=excluded.priority,
      assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at,updated_at=excluded.updated_at;
  return query select a.order_id,a.plan_team,a.current_team,a.spinoff_order_id,a.updated_at
    from public.khsx_order_assignments a where a.order_id=p_order_id;
end;
$$;
revoke all on function private.khsx_save_order_assignment_impl(uuid,text,public.khsx_unit,public.khsx_unit,text,text,boolean,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.khsx_save_order_assignment_v1(
  p_operation_id uuid,p_order_id text,p_plan_team public.khsx_unit,p_current_team public.khsx_unit,
  p_spinoff_order_id text,p_change_note text,p_priority boolean,p_client_updated_at timestamptz
)
returns table(order_id text,plan_team public.khsx_unit,current_team public.khsx_unit,spinoff_order_id text,updated_at timestamptz)
language sql security definer set search_path='' as $$
  select * from private.khsx_save_order_assignment_impl($1,$2,$3,$4,$5,$6,$7,$8);
$$;
revoke all on function public.khsx_save_order_assignment_v1(uuid,text,public.khsx_unit,public.khsx_unit,text,text,boolean,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.khsx_save_order_assignment_v1(uuid,text,public.khsx_unit,public.khsx_unit,text,text,boolean,timestamptz) to authenticated;

create or replace function private.khsx_assign_support_impl(
  p_operation_id uuid,
  p_order_id text,
  p_work_date date,
  p_support_team public.khsx_unit
)
returns table(operation_id uuid, support_order_id text, support_team public.khsx_unit, remainder integer, cleared boolean)
language plpgsql
security definer
set search_path = public, private, pg_catalog
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_order public.khsx_orders%rowtype;
  v_assignment public.khsx_order_assignments%rowtype;
  v_existing_team public.khsx_unit;
  v_support_id text;
  v_plan integer;
  v_dan integer := 0;
  v_remainder integer := 0;
  v_other_days integer := 0;
  v_has_progress boolean := false;
begin
  if v_actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.khsx_is_manager() then raise exception using errcode='42501',message='MANAGER_REQUIRED'; end if;
  if p_operation_id is null or nullif(pg_catalog.btrim(p_order_id),'') is null or p_work_date is null then
    raise exception using errcode='22023',message='INVALID_SUPPORT_INPUT';
  end if;
  if p_support_team is not null and p_support_team not in (
    'To 1'::public.khsx_unit,'To 2'::public.khsx_unit,'To 3'::public.khsx_unit,
    'To 4'::public.khsx_unit,'To 5'::public.khsx_unit
  ) then raise exception using errcode='22023',message='INVALID_SUPPORT_TEAM'; end if;

  select * into v_order from public.khsx_orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  select * into v_assignment from public.khsx_order_assignments where order_id=p_order_id for update;
  if v_assignment.current_team is null and v_assignment.plan_team is null then
    raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED';
  end if;

  select da.team_name into v_existing_team
  from public.khsx_daily_assignments da
  where da.order_id=p_order_id and da.assignment_kind='support' and da.team_name is not null
  order by da.work_date limit 1;
  if p_support_team is not null and v_existing_team is not null and v_existing_team<>p_support_team then
    raise exception using errcode='22023',message='SUPPORT_TEAM_CONFLICT';
  end if;

  if p_support_team is null then
    v_support_id := v_assignment.spinoff_order_id;
    if v_support_id is not null then
      select exists(select 1 from public.khsx_stage_progress s where s.order_id=v_support_id) into v_has_progress;
      if v_has_progress then raise exception using errcode='22023',message='SUPPORT_HAS_PROGRESS'; end if;
    end if;
    delete from public.khsx_daily_assignments
      where order_id=p_order_id and work_date=p_work_date and assignment_kind='support';
    select count(*) into v_other_days from public.khsx_daily_assignments
      where order_id=p_order_id and assignment_kind='support';
    if v_other_days=0 and v_support_id is not null then
      update public.khsx_orders set deleted_at=now(),updated_at=now() where id=v_support_id and deleted_at is null;
      update public.khsx_order_assignments set spinoff_order_id=null,updated_at=now() where order_id=p_order_id;
      v_support_id := null;
    end if;
    return query select p_operation_id,v_support_id,null::public.khsx_unit,0,true;
    return;
  end if;

  select coalesce(sum(s.quantity),0)::integer into v_dan
  from public.khsx_stage_progress s
  where s.order_id=p_order_id and s.stage='dan'::public.khsx_stage and s.work_date<=p_work_date;
  v_plan := coalesce(v_order.plan_qty,0);
  v_remainder := greatest(0,v_plan-v_dan);
  if v_remainder<=0 and v_assignment.spinoff_order_id is null then
    raise exception using errcode='22023',message='SUPPORT_NO_REMAINDER';
  end if;

  v_support_id := v_assignment.spinoff_order_id;
  if v_support_id is null then
    v_support_id := 's_' || md5(p_order_id);
    insert into public.khsx_orders(
      id,production_date,product_code,product_name,width_mm,length_mm,thickness_mm,plan_qty,note,order_group,
      source_order_id,is_manual,is_drop,is_ghost,is_warranty,is_lot,lot_label,source_payload
    ) values (
      v_support_id,v_order.production_date,v_order.product_code,v_order.product_name,v_order.width_mm,v_order.length_mm,
      v_order.thickness_mm,v_remainder,coalesce(v_order.note,'Hỗ trợ từ đơn gốc'),v_order.order_group,
      v_order.id,false,true,false,false,v_order.is_lot,v_order.lot_label,
      jsonb_build_object('source','support_split','source_order_id',v_order.id,'operation_id',p_operation_id)
    );
    insert into public.khsx_order_assignments(order_id,plan_team,current_team,assigned_by,assigned_at)
      values(v_support_id,p_support_team,p_support_team,v_actor,now())
      on conflict(order_id) do update set current_team=excluded.current_team,updated_at=now();
    update public.khsx_order_assignments set spinoff_order_id=v_support_id,updated_at=now() where order_id=p_order_id;
  else
    select exists(select 1 from public.khsx_stage_progress s where s.order_id=v_support_id) into v_has_progress;
    if not v_has_progress then
      update public.khsx_orders set plan_qty=v_remainder,deleted_at=null,updated_at=now() where id=v_support_id;
    else
      -- Đã có sản lượng hỗ trợ thì không tự đổi kế hoạch của dòng con;
      -- trả đúng số đã chốt để giao diện không tự hiện khác sau reload.
      select coalesce(plan_qty,0) into v_remainder from public.khsx_orders where id=v_support_id;
    end if;
  end if;
  -- Khôi phục liên kết phân tổ nếu dữ liệu cũ từng bị thiếu assignment.
  insert into public.khsx_order_assignments as existing(order_id,plan_team,current_team,assigned_by,assigned_at)
    values(v_support_id,p_support_team,p_support_team,v_actor,now())
    on conflict(order_id) do update set current_team=coalesce(existing.current_team,excluded.current_team),updated_at=now();
  insert into public.khsx_daily_assignments(order_id,work_date,team_name,assignment_kind,assigned_by)
    values(p_order_id,p_work_date,p_support_team,'support',v_actor)
    on conflict(order_id,work_date,assignment_kind) do update set team_name=excluded.team_name,assigned_by=excluded.assigned_by,updated_at=now();
  return query select p_operation_id,v_support_id,p_support_team,v_remainder,false;
end;
$$;
revoke all on function private.khsx_assign_support_impl(uuid,text,date,public.khsx_unit) from public,anon,authenticated,service_role;

create or replace function public.khsx_assign_support_v1(
  p_operation_id uuid,p_order_id text,p_work_date date,p_support_team public.khsx_unit
)
returns table(operation_id uuid,support_order_id text,support_team public.khsx_unit,remainder integer,cleared boolean)
language sql security definer set search_path='' as $$
  select * from private.khsx_assign_support_impl($1,$2,$3,$4);
$$;
revoke all on function public.khsx_assign_support_v1(uuid,text,date,public.khsx_unit) from public,anon,authenticated,service_role;
grant execute on function public.khsx_assign_support_v1(uuid,text,date,public.khsx_unit) to authenticated;

