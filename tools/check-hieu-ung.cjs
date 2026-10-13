// Hiệu ứng giao diện (bản 240): kiểm bộ đọc/ghi số đếm trong node:vm + các điểm gắn hiệu ứng có mặt trong index.html.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const a=html.indexOf('const FX=(()=>{'), b=html.indexOf("document.addEventListener('DOMContentLoaded',()=>FX.start());",a);
assert.ok(a>0&&b>a,'không thấy khối FX');
const noop=()=>{};
const ctx={window:{matchMedia:()=>({matches:false})},matchMedia:()=>({matches:false}),document:{addEventListener:noop},performance:{now:()=>0},requestAnimationFrame:noop,setTimeout:noop,MutationObserver:class{observe(){}}};
vm.createContext(ctx); vm.runInContext(html.slice(a,b)+';this.FX=FX;',ctx);
const {parseNum,fmt}=ctx.FX, P=s=>{ const m=parseNum(s); return m&&{v:m.v,dec:m.dec,pre:m.pre,post:m.post}; };
assert.deepEqual(P('1.157'),{v:1157,dec:0,pre:'',post:''},'1.157 là một nghìn một trăm năm mươi bảy');
assert.deepEqual(P('101.1%'),{v:101.1,dec:1,pre:'',post:'%'});
assert.deepEqual(P('12,5%'),{v:12.5,dec:1,pre:'',post:'%'});
assert.deepEqual(P('1.234.567'),{v:1234567,dec:0,pre:'',post:''});
assert.deepEqual(P('+3'),{v:3,dec:0,pre:'+',post:''});
assert.deepEqual(P('Chậm 172 tấm'),{v:172,dec:0,pre:'Chậm ',post:' tấm'});
assert.equal(P('9 / 9'),null,'hai số trong một ô thì không đếm'); assert.equal(P('—'),null);
for(const s of ['1.157','101.1%','12,5%','1.234.567','49','0','1,170']){ const m=parseNum(s); assert.equal(m.pre+fmt(m.v,m)+m.post,s,'định dạng lại phải ra đúng '+s); }
const m1=parseNum('1.170'); assert.equal(fmt(500,m1),'500'); assert.equal(fmt(1234,m1),'1.234','giữ dấu chấm hàng nghìn như bản gốc');
console.log('PASS đọc/ghi số đếm: nghìn, thập phân, % , tiền tố/hậu tố, giữ đúng dấu phân cách; ô có hai số không đếm');
// các điểm gắn
for(const t of ["FX.chartAnim('dayStageChart')","FX.chartAnim('productChart')","FX.chartAnim('teamMonthChart')","FX.chartAnim('dailyTrendChart')","FX.theme();","FX.reveal(document.getElementById('panel-'+btn.dataset.tab))","FX.forget('tc|'+id)",'@media (prefers-reduced-motion:reduce)','id="khsxFx"','doTdqFill','doTdqText','.tdq-fill::after','fxSheenLoop 4s ease-in-out infinite','fx-glow1']) assert.ok(html.includes(t),'thiếu '+t);
console.log('PASS các điểm gắn: 4 biểu đồ, đổi giao diện, mở tab, nút Tăng ca, giảm chuyển động');
