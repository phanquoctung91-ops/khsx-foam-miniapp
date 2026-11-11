// Nút "Xuất lên Sheet" ở tab Điểm danh (12/11/2026): kiểm cấu trúc trong index.html, không chạy trình duyệt.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const h = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const co = re => assert.match(h, re);
co(/id="ddSheetBtn"[^>]*>📊 Xuất lên Sheet</);
co(/id="ddSheet"[\s\S]{0,400}id="ddSheetTo"[\s\S]{0,200}value="mut"[\s\S]{0,80}value="may"[\s\S]{0,400}id="ddSheetGhi"[^>]*>Cập nhật Sheet ngay</);
assert.ok(!/id="ddSheetTu"|id="ddSheetDen"/.test(h), 'đã bỏ ô chọn ngày');
co(/const DD_SHEET_API=\{mut:'[^']*',may:'[^']*'\};/);
co(/body:JSON\.stringify\(\{token\}\)/);                  // chỉ gửi mã hỏi kết quả, không gửi dữ liệu người
co(/\?action=result&token=\$\{token\}/);                  // hỏi lại kết quả theo mã, giống xuất báo cáo đóng gói
co(/confirm\(`Cập nhật Sheet \$\{tenTo\} ngay\?[\s\S]{0,120}3 tab của tháng này/);
co(/getElementById\('ddSheetGhi'\)[\s\S]{0,700}if\(!duocDiemDanh\(\)&&!duocPhatSua\(\)\) return;\s*if\(LOCAL_PREVIEW_MODE\)/);   // cùng quyền với nút Xuất Excel
co(/\^https:\\\/\\\/docs\\\.google\\\.com\\\//);              // chỉ mở link Google Sheet
const v = +h.match(/const APP_VERSION = (\d+);/)[1]; assert.ok(v >= 286); assert.match(h, new RegExp('raw-data\\.js\\?v=' + v + '"'));
console.log('PASS nút Xuất lên Sheet: cấu trúc, quyền, bỏ ô chọn ngày, xác nhận, chỉ mở link docs.google.com, phiên bản ' + v);
