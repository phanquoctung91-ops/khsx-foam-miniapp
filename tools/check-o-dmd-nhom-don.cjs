// Ô D/M/Đ trên dòng gộp nhiều đơn cùng mã (thẻ tổ điện thoại): số gõ vào là tổng cả nhóm, phải chia
// cho từng đơn — lỗi 25/09/2026: sửa 10 → 8 thì dồn 8 vào đơn kia, thẻ thành 18 (8 tấm ảo).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('function chiaSoNhomDon('),b=html.indexOf('\n}',a)+2;
const ctx={}; vm.createContext(ctx); vm.runInContext(html.slice(a,b),ctx);
const chia=(don,moi)=>JSON.parse(JSON.stringify(ctx.chiaSoNhomDon(don,moi)));
// A dời từ hôm trước đã dán 10 (hết việc), B hôm nay chưa dán (còn 10)
assert.deepEqual(chia([{id:'A',v:10,con:0},{id:'B',v:0,con:10}],8),{thay:[['A',8]],thieu:0});
console.log('PASS sửa tổng 10 → 8: bớt ở đơn đang có số, không sinh tấm ảo');
assert.deepEqual(chia([{id:'A',v:10,con:0},{id:'B',v:0,con:10}],15),{thay:[['B',5]],thieu:0});
console.log('PASS sửa tổng 10 → 15: 5 tấm thêm vào đơn còn việc');
assert.deepEqual(chia([{id:'A',v:3,con:2},{id:'B',v:0,con:4}],12),{thay:[['A',5],['B',4]],thieu:3});
console.log('PASS vượt số còn làm được: ghi tới mức tối đa, báo phần thiếu');
assert.deepEqual(chia([{id:'A',v:4,con:0},{id:'B',v:3,con:0}],2),{thay:[['B',0],['A',2]],thieu:0});
console.log('PASS giảm nhiều: bớt đơn cuối trước rồi tới đơn đầu');
