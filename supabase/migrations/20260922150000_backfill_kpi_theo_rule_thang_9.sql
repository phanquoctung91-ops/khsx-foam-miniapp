-- Backfill 2026-09-22 (anh Tùng chốt trực tiếp): trả lại công cá nhân cho 253 tấm
-- May/Đóng gói bị ghi sản lượng mà không gắn người.
--
-- Nguyên nhân (đã vá phía client ở bản 189):
--   1. Nút "Hoàn thành" hàng loạt không truyền người khi ghi May/Đóng gói.
--   2. Nhập lẻ chỉ hỏi người khi công đoạn khép đủ, nên mọi lần nhập dở dang trôi qua.
-- Cả hai chỉ xảy ra khi Quản lý nhập hộ — nhân viên tự nhập luôn có người (server lấy
-- worker_id từ chính hồ sơ họ).
--
-- Phạm vi CHỈ từ 01/09/2026. Tháng 8 giữ nguyên (4.525 tấm còn trống), đúng như ba lần
-- backfill trước đã chốt "dữ liệu tháng 8 bỏ qua":
--   20260905020000, 20260905030000, 20260908090000.
--
-- Ánh xạ người theo ĐÚNG bảng mặc định trong app (NGUOI_MAY_DONG_GOI_MAC_DINH_THEO_TO
-- và NGUOI_DONG_GOI_MAC_DINH của index.html): May theo tổ đã Dán, Đóng gói luôn là
-- Minh Thuận. Trong DB dòng May/Đóng gói chỉ có kpi_team — đã đối chiếu toàn bộ 946
-- dòng thiếu người: kpi_team trùng 946/946 với kpi_team của dòng Dán cùng đơn cùng
-- ngày, nên dùng kpi_team là tương đương, không phải suy đoán.
--
-- Tổ 5 CỐ Ý không có người mặc định (đúng chủ đích từ trước) nên bị loại; tháng 9 thực
-- tế cũng không có dòng trống nào thuộc Tổ 5 hay kpi_team rỗng.
--
-- Điều kiện completed_by_worker_id is null làm migration idempotent: chạy lại không
-- đụng thêm dòng nào, và không bao giờ ghi đè người đã ghi đúng.

update public.khsx_stage_progress p
set completed_by_worker_id = case
      when p.stage = 'dong_goi' then 'minh_thuan'
      when p.kpi_team = 'To 1' then 'thao_vy'
      when p.kpi_team = 'To 2' then 'bao_cham'
      else 'loan_anh'   -- To 3 va To 4
    end
where p.stage in ('may','dong_goi')
  and p.work_date >= '2026-09-01'
  and p.completed_by_worker_id is null
  and p.quantity > 0
  and p.kpi_team in ('To 1','To 2','To 3','To 4');

-- Khoá chính khsx_stage_credits gồm ĐỦ 5 cột (order_id, work_date, stage, worker_id,
-- kpi_team) — khác mệnh đề 4 cột của ba backfill cũ, vì RPC v2 tách công theo từng tổ:
-- một người bộ phận có thể làm cho nhiều tổ trong cùng một ngày.
insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source,kpi_team)
select p.order_id, p.work_date, p.stage, p.completed_by_worker_id, p.quantity, 'actual', p.kpi_team
from public.khsx_stage_progress p
where p.stage in ('may','dong_goi')
  and p.work_date >= '2026-09-01'
  and p.quantity > 0
  and p.completed_by_worker_id is not null
on conflict (order_id,work_date,stage,worker_id,kpi_team) do update set quantity = excluded.quantity;
