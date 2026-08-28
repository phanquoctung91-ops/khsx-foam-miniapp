-- Kiểm tra read-only cho bản #116. Kết quả mong đợi tại thời điểm 28/08/2026:
-- plan=3016, completed_capped=2921, throughput=2933, warranty=70.
with roots as (
  select id,plan_qty
  from public.khsx_orders
  where deleted_at is null
    and production_date between date '2026-08-01' and date '2026-08-28'
    and not is_warranty and not is_drop and not is_manual and not is_ghost
), family as (
  select r.id root_id,r.plan_qty,o.id member_id
  from roots r
  join public.khsx_orders o
    on o.deleted_at is null and (o.id=r.id or o.source_order_id=r.id)
), completed as (
  select f.root_id,max(f.plan_qty) plan_qty,coalesce(sum(p.quantity),0) done_qty
  from family f
  left join public.khsx_stage_progress p on p.order_id=f.member_id and p.stage='dong_goi'
  group by f.root_id
)
select
  sum(plan_qty) as plan,
  sum(least(plan_qty,done_qty)) as completed_capped,
  (select coalesce(sum(quantity),0)
   from public.khsx_stage_progress p
   join public.khsx_orders o on o.id=p.order_id
   where p.stage='dong_goi'
     and p.work_date between date '2026-08-01' and date '2026-08-28'
     and o.deleted_at is null and not o.is_warranty and not o.is_ghost) as throughput,
  (select coalesce(sum(plan_qty),0)
   from public.khsx_orders
   where deleted_at is null and is_warranty
     and production_date between date '2026-08-01' and date '2026-08-28') as warranty
from completed;

-- Đơn đã xóa phải còn tombstone, không được trả về tập active.
select id,deleted_at
from public.khsx_orders
where id='r_25_08_2026_CLS15_2022_220_200_15_5_1';

-- Ngày 22/08 chỉ có đúng một bản ghi bảo hành, có chi tiết và phân tổ nguồn.
select id,plan_qty,
  source_payload->'live_row'->'bh_theo_to' as bh_theo_to,
  jsonb_array_length(coalesce(source_payload->'live_row'->'bh_chi_tiet','[]'::jsonb)) as detail_count
from public.khsx_orders
where deleted_at is null and production_date=date '2026-08-22' and is_warranty;
