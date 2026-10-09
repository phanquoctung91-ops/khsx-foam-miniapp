// Giấy đề xuất tăng ca (bản 233): dựng HTML in từ index.html trong node:vm.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/const GIAY_TC_DONG=[^\n]*\n/,/function giayTangCaHtml\([\s\S]*?\n\}\n/,/function thoatHtml\([\s\S]*?\n\}\n|const thoatHtml=[^\n]*\n/].map(lay).join('\n');
const ctx={}; vm.createContext(ctx); vm.runInContext(code+';this.g=giayTangCaHtml;',ctx);
const dem=(h,re)=>(h.match(re)||[]).length;
const mot=ctx.g([{ten:'An',tc:1},{ten:'Bình <b>',tc:3}],'x.png');
assert.equal(dem(mot,/<section class="tr">/g),1,'2 người = 1 tờ');
assert.equal(dem(mot,/<tr><td class="c">/g),11,'luôn 11 dòng/tờ');
assert.match(mot,/<td class="c">1<\/td><td class="ten">An<\/td><td class="c">17h<\/td><td class="c">18h<\/td><td><\/td>/);
assert.match(mot,/Bình &lt;b&gt;<\/td><td class="c">17h<\/td><td class="c">20h<\/td>/,'tên được thoát HTML; 3h = 17h-20h');
for(const t of ['GIẤY ĐỀ XUẤT TĂNG CA','CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM','Độc lập - Tự do - Hạnh phúc','Bộ phận:','Nội dung công việc tăng ca','Phòng HCNS','BAN GIÁM ĐỐC','Trưởng bộ phận','(Ký, ghi rõ họ tên)']) assert.ok(mot.includes(t),t);
assert.equal(dem(mot,/<td><\/td><\/tr>/g),11,'cột nội dung để trống cho anh ghi tay');
const nhieu=ctx.g(Array.from({length:12},(_,i)=>({ten:'N'+(i+1),tc:2})),'x.png');
assert.equal(dem(nhieu,/<section class="tr">/g),2,'12 người = 2 tờ');
assert.match(nhieu,/<td class="c">12<\/td><td class="ten">N12<\/td><td class="c">17h<\/td><td class="c">19h<\/td>/,'người thứ 12 sang tờ 2, TT nối tiếp');
assert.equal(dem(ctx.g(Array.from({length:11},(_,i)=>({ten:'N'+i,tc:1})),'x.png'),/<section class="tr">/g),1,'đúng 11 người vẫn 1 tờ');
console.log('PASS giấy tăng ca: đủ khung theo mẫu, 11 dòng/tờ, sang tờ khi quá 11 người, giờ 17h→18/19/20h, tên thoát HTML, cột nội dung trống');
