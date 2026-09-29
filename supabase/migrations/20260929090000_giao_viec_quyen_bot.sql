-- Sửa 29/09/2026: project này không tự cấp quyền bảng mới cho service_role, nên hàm khsx-gui-tin
-- báo "permission denied for table khsx_tin_nhan_cho" và tin giao việc không gửi được.
grant select, update on public.khsx_tin_nhan_cho to service_role;
grant select, update on public.khsx_tasks to service_role;
