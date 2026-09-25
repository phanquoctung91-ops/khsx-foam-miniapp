-- File xuất xác nhận BOM theo khung file mẫu "BOM Nem Foam" (2026-09-25, anh Tùng duyệt):
-- dòng "Thành phẩm: MÃ - Tên" cần tên thành phẩm đúng như trên ERP. Chép kèm vào sổ BOM.
alter table public.khsx_bom_lines add column if not exists ten_hang text not null default '';
