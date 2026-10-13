// Mã nền gọn và an toàn (bản 243): không khai báo hàm trùng tên, mọi lệnh gọi mạng ngoài đều có hạn chờ, không còn file sao lưu trong repo.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const goc=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(goc,'index.html'),'utf8').split('\r\n').join('\n');
// 1) không hàm nào khai báo hai lần trong index.html (JavaScript chỉ lấy bản cuối, các bản trước là mã chết dễ gây nhầm)
const ten=[...html.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map(m=>m[1]);
const trung=[...new Set(ten.filter((t,i)=>ten.indexOf(t)!==i))];
assert.deepEqual(trung,[],'hàm khai báo hai lần: '+trung.join(', '));
console.log('PASS không có hàm nào khai báo trùng tên ('+ten.length+' hàm)');
// 2) lệnh gọi mạng: chỉ được dùng fetch trần ở các chỗ có chủ ý (gói hạn chờ, gửi tin chạy ngầm)
const fetchTran=html.split('\n').map((l,i)=>[i+1,l]).filter(([,l])=>/(?<![\w.])fetch\(/.test(l)&&!/^\s*(\/\/|\*)/.test(l)&&!/Apps Script Web App không hỗ trợ/.test(l));
const choPhep=fetchTran.filter(([,l])=>/return await fetch\(url,Object\.assign/.test(l)||/khsx-gui-tin/.test(l));
assert.equal(fetchTran.length,choPhep.length,'fetch trần ngoài danh sách cho phép: '+fetchTran.filter(x=>!choPhep.includes(x)).map(x=>x[0]+': '+x[1].trim().slice(0,70)).join(' | '));
assert.ok(/async function fetchCoHan\(url,opt,ms\)/.test(html)&&/AbortController/.test(html)&&/fetchCoHanDai/.test(html));
console.log('PASS mọi lệnh gọi mạng đều qua fetchCoHan / fetchCoHanDai (trừ hàm hạn chờ và gửi tin chạy ngầm)');
// 3) fetchCoHan thật sự dừng khi máy chủ treo
const m=html.match(/async function fetchCoHan\(url,opt,ms\)\{[\s\S]*?\n\}\nconst fetchCoHanDai=[^\n]*\n/); assert.ok(m);
const ctx={AbortController,setTimeout,clearTimeout,Object,Error,Promise,fetch:(u,o)=>new Promise((_,rej)=>{ o.signal.addEventListener('abort',()=>rej(new Error('abort'))); })};
const vm=require('node:vm'); vm.createContext(ctx); vm.runInContext(m[0]+';this.fetchCoHan=fetchCoHan;',ctx);
(async()=>{
  const t0=Date.now();
  await assert.rejects(()=>ctx.fetchCoHan('x',{},120),/Hết thời gian chờ máy chủ/);
  assert.ok(Date.now()-t0<2000,'dừng đúng hạn');
  ctx.fetch=()=>Promise.resolve({ok:true}); const r=await ctx.fetchCoHan('x',{},120); assert.equal(r.ok,true);
  ctx.fetch=()=>Promise.reject(new TypeError('mất mạng')); await assert.rejects(()=>ctx.fetchCoHan('x',{},120),/mất mạng/);   // lỗi mạng thật giữ nguyên
  console.log('PASS fetchCoHan: treo thì dừng đúng hạn với thông báo tiếng Việt, trả lời bình thường thì qua, lỗi mạng giữ nguyên');
  // 4) không còn file sao lưu trong repo
  const sao=fs.readdirSync(goc).filter(f=>/^index_backup.*\.html$/.test(f));
  assert.deepEqual(sao,[],'file sao lưu còn trong repo: '+sao.join(', '));
  console.log('PASS không còn file index_backup*.html trong repo');
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
