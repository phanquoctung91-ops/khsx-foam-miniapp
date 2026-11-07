-- RPC chỉ đọc cho bot giám sát sản xuất (anh Tùng duyệt 07/11/2026): bot kiểm "mã nào đã có BOM" và tính bảng Đặt áo
-- bằng đúng mã của mini-app. CHỈ trả mã hàng + các dòng ÁO (ma_vt bắt đầu AN/AL/AV/AG hoặc tên bắt đầu "Áo"); không trả NVL khác.
-- Mã có BOM mà không có dòng áo trả một dòng giữ chỗ (stt 0, ma_vt rỗng) để bot phân biệt "chưa có BOM" với "BOM không có áo".
create or replace function public.khsx_bom_ao_guest_v1()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
with ao as (
  select ma_hang, stt, ma_vt, ten_vt, dinh_muc, dvt
  from public.khsx_bom_lines
  where ma_vt ~ '^A[NLVG]' or pg_catalog.lower(ten_vt) ~ '^\s*(áo|ao)(\s|$)'
),
co_bom as (select distinct ma_hang from public.khsx_bom_lines),
giu_cho as (
  select c.ma_hang, 0 as stt, ''::text as ma_vt, ''::text as ten_vt, 0::numeric as dinh_muc, ''::text as dvt
  from co_bom c where not exists (select 1 from ao a where a.ma_hang = c.ma_hang)
)
select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.ma_hang, x.stt), '[]'::jsonb)
from (select * from ao union all select * from giu_cho) x;
$$;
revoke all on function public.khsx_bom_ao_guest_v1() from public;
grant execute on function public.khsx_bom_ao_guest_v1() to anon, authenticated;
