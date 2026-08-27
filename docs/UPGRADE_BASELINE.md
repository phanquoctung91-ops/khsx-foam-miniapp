# Chuẩn nâng cấp Dashboard KHSX Supabase

## Ranh giới an toàn

- Dashboard live là nguồn vận hành hiện tại và chỉ được dùng để đọc, đối chiếu.
- Repo này là bản thử nghiệm Supabase độc lập.
- Thêm, sửa, xóa tiến độ trong repo này chỉ được ghi vào Supabase thử nghiệm.
- Không có cơ chế fallback ghi sang Apps Script/Google Sheet của bản live.
- Dữ liệu kế hoạch từ nguồn ngoài chỉ được nhập theo luồng đọc hoặc sao chép có kiểm soát.
- Không commit, push, public hoặc áp schema khi chưa có xác nhận riêng.

## Chuẩn đối chiếu hiện tại

- Bản live được kiểm kê: `v8.8 #83`.
- SHA-256 file live lúc lập chuẩn: `29F5302395D95A2A10272F1F79E22D7C8F9F7580F95FED58BDDF84CD406FD02B`.
- Bản Supabase hiện tại: `APP_VERSION = 102`.
- Kiểm kê tên hàm và thành phần giao diện hiện đã đạt parity với live #83.
- `applyLocalRoleTest` được loại có chủ đích vì chỉ là cửa giả lập vai bằng query string của bản live.
- Parity cấu trúc không thay thế kiểm thử nghiệp vụ bằng dữ liệu Supabase thật.

## Năm mục tiêu bắt buộc

1. Lưu, tải và đồng bộ nhanh trên Android, iOS và PC; mất mạng không mất thao tác.
2. Giao diện mobile-first, rõ, chuyên nghiệp và dùng màu theo trạng thái nghiệp vụ.
3. KPI chỉ tính từ dữ liệu thực tế có nguồn; KH, tiến độ, bảo hành và dữ liệu ngoài độc lập.
4. Tiêu đề, nút và trạng thái dùng một bộ thuật ngữ; không đoán hoặc bê nguyên câu mô tả trao đổi.
5. Vai Khách xem được toàn bộ số liệu nhưng backend không cấp quyền ghi.

## Cổng nghiệm thu parity

Bản Supabase chỉ được đưa sang bước thử dữ liệu khi đạt đủ:

- Không thiếu tab, bộ lọc, popup, báo cáo và luồng nghiệp vụ đang có trên live.
- Cùng một bộ dữ liệu đầu vào cho ra cùng KH, HT, tồn công đoạn và trạng thái đơn.
- Tất cả khác biệt có chủ đích đều được ghi trong bảng thay đổi và được duyệt.
- Kiểm tra cách ly dữ liệu chạy đạt.

## Kiểm tra tự động

```powershell
node tools/check-trial-isolation.mjs
node tools/check-live-parity.mjs "C:\Users\LAPTOP HP\OneDrive\Tài liệu\ChatGPT\Dashboard KHSX\khsx-foam-dashboard\index.html"
```

Kiểm tra parity chỉ đọc bản live và báo phần còn thiếu; không sửa file live.
