-- Phan quyen tai khoan - bo sung 3 quyen bi sot khoi danh muc 37 quyen ban dau,
-- phat hien khi anh Tung tu tay test man hinh Phan quyen tai khoan va thay
-- "Bang dat phoi" khong co dong nao tuong ung. Ra soat lai toan bo 35 cho goi
-- canManage() + 29 cho goi canManage2() trong code de tim het cac cho con thieu,
-- khong chi sua rieng truong hop nay.
--
-- Ca 3 deu la chuc nang co that dang chay (khong phai tao moi), hien dang khoa
-- cung theo only-manager/only-manager2 trong index.html:
--   - phoiBtn / phoiModal ("Bang dat phoi")            -> chi Quan ly
--   - bulkCompleteBtn ("Hoan thanh hang loat")          -> Quan ly + Quan ly 2
--   - customerViewLinkBtn ("Link khach xem")            -> chi Quan ly
--
-- Khong thay doi hanh vi gi (Giai doan 4 - enforcement - chua lam), day chi la
-- bo sung danh muc de Tung tick duoc qua man hinh Phan quyen tai khoan.

insert into public.khsx_permissions (permission_key, display_name, group_name, description, sort_order) values
('phoi_board_use','Dùng bảng đặt phôi','KHSX','Mở và dùng Bảng đặt phôi (🧱)',38),
('progress_bulk_complete','Hoàn thành hàng loạt','TDSX','Điền nhanh Dán → May → Đóng gói cho nhiều đơn cùng lúc trong 1 ngày',39),
('settings_guest_link','Lấy link khách xem','Cài đặt','Sao chép link chỉ xem dành cho khách (chỉ đọc, không sửa được gì)',40)
on conflict (permission_key) do nothing;
