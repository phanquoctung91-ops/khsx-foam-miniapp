-- Giờ công theo tổ theo ngày cho khối "Năng suất theo giờ công" ở tab Năng lực (anh Tùng duyệt 30/10/2026, cả chế độ khách xem được).
-- Chỉ trả số tổng hợp theo (ngày, nhóm): số người, số buổi sáng, số buổi chiều, tổng giờ tăng ca. Không có tên người, chức vụ, ghi chú.
-- Nhóm: 6 tổ (Tổ dán 1-4, Tổ may, Tổ đóng gói); mọi người còn lại (Phụ kho, Hỗ trợ, Thủ kho, Tổ trưởng, Trưởng nhóm, chưa gắn tổ)
-- gộp thành "Ngoài 6 tổ" để không lộ giờ riêng của từng người. Giờ công tính ở app: sáng 4,25 giờ, chiều 3,75 giờ, cộng tăng ca.
create or replace function public.khsx_gio_cong_theo_to_v1(p_tu date, p_den date)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'ngay', t.ngay, 'nhom', t.nhom, 'nguoi', t.nguoi, 'sang', t.sang, 'chieu', t.chieu, 'tang_ca', t.tang_ca
    ) order by t.ngay, t.nhom), '[]'::jsonb)
  from (
    select d.ngay,
      case when n.to_lam in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ may','Tổ đóng gói') then n.to_lam else 'Ngoài 6 tổ' end as nhom,
      count(*)::int as nguoi,
      (count(*) filter (where d.sang))::int as sang,
      (count(*) filter (where d.chieu))::int as chieu,
      coalesce(sum(d.tang_ca), 0)::int as tang_ca
    from public.khsx_diem_danh d
    join public.khsx_diem_danh_nguoi n on n.id = d.nguoi_id
    where p_tu is not null and p_den is not null
      and d.ngay between greatest(p_tu, p_den - 400) and least(p_den, (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh')::date)
    group by d.ngay, 2
  ) t;
$$;
revoke all on function public.khsx_gio_cong_theo_to_v1(date, date) from public;
grant execute on function public.khsx_gio_cong_theo_to_v1(date, date) to anon, authenticated;
