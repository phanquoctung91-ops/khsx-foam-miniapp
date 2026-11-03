// Khối "Quản lý Telegram & phân tổ" mặc định thu gọn, bấm tiêu đề để mở/đóng.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const a=html.indexOf('<div class="card" id="staffAccountCard">'), b=html.indexOf('<div id="stageChoiceModal"');
assert.ok(a>0&&b>a,'không thấy khối staffAccountCard');
const the=html.slice(a,b);
assert.match(the,/<button type="button" id="staffToggle" aria-expanded="false" aria-controls="staffBody"/,'tiêu đề là nút, mặc định đóng');
assert.match(the,/<div id="staffBody" hidden>/,'thân khối mặc định ẩn');
for(const id of ['supabaseTelegramAdmin','staffUsersList','telegramAccessRequests']) assert.ok(the.indexOf('id="staffBody"')<the.indexOf(`id="${id}"`),id+' nằm trong thân thu gọn');
assert.ok(the.indexOf('id="staffModalTitle"')<the.indexOf('id="staffBody"'),'tiêu đề nằm ngoài thân thu gọn');
const mo=(the.match(/<div\b/g)||[]).length, dong=(the.match(/<\/div>/g)||[]).length;
assert.equal(dong-mo,2,'thẻ div cân bằng: đoạn cắt còn 2 thẻ đóng của khung tab bên ngoài card');
// chạy đúng đoạn xử lý bấm trong vm
const m=html.match(/document\.getElementById\('staffToggle'\)\?\.addEventListener\('click',\(\)=>\{[\s\S]*?\n\}\);/); assert.ok(m,'không thấy xử lý bấm');
const el={body:{hidden:true},btn:{a:{},setAttribute(k,v){this.a[k]=v;},click:null},chev:{textContent:'▸'}};
const doc={getElementById:id=>({staffBody:el.body,staffToggle:{addEventListener:(_,f)=>{el.click=f;},setAttribute:(k,v)=>el.btn.setAttribute(k,v)},staffChevron:el.chev})[id]};
vm.runInNewContext(m[0],{document:doc,String});
el.click(); assert.equal(el.body.hidden,false); assert.equal(el.btn.a['aria-expanded'],'true'); assert.equal(el.chev.textContent,'▾');
el.click(); assert.equal(el.body.hidden,true); assert.equal(el.btn.a['aria-expanded'],'false'); assert.equal(el.chev.textContent,'▸');
console.log('PASS khối Telegram & phân tổ: mặc định thu gọn, bấm mở/đóng đúng, div cân bằng, danh sách nằm trong thân');
