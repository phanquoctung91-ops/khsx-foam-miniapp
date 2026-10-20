// "Lấy KHSX từ Sheet" (20/10/2026): ghi thành công thì tự đóng bảng, chỉ hiện ô vuông "Thành công" khoảng 1 giây.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
// nhánh thành công: đóng bảng + ô thành công + chi tiết ghi ở dòng trạng thái; nhánh lỗi vẫn ở lại trong bảng
const a=html.indexOf("sheetXemTruoc=null; nut.remove();"), b=html.indexOf("hienThanhCong('Thành công'",a);
assert.ok(a>0&&b>a,'không thấy nhánh thành công');
const nhanh=html.slice(a,b);
assert.ok(nhanh.includes("hop.style.display='none'")&&nhanh.includes('supabaseStatus(chiTiet,true)'));
assert.match(html,/if\(!kq\.ok\) return bao\(`Chưa ghi được:/);   // lỗi: không đóng bảng
console.log('PASS ghi thành công thì đóng bảng, chi tiết vẫn ghi ở dòng trạng thái; ghi lỗi thì bảng ở lại báo lỗi');
// ô vuông: hiện đúng nội dung và tự gỡ sau ~1,3 giây, không chồng nhiều ô
const x=html.indexOf('function hienThanhCong('), y=html.indexOf('async function moLayKhsxSheet(){');
assert.ok(x>0&&y>x);
const dom=[]; let hen=null;
const el=()=>({className:'',attrs:{},innerHTML:'',setAttribute(k,v){this.attrs[k]=v;},remove(){ const i=dom.indexOf(this); if(i>=0) dom.splice(i,1); }});
const ctx={thoatHtml:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;'),setTimeout:(f,ms)=>{hen={f,ms};},document:{createElement:()=>el(),body:{appendChild:o=>dom.push(o)},querySelectorAll:()=>[...dom]}};
vm.createContext(ctx); vm.runInContext(html.slice(x,y)+';this.h=hienThanhCong;',ctx);
ctx.h('Thành công','Thêm 3 · bỏ 1'); assert.equal(dom.length,1); assert.match(dom[0].innerHTML,/✓/); assert.match(dom[0].innerHTML,/Thêm 3 · bỏ 1/);
assert.ok(hen.ms>=1000&&hen.ms<=1500,'phải tự tắt trong khoảng 1 giây'); hen.f(); assert.equal(dom.length,0);
ctx.h(); ctx.h(); assert.equal(dom.length,1,'hai lần liên tiếp không được chồng ô');
ctx.h('<b>x</b>'); assert.ok(!dom[0].innerHTML.includes('<b>x</b>'),'nội dung phải được thoát HTML');
console.log('PASS ô vuông Thành công: có dấu ✓, tự tắt khoảng 1 giây, không chồng ô, thoát HTML');
assert.match(html,/\.toast-vuong\{position:fixed;left:50%;top:50%;[^}]*width:156px;height:156px/);
console.log('PASS ô hình vuông, nằm giữa màn hình');
