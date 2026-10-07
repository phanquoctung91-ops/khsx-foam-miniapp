// Lấy KHSX từ Sheet: chỉ đọc từ hôm nay trở đi, ngày đã qua coi như đã chốt (anh Tùng chốt 07/10/2026). Dựng từ index.html trong node:vm.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/function parseDMY\(dateStr\)\{[\s\S]*?\n\}\n/,/function khoaNgayDMY\(dateStr\)\{[\s\S]*?\n\}\n/,/const sheetDocTuNgay=[^\n]*\n/,/const sheetLocTuNgay=[^\n]*\n/].map(lay).join('\n');
let homNay='2026-10-07';
const ctx={homNayIso:()=>homNay}; vm.createContext(ctx);
vm.runInContext(code+';this.sheetDocTuNgay=sheetDocTuNgay;this.sheetLocTuNgay=sheetLocTuNgay;',ctx);
const rows=['26/09/2026','29/09/2026','05/10/2026','06/10/2026','07/10/2026','08/10/2026','31/12/2026','01/01/2027'].map(date=>({date,ma:'X'}));
const ngay=tu=>ctx.sheetLocTuNgay(rows,tu).map(r=>r.date);
assert.equal(ctx.sheetDocTuNgay(),'07/10/2026');
assert.deepEqual(ngay(ctx.sheetDocTuNgay()),['07/10/2026','08/10/2026','31/12/2026','01/01/2027']);
console.log('PASS ngày đã qua (26/09 đến 06/10) bị bỏ; hôm nay và các ngày sau vẫn đọc');
homNay='2026-10-08'; assert.equal(ctx.sheetDocTuNgay(),'08/10/2026'); assert.deepEqual(ngay(ctx.sheetDocTuNgay()),['08/10/2026','31/12/2026','01/01/2027']);
console.log('PASS qua ngày mới thì mốc tự dời theo hôm nay, ngày 07/10 thành đã qua');
homNay='2027-01-01'; assert.deepEqual(ngay(ctx.sheetDocTuNgay()),['01/01/2027']);
console.log('PASS qua năm mới so sánh đúng (dd/mm/yyyy không so theo chữ)');
assert.ok(!/SHEET_DOC_TU_NGAY/.test(html),'không còn mốc cố định 26/09');
console.log('PASS không còn mốc cố định 26/09/2026');
