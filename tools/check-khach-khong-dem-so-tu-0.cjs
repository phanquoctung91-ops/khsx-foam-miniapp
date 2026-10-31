// v263: thẻ số không đếm từ 0 khi mới hiện ra (chỉ chạy khi số đổi thật, từ số cũ) + khách luôn mở vào Thống kê, không nhớ tab cũ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };

// 1) doValue chạy thật với bản trích từ index.html
const doValue=lay(/  function doValue\(el\)\{[\s\S]*?\n  \}\n/);
const calls=[],prev=new Map();
const ctx={prev,CARD:'.kpi',scopeId:()=>'kpiRow',labelOf:()=>'Tổng kế hoạch',
  parseNum:s=>{const m=String(s).match(/^(\D*)([\d.,]+)(\D*)$/);if(!m)return null;return {pre:m[1],v:Number(m[2].split('.').join('').split(',').join('.')),post:m[3]};},
  countTo:(el,from,to)=>calls.push(['countTo',from,to]),flash:()=>calls.push(['flash']),celebrate:()=>calls.push(['celebrate'])};
vm.createContext(ctx); vm.runInContext(doValue+';this.doValue=doValue;',ctx);
const the=txt=>({children:{length:0},dataset:{},textContent:txt,closest:()=>({dataset:{}})});
ctx.doValue(the('2.913'));
assert.deepEqual(calls,[],'lần đầu thấy: không đếm từ 0, không nháy');
ctx.doValue(the('2.913')); assert.deepEqual(calls,[],'số không đổi: không chạy gì (chuyển tab qua lại không nhảy số)');
ctx.doValue(the('3.041')); assert.deepEqual(calls[0],['countTo',2913,3041],'số đổi thật: đếm từ số cũ lên số mới'); assert.equal(calls[1][0],'flash');
calls.length=0; prev.clear(); ctx.doValue(the('100%')); assert.deepEqual(calls,[['celebrate']],'đạt 100% lần đầu vẫn ăn mừng, không đếm');
console.log('PASS thẻ số: lần đầu hiện đúng số ngay, không đổi thì đứng yên, đổi thật mới đếm từ số cũ');

// 2) dòng "x / y tấm · z%" của thanh tiến độ quý cũng không đếm từ 0 lần đầu
assert.ok(html.includes("if(!on()||!was||(was[0]===a.v&&was[1]===p.v)) return;"),'tdq text lần đầu không đếm');
assert.ok(html.includes('const fa=was[0], fp=was[1],'));
assert.ok(!/countTo\(el,0,/.test(html),'không còn đếm từ 0 ở thẻ số');
console.log('PASS dòng tiến độ quý: lần đầu hiện ngay');

// 3) khách không nhớ tab cũ
assert.ok(html.includes("if(st.tab&&!PUBLIC_VIEW_MODE){"),'khách luôn mở vào Thống kê');
assert.ok(Number(html.match(/const APP_VERSION = (\d+);/)[1])>=263);
console.log('PASS khách không khôi phục tab đã mở lần trước');
