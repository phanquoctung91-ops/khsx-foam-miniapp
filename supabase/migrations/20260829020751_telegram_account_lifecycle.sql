-- Vòng đời tài khoản Telegram: mọi lần duyệt/sửa/thu hồi/khôi phục đều có log.
begin;

create table if not exists public.khsx_account_audit (
  id bigint generated always as identity primary key,
  telegram_user_id bigint not null,
  auth_user_id uuid,
  action text not null check (action in ('approve','update','revoke','restore')),
  actor_user_id uuid references auth.users(id) on delete set null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists khsx_account_audit_telegram_created_idx
  on public.khsx_account_audit(telegram_user_id, created_at desc);
create index if not exists khsx_account_audit_auth_created_idx
  on public.khsx_account_audit(auth_user_id, created_at desc);

alter table public.khsx_account_audit enable row level security;
revoke all on public.khsx_account_audit from anon, authenticated;
grant select on public.khsx_account_audit to authenticated;
grant select, insert on public.khsx_account_audit to service_role;

drop policy if exists khsx_account_audit_manager_select on public.khsx_account_audit;
create policy khsx_account_audit_manager_select on public.khsx_account_audit
  for select to authenticated
  using ((select private.khsx_is_full_manager()));

commit;
