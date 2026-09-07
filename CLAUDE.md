# Quy tắc làm việc trong repo này

## Luôn lập plan trước, kể cả việc nhỏ
Trước khi sửa bất kỳ đoạn code nào trong repo này — kể cả một lỗi nhỏ, một dòng CSS,
một câu chữ — phải viết plan (dùng chế độ plan) và được anh Tùng duyệt trước, rồi mới
được implement. Không tự ý vừa phát hiện lỗi vừa sửa luôn trong cùng lượt.

**Vì sao:** Giai đoạn 4 (redesign UI theo mẫu Clinova) đã tự sửa liên tục theo kiểu
"phát hiện gì sửa nấy" mà không dừng lại để lập kế hoạch — dẫn tới lỗi cấu trúc
nghiêm trọng (trang Cài đặt/Nhân sự/Năng lực bị đặt ngoài `.wrap`, làm mất tab
Tiến độ sản xuất/TDSX khỏi luồng chính, màu sắc lệch mẫu tham khảo) mà không ai
soát lại trước khi báo "xong". Tự verify bằng Browser tool không thay được việc
dừng lại hỏi ý kiến trước khi động tay, nhất là với thay đổi ảnh hưởng bố cục/nhiều
trang.

**Áp dụng:** Mọi thay đổi trong `index.html` (và các file khác trong repo) — dù
là bugfix 1 dòng, đổi màu, hay tính năng lớn — đều phải qua bước lập plan trước.
Chỉ khi anh Tùng xác nhận đồng ý plan thì mới bắt đầu sửa code.
