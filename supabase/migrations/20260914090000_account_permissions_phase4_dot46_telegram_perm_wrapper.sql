-- Phan quyen tai khoan - Dot 4.6: vo boc cong khai cho private.khsx_has_permission
-- de Edge Function khsx-telegram-account (chay bang service_role, khong qua
-- PostgREST tu JWT nguoi dung) co the goi duoc - private.khsx_has_permission
-- da bi revoke khoi moi role tru khi goi tu ben trong 1 ham SECURITY DEFINER
-- khac. Chi cap quyen goi cho service_role, khong mo cho authenticated/anon.

create or replace function public.khsx_has_permission_public(p_key text, p_user_id uuid)
returns boolean
language sql security definer set search_path = '' as $$
  select private.khsx_has_permission(p_key, p_user_id);
$$;
revoke all on function public.khsx_has_permission_public(text,uuid) from public,anon,authenticated;
grant execute on function public.khsx_has_permission_public(text,uuid) to service_role;

notify pgrst,'reload schema';
