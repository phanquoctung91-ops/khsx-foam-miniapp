-- Backfill 2026-09-05: hồ sơ Loan Anh (nhân viên, Tổ may) chưa từng được gán worker_id
-- trong khsx_profiles nên số cô nhập vẫn lưu bình thường (khsx_stage_progress) nhưng
-- không tính công cá nhân (không tạo khsx_stage_credits). Danh mục khsx_workers đã có
-- sẵn đúng người (id='loan_anh', stage='may', active=true) — chỉ cần liên kết.
--
-- Phạm vi CHỈ áp dụng từ 01/09/2026, theo đúng yêu cầu anh Tùng ("dữ liệu tháng 8 bỏ
-- qua"). CHỈ backfill 4 dòng do CHÍNH tài khoản Loan Anh nhập (user_id
-- b5db2e3e-186f-445e-bfe0-88f5bea47cf2), KHÔNG đụng tới 42 dòng công đoạn May do tài
-- khoản Quản lý (Phan Quốc Tùng) nhập trong cùng kỳ — đang chờ xác nhận riêng đó có
-- phải việc thật của Loan Anh hay không trước khi backfill tiếp.

update public.khsx_profiles
set worker_id='loan_anh'
where user_id='b5db2e3e-186f-445e-bfe0-88f5bea47cf2';

update public.khsx_stage_progress
set completed_by_worker_id='loan_anh'
where stage='may'
  and entered_by='b5db2e3e-186f-445e-bfe0-88f5bea47cf2'
  and work_date>='2026-09-01'
  and completed_by_worker_id is null;

insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source)
select sp.order_id, sp.work_date, sp.stage, 'loan_anh', sp.quantity, 'actual'
from public.khsx_stage_progress sp
where sp.stage='may'
  and sp.entered_by='b5db2e3e-186f-445e-bfe0-88f5bea47cf2'
  and sp.work_date>='2026-09-01'
  and sp.completed_by_worker_id='loan_anh'
on conflict (order_id,work_date,stage,worker_id) do update set quantity=excluded.quantity;
