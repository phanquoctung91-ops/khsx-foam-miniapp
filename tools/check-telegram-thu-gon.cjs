// Khối "Quản lý Telegram & phân tổ" thu gọn, cùng kiểu và cùng hiệu ứng với khối Điểm danh / Phát sữa.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const a=html.indexOf('<div class="card" id="staffAccountCard">'), b=html.indexOf('<div id="stageChoiceModal"');
assert.ok(a>0&&b>a,'không thấy khối staffAccountCard');
const the=html.slice(a,b);
// cùng kiểu tiêu đề với Điểm danh
assert.match(the,/<div class="dd-tieude">\s*<div class="dd-tieude-trai"><h3 id="staffModalTitle">🔗 QUẢN LÝ TELEGRAM &amp; PHÂN TỔ<\/h3><button type="button" id="staffToggle" class="capacity-quick-btn dd-gon" aria-expanded="false" aria-controls="staffBody">Hiện ▼<\/button>/);
assert.ok(!/<button[^>]*>\s*<h3/.test(the),'không để h3 trong button');
assert.match(the,/<div id="staffBody" hidden>/,'thân mặc định ẩn');
for(const id of ['supabaseTelegramAdmin','staffUsersList','telegramAccessRequests']) assert.ok(the.indexOf('id="staffBody"')<the.indexOf(`id="${id}"`),id+' nằm trong thân');
assert.equal((the.match(/<\/div>/g)||[]).length-(the.match(/<div\b/g)||[]).length,2,'div cân bằng (còn 2 thẻ đóng của khung ngoài)');
assert.ok(html.includes("staffTitle.textContent='🔗 QUẢN LÝ TELEGRAM & PHÂN TỔ';"),'tiêu đề đặt lại không đổi chữ thường');
// CSS điện thoại
assert.match(html,/\.dd-gon\{[^}]*touch-action:manipulation/); assert.match(html,/body\.mobile-view \.dd-tieude \.capacity-quick-btn\{min-height:44px;\}/);
// cùng một hiệu ứng: fx-expand, chạy mỗi lần mở (không qua once)
const h=html.match(/function hieuUngMoKhoi\(el\)\{[\s\S]*?\n\}\n/); assert.ok(h,'không thấy hieuUngMoKhoi');
assert.match(h[0],/fx-expand/); assert.ok(!/once\(/.test(h[0]));
assert.ok(html.includes("if(!ddGd.gon[m]) hieuUngMoKhoi(document.getElementById('ddThan'+m.toUpperCase()));"),'Điểm danh/Phát sữa dùng cùng hiệu ứng khi mở');
// chạy thật trong vm
const cls=new Set(); const el={hidden:true,offsetWidth:1,classList:{remove:c=>cls.delete(c),add:c=>cls.add(c)}};
const nut={a:{},textContent:'Hiện ▼',setAttribute(k,v){this.a[k]=v;}}; let click;
const code=h[0]+html.match(/document\.getElementById\('staffToggle'\)\?\.addEventListener\('click',\(\)=>\{[\s\S]*?\n\}\);/)[0];
const dem={n:0}; vm.runInNewContext(code,{document:{getElementById:id=>id==='staffBody'?el:{addEventListener:(_,f)=>{click=f;},setAttribute:(k,v)=>nut.setAttribute(k,v),get textContent(){return nut.textContent;},set textContent(v){nut.textContent=v;}}},setTimeout:f=>{dem.n++;},String});
click(); assert.equal(el.hidden,false); assert.equal(nut.a['aria-expanded'],'true'); assert.equal(nut.textContent,'Ẩn ▲'); assert.ok(cls.has('fx-expand'));
click(); assert.equal(el.hidden,true); assert.equal(nut.textContent,'Hiện ▼'); assert.equal(nut.a['aria-expanded'],'false');
cls.clear(); click(); assert.ok(cls.has('fx-expand'),'mở lần sau vẫn chạy hiệu ứng');
console.log('PASS khối Telegram: cùng kiểu tiêu đề Điểm danh, mặc định thu gọn, mở/đóng đúng, cùng hiệu ứng fx-expand mỗi lần mở');
