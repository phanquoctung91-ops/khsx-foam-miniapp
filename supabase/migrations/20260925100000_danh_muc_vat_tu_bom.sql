-- Gợi ý mã vật tư khi sửa BOM (2026-09-25, anh Tùng duyệt): danh sách vật tư khác nhau đang có
-- trong các BOM (~350 mã). App chỉ đọc danh sách này một lần khi mở bảng vật tư, thay vì đọc
-- cả 1.786 dòng BOM rồi tự lọc trùng.
-- security_invoker: người đọc phải qua đúng quyền đọc của bảng khsx_bom_lines.
create or replace view public.khsx_bom_vat_tu with (security_invoker = true) as
select distinct on (ma_vt) ma_vt, ten_vt, dvt
from public.khsx_bom_lines
order by ma_vt, dong_bo_luc desc;
revoke all on public.khsx_bom_vat_tu from anon, authenticated;
grant select on public.khsx_bom_vat_tu to authenticated;
