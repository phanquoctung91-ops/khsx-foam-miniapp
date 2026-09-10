import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const schema = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'supabase', 'schema', 'miniapp_upgrade_v1.sql'), 'utf8');
const checks = [
  ['Nhân viên May/Đóng gói được ghi nhận theo tài khoản hoàn thành', /daHoanTat\s*\?\s*await\s+chonNguoiHoanThanhCongDoan\(congDoan\)/],
  ['Người hoàn thành được khôi phục từ entered_by của Supabase', /p\.entered_by[\s\S]{0,500}truongNguoiHoanThanh\(p\.stage,'name'\)/],
  ['Dữ liệu bảo hành trong Supabase không bị loại khỏi danh sách động', /o\.is_manual\|\|o\.is_drop\|\|o\.is_ghost\|\|o\.is_warranty/],
  ['Thẻ tổ dùng đúng công đoạn đang đăng nhập', /ringCongDoan\s*=\s*congDoanNhanVien\s*\|\|\s*'dong_goi'/],
  ['Thẻ tổ có đường nhập nhanh theo đúng dòng', /function\s+moPopupNhapNhanhCongDoan[\s\S]{0,1000}handleStageQtyChange/],
  ['KPI năng lực Dán tách khỏi KPI cá nhân May và Đóng gói', /tinhNangLucToDan[\s\S]{0,4000}tinhNangLucCaNhan\('may'[\s\S]{0,300}tinhNangLucCaNhan\('dong_goi'/],
  ['MiniApp luôn khôi phục phiên Telegram Supabase thật', /if\(SUPABASE_VARIANT\)[\s\S]{0,260}try\{ coSession = \(await restoreSupabaseSession\(\)/],
  ['Không còn nhánh giao diện Test 3 công đoạn', !/stageTestMenuBtn|stageTestModal|managerStageTestMode/.test(html)],
  ['Gán hỗ trợ tính theo Dán lũy kế đến ngày', /tongCongDoanLuyKeDenNgay\(o,'dan',ngay\)/],
  ['Một đơn không bị đổi sang tổ hỗ trợ khác', /assignedSupportTeams\.length[\s\S]{0,220}!assignedSupportTeams\.includes\(val\)/.test(html) && /SUPPORT_TEAM_CONFLICT/.test(schema)],
  ['Tổ hỗ trợ chỉ được ghi nhận cho công đoạn Dán', /function\s+toPhuTrachCongDoanTheoNgay[\s\S]{0,260}congDoan === 'dan'/],
  ['Gán hỗ trợ đi qua RPC giao dịch Supabase', /khsx_assign_support_v1/],
  ['Gán tổ chính dùng khóa phiên bản máy chủ', /khsx_save_order_assignment_v1/.test(html) && /ASSIGNMENT_CONFLICT/.test(schema)],
];

let failed = 0;
for (const [name, pattern] of checks) {
  const ok = pattern instanceof RegExp ? pattern.test(html) : Boolean(pattern);
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}\n`);
}
if (failed) {
  process.stderr.write(`\n${failed} business wiring check(s) failed.\n`);
  process.exit(1);
}
process.stdout.write('\nSupabase business wiring checks passed.\n');

