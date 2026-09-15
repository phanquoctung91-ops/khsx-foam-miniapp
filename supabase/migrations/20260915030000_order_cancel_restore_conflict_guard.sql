-- Huy/Khoi phuc don truoc gio ghi truc tiep tu client (PostgREST update), khong
-- co khoa dong bo hay kiem tra xung dot - 2 nguoi bam Huy va Khoi phuc dung 1
-- don cung luc thi ai gui sau cung thang, khong bao xung dot (khac voi gan
-- to/uu tien da co kiem tra qua khsx_save_order_assignment_impl). Dua ve chung
-- 1 RPC, khoa dong (for update) + kiem tra updated_at nhu duong gan to da lam,
-- dong thoi kiem tra dung quyen order_cancel/order_restore (RLS goc chi doi
-- hoi la_manager, long hon quy uoc phan quyen dang dung).
create or replace function public.khsx_cancel_restore_order_v1(
  p_order_id text,
  p_action text,
  p_cancel_reason text default null,
  p_client_updated_at timestamptz default null
)
returns table(order_id text, deleted_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = 'public','private','pg_catalog'
set lock_timeout = '3s'
set statement_timeout = '8s'
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.khsx_orders%rowtype;
  v_needed_key text;
begin
  if v_actor is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  if p_action not in ('cancel','restore') then raise exception using errcode='22023', message='INVALID_ACTION'; end if;
  if p_action='cancel' and nullif(btrim(coalesce(p_cancel_reason,'')),'') is null then
    raise exception using errcode='22023', message='CANCEL_REASON_REQUIRED';
  end if;
  v_needed_key := case p_action when 'cancel' then 'order_cancel' else 'order_restore' end;
  if not (private.khsx_is_full_manager() or private.khsx_has_permission(v_needed_key, v_actor)) then
    raise exception using errcode='42501', message=upper(v_needed_key)||'_FORBIDDEN';
  end if;
  select * into v_order from public.khsx_orders o where o.id=p_order_id for update;
  if not found then raise exception using errcode='22023', message='ORDER_NOT_FOUND'; end if;
  if v_order.updated_at is not null and p_client_updated_at is not null and v_order.updated_at > p_client_updated_at then
    raise exception using errcode='PT409', message='ORDER_CANCEL_CONFLICT';
  end if;
  if p_action='cancel' then
    update public.khsx_orders set deleted_at=now(), cancelled_by=v_actor,
      cancel_reason=p_cancel_reason, updated_at=now() where id=p_order_id;
  else
    update public.khsx_orders set deleted_at=null, cancelled_by=null,
      cancel_reason=null, updated_at=now() where id=p_order_id;
  end if;
  return query select o.id, o.deleted_at, o.updated_at from public.khsx_orders o where o.id=p_order_id;
end;
$$;
revoke all on function public.khsx_cancel_restore_order_v1(text,text,text,timestamptz) from public,anon;
grant execute on function public.khsx_cancel_restore_order_v1(text,text,text,timestamptz) to authenticated;

notify pgrst,'reload schema';
