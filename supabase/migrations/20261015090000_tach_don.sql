-- Tách đơn (anh Tùng chốt 15/10/2026): nút ✂️ Tách trong menu ⋯ của dòng đơn, chia đơn cho các tổ Dán.
-- Chỉ người có quyền khsx_split_order (mặc định chỉ chủ).
-- 1. Quyền mới khsx_split_order.
-- 2. public.khsx_split_order_v1 (bên dưới).
-- 3. private.khsx_reconcile_sheet_plan_impl: giữ nguyên bản đang chạy, chỉ thêm một nhánh — đơn đã tách (source_payload.split)
--    bị xóa mềm thì đồng bộ Sheet KHÔNG hồi sinh, nếu không đơn gốc sống lại và trùng với các đơn con.

insert into public.khsx_permissions(permission_key, display_name, group_name, description, sort_order)
values ('khsx_split_order', 'Tách đơn', 'KHSX', 'Tách một đơn thành nhiều đơn con theo tổ Dán (nút ✂️ trong menu ⋯ của dòng đơn)', 6)
on conflict (permission_key) do nothing;

-- 2. Hàm tách đơn. p_parts = [{"to":"To 1","qty":60},{"to":"To 3","qty":40}]. Chỉ người có quyền khsx_split_order.
--    Chưa có tiến độ: đơn gốc bị thay bằng các đơn con (gốc xóa mềm, đánh dấu split để đồng bộ Sheet không hồi sinh).
--    Đã có tiến độ: đơn gốc giữ lại, số lượng = số đã làm (công đoạn cao nhất), phần còn lại chia cho các đơn con.
--    Tổng qty luôn đúng bằng phần còn lại: tổng kế hoạch của ngày không đổi.
create or replace function public.khsx_split_order_v1(p_order_id text, p_parts jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '15s'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_order public.khsx_orders%rowtype;
  v_done integer;
  v_left integer;
  v_part jsonb;
  v_sum integer := 0;
  v_n integer := 0;
  v_cid text;
  v_ids text[] := '{}';
  v_kids jsonb := '[]'::jsonb;
  v_team text;
  v_qty integer;
  v_seen text[] := '{}';
  v_prio boolean;
  v_note text;
begin
  if v_actor is null or not exists (
    select 1 from public.khsx_profiles p
    where p.user_id=v_actor and p.active and p.role in ('quan_ly','quan_ly_2')
  ) or not private.khsx_has_permission('khsx_split_order', v_actor) then
    raise exception using errcode='42501',message='SPLIT_PERMISSION_REQUIRED';
  end if;
  if p_order_id is null or p_order_id='' or p_parts is null or pg_catalog.jsonb_typeof(p_parts)<>'array'
    or pg_catalog.jsonb_array_length(p_parts) not between 1 and 5 then
    raise exception using errcode='22023',message='INVALID_SPLIT';
  end if;
  for v_part in select x.e from pg_catalog.jsonb_array_elements(p_parts) x(e) loop
    v_team := v_part->>'to';
    if v_team is null or v_team not in ('To 1','To 2','To 3','To 4','To 5') or v_team=any(v_seen)
      or coalesce(v_part->>'qty','') !~ '^[0-9]+$' or (v_part->>'qty')::integer<=0 then
      raise exception using errcode='22023',message='INVALID_SPLIT';
    end if;
    v_seen := v_seen || v_team;
    v_sum := v_sum + (v_part->>'qty')::integer;
  end loop;

  -- Cùng khóa với chốt ngày, sửa đơn và đối chiếu KHSX.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khsx-day-locks',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id,1));
  select * into v_order from public.khsx_orders o where o.id=p_order_id for update;
  if v_order.id is null or v_order.deleted_at is not null then
    raise exception using errcode='P0002',message='ORDER_NOT_FOUND';
  end if;
  if v_order.is_manual or v_order.is_drop or v_order.is_ghost or v_order.is_warranty
    or v_order.source_order_id is not null then
    raise exception using errcode='22023',message='ORDER_NOT_SPLITTABLE';
  end if;

  select coalesce(max(t),0) into v_done from (
    select sum(p.quantity) t from public.khsx_stage_progress p where p.order_id=p_order_id group by p.stage
  ) x;
  v_left := v_order.plan_qty - v_done;
  if v_left<=0 then
    raise exception using errcode='22023',message='NOTHING_TO_SPLIT';
  end if;
  if v_sum<>v_left then
    raise exception using errcode='22023',message='SPLIT_SUM_MISMATCH',detail=v_left::text;
  end if;

  select coalesce(a.priority,false) into v_prio from public.khsx_order_assignments a where a.order_id=p_order_id;
  v_note := case when coalesce(v_order.note,'')<>'' then v_order.note||' · ' else '' end
    || 'Tách từ đơn '||v_order.plan_qty||' tấm';

  for v_part in select x.e from pg_catalog.jsonb_array_elements(p_parts) x(e) loop
    loop
      v_n := v_n+1;
      v_cid := p_order_id||'__t'||v_n;
      exit when not exists(select 1 from public.khsx_orders o where o.id=v_cid);
    end loop;
    v_qty := (v_part->>'qty')::integer;
    insert into public.khsx_orders(id,production_date,product_code,product_name,width_mm,length_mm,thickness_mm,
      plan_qty,note,order_group,is_lot,lot_label,source_payload)
    values(v_cid,v_order.production_date,v_order.product_code,v_order.product_name,v_order.width_mm,v_order.length_mm,
      v_order.thickness_mm,v_qty,v_note,v_order.order_group,false,'',
      pg_catalog.jsonb_build_object('source','miniapp_split','split_from',p_order_id,'at',pg_catalog.now(),'by',v_actor));
    insert into public.khsx_order_assignments(order_id,plan_team,current_team,priority,assigned_by,assigned_at)
    values(v_cid,(v_part->>'to')::public.khsx_unit,(v_part->>'to')::public.khsx_unit,coalesce(v_prio,false),v_actor,pg_catalog.now());
    v_ids := v_ids || v_cid;
    v_kids := v_kids || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',v_cid,'is_lot',false,'lot_label','','nhom_don_hang',v_order.order_group,'is_drop',false,
      'date',pg_catalog.to_char(v_order.production_date,'DD/MM/YYYY'),'ma',v_order.product_code,'dong',v_order.product_name,
      'ngang',coalesce(pg_catalog.trim_scale(v_order.width_mm)::text,''),'dai',coalesce(pg_catalog.trim_scale(v_order.length_mm)::text,''),
      'day',coalesce(pg_catalog.trim_scale(v_order.thickness_mm)::text,''),'so_luong',v_qty,'ghi_chu',v_note));
  end loop;

  if v_done=0 then
    update public.khsx_orders set deleted_at=pg_catalog.now(),cancelled_by=v_actor,
      cancel_reason='Tách đơn thành '||cardinality(v_ids)||' đơn con theo tổ',
      source_payload=source_payload||pg_catalog.jsonb_build_object('split',pg_catalog.jsonb_build_object(
        'children',pg_catalog.to_jsonb(v_ids),'at',pg_catalog.now(),'by',v_actor,'qty_before',v_order.plan_qty)),
      updated_at=pg_catalog.now()
    where id=p_order_id;
  else
    update public.khsx_orders set plan_qty=v_done,
      source_payload=source_payload||pg_catalog.jsonb_build_object('split',pg_catalog.jsonb_build_object(
        'children',coalesce(source_payload#>'{split,children}','[]'::jsonb)||pg_catalog.to_jsonb(v_ids),
        'at',pg_catalog.now(),'by',v_actor,'qty_before',v_order.plan_qty)),
      updated_at=pg_catalog.now()
    where id=p_order_id;
  end if;

  -- Ảnh chụp ngày đã chốt: thay dòng gốc tại chỗ bằng các dòng con (hoặc giữ gốc với số đã làm rồi thêm con phía sau).
  update public.khsx_plan_snapshots s set rows_json=(
    select coalesce(pg_catalog.jsonb_agg(z.e order by z.n,z.k),'[]'::jsonb) from (
      select x.n,0 k,case when x.e->>'id'=p_order_id then x.e||pg_catalog.jsonb_build_object('so_luong',v_done) else x.e end e
      from pg_catalog.jsonb_array_elements(s.rows_json) with ordinality x(e,n)
      where not (x.e->>'id'=p_order_id and v_done=0)
      union all
      select x.n,c.m::integer k,c.e
      from pg_catalog.jsonb_array_elements(s.rows_json) with ordinality x(e,n)
      cross join pg_catalog.jsonb_array_elements(v_kids) with ordinality c(e,m)
      where x.e->>'id'=p_order_id
    ) z),
    version=extract(epoch from pg_catalog.clock_timestamp())::bigint
  where s.rows_json @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',p_order_id));

  return pg_catalog.jsonb_build_object('ok',true,'children',pg_catalog.to_jsonb(v_ids),'kept',v_done>0,'done',v_done,'left',v_left);
end;
$function$;
revoke all on function public.khsx_split_order_v1(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.khsx_split_order_v1(text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION private.khsx_reconcile_sheet_plan_impl(p_source_orders jsonb, p_source_read_at timestamp with time zone, p_pending_order_ids text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '15s'
AS $function$
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
    where p.user_id=v_actor and p.active
      and (p.role='quan_ly' or (p.role='quan_ly_2' and private.khsx_has_permission('khsx_sync_source', v_actor)))
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
      elsif v_order.deleted_at is not null and v_order.source_payload ? 'split' then
        -- Đơn đã được tách thành đơn con theo tổ: file Sheet vẫn còn dòng gốc nhưng không được hồi sinh.
        null;
      elsif v_order.deleted_at is not null and v_order.source_payload ? 'manual_edit' then
        -- Đơn đã sửa tay sống lại: giữ nguyên bản quản lý đã sửa, không lấy lại giá trị cũ
        -- của file (chính là giá trị sai mà quản lý đã sửa).
        update public.khsx_orders set deleted_at=null,cancelled_by=null,cancel_reason=null,
          source_payload=source_payload-'sheet_sync_review',updated_at=now()
        where id=v_id;
        v_inserted:=v_inserted+1;
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
    elsif v_order.source_payload ? 'manual_edit' then
      -- Đơn quản lý đã sửa tay: không tự hủy, để quản lý hợp nhất với dòng mới.
      v_reason:='manual_edit';
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
