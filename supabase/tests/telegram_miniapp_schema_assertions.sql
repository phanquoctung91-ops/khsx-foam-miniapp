-- CHỈ KIỂM TRA SAU KHI DUYỆT ÁP SCHEMA. Không ghi dữ liệu vận hành.
-- Mọi lỗi đều dừng bằng exception để không có trạng thái "tưởng là ổn".

do $$
declare
  v_ok boolean;
begin
  select bool_and(c.relrowsecurity)
  into v_ok
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'khsx_telegram_links',
      'khsx_telegram_access_requests',
      'khsx_stage_operations',
      'khsx_stage_progress'
    );
  if coalesce(v_ok, false) is not true then
    raise exception 'ASSERT_RLS_NOT_ENABLED';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.khsx_stage_progress', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.khsx_stage_progress', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.khsx_stage_progress', 'DELETE') then
    raise exception 'ASSERT_DIRECT_STAGE_WRITE_STILL_OPEN';
  end if;
  if not pg_catalog.has_table_privilege('authenticated', 'public.khsx_stage_progress', 'SELECT') then
    raise exception 'ASSERT_STAGE_READ_MISSING';
  end if;

  select p.prosecdef
  into v_ok
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'khsx_apply_stage_progress_impl';
  if coalesce(v_ok, false) is not true then
    raise exception 'ASSERT_IMPL_NOT_SECURITY_DEFINER';
  end if;

  select not p.prosecdef
  into v_ok
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'khsx_apply_stage_progress';
  if coalesce(v_ok, false) is not true then
    raise exception 'ASSERT_WRAPPER_NOT_SECURITY_INVOKER';
  end if;

  if pg_catalog.has_function_privilege(
      'anon',
      'public.khsx_apply_stage_progress(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text)',
      'EXECUTE'
    ) then
    raise exception 'ASSERT_ANON_RPC_EXECUTE_OPEN';
  end if;
  if not pg_catalog.has_function_privilege(
      'authenticated',
      'public.khsx_apply_stage_progress(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text)',
      'EXECUTE'
    ) then
    raise exception 'ASSERT_AUTH_RPC_EXECUTE_MISSING';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'khsx_stage_progress'
  ) then
    raise exception 'ASSERT_STAGE_REALTIME_MISSING';
  end if;
end;
$$;

select 'telegram_miniapp_schema_assertions_ok' as result;
