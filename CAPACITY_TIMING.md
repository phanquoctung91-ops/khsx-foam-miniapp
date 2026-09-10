# Năng lực theo kỳ và chi tiết thời gian

Phạm vi đã được Tùng duyệt trong phiên này. Nền code: bản 158, commit `d341a1d`. Bản phát hành 159 gồm các thay đổi dưới đây; phần Phân quyền tài khoản tách riêng.

## Quy tắc hiển thị

- Hỗ trợ và Bảo hành của các bảng Năng lực theo bộ lọc ngày. Chỉ KPI tổng giữ lũy kế lịch sử. Hỗ trợ/Bảo hành không cộng vào tỷ lệ hoàn thành kế hoạch.
- Nút Chi tiết năng lực ở cuối dòng tổ/người, mở popup. Không thêm bảng ở màn hình chính.
- Dán: phút làm việc theo từng đơn/phần việc, bắt đầu theo quy tắc xếp hàng, kết thúc theo giờ nhập sản lượng. Lọc dòng nệm, kích thước, độ dày trong popup.
- Đầu ngày Dán từ 07:00 nếu đã có việc. Việc tiếp theo nối sau việc trước; nhận thêm khi rảnh thì bắt đầu khi nhận. Hỗ trợ: tổ gốc chốt tại lần nhập phần mình làm, không cộng thời gian chờ quản lý gán tổ nhận.
- Chỉ phần Dán chưa xong mới chuyển thời gian Dán sang ngày sau; May/Đóng gói còn rớt không kéo dài Dán.
- May/Đóng gói: bình quân theo ca = tổng phút lịch / tổng tấm hoàn thành, gồm sản xuất và bảo hành theo ngày thực hiện. Giữ ngày làm việc không có sản lượng; không trừ vắng/chờ hàng.
- Lịch Việt Nam thứ Hai–thứ Bảy: 07:00–09:00, 09:15–11:30, 13:00–15:00, 15:15–17:00 = 480 phút. Hôm nay tính phút đã trôi qua, không tính ngày tương lai. Chưa có lịch tăng ca/nghỉ lễ; sản lượng Chủ nhật vẫn hiện nhưng chưa tính bình quân cả khoảng đó.
- Thiếu tên không phân bổ đoán. Thiếu mốc Dán, sửa giảm số, đổi/hủy hỗ trợ hoặc sửa kế hoạch sau khi làm, nhiều đơn ghi đồng thời: hiện lý do cần kiểm tra, không ép thành một tốc độ.

## Xuất Excel

- Nút ngoài bảng: 6 sheet gồm Tổ Dán, May, Đóng gói, chi tiết Dán, ca May/Đóng gói và sản lượng đối chiếu. Giữ các chỉ số tổng hợp cũ, thêm chỉ số thời gian.
- Nút trong popup: chỉ tổ/người đang chọn; Dán giữ thêm bộ lọc dòng/size/độ dày. Có sheet tổng hợp và chi tiết.
- Ghi khoảng ngày, bộ lọc, thời điểm xuất và thời điểm tính số liệu riêng. Mốc giờ là ô ngày giờ Excel theo giờ Việt Nam, kể cả khi thiết bị dùng múi giờ khác. Mốc thiếu để trống kèm lý do.
- Mọi KPI trong file xuất theo khoảng lọc, không đưa lũy kế toàn lịch sử vào file của một kỳ.

## Lưu mốc giờ

- Migration `capacity_timing_observations` đã áp dụng ngày 10/09/2026: bảng sự kiện riêng trong schema private, 4 trigger chỉ ghi quan sát, RPC gửi mốc và RPC đọc cho quản lý/QL2.
- Không thay định nghĩa RPC tiến độ v2 đang dùng. RPC mới gọi lại v2 nên giữ giới hạn số lượng, công đoạn, phân quyền và khóa ngày.
- Hàng đợi mới lưu giờ bấm và giữ nguyên qua lần gửi lại. Hàng đợi/bản ứng dụng cũ thiếu giờ bấm được đánh dấu thiếu thời gian.
- Không điền giờ hoàn thành giả cho dữ liệu cũ. Baseline chỉ là trạng thái tại lúc bật theo dõi. Ngày bắt đầu theo dõi có thể chưa đủ thứ tự công việc.
- Đã kiểm tra đọc trên database thật bằng quyền authenticated của vai quản lý; khách không có quyền đọc, không cho ghi trực tiếp vào nhật ký. Cảnh báo INFO RLS không có policy ở bảng private là chủ đích chặn truy cập trực tiếp; chỉ hàm được cấp quyền mới đọc. [Giải thích linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Phần giao diện/hàng đợi mới thuộc bản 159. Thiết bị còn dùng bản 158 chưa gửi mốc giờ bấm; cần tải bản mới để bắt đầu ghi đủ mốc.

## Kiểm tra đã thực hiện

- 7 nhóm tính toán: lịch/nghỉ/chuyển ngày, 15 tấm 07–09 = 8 phút/tấm, hỗ trợ 09:00/09:20, hàng chờ, ngày 0 tấm, sửa số/hủy hỗ trợ, loại tương lai.
- May/Đóng gói: 70 sản xuất + 10 bảo hành = 80 tấm; 480/80 = 6 phút/tấm. Hai ngày tiêu chuẩn chỉ có 80 tấm = 960/80 = 12, không lấy trung bình hai tỷ lệ ngày.
- PostgreSQL cô lập bằng PGlite, dùng nguyên định nghĩa RPC v2 thật: ghi mốc cùng giao dịch, chống trùng, sửa giảm, dữ liệu cũ/giờ sai, lỗi số lượng, hỗ trợ/hủy hỗ trợ, phân quyền, chuỗi công đoạn.
- Hàng đợi giả lập mất mạng/khôi phục: mã thao tác và giờ bấm không đổi, hàng cũ gửi mốc null.
- Browser Edge desktop/mobile, các vai quản lý/QL2/khách/nhân viên: số liệu cũ và ngày mặc định không hồi quy. Popup mở đúng dòng, lọc, xem đơn, đóng/khôi phục focus; file xuất đúng phạm vi và giờ VN. Các ảnh popup minh họa dùng dữ liệu thử riêng.
- Soát diff: các luồng phân công, nhập tiến độ, quyền, đồng bộ Sheet và xuất báo cáo cũ giữ nguyên, ngoại trừ đúng hai điểm hàng đợi/RPC đã duyệt để gửi mốc.

Chạy các bài kiểm tra độc lập từ repo:

```text
node tools/check-capacity-plan.cjs
node tools/check-capacity-timing.cjs
node tools/check-capacity-timing-client.cjs
node tools/check-capacity-timing-sql.cjs
node tools/check-html-js-syntax.mjs
```

Bài SQL cần `@electric-sql/pglite` 0.5.8 trong môi trường kiểm thử. Không chạy các kịch bản sản lượng thử trên database thật.
