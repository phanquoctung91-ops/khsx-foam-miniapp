// Thanh tiến độ quý (bản 228): mô hình tinhThanhTienDoQuy dựng từ index.html trong node:vm.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const m=html.match(/function tinhThanhTienDoQuy\(t\)\{[\s\S]*?\n\}\n/); assert.ok(m,'không thấy tinhThanhTienDoQuy');
const ctx={}; vm.createContext(ctx); vm.runInContext(m[0]+';this.f=tinhThanhTienDoQuy;',ctx);
const J=x=>JSON.parse(JSON.stringify(x)), f=t=>J(ctx.f(t));
const base={quy:4,nam:2026,mucTieu:11500,totalWorkdays:79,elapsedWorkdays:7,output:735};

// số thật 08/10/2026: 735 / 11.500, vạch mờ 11.500 / 79 x 7 = 1.019
let r=f(base);
assert.equal(Math.round(r.gach),1019); assert.equal(Math.round(r.lech),-284); assert.equal(r.mau,'vang'); assert.equal(r.dat,false);
assert.ok(Math.abs(r.fillPct-6.391)<0.01); assert.ok(Math.abs(r.gachPct-8.861)<0.01); assert.equal(r.nhanPhai,false);
console.log('PASS số thật 08/10: 735 / 11.500, vạch mờ 1.019, chậm 284 tấm, màu vàng, nhãn nằm bên phải vạch');

// đi nhanh hơn tiến độ
r=f({...base,elapsedWorkdays:38,output:5900});
assert.equal(Math.round(r.gach),5532); assert.equal(r.mau,'xanh'); assert.ok(r.lech>0); assert.equal(r.nhanPhai,false);
r=f({...base,elapsedWorkdays:60,output:9000}); assert.equal(r.nhanPhai,true);   // vạch ở xa bên phải thì nhãn lùi sang trái
console.log('PASS đi nhanh: màu xanh; vạch ở quá 60% thì nhãn lật sang trái để khỏi tràn');

// đạt / vượt mục tiêu, tràn quá 100%
r=f({...base,output:11500}); assert.equal(r.dat,true); assert.equal(r.fillPct,100);
r=f({...base,output:13000}); assert.equal(r.dat,true); assert.equal(r.fillPct,100); assert.ok(r.phanTram>100);
console.log('PASS đạt hoặc vượt mục tiêu: phần tô kẹp ở 100%, vẫn báo đã đạt');

// cuối quý, ngày đã qua nhiều hơn tổng ngày (lịch sửa giữa quý)
r=f({...base,elapsedWorkdays:90}); assert.equal(r.qua,79); assert.equal(Math.round(r.gach),11500); assert.equal(r.gachPct,100);
console.log('PASS ngày đã qua vượt tổng ngày thì kẹp bằng tổng ngày, vạch ở đúng 100%');

// chưa có ngày nào đã qua
r=f({...base,elapsedWorkdays:0,output:0}); assert.equal(r.coGach,false); assert.equal(r.mau,'neutral'); assert.equal(r.fillPct,0);
console.log('PASS chưa có ngày làm việc nào đã qua: không có vạch, màu trung tính');

// không vẽ khi thiếu mục tiêu / lịch / dữ liệu hỏng
for(const t of [null,undefined,{},{...base,mucTieu:0},{...base,mucTieu:-5},{...base,mucTieu:'abc'},{...base,totalWorkdays:0},{...base,totalWorkdays:null}]) assert.equal(ctx.f(t),null,JSON.stringify(t));
r=f({...base,output:-20}); assert.equal(r.dg,0);
r=f({...base,output:'x',elapsedWorkdays:'y'}); assert.equal(r.dg,0); assert.equal(r.qua,0); assert.ok(Number.isFinite(r.gachPct)&&Number.isFinite(r.fillPct));
console.log('PASS thiếu mục tiêu / lịch / số liệu hỏng thì không vẽ hoặc kẹp về 0, không ra NaN');

// vị trí: thanh nằm ngoài các tab
const trong=html.indexOf('id="thanhTienDoQuy"'), tab=html.indexOf('class="tabs" id="mainTabs"'), kpi=html.indexOf('id="neoKpiChung"');
assert.ok(trong>0&&trong<kpi&&kpi<tab,'thanh phải nằm trên các tab, trong mainContent');
assert.ok(html.indexOf('<div id="mainContent">')<trong);
assert.match(html,/veThanhTienDoQuy\(tocDoQuy\)/);
console.log('PASS thanh nằm trong mainContent, phía trên hàng KPI và các tab (mọi tab đều thấy)');
