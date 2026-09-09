-- Approved guest/manager parity: only existing public order fields from locked plans.
CREATE OR REPLACE FUNCTION public.khsx_guest_dashboard_v116()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object(
  'orders',coalesce((
    select jsonb_agg(to_jsonb(q)) from (
      select o.id,o.production_date,o.product_code,o.product_name,
        o.width_mm,o.length_mm,o.thickness_mm,o.plan_qty,o.note,o.order_group,
        o.source_order_id,o.is_manual,o.is_drop,o.is_ghost,o.is_warranty,
        o.is_lot,o.lot_label,o.deleted_at,
        case when o.is_warranty then coalesce(o.source_payload->'live_row'->'bh_theo_to','{}'::jsonb)
          else '{}'::jsonb end as bh_theo_to,
        case when o.is_warranty then coalesce((
          select jsonb_agg(jsonb_build_object(
            'ten',d.item->'ten','kich_thuoc',d.item->'kich_thuoc','so_luong',d.item->'so_luong',
            'to',d.item->'to','loi',d.item->'loi','nguyen_nhan',d.item->'nguyen_nhan',
            'huong_xu_ly',d.item->'huong_xu_ly'))
          from jsonb_array_elements(coalesce(o.source_payload->'live_row'->'bh_chi_tiet','[]'::jsonb)) d(item)
        ),'[]'::jsonb) else '[]'::jsonb end as bh_chi_tiet
      from public.khsx_orders o
      where o.deleted_at is null
      order by o.production_date,o.id
    ) q
  ),'[]'::jsonb),
  'assignments',coalesce((
    select jsonb_agg(to_jsonb(q)) from (
      select a.order_id,a.plan_team,a.current_team,a.spinoff_order_id,a.change_note,a.priority
      from public.khsx_order_assignments a
      join public.khsx_orders o on o.id=a.order_id and o.deleted_at is null
      order by a.order_id
    ) q
  ),'[]'::jsonb),
  'daily_assignments',coalesce((
    select jsonb_agg(to_jsonb(q)) from (
      select a.order_id,a.work_date,a.team_name,a.assignment_kind
      from public.khsx_daily_assignments a
      join public.khsx_orders o on o.id=a.order_id and o.deleted_at is null
      order by a.work_date,a.order_id
    ) q
  ),'[]'::jsonb),
  'stage_progress',coalesce((
    select jsonb_agg(to_jsonb(q)) from (
      select p.order_id,p.work_date,p.stage,p.quantity,p.kpi_team
      from public.khsx_stage_progress p
      join public.khsx_orders o on o.id=p.order_id and o.deleted_at is null
      order by p.work_date,p.order_id,p.stage
    ) q
  ),'[]'::jsonb),
  'day_locks',coalesce((
    select jsonb_agg(to_jsonb(q)) from (
      select l.work_date,l.plan_locked,l.progress_locked
      from public.khsx_day_locks l order by l.work_date
    ) q
  ),'[]'::jsonb),
  'plan_snapshots',coalesce((
    select jsonb_agg(jsonb_build_object(
      'work_date',s.work_date,
      'rows_json',coalesce((
        select jsonb_agg((
          select jsonb_object_agg(f.key,f.value)
          from jsonb_each(r.item) f
          where f.key in ('id','date','ma','dong','ngang','dai','day','so_luong','ghi_chu',
            'nhom_don_hang','is_manual','is_drop','is_ghost','is_warranty','is_lot','lot_label',
            'source_order_id','is_support_split')
        ) order by r.ord)
        from jsonb_array_elements(s.rows_json) with ordinality r(item,ord)
        join public.khsx_orders o on o.id=r.item->>'id' and o.deleted_at is null
      ),'[]'::jsonb)
    ) order by s.work_date)
    from public.khsx_plan_snapshots s
    join public.khsx_day_locks l on l.work_date=s.work_date and l.plan_locked
    -- Omit genuinely empty source snapshots: manager also falls back to live rows.
    -- Keep a nonempty source snapshot even when every row has since been cancelled.
    where jsonb_array_length(s.rows_json)>0
  ),'[]'::jsonb),
  'quarter_targets',coalesce((
    select jsonb_agg(to_jsonb(q)) from (
      select t.year,t.quarter,t.target_qty
      from public.khsx_quarter_targets t order by t.year,t.quarter
    ) q
  ),'[]'::jsonb)
);
$function$
