# KHSX Foam Telegram Mini App

## Nguyên tắc vận hành

- Supabase là nguồn dữ liệu vận hành duy nhất.
- Apps Script chỉ được dùng để nhập/đối chiếu dữ liệu trong giai đoạn chuyển tiếp; không được ghi tiến độ song song.
- Telegram Mini App xác thực bằng `initData`; trình duyệt không được tin trực tiếp `user` do JavaScript cung cấp.
- Mọi lần nhập công đoạn có một `operation_id` duy nhất. Gửi lại cùng mã không tạo thêm thay đổi.
- Nhân viên chỉ được tăng số lượng công đoạn của mình. Giảm/xóa là thao tác sửa của quản lý.
- Hàng đợi chỉ xóa phần tử sau khi Supabase xác nhận `operation_id` đã được xử lý.

## Luồng đăng nhập

1. Telegram mở Mini App và cấp `initData`.
2. Mini App gửi nguyên chuỗi `initData` đến Edge Function `khsx-telegram-auth`.
3. Edge Function kiểm tra chữ ký HMAC và tuổi của `auth_date`.
4. `telegram_user_id` được đối chiếu với `khsx_telegram_links`.
5. Nếu chưa liên kết, yêu cầu được ghi vào `khsx_telegram_access_requests` để quản lý gán đúng tài khoản.
6. Nếu đã liên kết và hồ sơ còn hoạt động, Edge Function trả Supabase session ngắn hạn.

## Luồng nhập tiến độ

1. Giao diện cập nhật ngay trên máy và đưa thao tác vào IndexedDB/localStorage.
2. Client gọi RPC `khsx_apply_stage_progress` với `operation_id`.
3. RPC kiểm tra quyền công đoạn bằng RLS, ghi biên nhận rồi cập nhật tiến độ.
4. Gửi trùng `operation_id` trả lại kết quả cũ, không ghi trùng audit/KPI.
5. Với nhân viên, số cũ lớn hơn số gửi muộn được giữ nguyên. Quản lý có luồng sửa riêng.
6. Realtime báo thay đổi; các phiên khác tải lại dữ liệu liên quan.

## Cổng chuyển sang chạy thật

- Test đủ vai trò quản lý, Tổ Dán, Tổ May và Tổ Đóng gói.
- Test hai thiết bị sửa cùng ô, mất mạng, gửi lại, refresh và mở lại Mini App.
- Đối chiếu tổng đơn, phân công và tiến độ với bản sao nguồn.
- Chỉ sau khi đạt kiểm thử mới tắt đường ghi Apps Script và nhập dữ liệu thật đúng một lần.
