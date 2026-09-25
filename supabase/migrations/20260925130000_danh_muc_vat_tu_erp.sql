-- Gợi ý mã khi sửa BOM thiếu mã (anh Tùng báo 25/09/2026): trước đây chỉ gợi ý 419 vật tư đang
-- nằm trong BOM của 163 mã hàng trên app — vd túi PE ERP có 12 mã, app chỉ có TPET234.
-- Thêm sổ danh mục vật tư chép từ ERP (nhóm Nguyên vật liệu / Raw Material / Nguyên liệu thô,
-- cùng áo AN*, AL* và phôi topper PLT*), ~1.600 mã. Ô gợi ý đọc view khsx_bom_vat_tu như cũ,
-- nay view gộp cả sổ này; tên trong BOM được ưu tiên khi trùng mã.
-- Dữ liệu danh mục KHÔNG để trong repo (repo lên GitHub Pages): nạp riêng bằng file ngoài repo.
create table if not exists public.khsx_vat_tu(
  ma_vt text primary key,
  ten_vt text not null default '',
  dvt text not null default '',
  dong_bo_luc timestamptz not null default now()
);
alter table public.khsx_vat_tu enable row level security;
revoke all on public.khsx_vat_tu from anon, authenticated;
grant select on public.khsx_vat_tu to authenticated;
drop policy if exists khsx_vat_tu_doc on public.khsx_vat_tu;
create policy khsx_vat_tu_doc on public.khsx_vat_tu for select to authenticated using (true);

create or replace view public.khsx_bom_vat_tu with (security_invoker = true) as
select distinct on (ma_vt) ma_vt, ten_vt, dvt
from (
  select b.ma_vt, b.ten_vt, b.dvt, 0 as uu_tien, b.dong_bo_luc from public.khsx_bom_lines b
  union all
  select v.ma_vt, v.ten_vt, v.dvt, 1, v.dong_bo_luc from public.khsx_vat_tu v
) x
order by ma_vt, uu_tien, dong_bo_luc desc;
revoke all on public.khsx_bom_vat_tu from anon, authenticated;
grant select on public.khsx_bom_vat_tu to authenticated;
