-- Fix: khsx_save_order_assignment_impl luôn báo lỗi "column reference order_id is ambiguous"
-- Nguyên nhân: hàm khai báo RETURNS TABLE(order_id text, ...) khiến Postgres tự tạo biến
-- OUT tên "order_id" trùng với cột order_id của bảng khsx_order_assignments. Dòng
-- "select * into v_existing from public.khsx_order_assignments where order_id=p_order_id"
-- không rõ order_id là cột bảng hay biến OUT -> luôn raise lỗi -> MỌI thao tác gán tổ qua
-- giao diện thất bại âm thầm từ trước tới giờ, dù insert/on conflict phía dưới không sao.
-- Sửa: đặt alias cho bảng, qualify rõ cột.

create or replace function private.khsx_save_order_assignment_impl(
  p_operation_id uuid,
  p_order_id text,
  p_plan_team public.khsx_unit,
  p_current_team public.khsx_unit,
  p_spinoff_order_id text,
  p_change_note text,
  p_priority boolean,
  p_client_updated_at timestamptz
)
returns table(order_id text, plan_team public.khsx_unit, current_team public.khsx_unit, spinoff_order_id text, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog'
set lock_timeout to '3s'
set statement_timeout to '8s'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.khsx_order_assignments%rowtype;
  v_updated timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.khsx_is_manager() then raise exception using errcode='42501',message='MANAGER_REQUIRED'; end if;
  if p_operation_id is null or nullif(pg_catalog.btrim(p_order_id),'') is null then
    raise exception using errcode='22023',message='INVALID_ASSIGNMENT_INPUT';
  end if;
  if p_plan_team is not null and p_plan_team not in ('To 1'::public.khsx_unit,'To 2'::public.khsx_unit,'To 3'::public.khsx_unit,'To 4'::public.khsx_unit,'To 5'::public.khsx_unit) then
    raise exception using errcode='22023',message='INVALID_PLAN_TEAM';
  end if;
  if p_current_team is not null and p_current_team not in ('To 1'::public.khsx_unit,'To 2'::public.khsx_unit,'To 3'::public.khsx_unit,'To 4'::public.khsx_unit,'To 5'::public.khsx_unit) then
    raise exception using errcode='22023',message='INVALID_CURRENT_TEAM';
  end if;
  perform 1 from public.khsx_orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  select a.* into v_existing from public.khsx_order_assignments a where a.order_id=p_order_id for update;
  if found and v_existing.updated_at is not null and p_client_updated_at is not null and v_existing.updated_at>p_client_updated_at then
    raise exception using errcode='40001',message='ASSIGNMENT_CONFLICT';
  end if;
  insert into public.khsx_order_assignments(order_id,plan_team,current_team,spinoff_order_id,change_note,priority,assigned_by,assigned_at,updated_at)
    values(p_order_id,p_plan_team,p_current_team,p_spinoff_order_id,coalesce(p_change_note,''),coalesce(p_priority,false),v_actor,now(),v_updated)
    on conflict(order_id) do update set plan_team=excluded.plan_team,current_team=excluded.current_team,
      spinoff_order_id=excluded.spinoff_order_id,change_note=excluded.change_note,priority=excluded.priority,
      assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at,updated_at=excluded.updated_at;
  return query select a.order_id,a.plan_team,a.current_team,a.spinoff_order_id,a.updated_at
    from public.khsx_order_assignments a where a.order_id=p_order_id;
end;
$function$;
