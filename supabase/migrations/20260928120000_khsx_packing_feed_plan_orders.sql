-- Feed đóng gói + danh sách đơn KHSX theo ngày (2026-09-28) cho bot @NghiepVuKho_bot.
-- Chỉ đọc. Lọc deleted_at is null giống khsx_guest_dashboard_v116 để không lộ hơn link khách.

-- A. Đóng gói trong ngày, cộng dồn mọi team_key, kèm đơn gốc (lần ngược source_order_id).
-- cursor = received_at mới nhất của thao tác dong_goi; p_since = cursor lần trước → rows rỗng nếu chưa có gì mới.
create or replace function public.khsx_packing_feed(
  p_since timestamptz default null,
  p_date date default (now() at time zone 'Asia/Ho_Chi_Minh')::date)
returns jsonb language sql stable security definer set search_path to '' as $$
with recursive
pk as (
  select p.order_id, sum(p.quantity)::int as quantity
  from public.khsx_stage_progress p
  where p.stage = 'dong_goi' and p.work_date = p_date
  group by p.order_id having sum(p.quantity) > 0),
chain as (
  select o.id as start_id, o.id, o.source_order_id, o.production_date, 0 as depth
  from pk join public.khsx_orders o on o.id = pk.order_id and o.deleted_at is null
  union all
  select c.start_id, o.id, o.source_order_id, o.production_date, c.depth + 1
  from chain c join public.khsx_orders o on o.id = c.source_order_id and o.deleted_at is null
  where c.depth < 20),
root as (
  select distinct on (start_id) start_id, id as root_order_id, production_date as root_production_date
  from chain order by start_id, depth desc)
select jsonb_build_object(
  'cursor', (select max(received_at) from public.khsx_stage_operations where stage = 'dong_goi'),
  'rows', case when exists (select 1 from public.khsx_stage_operations
                            where stage = 'dong_goi' and (p_since is null or received_at > p_since))
    then coalesce((select jsonb_agg(jsonb_build_object(
        'order_id', o.id, 'product_code', o.product_code, 'product_name', o.product_name,
        'quantity', pk.quantity, 'root_order_id', r.root_order_id,
        'root_production_date', r.root_production_date,
        'is_warranty', o.is_warranty, 'is_ghost', o.is_ghost, 'deleted_at', o.deleted_at,
        'is_manual', o.is_manual, 'width_mm', o.width_mm, 'length_mm', o.length_mm,
        'thickness_mm', o.thickness_mm) order by o.id)
      from pk join public.khsx_orders o on o.id = pk.order_id and o.deleted_at is null
      join root r on r.start_id = o.id), '[]'::jsonb)
    else '[]'::jsonb end);
$$;

-- B. Đơn KHSX của 1 ngày sản xuất (chưa xoá).
create or replace function public.khsx_plan_orders_for_date(p_date date)
returns jsonb language sql stable security definer set search_path to '' as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'id', o.id, 'production_date', o.production_date, 'product_code', o.product_code,
  'product_name', o.product_name, 'plan_qty', o.plan_qty, 'is_ghost', o.is_ghost,
  'deleted_at', o.deleted_at, 'is_warranty', o.is_warranty, 'is_lot', o.is_lot,
  'lot_label', o.lot_label, 'is_drop', o.is_drop, 'source_order_id', o.source_order_id,
  'width_mm', o.width_mm, 'length_mm', o.length_mm, 'thickness_mm', o.thickness_mm) order by o.id), '[]'::jsonb)
from public.khsx_orders o
where o.production_date = p_date and o.deleted_at is null;
$$;

revoke all on function public.khsx_packing_feed(timestamptz, date) from public;
revoke all on function public.khsx_plan_orders_for_date(date) from public;
grant execute on function public.khsx_packing_feed(timestamptz, date) to anon, authenticated;
grant execute on function public.khsx_plan_orders_for_date(date) to anon, authenticated;
