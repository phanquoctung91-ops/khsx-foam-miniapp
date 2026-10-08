// Quản lý 2 được cấp "Đồng bộ kế hoạch từ nguồn" (khsx_sync_source) thì dùng được Lấy KHSX từ Sheet (anh Tùng chốt 08/10/2026).
// Kiểm tra mã nguồn: nút không còn nhãn chỉ-Quản-lý, nút theo quyền, hàm mở bảng chấp nhận quyền, máy chủ chỉ cho Quản lý 2 có quyền.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const mig=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20261008120000_quyen_sync_sheet_ql2.sql'),'utf8');
assert.match(html,/<button id="layKhsxSheetBtn" class="primary-btn" type="button">/);
assert.ok(!/id="layKhsxSheetBtn"[^>]*only-manager/.test(html));
assert.match(html,/layKhsxSheetBtn:\['khsx_sync_source'\]/);
assert.match(html,/async function moLayKhsxSheet\(\)\{\n  if\(!\(canManage\(\)\|\|hasPermOrOwner\('khsx_sync_source'\)\)\) return;/);
console.log('PASS giao diện: nút Lấy KHSX từ Sheet hiện theo quyền khsx_sync_source, hàm mở bảng chấp nhận Quản lý hoặc người có quyền');
assert.match(mig,/p\.role='quan_ly' or \(p\.role='quan_ly_2' and private\.khsx_has_permission\('khsx_sync_source', v_actor\)\)/);
assert.ok(!/role='nhan_vien'|role='chi_xem'/.test(mig));
assert.equal((mig.match(/FULL_MANAGER_REQUIRED/g)||[]).length,1);
console.log('PASS máy chủ: Quản lý như cũ; Quản lý 2 chỉ khi có khsx_sync_source; Nhân viên / Chỉ xem không bao giờ qua');
