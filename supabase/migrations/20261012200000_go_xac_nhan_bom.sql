-- Gỡ "Xác nhận BOM" (anh Tùng chốt 12/10/2026): bỏ tab BOM, quyền bom_confirm, bảng xác nhận và 2 hàm.
-- GIỮ bảng BOM chuẩn khsx_bom_lines / khsx_bom_vat_tu (Bảng đặt áo và cảnh báo "chưa có BOM" vẫn dùng).
delete from public.khsx_account_permissions where permission_key = 'bom_confirm';
delete from public.khsx_permissions where permission_key = 'bom_confirm';
drop function if exists public.khsx_confirm_bom_v1(text, text, jsonb, text);
drop function if exists public.khsx_reopen_bom_v1(text);
drop table if exists public.khsx_bom_confirmations;   -- chính sách đọc đi theo bảng
