-- Thu hồi tài khoản thì người điểm danh tương ứng không còn hiện từ NGÀY HÔM SAU (anh Tùng duyệt 04/11/2026).
-- Lịch sử giữ nguyên: ngày nào người đó có điểm danh / ghi chú thì vẫn hiện ở ngày đó (xử lý ở máy khách).
-- tai_khoan_id: nối người điểm danh với tài khoản (khsx_profiles.user_id). Không dùng khsx_profiles.worker_id vì cột đó nối sang khsx_workers.
-- an_tu_ngay: từ ngày này trở đi không hiện (trống = hiện bình thường). Thu hồi lúc nào cũng tính theo giờ Việt Nam.

alter table public.khsx_diem_danh_nguoi add column if not exists tai_khoan_id uuid references auth.users(id) on delete set null;
alter table public.khsx_diem_danh_nguoi add column if not exists an_tu_ngay date;

create or replace function private.khsx_dd_an_theo_tai_khoan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active is distinct from old.active then
    if new.active then
      update public.khsx_diem_danh_nguoi set an_tu_ngay = null where tai_khoan_id = new.user_id;
    else
      update public.khsx_diem_danh_nguoi
         set an_tu_ngay = ((coalesce(new.revoked_at, pg_catalog.now()) at time zone 'Asia/Ho_Chi_Minh')::date + 1)
       where tai_khoan_id = new.user_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function private.khsx_dd_an_theo_tai_khoan() from public, anon, authenticated;

drop trigger if exists khsx_dd_an_theo_tai_khoan on public.khsx_profiles;
create trigger khsx_dd_an_theo_tai_khoan after update of active on public.khsx_profiles
  for each row execute function private.khsx_dd_an_theo_tai_khoan();

-- Dữ liệu hiện có: Thế Quyền thu hồi 04/11 nên ẩn từ 05/11.
update public.khsx_diem_danh_nguoi
   set tai_khoan_id = '28e9f033-9bc8-43b5-8c15-e2c0308fc659', an_tu_ngay = date '2026-11-05'
 where id = '549a7824-c078-4c88-863b-4cd81193b36d' and ten = 'Nguyễn Thế Quyền';
