-- Sửa 2026-09-23: đơn LAEZ15-8 ngày 19/09/2026 cứ trôi sang ngày mới với nhãn
-- "Đơn hàng rớt · Trễ 4 ngày" dù hàng đã đóng gói xong ngày 21/09.
--
-- Chuyện đã xảy ra: file KHSX nguồn đổi trong lúc đang sản xuất, app tách đơn ba đời
-- liên tiếp, mỗi lần chép nguyên lịch sử Dán 5 / May 5 sang đơn mới:
--   r_19_09_2026_LAEZ15_8_180_200_15_5_1  (đơn gốc từ file, KH 5)   -> còn sống
--     -> m1789892326592akbsy   (tách 20/09)                          -> đã hủy 20/09
--        -> m1789893553541rgrs1 (tách 20/09)                         -> đã hủy 21/09
--           -> m1789951626518nlygq (tách 21/09, đóng gói đủ 5)       -> còn sống
-- Hai đơn ở giữa bị hủy nên đứt dây nối giữa đơn gốc và đơn cuối. Đơn gốc mất luôn
-- current_team, thành đơn mồ côi: getOrderStatus() thấy to = null nên trả 'rot'.
--
-- Hậu quả thứ hai: đơn gốc và đơn cuối cùng giữ Dán 5 / May 5 ngày 19/09, nên sản lượng
-- Dán và May ngày đó bị đếm hai lần (106 thay vì 101), và Bảo Chăm được tính 10 tấm May
-- cho 5 tấm làm thật.
--
-- Cách sửa: nối lại dây (spinoff_order_id) và trả current_team về đúng tổ kế hoạch — đơn
-- gốc chuyển sang trạng thái "Hoàn thành một phần", hết trôi, kế hoạch 5 tấm vẫn giữ
-- nguyên trong thống kê. Sau đó xoá bản sao tiến độ ngày 19/09 ở ĐƠN GỐC, giữ bản ở đơn
-- cuối vì chỉ đơn cuối mới có đủ chuỗi Dán -> May -> Đóng gói.
--
-- Chỉ đụng đúng một đơn. Mệnh đề where làm migration chạy lại không đổi gì thêm.

update public.khsx_order_assignments
set current_team = coalesce(current_team, plan_team),
    spinoff_order_id = 'm1789951626518nlygq'
where order_id = 'r_19_09_2026_LAEZ15_8_180_200_15_5_1'
  and spinoff_order_id is null;

delete from public.khsx_stage_credits
where order_id = 'r_19_09_2026_LAEZ15_8_180_200_15_5_1'
  and work_date = '2026-09-19';

delete from public.khsx_stage_progress
where order_id = 'r_19_09_2026_LAEZ15_8_180_200_15_5_1'
  and work_date = '2026-09-19';
