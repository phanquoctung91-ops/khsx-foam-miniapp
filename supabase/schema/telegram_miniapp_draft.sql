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

grant select, insert, update, delete on public.khsx_telegram_links to authenticated;
grant select, delete on public.khsx_telegram_access_requests to authenticated;
grant select on public.khsx_stage_operations to authenticated;

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

create policy khsx_telegram_requests_select on public.khsx_telegram_access_requests
  for select to authenticated using ((select private.khsx_is_manager()));
create policy khsx_telegram_requests_delete on public.khsx_telegram_access_requests
  for delete to authenticated using ((select private.khsx_is_manager()));

create policy khsx_stage_operations_select on public.khsx_stage_operations
  for select to authenticated
  using (actor_user_id = (select auth.uid()) or (select private.khsx_is_manager()));
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing integer;
  v_applied integer;
  v_actor uuid := (select auth.uid());
  v_actor_unit public.khsx_unit;
  v_is_manager boolean;
begin
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

  if p_quantity < 0 then
    raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
  end if;

  if not (select private.khsx_can_edit_stage(p_stage)) then
    raise exception using errcode = '42501', message = 'STAGE_FORBIDDEN';
  end if;

  -- Tuần tự hóa cả lần gửi lại cùng operation_id và các thiết bị cùng sửa một ô.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_order_id || '|' || p_work_date::text || '|' || p_stage::text,
      1
    )
  );

  select o.applied_quantity into v_existing
  from public.khsx_stage_operations o
  where o.operation_id = p_operation_id;

  if found then
    return query select p_operation_id, v_existing, true;
    return;
  end if;

  select s.quantity into v_existing
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
    -- Tổ tính KPI của nhân viên luôn lấy từ hồ sơ server, không tin dữ liệu client.
    if v_actor_unit is null then
      raise exception using errcode = '42501', message = 'UNIT_REQUIRED';
    end if;
    p_kpi_team := v_actor_unit;
  end if;

  insert into public.khsx_stage_operations(
    operation_id, order_id, work_date, stage, requested_quantity,
    applied_quantity, kpi_team, actor_user_id, device_id
  ) values (
    p_operation_id, p_order_id, p_work_date, p_stage, p_quantity,
    v_applied, p_kpi_team, v_actor, left(coalesce(p_device_id, ''), 160)
  );

  insert into public.khsx_stage_progress(
    order_id, work_date, stage, quantity, kpi_team, entered_by
  ) values (
    p_order_id, p_work_date, p_stage, v_applied, p_kpi_team, v_actor
  )
  on conflict (order_id, work_date, stage) do update
  set quantity = excluded.quantity,
      kpi_team = excluded.kpi_team,
      entered_by = excluded.entered_by,
      updated_at = now();

  return query select p_operation_id, v_applied, false;
end;
$$;

revoke all on function public.khsx_apply_stage_progress(
  uuid, text, date, public.khsx_stage, integer, public.khsx_unit, text
) from public, anon;
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
