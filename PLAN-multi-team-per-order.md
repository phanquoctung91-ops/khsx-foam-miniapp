# Tick nhiều tổ / 1 đơn — plan (bản thảo, CHƯA CODE)

Đã chốt với anh Tùng:
1. Mỗi tổ được gán tự nhập số của mình (không phải 1 tổ chính nhập hộ). Tổng lũy kế các tổ không vượt KH đầu vào (KH không đổi).
2. Bất kỳ tổ nào trong danh sách gán cho đơn đó cũng được nhập tiến độ (không chỉ tổ "chính").
3. Cơ chế "tổ hỗ trợ" hiện có (tách đơn phụ riêng) — **gộp bỏ**, thay bằng tick nhiều tổ.

## Đánh giá mức độ nghiêm trọng (đọc kỹ trước khi quyết làm)

Đây **không phải đổi 1 dropdown thành checkbox**. Đây là đổi **đơn vị nhỏ nhất của dữ liệu tiến độ** từ `(đơn, ngày, công đoạn)` → `(đơn, ngày, công đoạn, TỔ)`. Lý do: yêu cầu #1 (mỗi tổ tự nhập số riêng, cộng dồn không vượt KH) nghĩa là 1 ô "Dán ngày X của đơn Y" giờ có THỂ NHIỀU giá trị (1 giá trị/tổ), không còn là 1 số nữa.

Cái này khác hẳn việc đổi `plan_team`/`current_team` (bảng phân công) — 2 cột đó chỉ là "ai phụ trách", còn bảng `khsx_stage_progress` (số liệu THẬT) hiện có **unique constraint `(order_id, work_date, stage)`** — 1 dòng duy nhất. Phải đổi thành `(order_id, work_date, stage, team_name)`.

**Vì sao đây là việc nặng nhất từ đầu dự án tới giờ** (kể cả so với toàn bộ gói phân quyền): số liệu công đoạn (`khsx_stage_progress`) là bảng NGUỒN mà gần như mọi thứ khác trong app tính lại từ đó. Đổi granularity của nó kéo theo dây chuyền:

### Chỗ phải sửa (đã rà, chưa chắc đủ 100%)

**Server (Supabase):**
- `khsx_stage_progress`: đổi unique key, thêm cột `team_name`.
- `khsx_stage_operations` (audit/chống trùng thao tác): cần biết đang ghi cho tổ nào để tính đúng "số hiện có" khi nhập.
- `khsx_stage_credits` (KPI cá nhân theo worker): đã keyed theo worker_id — cần xác minh có bị ảnh hưởng không (nhiều khả năng KHÔNG, vì worker luôn thuộc 1 tổ).
- `khsx_apply_stage_progress_v2`: đổi `ORDER_TEAM_FORBIDDEN` từ so sánh bằng (`=`) sang "thuộc danh sách tổ được gán" (`IN`); đổi toàn bộ logic tính `PLAN_LIMIT_EXCEEDED`/`CHAIN_LIMIT_EXCEEDED` từ "1 số" sang "tổng nhiều tổ cộng lại"; đổi `on conflict(order_id,work_date,stage)` → thêm `team_name`.
- `khsx_order_assignments` (`plan_team`/`current_team`, enum scalar): thay bằng bảng liên kết nhiều-nhiều mới, ví dụ `khsx_order_team_assignments(order_id, team_name, assigned_by, assigned_at)`.
- `khsx_assign_support_v1`/`khsx_assign_support_impl`: bỏ (thay bằng cơ chế tick tổ mới), hoặc giữ RPC nhưng đổi hoàn toàn bên trong.
- `khsx_save_order_assignment_v1`/`impl`: đổi tham số từ 1 tổ sang danh sách tổ.
- RLS/RPC đọc guest dashboard (`khsx_guest_dashboard_v116`) nếu có trả về tổ phụ trách.

**Client (`index.html`) — cấu trúc dữ liệu cục bộ:**
- `assignments[orderId].stage_by_date[ngay] = {dan, may, dong_goi, ...}` — hiện `dan`/`may`/`dong_goi` là **1 số**. Phải đổi thành theo-tổ (map `{TổA: 5, TổB: 3}`), kéo theo MỌI hàm đọc `entry.dan` như 1 số phải sửa: `recordStagePatch`, `tongCongDoan`, `damBaoLichSuCongDoan`, hàng đợi offline (`supabaseStageOutbox`), overlay đồng bộ, hàm Hoàn thành hàng loạt, v.v.
- `assignments[orderId].to` (1 tổ) → danh sách tổ.
- `js/khsx-capacity-core.js` `teamReport` — lõi tính năng lực/KPI, cộng dồn vào đúng 1 `rows[team]`/ngày. Phải viết lại để 1 đơn đóng góp vào NHIỀU `rows[team]` cùng lúc, không nhầm giữa "tổ chính" và "tổ hỗ trợ" như hiện tại.
- `toKpiKhiNhapCongDoan`, `toPhuTrachTheoNgay`, `toPhuTrachCongDoanTheoNgay`, `toThucHienCongDoanNgay` — toàn bộ trả về 1 string tổ, phải đổi kiểu trả về/cách gọi.
- UI: 4 chỗ dropdown tổ (kế hoạch tuần, tiến độ sản xuất, đơn tách/hỗ trợ, hỗ trợ theo ngày) → tick multi-select; card/badge hiển thị tổ (hiện in text 1 tổ) → hiển thị danh sách.
- Toàn bộ nơi hiển thị/tính theo tổ ở tab Tổng thống kê, Năng lực, Xuất báo cáo, Số liệu lương (nếu tính theo tổ) — cần rà lại xem có giả định 1-tổ nào ăn theo `teamReport` không.
- `describeSpinoff` và toàn bộ luồng "đơn tách" hiện tại (nếu bỏ cơ chế hỗ trợ cũ) — cần biết có đơn nào ĐANG có `is_support_split` để xử lý dữ liệu cũ.

**Dữ liệu cũ (migration/backfill):** mọi đơn đang có `current_team`/`plan_team` phải convert sang "1 dòng trong bảng liên kết mới" và mọi dòng `khsx_stage_progress` cũ phải gán `team_name` = tổ hiện có (suy ra từ `current_team` tại thời điểm đó) — KHÔNG được để dữ liệu lịch sử biến thành NULL/mồ côi.

## Rủi ro lớn nhất

Đây là bảng **đang ghi liên tục mỗi ngày** (worker nhập số hàng chục lần/ngày) và là nguồn của TOÀN BỘ báo cáo/KPI/lương. Sai 1 chỗ trong dây chuyền trên = sai số liệu thật, sai lương, hoặc mất dữ liệu — không phải lỗi UI vô hại như phần phân quyền vừa làm.

## Đề xuất cách làm (không làm 1 lượt)

1. **Prototype/xác minh khép kín trước** — không viết migration thật ngay. Dựng 1 bản sao schema (hoặc nhánh riêng), thử đổi `khsx_stage_progress` + viết lại `khsx_apply_stage_progress_v2` cho ĐÚNG 1 đơn mẫu, kiểm chứng logic `PLAN_LIMIT`/`CHAIN_LIMIT` cộng-nhiều-tổ chạy đúng trước khi đụng gì khác.
2. **Giai đoạn A — Schema + backfill** (giống cách làm phân quyền): thêm bảng/cột mới, backfill dữ liệu cũ, KHÔNG đổi hành vi ghi hiện tại (song song, chưa bật).
3. **Giai đoạn B — RPC nhập tiến độ**: đổi `khsx_apply_stage_progress_v2` theo tổ, test kỹ bằng transaction-rollback với dữ liệu thật (như đã làm ở Đợt 4.2/4.3) trước khi áp thật.
4. **Giai đoạn C — Lõi năng lực/KPI** (`khsx-capacity-core.js`): viết lại `teamReport`, test riêng bằng dữ liệu thật đối chiếu số cũ trước/sau (không được lệch số cho các đơn 1-tổ hiện tại).
5. **Giai đoạn D — Client cấu trúc dữ liệu + UI tick nhiều tổ**: đổi `stage_by_date`, dropdown → tick, đồng bộ/outbox.
6. **Giai đoạn E — Bỏ cơ chế tổ hỗ trợ cũ**, dọn code chết, xử lý nốt các đơn tách còn tồn đọng.
7. Mỗi giai đoạn: trình tóm tắt riêng, test bằng 3 loại tài khoản thật, theo dõi thực tế trước khi qua giai đoạn sau — không dồn nhiều giai đoạn 1 buổi.

## Đã chốt với anh Tùng (2026-09-12)

1. **Đơn đã tách sẵn (tổ hỗ trợ cũ, `spinoff_id`)**: giữ nguyên, KHÔNG gộp lại. Chỉ đơn/lần gán MỚI từ nay dùng tick nhiều tổ, thay thế hoàn toàn luồng "gán tổ hỗ trợ" (RPC `khsx_assign_support_v1`) cho việc gán mới — không viết migration gộp dữ liệu lịch sử, không đụng đơn tách cũ.
2. **Bỏ phân biệt `plan_team`/`current_team`**: chỉ còn 1 danh sách tổ được gán cho đơn (không còn khái niệm "dự kiến" khác "đang làm").
3. **Làm nhiều giai đoạn**, mỗi giai đoạn trình riêng, duyệt xong mới qua giai đoạn sau — đúng như plan gốc.
