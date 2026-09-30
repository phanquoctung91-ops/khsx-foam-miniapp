-- Sửa 30/09/2026: không tài khoản nào đọc được khsx_tasks ("permission denied for function khsx_has_permission"):
-- chính sách đọc gọi private.khsx_has_permission, mà hàm này cố ý không cấp EXECUTE cho authenticated
-- (nhận p_user tuỳ ý, cấp ra thì ai cũng dò được quyền của người khác).
-- Dùng hàm riêng không nhận tham số: chỉ trả lời "tài khoản đang đăng nhập có quyền Giao việc không".
create or replace function private.khsx_toi_co_quyen_giao_viec() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.khsx_has_permission('task_assign', (select auth.uid()))
$$;
revoke all on function private.khsx_toi_co_quyen_giao_viec() from public, anon;
grant execute on function private.khsx_toi_co_quyen_giao_viec() to authenticated;

drop policy if exists khsx_tasks_select on public.khsx_tasks;
create policy khsx_tasks_select on public.khsx_tasks for select to authenticated
  using (nguoi_nhan = (select auth.uid()) or (select private.khsx_toi_co_quyen_giao_viec()));
