-- Release 118: lịch làm việc quý + OT có cấu trúc.
-- Chạy sau telegram_miniapp_draft.sql và miniapp_upgrade_v1.sql.

begin;

alter table public.khsx_quarter_targets
  add column if not exists work_dates date[] not null default '{}'::date[];

alter table public.khsx_orders
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by uuid references auth.users(id);

create table if not exists public.khsx_overtime_records (
  work_date date not null,
  team_name public.khsx_unit not null,
  stage public.khsx_stage not null,
  worker_id text not null,
  overtime_hours smallint not null check (overtime_hours in (2,3)),
  confirmed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (work_date,team_name,stage,worker_id)
);

alter table public.khsx_overtime_records enable row level security;
revoke all on public.khsx_overtime_records from public,anon;
grant select,insert,update,delete on public.khsx_overtime_records to authenticated;

drop policy if exists khsx_overtime_authenticated_read on public.khsx_overtime_records;
create policy khsx_overtime_authenticated_read on public.khsx_overtime_records
  for select to authenticated using (true);

drop policy if exists khsx_overtime_manager_insert on public.khsx_overtime_records;
create policy khsx_overtime_manager_insert on public.khsx_overtime_records
  for insert to authenticated
  with check ((select private.khsx_is_manager()) and confirmed_by=(select auth.uid()));

drop policy if exists khsx_overtime_manager_update on public.khsx_overtime_records;
create policy khsx_overtime_manager_update on public.khsx_overtime_records
  for update to authenticated using ((select private.khsx_is_manager()))
  with check ((select private.khsx_is_manager()) and confirmed_by=(select auth.uid()));

drop policy if exists khsx_overtime_manager_delete on public.khsx_overtime_records;
create policy khsx_overtime_manager_delete on public.khsx_overtime_records
  for delete to authenticated using ((select private.khsx_is_manager()));

commit;
