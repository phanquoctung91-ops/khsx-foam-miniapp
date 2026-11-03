// Nhãn nhóm đơn (.group-chip) cùng kích thước: rộng cố định, cao tối thiểu 2 dòng, chữ căn giữa.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const m=html.match(/\.group-chip\{[^}]*\}/); assert.ok(m,'không thấy .group-chip');
for(const k of ['display:inline-flex','align-items:center','justify-content:center','box-sizing:border-box','width:100px','min-height:34px','text-align:center']) assert.ok(m[0].includes(k),'thiếu '+k);
assert.ok(!/white-space:nowrap/.test(m[0]),'tên dài vẫn được xuống dòng');
console.log('PASS nhãn nhóm đơn: cùng rộng 100px, cao tối thiểu 34px, căn giữa');
