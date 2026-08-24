-- BẢN NHÁP LOCAL: chưa áp dụng lên Supabase.
-- Bổ sung xác thực Telegram và ghi tiến độ idempotent cho schema KHSX hiện có.

create table if not exists public.khsx_telegram_links (
  telegram_user_id bigint primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  telegram_username text,
  active boolean not null default true,
  linked_by uuid references auth.users(id),
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.khsx_telegram_access_requests (
  telegram_user_id bigint primary key,
  telegram_username text,
  telegram_display_name text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.khsx_stage_operations (
  operation_id uuid primary key,
  order_id text not null references public.khsx_orders(id),
  work_date date not null,
  stage public.khsx_stage not null,
  requested_quantity integer not null check (requested_quantity >= 0),
  applied_quantity integer not null check (applied_quantity >= 0),
  kpi_team public.khsx_unit not null,
  actor_user_id uuid not null references auth.users(id),
  device_id text not null default '',
  received_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'khsx_stage_operations_kpi_team_check'
      and conrelid = 'public.khsx_stage_operations'::pg_catalog.regclass
  ) then
    alter table public.khsx_stage_operations
      add constraint khsx_stage_operations_kpi_team_check check (
        kpi_team in (
          'To 1'::public.khsx_unit, 'To 2'::public.khsx_unit, 'To 3'::public.khsx_unit,
          'To 4'::public.khsx_unit, 'To 5'::public.khsx_unit
        )
      );
  end if;
end;
$$;

create index if not exists khsx_stage_operations_order_date_idx
  on public.khsx_stage_operations(order_id, work_date, stage, received_at desc);
create index if not exists khsx_stage_operations_actor_idx
  on public.khsx_stage_operations(actor_user_id, received_at desc);
create index if not exists khsx_telegram_links_linked_by_idx
  on public.khsx_telegram_links(linked_by);

alter table public.khsx_telegram_links enable row level security;
alter table public.khsx_telegram_access_requests enable row level security;
alter table public.khsx_stage_operations enable row level security;

revoke all on public.khsx_telegram_links from anon, authenticated;
revoke all on public.khsx_telegram_access_requests from anon, authenticated;
revoke all on public.khsx_stage_operations from anon, authenticated;

grant select on public.khsx_telegram_links to service_role;
grant select, insert, update on public.khsx_telegram_access_requests to service_role;

grant select, insert, update, delete on public.khsx_telegram_links to authenticated;
grant select, delete on public.khsx_telegram_access_requests to authenticated;
grant select on public.khsx_stage_operations to authenticated;
-- Tiến độ chỉ được ghi qua RPC idempotent. Chặn client đi vòng bằng REST trực tiếp.
revoke insert, update, delete on public.khsx_stage_progress from authenticated;
grant select on public.khsx_stage_progress to authenticated;

drop policy if exists khsx_telegram_links_select on public.khsx_telegram_links;
drop policy if exists khsx_telegram_links_insert on public.khsx_telegram_links;
drop policy if exists khsx_telegram_links_update on public.khsx_telegram_links;
drop policy if exists khsx_telegram_links_delete on public.khsx_telegram_links;
create policy khsx_telegram_links_select on public.khsx_telegram_links
  for select to authenticated using ((select private.khsx_is_manager()));
create policy khsx_telegram_links_insert on public.khsx_telegram_links
  for insert to authenticated with check ((select private.khsx_is_manager()));
create policy khsx_telegram_links_update on public.khsx_telegram_links
  for update to authenticated
  using ((select private.khsx_is_manager()))
  with check ((select private.khsx_is_manager()));
create policy khsx_telegram_links_delete on public.khsx_telegram_links
  for delete to authenticated using ((select private.khsx_is_manager()));

drop policy if exists khsx_telegram_requests_select on public.khsx_telegram_access_requests;
drop policy if exists khsx_telegram_requests_delete on public.khsx_telegram_access_requests;
create policy khsx_telegram_requests_select on public.khsx_telegram_access_requests
  for select to authenticated using ((select private.khsx_is_manager()));
create policy khsx_telegram_requests_delete on public.khsx_telegram_access_requests
  for delete to authenticated using ((select private.khsx_is_manager()));

drop policy if exists khsx_stage_operations_select on public.khsx_stage_operations;
create policy khsx_stage_operations_select on public.khsx_stage_operations
  for select to authenticated
  using (actor_user_id = (select auth.uid()) or (select private.khsx_is_manager()));
create or replace function private.khsx_apply_stage_progress_impl(
  p_operation_id uuid,
  p_order_id text,
  p_work_date date,
  p_stage public.khsx_stage,
  p_quantity integer,
  p_kpi_team public.khsx_unit,
  p_device_id text default ''
)
returns table(operation_id uuid, applied_quantity integer, duplicate boolean)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_existing_operation public.khsx_stage_operations%rowtype;
  v_existing integer;
  v_existing_team public.khsx_unit;
  v_applied integer;
  v_actor uuid := (select auth.uid());
  v_actor_unit public.khsx_unit;
  v_is_manager boolean;
  v_order_team public.khsx_unit;
  v_progress_locked boolean := false;
  v_total_dan integer := 0;
  v_total_may integer := 0;
  v_total_dong_goi integer := 0;
begin
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'INVALID_OPERATION_ID';
  end if;
  if nullif(pg_catalog.btrim(p_order_id), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ID';
  end if;
  if p_work_date is null or p_stage is null or p_quantity is null then
    raise exception using errcode = '22023', message = 'MISSING_STAGE_INPUT';
  end if;
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select p.unit_name, p.role in ('quan_ly', 'quan_ly_2')
  into v_actor_unit, v_is_manager
  from public.khsx_profiles p
  where p.user_id = v_actor and p.active;

  if not found then
    raise exception using errcode = '42501', message = 'PROFILE_INACTIVE';
  end if;

  if p_quantity < 0 or p_quantity > 1000000 then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
  end if;

  if not (select private.khsx_can_edit_stage(p_stage)) then
    raise exception using errcode = '42501', message = 'STAGE_FORBIDDEN';
  end if;

  -- Khóa operation trước: cùng operation_id chỉ được xử lý đúng một lần.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );

  select o.* into v_existing_operation
  from public.khsx_stage_operations o
  where o.operation_id = p_operation_id;

  if found then
    if v_existing_operation.order_id <> p_order_id
      or v_existing_operation.work_date <> p_work_date
      or v_existing_operation.stage <> p_stage
      or v_existing_operation.requested_quantity <> p_quantity
      or v_existing_operation.actor_user_id <> v_actor then
      raise exception using errcode = '22023', message = 'OPERATION_ID_REUSED';
    end if;
    return query select p_operation_id, v_existing_operation.applied_quantity, true;
    return;
  end if;

  -- Mọi công đoạn của cùng một đơn đi qua một khóa để kiểm tra Dán → May → Đóng gói
  -- không bị hai thiết bị ghi chéo làm vượt công đoạn trước.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_order_id, 1)
  );

  select coalesce(sup.team_name, own.team_name, a.current_team, a.plan_team),
         coalesce(l.progress_locked, false)
  into v_order_team, v_progress_locked
  from public.khsx_orders o
  left join public.khsx_order_assignments a on a.order_id = o.id
  left join public.khsx_daily_assignments sup
    on sup.order_id = o.id and sup.work_date = p_work_date and sup.assignment_kind = 'support'
  left join public.khsx_daily_assignments own
    on own.order_id = o.id and own.work_date = p_work_date and own.assignment_kind = 'owner'
  left join public.khsx_day_locks l on l.work_date = p_work_date
  where o.id = p_order_id and o.deleted_at is null;

  if not found then
    raise exception using errcode = '22023', message = 'ORDER_NOT_FOUND';
  end if;
  if v_progress_locked and not v_is_manager then
    raise exception using errcode = '42501', message = 'PROGRESS_LOCKED';
  end if;
  if v_order_team is null or v_order_team not in (
    'To 1'::public.khsx_unit, 'To 2'::public.khsx_unit, 'To 3'::public.khsx_unit,
    'To 4'::public.khsx_unit, 'To 5'::public.khsx_unit
  ) then
    raise exception using errcode = '22023', message = 'ORDER_TEAM_REQUIRED';
  end if;
  -- Tổ Dán chỉ được nhập đơn đang thuộc chính tổ đó. May/Đóng gói được xử lý
  -- các đơn của cả 5 tổ nhưng KPI tổ vẫn lấy từ phân công server, không tin client.
  if not v_is_manager and p_stage = 'dan'::public.khsx_stage and v_actor_unit <> v_order_team then
    raise exception using errcode = '42501', message = 'ORDER_TEAM_FORBIDDEN';
  end if;

  select s.quantity, s.kpi_team into v_existing, v_existing_team
  from public.khsx_stage_progress s
  where s.order_id = p_order_id
    and s.work_date = p_work_date
    and s.stage = p_stage
  for update;

  -- Nhân viên không được để gói tin offline cũ kéo số lượng lùi xuống.
  if v_is_manager then
    v_applied := p_quantity;
  else
    v_applied := greatest(coalesce(v_existing, 0), p_quantity);
  end if;

  select
    coalesce(sum(s.quantity) filter (where s.stage = 'dan'::public.khsx_stage), 0),
    coalesce(sum(s.quantity) filter (where s.stage = 'may'::public.khsx_stage), 0),
    coalesce(sum(s.quantity) filter (where s.stage = 'dong_goi'::public.khsx_stage), 0)
  into v_total_dan, v_total_may, v_total_dong_goi
  from public.khsx_stage_progress s
  where s.order_id = p_order_id;

  if p_stage = 'dan'::public.khsx_stage then
    v_total_dan := v_total_dan - coalesce(v_existing, 0) + v_applied;
  elsif p_stage = 'may'::public.khsx_stage then
    v_total_may := v_total_may - coalesce(v_existing, 0) + v_applied;
  else
    v_total_dong_goi := v_total_dong_goi - coalesce(v_existing, 0) + v_applied;
  end if;

  if v_total_may > v_total_dan then
    raise exception using errcode = '22023', message = 'MAY_EXCEEDS_DAN';
  end if;
  if v_total_dong_goi > v_total_may then
    raise exception using errcode = '22023', message = 'PACK_EXCEEDS_MAY';
  end if;

  insert into public.khsx_stage_operations(
    operation_id, order_id, work_date, stage, requested_quantity,
    applied_quantity, kpi_team, actor_user_id, device_id
  ) values (
    p_operation_id, p_order_id, p_work_date, p_stage, p_quantity,
    v_applied, v_order_team, v_actor, left(coalesce(p_device_id, ''), 160)
  );

  -- Gói offline cũ/equal vẫn được xác nhận trong operations nhưng không được đổi
  -- entered_by của người đã thực sự nâng số gần nhất.
  if v_existing is distinct from v_applied or v_existing_team is distinct from v_order_team then
    insert into public.khsx_stage_progress(
      order_id, work_date, stage, quantity, kpi_team, entered_by
    ) values (
      p_order_id, p_work_date, p_stage, v_applied, v_order_team, v_actor
    )
    on conflict (order_id, work_date, stage) do update
    set quantity = excluded.quantity,
        kpi_team = excluded.kpi_team,
        entered_by = excluded.entered_by,
        updated_at = now();
  end if;

  return query select p_operation_id, v_applied, false;
end;
$$;

create or replace function public.khsx_apply_stage_progress(
  p_operation_id uuid,
  p_order_id text,
  p_work_date date,
  p_stage public.khsx_stage,
  p_quantity integer,
  p_kpi_team public.khsx_unit,
  p_device_id text default ''
)
returns table(operation_id uuid, applied_quantity integer, duplicate boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from private.khsx_apply_stage_progress_impl(
    p_operation_id, p_order_id, p_work_date, p_stage,
    p_quantity, p_kpi_team, p_device_id
  );
$$;

revoke all on function private.khsx_apply_stage_progress_impl(
  uuid, text, date, public.khsx_stage, integer, public.khsx_unit, text
) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.khsx_apply_stage_progress_impl(
  uuid, text, date, public.khsx_stage, integer, public.khsx_unit, text
) to authenticated;
revoke all on function public.khsx_apply_stage_progress(
  uuid, text, date, public.khsx_stage, integer, public.khsx_unit, text
) from public, anon, authenticated, service_role;
grant execute on function public.khsx_apply_stage_progress(
  uuid, text, date, public.khsx_stage, integer, public.khsx_unit, text
) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'khsx_stage_progress'
  ) then
    alter publication supabase_realtime add table public.khsx_stage_progress;
  end if;
end;
$$;
