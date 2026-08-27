# Hợp đồng cách ly dữ liệu

## Bản live

- Frontend: GitHub Pages của `khsx-foam-dashboard`.
- Nguồn vận hành: Apps Script/Google Sheet hiện tại.
- Repo Supabase không được gọi đường ghi của hệ thống này.

## Bản thử nghiệm

- Frontend: repo `khsx-foam-miniapp`.
- Nguồn vận hành duy nhất: project Supabase thử nghiệm.
- Tên khoá cache, phiên đăng nhập và outbox phải có tiền tố Supabase riêng.
- Mọi thao tác tiến độ có `operation_id` để gửi lại không ghi trùng.
- Realtime chỉ theo dõi bảng của project Supabase thử nghiệm.

## Dữ liệu được phép đọc từ ngoài

- Kế hoạch công ty và bảo hành có thể được đọc để nhập/đối chiếu.
- Đọc nguồn ngoài không đồng nghĩa với quyền sửa nguồn ngoài.
- Sau lần sao chép khởi tạo, sửa/xóa trong Supabase không phản hồi ngược về live.

## Dữ liệu vận hành tách riêng

- Kế hoạch gốc.
- Phân công tổ và hỗ trợ theo ngày.
- Tiến độ thực tế từng công đoạn.
- Bảo hành.
- Người dùng và phân quyền.
- Nhật ký thao tác và biên nhận đồng bộ.

