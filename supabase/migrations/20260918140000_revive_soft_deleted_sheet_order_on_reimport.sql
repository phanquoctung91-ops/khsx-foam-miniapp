-- Bug: khsx_reconcile_sheet_plan_impl only handled two states for an id that
-- already exists in khsx_orders — insert-if-missing, or clear the review flag
-- if active. A soft-deleted order (deleted_at set, e.g. auto-cancelled once
-- because the sheet source temporarily dropped it) had no matching branch and
-- fell through to `continue`, so re-importing the exact same row later could
-- never bring it back — it was lost permanently and silently (no error, no
-- review entry). Reported 2026-09-18: KHSX file import for 19/9/2026 showed
-- 125/134 tấm, missing SORA15-8 (9 tấm) because that exact order had been
-- auto-cancelled on 16/9 and the sheet later listed it again.
--
-- Fix: add a revive branch. An id is a primary key derived from
-- date+product_code+dims+qty, so it can never collide with an unrelated
-- order — if the row exists and is soft-deleted, restore it in place with the
-- freshly imported field values instead of leaving it lost. Applies whether
-- the row was auto-cancelled by this same sync or manually cancelled by a
-- manager via khsx_cancel_restore_order_v1 — a reappearing id is always the
-- same order.
create or replace function private.khsx_reconcile_sheet_plan_impl(
  p_source_orders jsonb,
  p_source_read_at timestamptz,
  p_pending_order_ids text[] default '{}'::text[]
) returns jsonb
language plpgsql security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '15s'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_source public.khsx_orders%rowtype;
  v_order public.khsx_orders%rowtype;
  v_id text;
  v_ids text[];
  v_dates date[];
  v_reason text;
  v_inserted integer := 0;
  v_cancelled integer := 0;
  v_review_updated integer := 0;
  v_review_ids text[] := '{}';
  v_locked integer := 0;
  v_recent integer := 0;
  v_count integer;
begin
  if v_actor is null or not exists (
    select 1 from public.khsx_profiles p
    where p.user_id=v_actor and p.active and p.role='quan_ly'
  ) then
    raise exception using errcode='42501',message='FULL_MANAGER_REQUIRED';
  end if;
  if p_source_orders is null or pg_catalog.jsonb_typeof(p_source_orders)<>'array' then
    raise exception using errcode='22023',message='INVALID_SHEET_SOURCE';
  end if;
  if pg_catalog.jsonb_array_length(p_source_orders) not between 1 and 10000
    or p_source_read_at is null
    or p_source_read_at < pg_catalog.clock_timestamp()-interval '15 minutes'
    or p_source_read_at > pg_catalog.clock_timestamp()+interval '2 minutes' then
    raise exception using errcode='22023',message='EMPTY_OR_STALE_SHEET_SOURCE';
  end if;
  -- Validate the entire batch before the first write. Use an explicit insert
  -- allowlist below so incoming JSON cannot restore/cancel rows or set flags.
  for v_source in select * from pg_catalog.jsonb_populate_recordset(null::public.khsx_orders,p_source_orders) loop
    if v_source.id is null or pg_catalog.left(v_source.id,2)<>'r_'
      or v_source.production_date is null or nullif(v_source.product_code,'') is null
      or v_source.plan_qty is null or v_source.plan_qty<0
      or coalesce(v_source.is_manual,false) or coalesce(v_source.is_drop,false)
      or coalesce(v_source.is_ghost,false) or coalesce(v_source.is_warranty,false)
      or v_source.source_order_id is not null or v_source.deleted_at is not null then
      raise exception using errcode='22023',message='INVALID_SHEET_ORDER';
    end if;
  end loop;
  select array_agg(s.id),array_agg(distinct s.production_date)
    into v_ids,v_dates
  from pg_catalog.jsonb_populate_recordset(null::public.khsx_orders,p_source_orders) s;
  if (select count(distinct x) from unnest(v_ids) x)<>cardinality(v_ids) then
    raise exception using errcode='22023',message='DUPLICATE_SHEET_ORDER';
  end if;

  -- Same lock as khsx_set_day_locks: locking a day cannot race this batch.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khsx-day-locks',0));
  -- Sorted order locks match khsx_apply_stage_progress_v2. Once acquired,
  -- re-read the row and all production evidence before deciding to cancel.
  for v_id in
    select id from (
      select unnest(v_ids) as id
      union
      select o.id from public.khsx_orders o
      where o.production_date=any(v_dates) and o.deleted_at is null
        and not o.is_manual and not o.is_drop and not o.is_ghost and not o.is_warranty
        and o.source_order_id is null
        and (o.source_payload->>'source' like 'sheet_live_sync_v%' or o.source_payload ? 'clone_run')
    ) candidates order by id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id,1));
    select * into v_source from pg_catalog.jsonb_populate_recordset(null::public.khsx_orders,p_source_orders) s where s.id=v_id;
    select * into v_order from public.khsx_orders o where o.id=v_id for update;
    if exists(select 1 from public.khsx_day_locks l
      where l.work_date=coalesce(v_order.production_date,v_source.production_date)
        and (l.plan_locked or l.progress_locked)) then
      v_locked:=v_locked+1;
      continue;
    end if;
    if v_source.id is not null then
      if v_order.id is null then
        insert into public.khsx_orders(id,production_date,product_code,product_name,
          width_mm,length_mm,thickness_mm,plan_qty,note,order_group,is_lot,lot_label,source_payload)
        values(v_source.id,v_source.production_date,v_source.product_code,coalesce(v_source.product_name,''),
          v_source.width_mm,v_source.length_mm,v_source.thickness_mm,v_source.plan_qty,
          coalesce(v_source.note,''),coalesce(v_source.order_group,''),coalesce(v_source.is_lot,false),coalesce(v_source.lot_label,''),
          pg_catalog.jsonb_build_object('source','sheet_live_sync_v123','live_row',coalesce(v_source.source_payload->'live_row','{}'::jsonb)))
        on conflict(id) do nothing;
        get diagnostics v_count = row_count;
        v_inserted:=v_inserted+v_count;
      elsif v_order.deleted_at is not null then
        -- Same id reappeared in a fresh import after being soft-cancelled (either
        -- auto-cancelled by this function when the sheet once dropped it, or
        -- manually cancelled). Ids are primary keys derived from
        -- date+code+dims+qty, so this can never collide with a different order —
        -- revive it in place instead of losing it forever.
        update public.khsx_orders set deleted_at=null,cancelled_by=null,cancel_reason=null,
          product_name=coalesce(v_source.product_name,''),width_mm=v_source.width_mm,length_mm=v_source.length_mm,
          thickness_mm=v_source.thickness_mm,plan_qty=v_source.plan_qty,note=coalesce(v_source.note,''),
          order_group=coalesce(v_source.order_group,''),is_lot=coalesce(v_source.is_lot,false),lot_label=coalesce(v_source.lot_label,''),
          source_payload=pg_catalog.jsonb_build_object('source','sheet_live_sync_v123','live_row',coalesce(v_source.source_payload->'live_row','{}'::jsonb)),
          updated_at=now()
        where id=v_id;
        v_inserted:=v_inserted+1;
      elsif v_order.deleted_at is null and v_order.updated_at<=p_source_read_at
        and v_order.source_payload ? 'sheet_sync_review' then
        update public.khsx_orders set source_payload=source_payload-'sheet_sync_review',updated_at=now() where id=v_id;
        v_review_updated:=v_review_updated+1;
      end if;
      continue;
    end if;
    if v_order.id is null or v_order.deleted_at is not null then continue; end if;
    -- Candidate properties may have changed while waiting for its row lock.
    if v_order.is_manual or v_order.is_drop or v_order.is_ghost or v_order.is_warranty
      or v_order.source_order_id is not null
      or not (coalesce(v_order.source_payload->>'source','') like 'sheet_live_sync_v%' or v_order.source_payload ? 'clone_run') then
      continue;
    end if;
    -- An older response must not cancel an order added/edited while it loaded.
    if v_order.updated_at>p_source_read_at then
      v_recent:=v_recent+1;
      continue;
    end if;
    v_reason:=null;
    if v_id=any(coalesce(p_pending_order_ids,'{}'::text[])) then
      v_reason:='pending_local_change';
    elsif exists(select 1 from public.khsx_stage_progress p where p.order_id=v_id and p.quantity>0)
      or exists(select 1 from public.khsx_stage_operations p where p.order_id=v_id and p.applied_quantity>0)
      or exists(select 1 from public.khsx_stage_progress_audit p where p.order_id=v_id and (p.old_quantity>0 or p.new_quantity>0))
      or exists(select 1 from public.khsx_stage_credits p where p.order_id=v_id and p.quantity>0) then
      v_reason:='recorded_progress';
    elsif exists(select 1 from public.khsx_orders o where o.source_order_id=v_id)
      or exists(select 1 from public.khsx_order_assignments a where a.order_id=v_id and nullif(a.spinoff_order_id,'') is not null)
      or exists(select 1 from public.khsx_order_assignments a where a.spinoff_order_id=v_id) then
      v_reason:='linked_order';
    end if;
    if v_reason is not null then
      v_review_ids:=array_append(v_review_ids,v_id);
      if v_order.source_payload#>>'{sheet_sync_review,reason}' is distinct from v_reason then
        update public.khsx_orders set source_payload=pg_catalog.jsonb_set(source_payload,'{sheet_sync_review}',
          pg_catalog.jsonb_build_object('removed',true,'reason',v_reason,'observed_at',p_source_read_at)),updated_at=now()
        where id=v_id;
        v_review_updated:=v_review_updated+1;
      end if;
    else
      update public.khsx_orders set deleted_at=now(),cancelled_by=v_actor,
        cancel_reason='Sheet nguồn đã bỏ dòng khỏi kế hoạch; đồng bộ kiểm tra không có tiến độ hoặc đơn liên kết. Nguồn đọc lúc '||p_source_read_at::text,
        source_payload=source_payload-'sheet_sync_review',updated_at=now()
      where id=v_id;
      v_cancelled:=v_cancelled+1;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok',true,'inserted',v_inserted,'cancelled',v_cancelled,
    'review_updated',v_review_updated,'review_ids',v_review_ids,'review_count',cardinality(v_review_ids),
    'skipped_locked',v_locked,'skipped_recent',v_recent,
    'changed',v_inserted+v_cancelled+v_review_updated>0);
end;
$function$;
