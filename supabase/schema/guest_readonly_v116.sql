-- Bản khách chỉ đọc #116.
-- Không cấp SELECT vào bảng/view gốc. Một RPC trả đúng dữ liệu thuộc hai màn
-- Thống kê/KHSX; source_payload không lộ nguyên khối, tài khoản/Telegram/worker
-- không được đọc và anon không có bất kỳ quyền ghi nào.

revoke all on public.khsx_orders,public.khsx_order_assignments,
  public.khsx_daily_assignments,public.khsx_stage_progress,public.khsx_day_locks,
  public.khsx_plan_snapshots,public.khsx_quarter_targets,
  public.khsx_profiles,public.khsx_telegram_links,public.khsx_workers,
  public.khsx_stage_credits,public.khsx_worker_team_assignments from anon;

-- Dọn các view của lần triển khai đầu; advisor Supabase không chấp nhận view
-- chạy bằng quyền chủ sở hữu dù danh sách cột đã được lọc.
drop view if exists public.khsx_guest_orders;
drop view if exists public.khsx_guest_order_assignments;
drop view if exists public.khsx_guest_daily_assignments;
drop view if exists public.khsx_guest_stage_progress;
drop view if exists public.khsx_guest_day_locks;
drop view if exists public.khsx_guest_quarter_targets;

create or replace function public.khsx_guest_dashboard_v116()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $guest$
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
  'plan_snapshots','[]'::jsonb,
  'quarter_targets',coalesce((
    select jsonb_agg(to_jsonb(q)) from (
      select t.year,t.quarter,t.target_qty,t.work_dates
      from public.khsx_quarter_targets t order by t.year,t.quarter
    ) q
  ),'[]'::jsonb)
);
$guest$;

revoke all on function public.khsx_guest_dashboard_v116() from public;
revoke all on function public.khsx_guest_dashboard_v116() from authenticated;
grant execute on function public.khsx_guest_dashboard_v116() to anon;
