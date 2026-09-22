-- Chỉ xóa nguồn đăng ký/link cũ sau khi v121 đăng ký và đăng nhập thành công.
begin;
do $$
begin
  if to_regclass('public.khsx_telegram_registrations') is null then
    raise exception 'V121_REGISTRATION_TABLE_MISSING';
  end if;

  if to_regclass('public.khsx_telegram_links') is not null and exists (
    select 1
    from public.khsx_telegram_links l
    left join public.khsx_profiles p on p.user_id = l.auth_user_id
    where p.user_id is null
       or p.telegram_user_id is distinct from l.telegram_user_id
  ) then
    raise exception 'LEGACY_TELEGRAM_LINK_NOT_MIGRATED';
  end if;
end
$$;
drop table if exists public.khsx_telegram_access_requests;
drop table if exists public.khsx_telegram_links;
commit;
