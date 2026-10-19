// Lỗi 15/10/2026: số trên thẻ KPI chạy từ 0 lên bị hiện ÂM (−0,75 lần số thật) khi máy bận, vì mốc khung hình t nhỏ hơn giờ bắt đầu.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
// 1) mọi công thức tiến độ dạng Math.min(1, (x - mốc)/thời lượng) đều phải có Math.max(0, ...) bọc ngoài
const xau=[...html.matchAll(/Math\.min\(1, ?\([a-zA-Z0-9_]+ ?- ?[a-zA-Z0-9_]+\) ?\/ ?[a-zA-Z0-9_]+\)/g)];
assert.ok(xau.length>=4,'phải thấy ít nhất 4 công thức tiến độ, thấy '+xau.length);
xau.forEach(m=>assert.ok(/Math\.max\(0, ?$/.test(html.slice(Math.max(0,m.index-12),m.index)),'chưa chặn âm: '+m[0]));
console.log('PASS cả '+xau.length+' công thức tiến độ chạy số đều bị chặn không âm');
// 2) chạy thật chayDemSo với khung hình đến SỚM hơn giờ bắt đầu
const a=html.indexOf('function chayDemSo(goc){'), b=html.indexOf('// ---- Tổng hợp tháng tab ----',a); assert.ok(a>0&&b>a);
const el={dataset:{dem:'1673'},textContent:'1.673'}, ghi=[];
const goc={querySelectorAll:()=>[el]};
let cb=null; const hen=[];
const ctx={Number,Math,Date,performance:{now:()=>1000},requestAnimationFrame:f=>{cb=f;},setTimeout:(f,ms)=>{hen.push(f);},document:{},
  Object:{defineProperty(){}}};
Object.defineProperty(el,'textContent',{get(){return this._t},set(v){this._t=v;ghi.push(v);}});
vm.createContext(ctx); vm.runInContext(html.slice(a,b)+';this.chay=chayDemSo;',ctx);
ctx.chay(goc);
for(const t of [880,900,990,1000,1100,1300,1700]){ cb(t); }   // 880 < 1000: khung hình đến trước giờ bắt đầu 120 ms
assert.ok(ghi.length>0);
ghi.forEach(v=>assert.ok(!String(v).includes('-'),'hiện số âm: '+v));
console.log('PASS khung hình đến sớm hơn giờ bắt đầu: số hiện ra không âm ('+ghi.slice(0,3).join(' → ')+' … '+ghi[ghi.length-1]+')');
hen.forEach(f=>f()); assert.equal(el.textContent,'1.673'); console.log('PASS cuối cùng vẫn đúng số thật 1.673');
