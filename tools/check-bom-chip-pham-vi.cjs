// Nút lọc kiểu .bom-chip của các trang khác (Giao việc, Việc lặp, Phát sữa...) không được dính vào bộ lọc của trang BOM.
// Lỗi cũ: bộ lọc BOM gắn vào MỌI .bom-chip trong trang, bấm "Ngày chưa phát" thì đổi bộ lọc BOM và làm mọi nút không có data-loc sáng lên.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
assert.ok(!/querySelectorAll\('\.bom-chip'\)/.test(html),'còn chọn mọi .bom-chip trong trang');
assert.ok(/querySelectorAll\('#panel-bom \.bom-chip'\)\.forEach\(c=>c\.addEventListener\('click'/.test(html));
assert.ok(/querySelectorAll\('#panel-bom \.bom-chip'\)\.forEach\(c=>c\.classList\.toggle\('active',c\.dataset\.loc===bomLocDangXem\)\)/.test(html));
const panel=html.slice(html.indexOf('id="panel-bom"'),html.indexOf('id="panel-wage"'));
assert.ok((panel.match(/class="bom-chip/g)||[]).length>=3,'các nút lọc BOM phải nằm trong #panel-bom');
console.log('PASS nút lọc BOM chỉ gắn trong #panel-bom, không đụng các nút bom-chip ở trang khác');
