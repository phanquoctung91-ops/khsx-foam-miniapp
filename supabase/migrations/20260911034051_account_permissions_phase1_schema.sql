-- Phan quyen tai khoan - GIAI DOAN 1 (chi tao cau truc du lieu, KHONG doi hanh vi cu).
-- Khong co RLS/trigger/RPC nao trong file nay gan vao bang nghiep vu cu (orders,
-- stage_progress, profiles...). App tiep tuc chay 100% bang role/canManage() nhu hien tai
-- cho toi Giai doan 4. Chua backfill du lieu quyen cho tai khoan nao trong file nay.

-- ============================================================================
-- 1) Danh muc quyen co dinh (37 quyen co the cap)
-- ============================================================================
create table public.khsx_permissions (
  permission_key text primary key,
  display_name text not null,
  group_name text not null,
  description text not null,
  sort_order int not null,
  created_at timestamptz not null default now()
);
alter table public.khsx_permissions enable row level security;
create policy khsx_permissions_read on public.khsx_permissions
  for select to authenticated using (true);
revoke insert, update, delete on public.khsx_permissions from authenticated, anon;

insert into public.khsx_permissions (permission_key, display_name, group_name, description, sort_order) values
('view_overview','Xem tổng thống kê','Tổng thống kê','Xem thống kê và chi tiết sản xuất được công bố trong dashboard (bao gồm số tổng bảo hành; xem chi tiết từng đơn bảo hành cần quyền riêng)',1),
('khsx_view_plan','Xem kế hoạch sản xuất','KHSX','Mở danh sách kế hoạch',2),
('khsx_sync_source','Đồng bộ kế hoạch từ nguồn','KHSX','Chạy đối chiếu/đồng bộ dữ liệu KHSX, giữ cơ chế bảo vệ ngày chốt và đơn có tiến độ',3),
('khsx_edit_order','Thêm, sửa thông tin đơn','KHSX','Dùng thao tác tạo/sửa đơn đang có; không bao gồm hủy hoặc sửa tiến độ',4),
('khsx_priority','Đánh dấu đơn ưu tiên','KHSX','Thay đổi cờ ưu tiên',5),
('assign_team','Gán, đổi tổ phụ trách','Phân công','Đổi tổ bằng luồng hiện có khi ngày cho phép',6),
('assign_support','Gán, hủy hỗ trợ','Phân công','Dùng luồng hỗ trợ hiện có; giữ các giới hạn khi phần hỗ trợ đã có sản lượng',7),
('order_cancel','Hủy đơn','Đơn hàng','Hủy mềm, không xóa cứng dữ liệu',8),
('order_view_cancelled','Xem đơn đã hủy','Đơn hàng','Xem danh sách và lý do',9),
('order_restore','Khôi phục đơn đã hủy','Đơn hàng','Khôi phục qua chức năng hiện có',10),
('khsx_lock_plan','Chốt kế hoạch','KHSX','Chốt đầu vào ngày',11),
('khsx_unlock_plan','Mở khóa kế hoạch','KHSX','Bỏ chốt đầu vào ngày',12),
('progress_view_all','Xem tiến độ toàn xưởng','TDSX','Xem các tổ/công đoạn ngoài phần việc của mình; không được nhập thay',13),
('progress_enter_dan','Nhập Dán','TDSX','Nhập tăng sản lượng Dán trong phạm vi tổ được giao',14),
('progress_enter_may','Nhập May','TDSX','Nhập tăng sản lượng May của mình',15),
('progress_enter_dong_goi','Nhập Đóng gói','TDSX','Nhập tăng sản lượng Đóng gói của mình',16),
('progress_enter_for_other','Nhập thay tổ/người khác','TDSX','Ghi theo tổ/người thực hiện được chọn; người nhập vẫn lưu riêng. Cần quyền nhập công đoạn tương ứng',17),
('progress_reduce','Sửa giảm sản lượng đã nhập','TDSX','Cho phép sửa giảm trong phạm vi đã được cấp, giữ giới hạn số lượng và thứ tự công đoạn',18),
('progress_lock','Chốt tiến độ','TDSX','Chốt tiến độ ngày',19),
('progress_unlock','Mở khóa tiến độ','TDSX','Bỏ chốt tiến độ ngày',20),
('progress_override_lock','Điều chỉnh ngày đã chốt','TDSX','Bổ sung quyền vượt khóa ngày cho thao tác vốn đã được cấp; không tự có quyền nhập/đổi tổ',21),
('overtime_manage','Ghi, sửa, hủy tăng ca','TDSX','Quản lý các bản ghi tăng ca theo luồng hiện có',22),
('capacity_view','Xem năng lực','Năng lực','Xem bảng và popup chi tiết Dán/May/Đóng gói (toàn xưởng, mọi tổ)',23),
('capacity_export','Xuất dữ liệu năng lực','Năng lực','Xuất tổng hợp/chi tiết theo khoảng lọc; cần quyền xem Năng lực',24),
('warranty_view','Xem bảo hành','Bảo hành','Xem số liệu/chi tiết bảo hành',25),
('warranty_import_temp','Nạp file bảo hành tạm','Bảo hành','Dùng chức năng nhập offline đang có; không tạo quyền sửa dữ liệu ở nguồn ngoài dashboard',26),
('report_export','Xuất báo cáo sản xuất','Báo cáo','Dùng các báo cáo có sẵn, chỉ xuất dữ liệu được xem',27),
('report_sign_off','Ký duyệt báo cáo','Báo cáo','Cho phép phần ký duyệt đang có; không tự có quyền sửa số liệu',28),
('payroll_view','Xem số liệu lương','Lương','Mở trang số liệu thô hiện có; không bổ sung tính lương hay xuất lương mới',29),
('hr_view','Xem danh sách tài khoản/nhân sự','Nhân sự','Xem hồ sơ cần thiết, không xem dữ liệu đăng nhập bí mật',30),
('hr_approve_new','Duyệt nhân viên mới','Nhân sự','Duyệt đăng ký nhân viên, gắn tổ/công đoạn; không được cấp quyền quản trị',31),
('hr_edit_profile','Sửa hồ sơ, phân tổ nhân sự','Nhân sự','Đổi thông tin/tổ trong phạm vi hiện có; không sửa chủ tài khoản hoặc quyền của người khác',32),
('hr_revoke_restore','Thu hồi, khôi phục tài khoản','Nhân sự','Dùng luồng hiện có, không áp dụng với tài khoản chủ',33),
('settings_backup_download','Tải gói sao lưu','Cài đặt','Tải phạm vi dữ liệu của gói sao lưu; đây có thể là toàn bộ dữ liệu, rộng hơn quyền xem từng trang',34),
('settings_backup_restore','Nạp lại gói sao lưu','Cài đặt','Dùng luồng phục hồi đang có sau xác nhận riêng; không được ghi đè quyền/chủ tài khoản từ file',35),
('settings_import_khsx_file','Nạp file KHSX','Cài đặt','Dùng nút "Nạp file KHSX" — cách nhập kế hoạch sản xuất chính thức hiện tại, ghi trực tiếp lên hệ thống',36),
('settings_edit_targets','Sửa mục tiêu, lịch làm việc quý','Cài đặt','Thay đổi mục tiêu quý và lịch quý đang có; không đổi công thức phút/tấm của bản 159',37);

-- ============================================================================
-- 2) Quyen da cap cho tung tai khoan (backfill se chen du lieu o buoc RIENG sau nay)
-- ============================================================================
create table public.khsx_account_permissions (
  user_id uuid not null,
  permission_key text not null references public.khsx_permissions(permission_key),
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);
alter table public.khsx_account_permissions enable row level security;
create policy khsx_account_permissions_self_read on public.khsx_account_permissions
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.khsx_account_permissions from authenticated, anon;

-- ============================================================================
-- 3) Chu tai khoan - KHONG PHAI checkbox, tach biet hoan toan khoi 37 quyen tren
-- ============================================================================
create table private.khsx_permission_owner (
  user_id uuid primary key
);
alter table private.khsx_permission_owner enable row level security;
revoke all on private.khsx_permission_owner from authenticated, anon, service_role;
-- "Phan Quoc Tung - Truong nhom", xac nhan bang du lieu that 2026-09-11 (khong suy tu ten hien thi)
insert into private.khsx_permission_owner(user_id) values ('7ebce211-e3b0-4195-9207-ff46506e13d6');

-- ============================================================================
-- 4) So phien ban chong 2 tab ghi de nhau
-- ============================================================================
create table private.khsx_permission_versions (
  user_id uuid primary key,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table private.khsx_permission_versions enable row level security;
revoke all on private.khsx_permission_versions from authenticated, anon, service_role;

-- ============================================================================
-- 5) Lich su cap/thu hoi
-- ============================================================================
create table private.khsx_permission_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  permission_key text not null,
  action text not null check (action in ('grant','revoke')),
  actor_user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table private.khsx_permission_audit enable row level security;
revoke all on private.khsx_permission_audit from authenticated, anon, service_role;
create index khsx_permission_audit_target_idx on private.khsx_permission_audit(target_user_id, created_at desc);

-- ============================================================================
-- 6) Ham noi bo - Giai doan 1 CHI TAO, CHUA gan vao bat ky RLS/RPC nghiep vu nao
-- ============================================================================
create function private.khsx_is_permission_owner(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.khsx_permission_owner where user_id=p_user_id);
$$;
revoke all on function private.khsx_is_permission_owner(uuid) from public,anon,authenticated,service_role;

create function private.khsx_has_permission(p_key text, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select private.khsx_is_permission_owner(p_user_id)
    or exists(select 1 from public.khsx_account_permissions where user_id=p_user_id and permission_key=p_key);
$$;
revoke all on function private.khsx_has_permission(text,uuid) from public,anon,authenticated,service_role;

-- ============================================================================
-- 7) RPC doc quyen cua 1 tai khoan - chi Tung goi duoc
-- ============================================================================
create function public.khsx_get_account_permissions(p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_keys text[]; v_version bigint;
begin
  if not private.khsx_is_permission_owner() then
    raise sqlstate '42501' using message='OWNER_REQUIRED';
  end if;
  if not exists(select 1 from public.khsx_profiles where user_id=p_target_user_id) then
    raise sqlstate '22023' using message='ACCOUNT_NOT_FOUND';
  end if;
  select coalesce(array_agg(permission_key),'{}') into v_keys
    from public.khsx_account_permissions where user_id=p_target_user_id;
  select coalesce(version,0) into v_version
    from private.khsx_permission_versions where user_id=p_target_user_id;
  return jsonb_build_object(
    'user_id',p_target_user_id,
    'is_owner',private.khsx_is_permission_owner(p_target_user_id),
    'permission_keys',to_jsonb(coalesce(v_keys,'{}'::text[])),
    'version',coalesce(v_version,0)
  );
end $$;
revoke all on function public.khsx_get_account_permissions(uuid) from public,anon,service_role;
grant execute on function public.khsx_get_account_permissions(uuid) to authenticated;

-- ============================================================================
-- 8) RPC luu tap quyen cho 1 tai khoan - chi Tung goi duoc, co khoa/audit/version
-- ============================================================================
create function public.khsx_save_account_permissions(
  p_target_user_id uuid, p_permission_keys text[], p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_current_version bigint;
  v_before text[];
  v_add text[];
  v_remove text[];
begin
  if not private.khsx_is_permission_owner(v_actor) then
    raise sqlstate '42501' using message='OWNER_REQUIRED';
  end if;
  if private.khsx_is_permission_owner(p_target_user_id) then
    raise sqlstate '42501' using message='CANNOT_EDIT_OWNER';
  end if;
  if not exists(select 1 from public.khsx_profiles where user_id=p_target_user_id and active) then
    raise sqlstate '22023' using message='ACCOUNT_NOT_FOUND_OR_INACTIVE';
  end if;
  if p_permission_keys is null or exists(
    select 1 from unnest(p_permission_keys) k
    where not exists(select 1 from public.khsx_permissions where permission_key=k)
  ) then
    raise sqlstate '22023' using message='UNKNOWN_PERMISSION_KEY';
  end if;
  -- Loai trung lap truoc khi tinh them/bo, tranh vi pham khoa chinh (user_id,permission_key)
  -- neu client lo gui trung 1 ma quyen nhieu lan.
  select coalesce(array_agg(distinct k),'{}') into p_permission_keys from unnest(p_permission_keys) k;

  insert into private.khsx_permission_versions(user_id,version) values (p_target_user_id,0)
    on conflict (user_id) do nothing;
  select version into v_current_version
    from private.khsx_permission_versions where user_id=p_target_user_id for update;
  if v_current_version <> p_expected_version then
    raise sqlstate 'PT409' using message='PERMISSION_VERSION_CONFLICT';
  end if;

  select coalesce(array_agg(permission_key),'{}') into v_before
    from public.khsx_account_permissions where user_id=p_target_user_id;
  select coalesce(array_agg(k),'{}') into v_add
    from unnest(p_permission_keys) k where k <> all(v_before);
  select coalesce(array_agg(k),'{}') into v_remove
    from unnest(v_before) k where k <> all(p_permission_keys);

  delete from public.khsx_account_permissions
    where user_id=p_target_user_id and permission_key = any(v_remove);
  insert into public.khsx_account_permissions(user_id,permission_key,granted_by)
    select p_target_user_id, k, v_actor from unnest(v_add) k;

  insert into private.khsx_permission_audit(target_user_id,permission_key,action,actor_user_id)
    select p_target_user_id, k, 'revoke', v_actor from unnest(v_remove) k;
  insert into private.khsx_permission_audit(target_user_id,permission_key,action,actor_user_id)
    select p_target_user_id, k, 'grant', v_actor from unnest(v_add) k;

  update private.khsx_permission_versions
    set version=version+1, updated_at=now() where user_id=p_target_user_id;

  return jsonb_build_object('ok',true,'added',v_add,'removed',v_remove,'version',v_current_version+1);
end $$;
revoke all on function public.khsx_save_account_permissions(uuid,text[],bigint) from public,anon,service_role;
grant execute on function public.khsx_save_account_permissions(uuid,text[],bigint) to authenticated;

notify pgrst,'reload schema';
