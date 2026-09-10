-- Hotfix: do not use retryable SQLSTATE 40001 for business conflicts.
-- Existing clients already stop on the ASSIGNMENT_CONFLICT message (now HTTP 409).
create table private.khsx_assignment_receipts (
  operation_id uuid primary key,actor_user_id uuid not null,request jsonb not null,
  result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.khsx_assignment_receipts enable row level security;
revoke all on private.khsx_assignment_receipts from public,anon,authenticated,service_role;
create table private.khsx_hotfix_control (
  id boolean primary key default true check(id),
  mode text not null check(mode in ('normal','reduced','read_only')),
  updated_at timestamptz not null default clock_timestamp(),updated_by uuid
);
insert into private.khsx_hotfix_control(id,mode) values(true,'normal');
alter table private.khsx_hotfix_control enable row level security;
revoke all on private.khsx_hotfix_control from public,anon,authenticated,service_role;
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
#variable_conflict use_column
declare
  v_actor uuid := (select auth.uid());
  v_existing public.khsx_order_assignments%rowtype;
  v_updated timestamptz := clock_timestamp();
  v_receipt private.khsx_assignment_receipts%rowtype;
  v_request jsonb := jsonb_build_array(p_order_id,p_plan_team,p_current_team,p_spinoff_order_id,coalesce(p_change_note,''),coalesce(p_priority,false),p_client_updated_at);
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
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into v_receipt from private.khsx_assignment_receipts r where r.operation_id=p_operation_id;
  if found then
    if v_receipt.actor_user_id<>v_actor or v_receipt.request<>v_request then
      raise sqlstate 'PT409' using message='OPERATION_PAYLOAD_CONFLICT';
    end if;
    return query select x.order_id,x.plan_team,x.current_team,x.spinoff_order_id,x.updated_at
      from jsonb_to_record(v_receipt.result) as x(order_id text,plan_team public.khsx_unit,current_team public.khsx_unit,spinoff_order_id text,updated_at timestamptz);
    return;
  end if;
  perform 1 from public.khsx_orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  select a.* into v_existing from public.khsx_order_assignments a where a.order_id=p_order_id for update;
  if found and v_existing.updated_at is not null and p_client_updated_at is not null and v_existing.updated_at>p_client_updated_at then
    raise exception using errcode='PT409',message='ASSIGNMENT_CONFLICT';
  end if;
  insert into public.khsx_order_assignments(order_id,plan_team,current_team,spinoff_order_id,change_note,priority,assigned_by,assigned_at,updated_at)
    values(p_order_id,p_plan_team,p_current_team,p_spinoff_order_id,coalesce(p_change_note,''),coalesce(p_priority,false),v_actor,now(),v_updated)
    on conflict(order_id) do update set plan_team=excluded.plan_team,current_team=excluded.current_team,
      spinoff_order_id=excluded.spinoff_order_id,change_note=excluded.change_note,priority=excluded.priority,
      assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at,updated_at=excluded.updated_at;
  insert into private.khsx_assignment_receipts(operation_id,actor_user_id,request,result)
    select p_operation_id,v_actor,v_request,jsonb_build_object('order_id',a.order_id,'plan_team',a.plan_team,'current_team',a.current_team,'spinoff_order_id',a.spinoff_order_id,'updated_at',a.updated_at)
    from public.khsx_order_assignments a where a.order_id=p_order_id;
  return query select a.order_id,a.plan_team,a.current_team,a.spinoff_order_id,a.updated_at
    from public.khsx_order_assignments a where a.order_id=p_order_id;
end;
$function$;

-- v2 returns a business outcome. v1 remains compatible and never fabricates success.
create or replace function public.khsx_save_order_assignment_v2(
 p_operation_id uuid,p_order_id text,p_plan_team public.khsx_unit,p_current_team public.khsx_unit,
 p_spinoff_order_id text,p_change_note text,p_priority boolean,p_client_updated_at timestamptz,
 p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' set statement_timeout='8s' as $$
declare r record; v_existing timestamptz; v_duplicate boolean;
begin
 if auth.uid() is null then raise sqlstate '42501' using message='AUTH_REQUIRED'; end if;
 if not private.khsx_is_manager() then raise sqlstate '42501' using message='MANAGER_REQUIRED'; end if;
 if p_operation_id is null then raise sqlstate '22023' using message='INVALID_ASSIGNMENT_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 select exists(select 1 from private.khsx_assignment_receipts where operation_id=p_operation_id) into v_duplicate;
 if not v_duplicate then
   perform 1 from public.khsx_orders where id=p_order_id and deleted_at is null for update;
   select updated_at into v_existing from public.khsx_order_assignments where order_id=p_order_id for update;
   if v_existing is distinct from p_expected_updated_at then
     return jsonb_build_object('status','conflict','code','ASSIGNMENT_CONFLICT','order_id',p_order_id);
   end if;
 end if;
 select * into r from private.khsx_save_order_assignment_impl(p_operation_id,p_order_id,p_plan_team,p_current_team,p_spinoff_order_id,p_change_note,p_priority,p_client_updated_at);
 return to_jsonb(r)||jsonb_build_object('status',case when v_duplicate then 'duplicate' else 'applied' end,'operation_id',p_operation_id);
exception when sqlstate 'PT409' then
 return jsonb_build_object('status','conflict','code',sqlerrm,'order_id',p_order_id);
end $$;
revoke all on function public.khsx_save_order_assignment_v2(uuid,text,public.khsx_unit,public.khsx_unit,text,text,boolean,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.khsx_save_order_assignment_v2(uuid,text,public.khsx_unit,public.khsx_unit,text,text,boolean,timestamptz,timestamptz) to authenticated;

create function public.khsx_hotfix_get_mode() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode',mode,'updated_at',updated_at) from private.khsx_hotfix_control where id
$$;
revoke all on function public.khsx_hotfix_get_mode() from public;
grant execute on function public.khsx_hotfix_get_mode() to anon,authenticated;
create function public.khsx_hotfix_set_mode(p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.khsx_profiles where user_id=auth.uid() and active and role::text='quan_ly') then
   raise sqlstate '42501' using message='FULL_MANAGER_REQUIRED';
 end if;
 if p_mode not in ('normal','reduced','read_only') or p_mode is null then raise sqlstate '22023' using message='INVALID_MODE'; end if;
 update private.khsx_hotfix_control set mode=p_mode,updated_at=clock_timestamp(),updated_by=auth.uid() where id;
 return public.khsx_hotfix_get_mode();
end $$;
revoke all on function public.khsx_hotfix_set_mode(text) from public,anon,service_role;
grant execute on function public.khsx_hotfix_set_mode(text) to authenticated;
create function private.khsx_hotfix_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select mode from private.khsx_hotfix_control where id)='read_only' then
   raise sqlstate 'PT503' using message='SYSTEM_READ_ONLY';
 end if;
 return null;
end $$;
revoke all on function private.khsx_hotfix_write_guard() from public,anon,authenticated,service_role;
-- Statement triggers reject all write routes, including old clients and security-definer RPCs.
do $$declare t text; begin
 foreach t in array array['khsx_orders','khsx_order_assignments','khsx_daily_assignments','khsx_stage_progress','khsx_stage_operations','khsx_stage_credits','khsx_day_locks','khsx_plan_snapshots','khsx_quarter_targets','khsx_overtime_records'] loop
   if to_regclass('public.'||t) is not null then
     execute format('create trigger khsx_hotfix_read_only before insert or update or delete on public.%I for each statement execute function private.khsx_hotfix_write_guard()',t);
   end if;
 end loop;
end $$;
notify pgrst,'reload schema';
