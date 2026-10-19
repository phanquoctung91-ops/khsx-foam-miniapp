-- Gỡ chức năng "Ghi nhận OT" ở tab Tiến độ (anh Tùng chốt 19/10/2026).
-- Lý do: bảng khsx_overtime_records chưa từng có dòng nào kể từ khi tạo; tăng ca đang dùng thật nằm ở Điểm danh (khsx_diem_danh.tang_ca).
-- App bản 247 không còn đọc/ghi bảng này. Chính sách (policy) và trigger của bảng mất theo bảng.
-- Quyền overtime_manage ("Ghi, sửa, hủy tăng ca") không còn gắn vào đâu: xóa khỏi danh sách quyền và gỡ khỏi tài khoản đang được cấp.
delete from public.khsx_account_permissions where permission_key = 'overtime_manage';
delete from public.khsx_permissions where permission_key = 'overtime_manage';
drop table if exists public.khsx_overtime_records;
