-- Sửa 05/10/2026: không tài khoản nào đọc được danh sách điểm danh / sữa ("permission denied for function khsx_has_permission").
-- Chính sách đọc của 3 bảng điểm danh gọi thẳng private.khsx_has_permission, hàm này cố ý không cấp EXECUTE cho authenticated
-- (lỗi giống khsx_tasks 30/09). Dùng hàm riêng không nhận tham số: chỉ trả lời "tài khoản đang đăng nhập có quyền X không".
create or replace function private.khsx_toi_co_quyen_diem_danh() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.khsx_has_permission('diem_danh', (select auth.uid()))
$$;
create or replace function private.khsx_toi_co_quyen_phat_sua() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.khsx_has_permission('phat_sua', (select auth.uid()))
$$;
revoke all on function private.khsx_toi_co_quyen_diem_danh(), private.khsx_toi_co_quyen_phat_sua() from public, anon;
grant execute on function private.khsx_toi_co_quyen_diem_danh(), private.khsx_toi_co_quyen_phat_sua() to authenticated;

drop policy if exists khsx_diem_danh_nguoi_select on public.khsx_diem_danh_nguoi;
create policy khsx_diem_danh_nguoi_select on public.khsx_diem_danh_nguoi for select to authenticated
  using ((select private.khsx_toi_co_quyen_diem_danh()) or (select private.khsx_toi_co_quyen_phat_sua()));
drop policy if exists khsx_diem_danh_select on public.khsx_diem_danh;
create policy khsx_diem_danh_select on public.khsx_diem_danh for select to authenticated
  using ((select private.khsx_toi_co_quyen_diem_danh()) or (select private.khsx_toi_co_quyen_phat_sua()));
drop policy if exists khsx_phat_sua_select on public.khsx_phat_sua;
create policy khsx_phat_sua_select on public.khsx_phat_sua for select to authenticated
  using ((select private.khsx_toi_co_quyen_diem_danh()) or (select private.khsx_toi_co_quyen_phat_sua()));
