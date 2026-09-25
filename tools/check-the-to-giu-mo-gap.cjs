// Điện thoại: vẽ lại thẻ tổ cùng ngày phải giữ tổ đang mở / đang gập (lỗi 25/09/2026: đang bấm thì thẻ tổ tự thu lại).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('function renderTeamRings('),b=html.indexOf('\nfunction ',a+10),f=html.slice(a,b);
assert.match(f,/container\.dataset\.ngay===String\(ngayDangXem\)/,'Không so ngày trước khi giữ trạng thái — đổi ngày sẽ giữ nhầm');
assert.match(f,/dangGap\[c\.dataset\.to\]=c\.classList\.contains\('to-gap'\)/,'Không đọc lại tổ đang mở / đang gập trước khi vẽ lại');
assert.ok(f.indexOf('const dangGap')<f.indexOf('container.innerHTML'),'Đọc trạng thái sau khi đã xoá thẻ cũ');
assert.match(f,/const gapSan = dangGap\[team\]!==undefined \? dangGap\[team\] : \(con<=0 \|\| daMoMot\);/,'Vẽ lại vẫn dùng kiểu mặc định, bỏ qua tổ người dùng đang mở');
console.log('PASS  vẽ lại cùng ngày giữ nguyên tổ đang mở / gập; đổi ngày mới dùng kiểu mặc định');
