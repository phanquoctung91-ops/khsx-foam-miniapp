import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260903014408_reconcile_aug_25_29_v123.sql', import.meta.url), 'utf8');

const checks = [
  ['Bản phát hành được nâng lên 123', /const APP_VERSION = 123;/.test(html)],
  ['Ngày đã chốt bị loại trước khi tìm ID còn thiếu', /unlockedSourceRows=source\.rows\.filter\(o=>!isPlanLocked\(o\.date\)\)[\s\S]{0,200}missing=unlockedSourceRows\.filter/.test(html)],
  ['Dữ liệu Sheet mới mang nhãn nguồn v123', /source:'sheet_live_sync_v123'/.test(html)],
  ['Migration có bản sao trước khi sửa', /backup_v123_aug_25_29_before_reconcile/.test(migration)],
  ['Migration khôi phục đủ 52 tấm bảo hành', /bh_27-08-2026/.test(migration) && /bh_28-08-2026/.test(migration) && /Bảo hành tháng 8 chưa đạt 122 tấm/.test(migration)],
  ['Migration kiểm tra đủ tổng công đoạn 25-29/08', /2026-08-25[\s\S]*151[\s\S]*2026-08-29[\s\S]*109/.test(migration)],
  ['Migration kiểm tra KHSX từng ngày', /2026-08-25',163[\s\S]*2026-08-29',108/.test(migration)],
  ['Migration tự hủy nếu còn đơn thiếu tổ', /Còn đơn 28-29\/08 chưa có tổ/.test(migration)],
  ['Migration chạy nguyên khối', /^begin;[\s\S]*commit;\s*$/m.test(migration)]
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
if (failed) process.exit(1);
console.log('\nRelease v123 reconciliation checks passed.');
