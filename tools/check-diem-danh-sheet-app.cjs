// Nút "Xuất lên Sheet" ở tab Điểm danh (12/11/2026): kiểm cấu trúc trong index.html, không chạy trình duyệt.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const h = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const co = re => assert.match(h, re);
co(/id="ddSheetBtn"[^>]*>📊 Xuất lên Sheet</);
co(/id="ddSheet"[\s\S]{0,400}id="ddSheetTu"[\s\S]{0,300}id="ddSheetDen"[\s\S]{0,400}id="ddSheetTo"[\s\S]{0,200}value="mut"[\s\S]{0,80}value="may"[\s\S]{0,400}id="ddSheetGhi"/);
co(/const DD_SHEET_API=\{mut:'[^']*',may:'[^']*'\};/);
co(/body:JSON\.stringify\(\{token,tu,den\}\)/);            // chỉ gửi mã + khoảng ngày, không gửi dữ liệu người
co(/\?action=result&token=\$\{token\}/);                  // hỏi lại kết quả theo mã, giống xuất báo cáo đóng gói
co(/>=62\) return bao\('Tối đa 62 ngày/);
co(/confirm\(`Ghi \$\{tenTo\}[\s\S]{0,200}GHI ĐÈ 3 tab "Xuất tay"/);
co(/if\(!duocDiemDanh\(\)&&!duocPhatSua\(\)\) return;\s*\n\s*if\(!tu\|\|!den\|\|tu>den\) return bao\('Chọn khoảng ngày/);   // cùng quyền với nút Xuất Excel
co(/\^https:\\\/\\\/docs\\\.google\\\.com\\\//);              // chỉ mở link Google Sheet
const v = +h.match(/const APP_VERSION = (\d+);/)[1]; assert.ok(v >= 284); assert.match(h, new RegExp('raw-data\\.js\\?v=' + v + '"'));
console.log('PASS nút Xuất lên Sheet: cấu trúc, quyền, giới hạn 62 ngày, xác nhận ghi đè, chỉ mở link docs.google.com, phiên bản ' + v);
