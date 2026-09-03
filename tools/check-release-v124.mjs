import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const checks = [
  ['Bản phát hành được nâng lên 124', /const APP_VERSION = 124;/.test(html)],
  ['Tài khoản công đoạn luôn mở thẳng TDSX', /if\(congDoanNhanVien\)[\s\S]{0,250}panel-progress/.test(html)],
  ['Chế độ công đoạn của quản lý không sửa currentUser', /managerStagePreview=\{stage,unit\}/.test(html) && !/managerStageOriginalUser/.test(html)],
  ['Nút thoát công đoạn đồng bộ theo trạng thái giả lập', /exitStageBtn\.style\.display=managerStagePreview\?'block':'none'/.test(html)],
  ['Header chặn đơn có ngày gốc khác tháng', (html.match(/if\(!ngayThuocThangHeader\(r\.date\)\) return false;/g) || []).length >= 2],
  ['Ngày mặc định được đặt lại khi đổi tháng', /delete autoDay\.dataset\.dayInitialized[\s\S]{0,120}delete progressDaySelect\.dataset\.dayInitialized/.test(html)],
  ['OT dùng danh sách tick và ca 4 hoặc 8 giờ', /id="overtimeWorkers"/.test(html) && /value="4"/.test(html) && /value="8"/.test(html) && !/id="overtimeWorker"/.test(html)],
  ['Đơn ưu tiên lấy cả cờ Supabase, xếp đầu và có hiệu ứng', /assignments\[id\]\?\.priority/.test(html) && /Number\(laUuTien\(b\.id\)\)-Number\(laUuTien\(a\.id\)\)/.test(html) && /prioritySlowPulse/.test(html)],
  ['Nút thao tác gọn thành Xong và Xóa', />Xong<\/button>/.test(html) && />Xóa<\/button>/.test(html)],
  ['Trạng thái popup được Việt hóa', /dang_san_xuat:'Đang sản xuất'/.test(html) && /status:tenTrangThaiDon\(getOrderStatus\(o\)\)/.test(html)],
  ['Bảo hành dùng danh sách tab chuẩn và nút làm mới ép tải lại', /action=baohanh/.test(html) && /fetchBaoHanh\(\{force:true\}\)/.test(html) && !/taiBaoHanhGanDay/.test(html)],
  ['KHSX và TDSX dùng cùng kích thước cột thao tác', /#autoPlanTable \.col-action,\s*#progressTable \.col-action/.test(html)]
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
if (failed) process.exit(1);
console.log('\nRelease v124 UI and workflow checks passed.');
