-- Phan quyen tai khoan - Giai doan 4, Dot 4.3 (4 phan nhe): assign_support,
-- assign_team/khsx_priority, progress_lock/progress_unlock. (order_cancel/
-- order_restore tach rieng lam sau - khong dung RPC, se can RPC moi.)
--
-- 1) private.khsx_assign_support_impl: MANAGER_REQUIRED -> can quyen assign_support.
-- 2) private.khsx_save_order_assignment_impl: giu nguyen MANAGER_REQUIRED lam
--    nen (khong doi hanh vi cac truong khac nhu spinoff/change_note), THEM 2
--    kiem tra rieng: doi to (plan_team/current_team) can assign_team, doi co
--    uu tien (priority) can khsx_priority. v_existing da duoc doc truoc do
--    trong ham nay nen so sanh truoc/sau khong can doc them.
-- 3) public.khsx_set_day_locks: khoa/mo khoa KE HOACH (p_lock_kind='plan') giu
--    nguyen theo role (chi quan_ly, khong doi - ngoai pham vi dot nay). Khoa/mo
--    khoa TIEN DO (p_lock_kind='progress') doi tu role sang quyen progress_lock
--    (khi dang chot) / progress_unlock (khi dang mo). Ham nay truoc gio KHONG
--    phai security definer (chay quyen nguoi goi) - them "security definer" vi
--    private.khsx_has_permission() da bi revoke khoi role authenticated (chi
--    goi duoc tu ben trong ham security definer khac), da test truc tiep tren
--    production (transaction roi rollback) va xac nhan thieu dong nay se loi
--    "permission denied for function khsx_has_permission".
--
-- Da doi chieu du lieu that: Le Huu Phuoc dang co du ca 3 quyen assign_support/
-- assign_team/khsx_priority/progress_lock (thieu progress_unlock - dung y, anh
-- Tung da noi ro Phuoc khong duoc go khoa). Khong nhan vien nao dang giu bat ky
-- quyen nao trong nhom nay. Chu tai khoan qua bypass owner co san.

create or replace function private.khsx_assign_support_impl(p_operation_id uuid, p_order_id text, p_work_date date, p_support_team khsx_unit)
returns table(operation_id uuid, support_order_id text, support_team khsx_unit, remainder integer, cleared boolean)
language plpgsql
security definer
set search_path='public','private','pg_catalog'
set lock_timeout='3s'
set statement_timeout='8s'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_order public.khsx_orders%rowtype;
  v_assignment public.khsx_order_assignments%rowtype;
  v_existing_team public.khsx_unit;
  v_support_id text;
  v_plan integer;
  v_dan integer := 0;
  v_remainder integer := 0;
  v_other_days integer := 0;
  v_has_progress boolean := false;
begin
  if v_actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.khsx_has_permission('assign_support', v_actor) then raise exception using errcode='42501',message='ASSIGN_SUPPORT_FORBIDDEN'; end if;
  if p_operation_id is null or nullif(pg_catalog.btrim(p_order_id),'') is null or p_work_date is null then
    raise exception using errcode='22023',message='INVALID_SUPPORT_INPUT';
  end if;
  if p_support_team is not null and p_support_team not in (
    'To 1'::public.khsx_unit,'To 2'::public.khsx_unit,'To 3'::public.khsx_unit,
    'To 4'::public.khsx_unit,'To 5'::public.khsx_unit
  ) then raise exception using errcode='22023',message='INVALID_SUPPORT_TEAM'; end if;

  select * into v_order from public.khsx_orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  select * into v_assignment from public.khsx_order_assignments where order_id=p_order_id for update;
  if v_assignment.current_team is null and v_assignment.plan_team is null then
    raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED';
  end if;

  select da.team_name into v_existing_team
  from public.khsx_daily_assignments da
  where da.order_id=p_order_id and da.assignment_kind='support' and da.team_name is not null
  order by da.work_date limit 1;
  if p_support_team is not null and v_existing_team is not null and v_existing_team<>p_support_team then
    raise exception using errcode='22023',message='SUPPORT_TEAM_CONFLICT';
  end if;

  if p_support_team is null then
    v_support_id := v_assignment.spinoff_order_id;
    if v_support_id is not null then
      select exists(select 1 from public.khsx_stage_progress s where s.order_id=v_support_id) into v_has_progress;
      if v_has_progress then raise exception using errcode='22023',message='SUPPORT_HAS_PROGRESS'; end if;
    end if;
    delete from public.khsx_daily_assignments
      where order_id=p_order_id and work_date=p_work_date and assignment_kind='support';
    select count(*) into v_other_days from public.khsx_daily_assignments
      where order_id=p_order_id and assignment_kind='support';
    if v_other_days=0 and v_support_id is not null then
      update public.khsx_orders set deleted_at=now(),updated_at=now() where id=v_support_id and deleted_at is null;
      update public.khsx_order_assignments set spinoff_order_id=null,updated_at=now() where order_id=p_order_id;
      v_support_id := null;
    end if;
    return query select p_operation_id,v_support_id,null::public.khsx_unit,0,true;
    return;
  end if;

  select coalesce(sum(s.quantity),0)::integer into v_dan
  from public.khsx_stage_progress s
  where s.order_id=p_order_id and s.stage='dan'::public.khsx_stage and s.work_date<=p_work_date;
  v_plan := coalesce(v_order.plan_qty,0);
  v_remainder := greatest(0,v_plan-v_dan);
  if v_remainder<=0 and v_assignment.spinoff_order_id is null then
    raise exception using errcode='22023',message='SUPPORT_NO_REMAINDER';
  end if;

  v_support_id := v_assignment.spinoff_order_id;
  if v_support_id is null then
    v_support_id := 's_' || md5(p_order_id);
    insert into public.khsx_orders(
      id,production_date,product_code,product_name,width_mm,length_mm,thickness_mm,plan_qty,note,order_group,
      source_order_id,is_manual,is_drop,is_ghost,is_warranty,is_lot,lot_label,source_payload
    ) values (
      v_support_id,v_order.production_date,v_order.product_code,v_order.product_name,v_order.width_mm,v_order.length_mm,
      v_order.thickness_mm,v_remainder,coalesce(v_order.note,'Hỗ trợ từ đơn gốc'),v_order.order_group,
      v_order.id,false,true,false,false,v_order.is_lot,v_order.lot_label,
      jsonb_build_object('source','support_split','source_order_id',v_order.id,'operation_id',p_operation_id)
    );
    insert into public.khsx_order_assignments(order_id,plan_team,current_team,assigned_by,assigned_at)
      values(v_support_id,p_support_team,p_support_team,v_actor,now())
      on conflict(order_id) do update set current_team=excluded.current_team,updated_at=now();
    update public.khsx_order_assignments set spinoff_order_id=v_support_id,updated_at=now() where order_id=p_order_id;
  else
    select exists(select 1 from public.khsx_stage_progress s where s.order_id=v_support_id) into v_has_progress;
    if not v_has_progress then
      update public.khsx_orders set plan_qty=v_remainder,deleted_at=null,updated_at=now() where id=v_support_id;
    else
      -- Đã có sản lượng hỗ trợ thì không tự đổi kế hoạch của dòng con;
      -- trả đúng số đã chốt để giao diện không tự hiện khác sau reload.
      select coalesce(plan_qty,0) into v_remainder from public.khsx_orders where id=v_support_id;
    end if;
  end if;
  -- Khôi phục liên kết phân tổ nếu dữ liệu cũ từng bị thiếu assignment.
  insert into public.khsx_order_assignments as existing(order_id,plan_team,current_team,assigned_by,assigned_at)
    values(v_support_id,p_support_team,p_support_team,v_actor,now())
    on conflict(order_id) do update set current_team=coalesce(existing.current_team,excluded.current_team),updated_at=now();
  insert into public.khsx_daily_assignments(order_id,work_date,team_name,assignment_kind,assigned_by)
    values(p_order_id,p_work_date,p_support_team,'support',v_actor)
    on conflict(order_id,work_date,assignment_kind) do update set team_name=excluded.team_name,assigned_by=excluded.assigned_by,updated_at=now();
  return query select p_operation_id,v_support_id,p_support_team,v_remainder,false;
end;
$$;

create or replace function private.khsx_save_order_assignment_impl(p_operation_id uuid, p_order_id text, p_plan_team khsx_unit, p_current_team khsx_unit, p_spinoff_order_id text, p_change_note text, p_priority boolean, p_client_updated_at timestamp with time zone)
returns table(order_id text, plan_team khsx_unit, current_team khsx_unit, spinoff_order_id text, updated_at timestamp with time zone)
language plpgsql
security definer
set search_path='public','private','pg_catalog'
set lock_timeout='3s'
set statement_timeout='8s'
as $$
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
  if (p_plan_team is distinct from v_existing.plan_team or p_current_team is distinct from v_existing.current_team)
     and not private.khsx_has_permission('assign_team', v_actor) then
    raise exception using errcode='42501',message='ASSIGN_TEAM_FORBIDDEN';
  end if;
  if (coalesce(p_priority,false) is distinct from coalesce(v_existing.priority,false))
     and not private.khsx_has_permission('khsx_priority', v_actor) then
    raise exception using errcode='42501',message='KHSX_PRIORITY_FORBIDDEN';
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
$$;

create or replace function public.khsx_set_day_locks(p_lock_kind text, p_lock_changes jsonb default '{}'::jsonb, p_snapshot_rows jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path='public','private','pg_catalog'
as $$
declare
  v_count integer := 0;
  v_date date;
  v_locked boolean;
  v_entry record;
  v_actor_role public.khsx_role;
begin
  if not private.khsx_is_manager() then
    raise exception using errcode='42501',message='MANAGER_REQUIRED';
  end if;
  select p.role into v_actor_role
  from public.khsx_profiles p
  where p.user_id=auth.uid() and p.active;
  if p_lock_kind not in ('plan','progress') then
    raise exception using errcode='22023',message='INVALID_LOCK_KIND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khsx-day-locks',0));
  for v_entry in select * from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) loop
    v_date:=v_entry.key::date;
    v_locked:=v_entry.value::boolean;
    v_count:=v_count+1;
    if p_lock_kind='plan' then
      -- Khoa/mo khoa KE HOACH: ngoai pham vi Dot 4.3, giu nguyen theo role
      -- (chi quan_ly, khong co permission_key rieng cho viec nay).
      if v_actor_role='quan_ly_2' then raise exception using errcode='42501',message='LOCKED_NO_UNLOCK'; end if;
    else
      -- Khoa/mo khoa TIEN DO: theo dung permission_key progress_lock/progress_unlock.
      if not private.khsx_has_permission(case when v_locked then 'progress_lock' else 'progress_unlock' end, auth.uid()) then
        raise exception using errcode='42501',message='LOCKED_NO_UNLOCK';
      end if;
    end if;
    if p_lock_kind='plan' then
      if v_locked then
        insert into public.khsx_day_locks(work_date,plan_locked,locked_by)
          values(v_date,true,auth.uid())
          on conflict(work_date) do update set plan_locked=true,locked_by=auth.uid(),updated_at=now();
      else
        update public.khsx_day_locks
           set plan_locked=false,locked_by=auth.uid(),updated_at=now()
         where work_date=v_date;
      end if;
    else
      if v_locked then
        insert into public.khsx_day_locks(work_date,progress_locked,locked_by)
          values(v_date,true,auth.uid())
          on conflict(work_date) do update set progress_locked=true,locked_by=auth.uid(),updated_at=now();
      else
        update public.khsx_day_locks
           set progress_locked=false,locked_by=auth.uid(),updated_at=now()
         where work_date=v_date;
      end if;
    end if;
  end loop;
  if p_lock_kind='plan' and jsonb_typeof(coalesce(p_snapshot_rows,'{}'::jsonb))='object' then
    insert into public.khsx_plan_snapshots(work_date,rows_json,version,created_by)
      select (e.key)::date,e.value,extract(epoch from clock_timestamp())::bigint,auth.uid()
      from jsonb_each(coalesce(p_snapshot_rows,'{}'::jsonb)) e
      where exists (
        select 1 from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) c
        where c.key=e.key and c.value::boolean
      )
      on conflict(work_date) do update set rows_json=excluded.rows_json,version=excluded.version,
        created_by=excluded.created_by,created_at=now();
  end if;
  return v_count;
end;
$$;
