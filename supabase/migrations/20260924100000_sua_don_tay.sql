-- Sửa 2026-09-24 (anh Tùng duyệt): quản lý chính sửa tay đơn kế hoạch đã nạp (mã, tên,
-- kích thước, số lượng, ngày, ghi chú) — ví dụ file KHSX ghi sai mã/tên.
--
-- 1. public.khsx_edit_order_v1: sửa đơn, GIỮ NGUYÊN id đơn (id sinh từ nội dung dòng lúc nạp
--    lần đầu). Nhờ vậy tổ, tiến độ, công từng người không đổi, và lần nạp sau nếu file vẫn còn
--    đúng dòng cũ thì ra đúng id cũ -> máy chủ thấy đơn đã có, không ghi đè bản đã sửa.
--    Ghi lại giá trị lúc nạp vào source_payload.manual_edit.before (chỉ lần sửa đầu tiên) để
--    app ghép được đơn đã sửa với dòng mới của file khi file đổi.
--    Ngày đang chốt đầu vào: sửa luôn ảnh chụp, không cần mở chốt.
--
-- 2. private.khsx_reconcile_sheet_plan_impl: đơn đã sửa tay
--    - file mới không còn dòng đó: KHÔNG tự hủy (kể cả chưa làm), chỉ gắn cờ cần kiểm tra
--      (lý do 'manual_edit') để quản lý hợp nhất với dòng mới trong bảng "Đơn cần kiểm tra";
--    - đơn đã hủy mà dòng cũ xuất hiện lại: cho sống lại nhưng giữ nguyên bản đã sửa, không
--      lấy lại giá trị sai trong file.

create or replace function public.khsx_edit_order_v1(p_edits jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '15s'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_edit jsonb;
  v_id text;
  v_order public.khsx_orders%rowtype;
  v_new_date date;
  v_new_qty integer;
  v_new_code text;
  v_new_name text;
  v_done integer;
  v_row jsonb;
  v_before jsonb;
  v_old_date date;
  v_updated integer := 0;
begin
  if v_actor is null or not exists (
    select 1 from public.khsx_profiles p
    where p.user_id=v_actor and p.active and p.role='quan_ly'
  ) then
    raise exception using errcode='42501',message='FULL_MANAGER_REQUIRED';
  end if;
  if p_edits is null or pg_catalog.jsonb_typeof(p_edits)<>'array'
    or pg_catalog.jsonb_array_length(p_edits) not between 1 and 50 then
    raise exception using errcode='22023',message='INVALID_ORDER_EDIT';
  end if;

  -- Cùng khóa với chốt ngày và đối chiếu KHSX: không chen giữa lúc đang chốt/nạp.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khsx-day-locks',0));

  for v_edit in
    select x.e from pg_catalog.jsonb_array_elements(p_edits) x(e) order by x.e->>'id'
  loop
    v_id := v_edit->>'id';
    if v_id is null or v_id='' then
      raise exception using errcode='22023',message='INVALID_ORDER_EDIT';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id,1));
    select * into v_order from public.khsx_orders o where o.id=v_id for update;
    if v_order.id is null or v_order.deleted_at is not null then
      raise exception using errcode='P0002',message='ORDER_NOT_FOUND';
    end if;
    -- Chỉ đơn kế hoạch nạp từ file/Sheet; đơn phát sinh, rớt, bảo hành có luồng riêng.
    if v_order.is_manual or v_order.is_drop or v_order.is_ghost or v_order.is_warranty
      or v_order.source_order_id is not null then
      raise exception using errcode='22023',message='ORDER_NOT_EDITABLE';
    end if;

    v_new_date := case when v_edit ? 'date' then (v_edit->>'date')::date else v_order.production_date end;
    v_new_qty  := case when v_edit ? 'so_luong' then (v_edit->>'so_luong')::integer else v_order.plan_qty end;
    v_new_code := case when v_edit ? 'ma' then pg_catalog.btrim(v_edit->>'ma') else v_order.product_code end;
    v_new_name := case when v_edit ? 'dong' then pg_catalog.btrim(v_edit->>'dong') else v_order.product_name end;
    if v_new_date is null or v_new_qty is null or v_new_qty<0
      or coalesce(v_new_code,'')='' or coalesce(v_new_name,'')='' then
      raise exception using errcode='22023',message='INVALID_ORDER_EDIT';
    end if;

    -- Kế hoạch là nguồn: không được nhỏ hơn số đã làm ở bất kỳ công đoạn nào.
    select coalesce(max(t),0) into v_done from (
      select sum(p.quantity) t from public.khsx_stage_progress p where p.order_id=v_id group by p.stage
    ) x;
    if v_new_qty < v_done then
      raise exception using errcode='22023',message='PLAN_BELOW_PROGRESS',detail=v_done::text;
    end if;
    -- Đổi ngày khi đã có tiến độ sẽ làm lệch lịch sử theo ngày -> không cho.
    if v_new_date<>v_order.production_date and (v_done>0
      or exists(select 1 from public.khsx_stage_credits c where c.order_id=v_id and c.quantity>0)) then
      raise exception using errcode='22023',message='ORDER_HAS_PROGRESS';
    end if;

    v_before := coalesce(v_order.source_payload#>'{manual_edit,before}', pg_catalog.jsonb_build_object(
      'date',pg_catalog.to_char(v_order.production_date,'DD/MM/YYYY'),'ma',v_order.product_code,'dong',v_order.product_name,
      'ngang',coalesce(pg_catalog.trim_scale(v_order.width_mm)::text,''),'dai',coalesce(pg_catalog.trim_scale(v_order.length_mm)::text,''),
      'day',coalesce(pg_catalog.trim_scale(v_order.thickness_mm)::text,''),'so_luong',v_order.plan_qty,'ghi_chu',v_order.note));
    v_old_date := v_order.production_date;

    update public.khsx_orders set
      production_date=v_new_date,
      product_code=v_new_code,
      product_name=v_new_name,
      width_mm=case when v_edit ? 'ngang' then nullif(v_edit->>'ngang','')::numeric else width_mm end,
      length_mm=case when v_edit ? 'dai' then nullif(v_edit->>'dai','')::numeric else length_mm end,
      thickness_mm=case when v_edit ? 'day' then nullif(v_edit->>'day','')::numeric else thickness_mm end,
      plan_qty=v_new_qty,
      note=case when v_edit ? 'ghi_chu' then coalesce(v_edit->>'ghi_chu','') else note end,
      source_payload=pg_catalog.jsonb_set(source_payload,'{manual_edit}',pg_catalog.jsonb_build_object(
        'before',v_before,'at',pg_catalog.now(),'by',v_actor,
        'count',coalesce((source_payload#>>'{manual_edit,count}')::integer,0)+1)),
      updated_at=pg_catalog.now()
    where id=v_id
    returning * into v_order;
    v_updated := v_updated+1;

    -- Dòng trong ảnh chụp, cùng dạng app đang lưu (kích thước là chữ, ngày dd/mm/yyyy).
    v_row := pg_catalog.jsonb_build_object(
      'date',pg_catalog.to_char(v_order.production_date,'DD/MM/YYYY'),'ma',v_order.product_code,'dong',v_order.product_name,
      'ngang',coalesce(pg_catalog.trim_scale(v_order.width_mm)::text,''),'dai',coalesce(pg_catalog.trim_scale(v_order.length_mm)::text,''),
      'day',coalesce(pg_catalog.trim_scale(v_order.thickness_mm)::text,''),'so_luong',v_order.plan_qty,'ghi_chu',v_order.note);

    -- Ảnh chụp ngày cũ: sửa tại chỗ (cùng ngày) hoặc bỏ dòng ra (đã dời ngày).
    update public.khsx_plan_snapshots s set rows_json=(
      select coalesce(pg_catalog.jsonb_agg(
        case when x.e->>'id'=v_id then x.e || v_row else x.e end order by x.n)
        filter (where x.e->>'id' is distinct from v_id or v_order.production_date=s.work_date),'[]'::jsonb)
      from pg_catalog.jsonb_array_elements(s.rows_json) with ordinality x(e,n)
    ), version=extract(epoch from pg_catalog.clock_timestamp())::bigint
    where s.rows_json @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id));

    -- Dời sang ngày đang chốt đã có ảnh -> thêm dòng vào ảnh ngày đó.
    update public.khsx_plan_snapshots s
      set rows_json=s.rows_json || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'id',v_id,'is_lot',v_order.is_lot,'lot_label',v_order.lot_label,'nhom_don_hang',v_order.order_group,'is_drop',false) || v_row),
          version=extract(epoch from pg_catalog.clock_timestamp())::bigint
    where v_order.production_date<>v_old_date
      and s.work_date=v_order.production_date
      and not s.rows_json @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id))
      and exists(select 1 from public.khsx_day_locks l where l.work_date=s.work_date and l.plan_locked);
  end loop;
  return pg_catalog.jsonb_build_object('ok',true,'updated',v_updated);
end;
$function$;
revoke all on function public.khsx_edit_order_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.khsx_edit_order_v1(jsonb) to authenticated;


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
