-- Phát hiện 2026-09-07 (báo cáo của anh Tùng): duyệt tài khoản nhân viên mới cho các tổ,
-- rồi chọn người đó để tính KPI cá nhân (May/Đóng gói) thì không được ghi nhận.
--
-- Nguyên nhân gốc (điều tra bằng agent đọc code, không đoán): bảng khsx_workers (danh mục
-- tính KPI cá nhân, chỉ áp dụng công đoạn May/Đóng gói — trả công theo đầu người, khác KPI
-- theo tổ) chỉ có 4 người được thêm tay từ lâu (loan_anh, thao_vy, bao_cham, minh_thuan).
-- Hàm duyệt tài khoản (khsx-telegram-account/index.ts:341) luôn ghi worker_id=null cho MỌI
-- tài khoản nhân viên mới, vĩnh viễn — không có bước nào tạo dòng khsx_workers tương ứng.
-- Khi Quản lý chọn nhân viên đó trong "chọn người hoàn thành", RPC khsx_apply_stage_progress_v2
-- không tìm thấy worker khớp trong danh mục nên ÂM THẦM đặt completed_by_worker_id=NULL
-- (sản lượng vẫn lưu, không báo lỗi, chỉ không tính công cho ai) — đúng loại lỗi đã từng vá
-- tay cho Loan Anh (20260905020000/030000), nhưng gốc rễ ở bước duyệt chưa từng được sửa.
--
-- Trang Nhân sự đã có sẵn cột "Tổ/công đoạn" cho nhân viên với 2 lựa chọn đặc biệt
-- "Tổ may"/"Tổ đóng gói" (unit_name='To may'/'To dong goi', index.html PROCESS_TEAM_STAGE)
-- dùng để quy định nhân viên đó tự nhập công đoạn nào — đúng khái niệm "công đoạn" cần gán,
-- chỉ chưa được nối với khsx_workers/worker_id. Đã chốt với anh Tùng: dùng LUÔN ô này, không
-- hỏi công đoạn lúc duyệt (anh tự gán sau trong Nhân sự), không thêm ô mới.
--
-- Phát hiện thêm khi tra dữ liệu thật trước khi áp migration (2026-09-07): 2 trong 4 người
-- đã có công (Bảo Chăm 95 lượt/854 tấm, Thảo Vy 91 lượt/831 tấm dưới khsx_stage_credits)
-- vừa được duyệt tài khoản Telegram thật hôm nay, trùng tên với đúng dòng khsx_workers cũ
-- của họ nhưng worker_id vẫn null (chưa ai nối tay lại). Nếu để trigger tự sinh id theo
-- user_id (UUID) như dự kiến ban đầu, công của họ từ giờ sẽ tính dưới 1 mã MỚI, tách rời
-- khỏi lịch sử cũ ('bao_cham'/'thao_vy') — mất liên tục KPI dù không mất số liệu thô. Sửa:
-- trước khi sinh id mới, ưu tiên tìm đúng người đã có sẵn trong danh mục theo tên trùng
-- khớp (và id đó đang không bị hồ sơ nhân viên nào khác nhận) để nối lại, giữ liên tục lịch
-- sử — chỉ sinh id mới (theo user_id) khi không tìm thấy ai khớp.
--
-- Sửa: trigger tự đồng bộ khsx_workers/khsx_profiles.worker_id mỗi khi hồ sơ 1 nhân viên
-- được duyệt/cập nhật — áp dụng cho MỌI đường ghi khsx_profiles (cả khsx-telegram-account
-- và khsx-admin-link-telegram), không cần sửa code 2 edge function đó.

create or replace function public.khsx_sync_worker_catalog()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_stage public.khsx_stage;
  v_matched_id text;
begin
  if new.role = 'nhan_vien' and new.active and new.unit_name in ('To may','To dong goi') then
    v_stage := case new.unit_name when 'To may' then 'may' else 'dong_goi' end;
    -- Giữ nguyên worker_id đã gán tay từ trước nếu vẫn còn hợp lệ.
    if new.worker_id is not null and not exists(select 1 from public.khsx_workers w where w.id = new.worker_id) then
      new.worker_id := null;
    end if;
    if new.worker_id is null then
      -- Chưa có liên kết: thử nối lại đúng người cũ theo tên trùng khớp (vd 4 người đã có
      -- sẵn công dưới id thủ công loan_anh/thao_vy/bao_cham/minh_thuan), miễn là id đó
      -- không bị hồ sơ nhân viên ĐANG HOẠT ĐỘNG nào khác đang giữ.
      select w.id into v_matched_id
      from public.khsx_workers w
      where pg_catalog.btrim(pg_catalog.lower(w.display_name)) = pg_catalog.btrim(pg_catalog.lower(new.display_name))
        and not exists(
          select 1 from public.khsx_profiles p
          where p.worker_id = w.id and p.user_id <> new.user_id and p.active
        )
      order by w.id limit 1;
      new.worker_id := coalesce(v_matched_id, new.user_id::text);
    end if;
    insert into public.khsx_workers(id, display_name, stage, active)
    values (new.worker_id, new.display_name, v_stage, true)
    on conflict (id) do update set display_name = excluded.display_name, stage = excluded.stage, active = true, updated_at = now();
  elsif new.worker_id is not null then
    -- Vai đổi khỏi nhân viên, tổ đổi khỏi May/Đóng gói, hoặc tài khoản bị thu hồi: ngừng cho
    -- chọn tính KPI cá nhân, KHÔNG xoá (giữ lịch sử khsx_stage_credits cũ nguyên vẹn).
    update public.khsx_workers set active = false, updated_at = now() where id = new.worker_id;
  end if;
  return new;
end;
$$;
revoke all on function public.khsx_sync_worker_catalog() from public,anon,authenticated,service_role;

drop trigger if exists khsx_profiles_sync_worker on public.khsx_profiles;
create trigger khsx_profiles_sync_worker
before insert or update on public.khsx_profiles
for each row execute function public.khsx_sync_worker_catalog();

-- Backfill 1 lần cho các tài khoản đã duyệt trước migration này: chỉ "chạm" đúng các dòng
-- liên quan để trigger ở trên tự chạy lại và đồng bộ, không viết logic riêng lần 2.
update public.khsx_profiles set updated_at = now()
where role = 'nhan_vien' and active and unit_name in ('To may','To dong goi');
