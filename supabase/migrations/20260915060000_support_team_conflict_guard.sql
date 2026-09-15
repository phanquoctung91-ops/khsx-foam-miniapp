-- Gan/bo to ho tro (kind='support') truoc gio upsert/delete thang qua PostgREST,
-- khong khoa dong, khong kiem tra xung dot - cung loai loi vua sua cho Huy/Khoi
-- phuc don (khsx_cancel_restore_order_v1). Dua ve RPC rieng, khoa dong theo
-- (order_id,work_date) + so updated_at CUA CHINH khsx_daily_assignments (bang
-- nay da co san cot updated_at rieng, dung dung cot do lam moc phien ban - khong
-- dung updated_at cua khsx_orders de tranh dam vao cac RPC khac dang theo doi
-- moc phien ban rieng cua don).
create or replace function public.khsx_set_support_team_v1(
  p_order_id text,
  p_work_date date,
  p_team public.khsx_unit default null,
  p_client_updated_at timestamptz default null
)
returns table(out_order_id text, out_work_date date, out_team_name public.khsx_unit)
language plpgsql
security definer
set search_path = 'public','private','pg_catalog'
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.khsx_daily_assignments%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  if p_order_id is null or p_work_date is null then
    raise exception using errcode='22023', message='INVALID_INPUT';
  end if;
  if not (private.khsx_is_full_manager() or private.khsx_has_permission('assign_support', v_actor)) then
    raise exception using errcode='42501', message='ASSIGN_SUPPORT_FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id||'|'||p_work_date::text||'|support',3));
  if not exists(select 1 from public.khsx_orders o where o.id=p_order_id and o.deleted_at is null) then
    raise exception using errcode='22023', message='ORDER_NOT_FOUND';
  end if;
  select * into v_existing from public.khsx_daily_assignments a
    where a.order_id=p_order_id and a.work_date=p_work_date and a.assignment_kind='support' for update;
  if found and v_existing.updated_at is not null and p_client_updated_at is not null
     and v_existing.updated_at > p_client_updated_at then
    raise exception using errcode='PT409', message='SUPPORT_TEAM_CONFLICT';
  end if;
  if p_team is not null then
    insert into public.khsx_daily_assignments(order_id,work_date,team_name,assignment_kind,assigned_by,updated_at)
      values(p_order_id,p_work_date,p_team,'support',v_actor,now())
    on conflict(order_id,work_date,assignment_kind) do update
      set team_name=excluded.team_name, assigned_by=excluded.assigned_by, updated_at=now();
  else
    delete from public.khsx_daily_assignments
      where order_id=p_order_id and work_date=p_work_date and assignment_kind='support';
  end if;
  return query select p_order_id, p_work_date, p_team;
end;
$$;
revoke all on function public.khsx_set_support_team_v1(text,date,public.khsx_unit,timestamptz) from public,anon;
grant execute on function public.khsx_set_support_team_v1(text,date,public.khsx_unit,timestamptz) to authenticated;

notify pgrst,'reload schema';
