-- Backfill 2026-09-05 (xác nhận trực tiếp với anh Tùng): 42 dòng công đoạn May
-- (03-05/09/2026, tổng 316 sản phẩm) được nhập qua chính tài khoản Quản lý
-- (Phan Quốc Tùng, user_id 7ebce211-e3b0-4195-9207-ff46506e13d6) trong lúc tài khoản
-- Loan Anh chưa dùng được — xác nhận đây là việc thật của Loan Anh (Tổ may), gán nốt
-- công cho đúng người. Vẫn KHÔNG đụng dữ liệu tháng 8 (đã chốt "bỏ qua" trước đó).

update public.khsx_stage_progress
set completed_by_worker_id='loan_anh'
where stage='may'
  and entered_by='7ebce211-e3b0-4195-9207-ff46506e13d6'
  and work_date>='2026-09-01'
  and completed_by_worker_id is null;

insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source)
select sp.order_id, sp.work_date, sp.stage, 'loan_anh', sp.quantity, 'actual'
from public.khsx_stage_progress sp
where sp.stage='may'
  and sp.entered_by='7ebce211-e3b0-4195-9207-ff46506e13d6'
  and sp.work_date>='2026-09-01'
  and sp.completed_by_worker_id='loan_anh'
on conflict (order_id,work_date,stage,worker_id) do update set quantity=excluded.quantity;
