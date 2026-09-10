-- Additive timing observations. Existing production/assignment RPCs stay intact.
create table private.khsx_capacity_events (
  id bigint generated always as identity primary key,
  kind text not null check(kind in ('baseline','progress','assignment','support','order')),
  order_id text not null,
  work_date date,
  operation_id uuid,
  occurred_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  quality text not null default 'server_observation',
  payload jsonb not null
);
alter table private.khsx_capacity_events enable row level security;
revoke all on private.khsx_capacity_events from public,anon,authenticated,service_role;
create index khsx_capacity_events_order_idx on private.khsx_capacity_events(order_id,id);
create index khsx_capacity_events_baseline_idx on private.khsx_capacity_events(recorded_at) where kind='baseline';
create unique index khsx_capacity_progress_operation_idx on private.khsx_capacity_events(operation_id,order_id,work_date)
  where kind='progress' and operation_id is not null;

create function private.khsx_capture_capacity_event() returns trigger
language plpgsql security definer set search_path='' as $f$
declare
  v_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_id text; v_day date; v_kind text; v_order jsonb; v_at timestamptz; v_op uuid; v_quality text:='server_observation';
begin
  if tg_table_name='khsx_stage_progress' then
    if coalesce(v_new->>'stage',v_old->>'stage')<>'dan' then return null; end if;
    if v_new->'quantity' is not distinct from v_old->'quantity' and v_new->'kpi_team' is not distinct from v_old->'kpi_team' then return null; end if;
    v_kind:='progress';
    v_old:=jsonb_build_object('quantity',v_old->'quantity','kpi_team',v_old->'kpi_team','order_id',v_old->'order_id','work_date',v_old->'work_date');
    v_new:=jsonb_build_object('quantity',v_new->'quantity','kpi_team',v_new->'kpi_team','order_id',v_new->'order_id','work_date',v_new->'work_date');
    v_op:=nullif(current_setting('khsx.capacity_operation',true),'')::uuid;
    v_at:=nullif(current_setting('khsx.capacity_occurred_at',true),'')::timestamptz;
  elsif tg_table_name='khsx_order_assignments' then
    if v_new->'current_team' is not distinct from v_old->'current_team'
      and v_new->'plan_team' is not distinct from v_old->'plan_team'
      and v_new->'spinoff_order_id' is not distinct from v_old->'spinoff_order_id' then return null; end if;
    v_kind:='assignment';
    v_old:=jsonb_build_object('order_id',v_old->'order_id','current_team',v_old->'current_team','plan_team',v_old->'plan_team','spinoff_order_id',v_old->'spinoff_order_id');
    v_new:=jsonb_build_object('order_id',v_new->'order_id','current_team',v_new->'current_team','plan_team',v_new->'plan_team','spinoff_order_id',v_new->'spinoff_order_id');
  elsif tg_table_name='khsx_daily_assignments' then
    if coalesce(v_new->>'assignment_kind',v_old->>'assignment_kind')<>'support' then return null; end if;
    if v_new->'team_name' is not distinct from v_old->'team_name' then return null; end if;
    v_kind:='support';
    v_old:=jsonb_build_object('order_id',v_old->'order_id','work_date',v_old->'work_date','team_name',v_old->'team_name');
    v_new:=jsonb_build_object('order_id',v_new->'order_id','work_date',v_new->'work_date','team_name',v_new->'team_name');
  else
    if tg_op='UPDATE' and v_old->'plan_qty' is not distinct from v_new->'plan_qty'
      and v_old->'deleted_at' is not distinct from v_new->'deleted_at'
      and v_old->'source_order_id' is not distinct from v_new->'source_order_id' then return null; end if;
    v_kind:='order';
    v_id:=coalesce(v_new->>'id',v_old->>'id');
    v_old:=jsonb_build_object('plan_qty',v_old->'plan_qty','deleted_at',v_old->'deleted_at','source_order_id',v_old->'source_order_id');
    v_new:=jsonb_build_object('plan_qty',v_new->'plan_qty','deleted_at',v_new->'deleted_at','source_order_id',v_new->'source_order_id');
  end if;
  v_id:=coalesce(v_id,v_new->>'order_id',v_old->>'order_id');
  v_day:=coalesce(v_new->>'work_date',v_old->>'work_date')::date;
  select jsonb_build_object('id',o.id,'production_date',o.production_date,'plan_qty',o.plan_qty,
    'source_order_id',o.source_order_id,'is_warranty',o.is_warranty,'is_ghost',o.is_ghost)
    into v_order from public.khsx_orders o where o.id=v_id;
  if v_order->>'is_warranty'='true' or v_order->>'is_ghost'='true' then return null; end if;
  if v_kind='progress' then
    if v_at is not null and v_at<=clock_timestamp()+interval '2 minutes'
      and (v_at at time zone 'Asia/Ho_Chi_Minh')::date=v_day
      and v_at>=(select min(recorded_at) from private.khsx_capacity_events where kind='baseline') then
      v_quality:='device_time';
    else v_quality:='missing_or_invalid_time';v_at:=null; end if;
  end if;
  insert into private.khsx_capacity_events(kind,order_id,work_date,operation_id,occurred_at,quality,payload)
    values(v_kind,v_id,v_day,v_op,v_at,v_quality,jsonb_build_object('before',v_old,'after',v_new,'order',v_order))
    on conflict do nothing;
  return null;
end;
$f$;
revoke all on function private.khsx_capture_capacity_event() from public,anon,authenticated,service_role;

-- Only a present-time baseline, never backfilled completion timestamps.
insert into private.khsx_capacity_events(kind,order_id,quality,payload)
values('baseline','__tracking_started__','baseline_only','{}');
insert into private.khsx_capacity_events(kind,order_id,quality,payload)
select 'baseline',o.id,'baseline_only',jsonb_build_object('order',jsonb_build_object('id',o.id,'production_date',o.production_date,'plan_qty',o.plan_qty,'source_order_id',o.source_order_id),
 'assignment',jsonb_build_object('current_team',a.current_team,'plan_team',a.plan_team,'spinoff_order_id',a.spinoff_order_id))
from public.khsx_orders o left join public.khsx_order_assignments a on a.order_id=o.id
where o.deleted_at is null and not o.is_warranty and not o.is_ghost;

create trigger khsx_capacity_progress after insert or update or delete on public.khsx_stage_progress
  for each row execute function private.khsx_capture_capacity_event();
create trigger khsx_capacity_assignment after insert or update or delete on public.khsx_order_assignments
  for each row execute function private.khsx_capture_capacity_event();
create trigger khsx_capacity_support after insert or update or delete on public.khsx_daily_assignments
  for each row execute function private.khsx_capture_capacity_event();
create trigger khsx_capacity_order after insert or update or delete on public.khsx_orders
  for each row execute function private.khsx_capture_capacity_event();

-- New client uses this invoker wrapper. Old clients keep using v2 unchanged.
create function public.khsx_apply_stage_progress_timed(
 p_operation_id uuid,p_order_id text,p_work_date date,p_stage public.khsx_stage,p_quantity integer,
 p_kpi_team public.khsx_unit default null,p_worker_id text default null,p_device_id text default '',p_occurred_at timestamptz default null
) returns table(operation_id uuid,applied_quantity integer,duplicate boolean,normalized_upstream boolean)
language plpgsql security invoker set search_path='' as $f$
begin
  perform set_config('khsx.capacity_operation',coalesce(p_operation_id::text,''),true);
  perform set_config('khsx.capacity_occurred_at',coalesce(p_occurred_at::text,''),true);
  return query select * from public.khsx_apply_stage_progress_v2(p_operation_id,p_order_id,p_work_date,p_stage,p_quantity,p_kpi_team,p_worker_id,p_device_id);
  perform set_config('khsx.capacity_operation','',true);
  perform set_config('khsx.capacity_occurred_at','',true);
end;
$f$;
revoke all on function public.khsx_apply_stage_progress_timed(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.khsx_apply_stage_progress_timed(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text,timestamptz) to authenticated;

create function private.khsx_read_capacity_events(p_to date,p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $f$
begin
  if auth.uid() is null or not exists(select 1 from public.khsx_profiles where user_id=auth.uid() and active and role in ('quan_ly','quan_ly_2')) then
    raise exception using errcode='42501',message='MANAGER_REQUIRED';
  end if;
  if p_to is null or p_after<0 then raise exception using errcode='22023',message='INVALID_RANGE'; end if;
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from (
    select * from private.khsx_capacity_events where id>p_after
      and coalesce(work_date,(recorded_at at time zone 'Asia/Ho_Chi_Minh')::date)<=p_to
    order by id limit 2000
  ) e),'[]'::jsonb);
end;
$f$;
revoke all on function private.khsx_read_capacity_events(date,bigint) from public,anon,authenticated,service_role;
grant execute on function private.khsx_read_capacity_events(date,bigint) to authenticated;
create function public.khsx_read_capacity_events(p_to date,p_after bigint default 0)
returns jsonb language sql security invoker set search_path='' as $f$
 select private.khsx_read_capacity_events(p_to,p_after);
$f$;
revoke all on function public.khsx_read_capacity_events(date,bigint) from public,anon,authenticated,service_role;
grant execute on function public.khsx_read_capacity_events(date,bigint) to authenticated;
