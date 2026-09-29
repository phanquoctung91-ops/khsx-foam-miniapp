-- Bảng đặt áo có quyền riêng (anh Tùng chốt 29/09/2026: "phôi ra phôi, áo ra áo").
-- Trước đây nút Bảng đặt áo mượn quyền phoi_board_use. Người đang có quyền phôi được cấp luôn quyền áo
-- (anh duyệt: Bảo Phương, Lê Hữu Phước), để không ai mất bảng áo đang dùng.
insert into public.khsx_permissions(permission_key, display_name, group_name, description, sort_order)
values ('ao_board_use', 'Dùng bảng đặt áo', 'KHSX', 'Mở và dùng Bảng đặt áo (👕)', 44)
on conflict (permission_key) do nothing;

insert into public.khsx_account_permissions(user_id, permission_key, granted_by)
select a.user_id, 'ao_board_use', a.granted_by
from public.khsx_account_permissions a
where a.permission_key = 'phoi_board_use'
on conflict do nothing;
