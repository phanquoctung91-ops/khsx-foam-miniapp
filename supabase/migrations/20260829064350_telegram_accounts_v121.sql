-- v121: một nguồn tài khoản Telegram duy nhất nằm trong khsx_profiles.
-- Bảng đăng ký chỉ giữ Telegram ID đang chờ; tên/vai/tổ do Quản lý nhập khi duyệt.
begin;

alter table public.khsx_profiles
  add column if not exists telegram_user_id bigint,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists revoked_at timestamptz;

create unique index if not exists khsx_profiles_telegram_user_id_unique_idx
  on public.khsx_profiles(telegram_user_id)
  where telegram_user_id is not null;
create index if not exists khsx_profiles_approved_by_idx
  on public.khsx_profiles(approved_by)
  where approved_by is not null;
create index if not exists khsx_profiles_revoked_by_idx
  on public.khsx_profiles(revoked_by)
  where revoked_by is not null;

-- Chỉ chuyển liên kết đang tồn tại sang profile. Không chuyển request thử nghiệm cũ.
-- Tài khoản Quản lý full vì vậy giữ nguyên UUID, vai, quyền và Telegram ID.
update public.khsx_profiles p
set telegram_user_id = l.telegram_user_id,
    approved_by = coalesce(p.approved_by, l.linked_by),
    approved_at = coalesce(p.approved_at, l.linked_at),
    revoked_at = case when l.active then null else coalesce(p.revoked_at, l.updated_at) end,
    updated_at = greatest(p.updated_at, l.updated_at)
from public.khsx_telegram_links l
where l.auth_user_id = p.user_id
  and p.telegram_user_id is null;

create table if not exists public.khsx_telegram_registrations (
  telegram_user_id bigint primary key,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.khsx_telegram_registrations enable row level security;
revoke all on public.khsx_telegram_registrations from anon, authenticated;
grant select on public.khsx_telegram_registrations to authenticated;
grant select, insert, update, delete on public.khsx_telegram_registrations to service_role;

drop policy if exists khsx_telegram_registrations_manager_select
  on public.khsx_telegram_registrations;
create policy khsx_telegram_registrations_manager_select
  on public.khsx_telegram_registrations
  for select to authenticated
  using ((select private.khsx_is_manager()));

commit;
