-- Phan quyen tai khoan - GIAI DOAN 3 (backfill): gan quyen hieu luc hien tai cho
-- 9 tai khoan dang hoat dong (ngoai Tung, la chu tai khoan mac dinh co du 37 quyen).
-- Da doi chieu qua code that (canManage/canManage2/coQuyenNhapCongDoan/tab class...)
-- va duoc anh Tung xac nhan 2 diem chinh sua truc tiep (Le Huu Phuoc: khong co
-- 'order_cancel', co 'progress_enter_for_other'). Cac dong con lai la du doan theo
-- quy tac chung, se sua lai tu do qua man hinh Phan quyen tai khoan (Giai doan 4).
--
-- Truoc khi chay migration nay, 3 tai khoan dung chung theo to khong con
-- telegram_user_id va chua tung dang nhap lai sau luc tao (Tổ 4, Tổ dán 2, Tổ dán 3)
-- da duoc anh Tung xac nhan thu hoi mem (active=false) do khong con dung.
--
-- Chay bang service_role (bo qua RLS/kiem tra owner cua RPC quan tri), vi day la
-- migration ha tang chay 1 lan, khong phai thao tac tu giao dien.

do $$
declare
  v_phuoc uuid := '5c7fbd28-0bff-47da-9d25-9ecccce68e5b'; -- Le Huu Phuoc, quan_ly_2
begin
  -- Quan ly 2: 24 quyen (khong bao gom Dong bo KHSX, Chot/Mo khoa KHSX, Dieu chinh
  -- ngay da chot, Xuat/Ky duyet bao cao, Sua ho so & Thu hoi tai khoan, toan bo Cai dat)
  insert into public.khsx_account_permissions (user_id, permission_key, granted_by)
  select v_phuoc, k, v_phuoc from unnest(array[
    'view_overview','khsx_view_plan','khsx_edit_order','khsx_priority','assign_team','assign_support',
    'order_view_cancelled','order_restore','progress_view_all','progress_enter_dan','progress_enter_may',
    'progress_enter_dong_goi','progress_enter_for_other','progress_reduce','progress_lock','progress_unlock',
    'overtime_manage','capacity_view','capacity_export','warranty_view','warranty_import_temp',
    'payroll_view','hr_view','hr_approve_new'
  ]) as k
  on conflict (user_id, permission_key) do nothing;

  insert into private.khsx_permission_versions(user_id, version)
  values (v_phuoc, (select count(*) from public.khsx_account_permissions where user_id=v_phuoc))
  on conflict (user_id) do update set version=excluded.version, updated_at=now();

  -- 8 nhan vien: dung 1 quyen nhap cong doan theo to/cong doan dang gan trong ho so
  insert into public.khsx_account_permissions (user_id, permission_key, granted_by) values
    ('a193492f-5cb8-4737-87df-e83c943cbd75','progress_enter_may',v_phuoc),        -- Bao Cham, To may
    ('88c8d03b-2ac8-4755-8753-a81e60ff36af','progress_enter_dan',v_phuoc),        -- Duy Khuong, To 3
    ('b5db2e3e-186f-445e-bfe0-88f5bea47cf2','progress_enter_may',v_phuoc),        -- Loan Anh, To may
    ('da1bfeb6-0720-40fb-8432-ef42f51a3346','progress_enter_dan',v_phuoc),        -- Minh Phuc, To 4
    ('73402bee-7737-449f-b6bd-e07b287c4b8a','progress_enter_dong_goi',v_phuoc),   -- Minh Thuan, To dong goi
    ('44e73b08-b427-4874-b151-0d0935f354d1','progress_enter_may',v_phuoc),        -- Thao Vy, To may
    ('28e9f033-9bc8-43b5-8c15-e2c0308fc659','progress_enter_dan',v_phuoc),        -- The Quyen, To 1
    ('0f5e59a9-105d-4ea8-b9f3-30248c0df62f','progress_enter_dan',v_phuoc)         -- Van Thao, To 2
  on conflict (user_id, permission_key) do nothing;

  insert into private.khsx_permission_versions(user_id, version)
  select user_id, 1 from (values
    ('a193492f-5cb8-4737-87df-e83c943cbd75'::uuid),('88c8d03b-2ac8-4755-8753-a81e60ff36af'::uuid),
    ('b5db2e3e-186f-445e-bfe0-88f5bea47cf2'::uuid),('da1bfeb6-0720-40fb-8432-ef42f51a3346'::uuid),
    ('73402bee-7737-449f-b6bd-e07b287c4b8a'::uuid),('44e73b08-b427-4874-b151-0d0935f354d1'::uuid),
    ('28e9f033-9bc8-43b5-8c15-e2c0308fc659'::uuid),('0f5e59a9-105d-4ea8-b9f3-30248c0df62f'::uuid)
  ) as t(user_id)
  on conflict (user_id) do nothing;
end $$;

-- 3 tai khoan dung chung theo to, khong con telegram_user_id, chua dang nhap lai
-- sau luc tao (22/08/2026) - anh Tung xac nhan thu hoi mem, khong con du lieu nao
-- tham chieu toi (da doi chieu rong khap truoc khi thu hoi).
update public.khsx_profiles
set active=false, revoked_by='7ebce211-e3b0-4195-9207-ff46506e13d6', revoked_at=now()
where user_id in (
  '8e4d4dd0-ab9a-41c7-b4fd-752ea5d3b515', -- "Tổ dán 2"
  'f6379238-0e48-47ce-bb28-26e404ffdaf3', -- "Tổ dán 3"
  '32643491-325b-4bbb-bb28-3b11ce84bdeb'  -- "Tổ 4"
) and active = true;
