-- Backfill 2026-09-08: anh Tùng báo ghi nhận năng lực May ngày 07/09 cho Thảo Vy/Bảo
-- Chăm nhưng "Số liệu lương" không thấy hiện — tra dữ liệu thật xác nhận đây là hậu quả
-- còn sót của đúng lỗi Việc 8 đã sửa (migration 20260907120000), không phải lỗi mới.
--
-- Toàn bộ 8 dòng khsx_stage_progress công đoạn May ngày 07/09 (ngoài phần Loan Anh) có
-- completed_by_worker_id=NULL — sản lượng vẫn lưu đủ, chỉ thiếu gắn người — vì được ghi
-- lúc trước ~09:38 UTC (~16:38 giờ VN) ngày 07/09, TRƯỚC khi migration Việc 8 áp dụng
-- (tối 07/09). Lúc đó Thảo Vy/Bảo Chăm chưa có worker_id hợp lệ nên mọi lượt chọn tên họ
-- trong "chọn người hoàn thành" đều bị RPC âm thầm bỏ qua phần gắn người — đúng kiểu lỗi
-- đã vá cho Loan Anh (20260905020000_backfill_loan_anh_may_credit_sep.sql).
--
-- Cả 8 dòng đều do 1 tài khoản Quản lý nhập hộ (entered_by giống nhau) nên không tách
-- được theo entered_by như bản vá Loan Anh — anh Tùng xác nhận trực tiếp: đơn của Tổ 1
-- là Thảo Vy may, đơn của Tổ 2 là Bảo Chăm may. Tra kpi_team của 8 dòng khớp sạch làm 2
-- nhóm (Tổ 1: 4 đơn/44 tấm, Tổ 2: 4 đơn/38 tấm) — dùng kpi_team để tách thay vì entered_by.

update public.khsx_stage_progress
set completed_by_worker_id='thao_vy'
where stage='may' and work_date='2026-09-07' and kpi_team='To 1' and completed_by_worker_id is null;

update public.khsx_stage_progress
set completed_by_worker_id='bao_cham'
where stage='may' and work_date='2026-09-07' and kpi_team='To 2' and completed_by_worker_id is null;

insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source)
select order_id, work_date, stage, completed_by_worker_id, quantity, 'actual'
from public.khsx_stage_progress
where stage='may' and work_date='2026-09-07' and completed_by_worker_id in ('thao_vy','bao_cham')
on conflict (order_id,work_date,stage,worker_id) do update set quantity=excluded.quantity;
