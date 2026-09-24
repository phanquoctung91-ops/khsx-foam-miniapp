-- Sửa 2026-09-24 (anh Tùng duyệt): link khách tự tải lại cả gói dữ liệu (~1,4 MB) mỗi 30 giây
-- kể cả khi không có gì thay đổi. Thêm một câu hỏi nhẹ "có gì mới không": trả về dấu vân tay
-- của đúng các bảng mà khsx_guest_dashboard_v116 đọc. Dấu không đổi thì app khách không tải
-- gói lớn nữa.
--
-- Dấu gồm số dòng + lần sửa gần nhất (+ tổng số lượng ở bảng tiến độ/công) của từng bảng:
-- thêm, xoá hay sửa dòng đều làm dấu đổi. Chỉ trả một chuỗi md5, không lộ dữ liệu nào.
-- Ba bảng không có trigger tự cập nhật updated_at (công từng người, nhân viên, tổ hỗ trợ theo
-- ngày) thì cộng thêm mã băm nội dung từng dòng, để đổi người ghi công / đổi tên / đổi tổ hỗ
-- trợ mà số dòng và số lượng giữ nguyên vẫn nhận ra.
create or replace function public.khsx_guest_version_v1()
returns text
language sql stable security definer
set search_path = ''
as $$
select pg_catalog.md5(pg_catalog.concat_ws('|',
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'')||'/'||coalesce(sum(plan_qty),0)::text from public.khsx_orders),
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'') from public.khsx_order_assignments),
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'')||'/'||coalesce(sum(pg_catalog.hashtext(to_jsonb(d)::text)),0)::text from public.khsx_daily_assignments d),
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'')||'/'||coalesce(sum(quantity),0)::text from public.khsx_stage_progress),
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'')||'/'||coalesce(sum(quantity),0)::text||'/'
     ||coalesce(sum(pg_catalog.hashtext(c.order_id||'/'||c.work_date::text||'/'||c.stage::text||'/'||coalesce(c.worker_id,'')
        ||'/'||c.quantity::text||'/'||coalesce(c.kpi_team::text,''))),0)::text from public.khsx_stage_credits c),
  (select count(*)::text||'/'||coalesce(max(version)::text,'') from public.khsx_plan_snapshots),
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'') from public.khsx_day_locks),
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'') from public.khsx_quarter_targets),
  (select count(*)::text||'/'||coalesce(max(updated_at)::text,'')||'/'||coalesce(sum(pg_catalog.hashtext(to_jsonb(w)::text)),0)::text from public.khsx_workers w)
));
$$;
revoke all on function public.khsx_guest_version_v1() from public;
grant execute on function public.khsx_guest_version_v1() to anon, authenticated;
