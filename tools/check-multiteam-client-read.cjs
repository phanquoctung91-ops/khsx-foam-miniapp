// Tick nhieu to (Giai doan C/D, phan doc) - tam dung tinh nang nay theo yeu cau
// 2026-09-12, chi giu phan doc du lieu (khong doi hanh vi hom nay, an toan de
// giu lai). Don Y, KH=10, Tổ 1 dan 6 + Tổ 2 dan 4 CUNG 1 ngay CUNG 1 don.
// Kiem tra: (1) du lieu CU (1 to/ngay, dang so) van dung y het nhu truoc; (2)
// du lieu MOI (nhieu to/ngay, dang object) duoc tinh tong dung, khong mat so;
// (3) khoa hang doi (outbox) co them to, khong con dung cho 2 to cung gui cung
// luc. KHONG kiem cot "Ke hoach" rieng tung to trong capacity-core
// (teamReport.daDan) - do van gan het cho 1 "chu don" (owner), chua chia theo
// tung to that su dan - day la phan con lai cua tinh nang da tam dung, xem
// PLAN-multi-team-per-order.md.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('xlsx'))return route.continue();
   return route.fulfill({contentType:'application/json',body:'[]'});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 const result=await page.evaluate(()=>{
   const out={};

   // --- (1) Du lieu CU: 1 to/ngay, dang so (nhu 100% du lieu that hien nay) ---
   const oLegacy={id:'O_LEGACY',date:'11/09/2026',so_luong:10};
   assignments['O_LEGACY']={to:'Tổ 1',stage_by_date:{'11/09/2026':{dan:6,_dan_to:'Tổ 1'}}};
   out.legacy_tongCongDoan = tongCongDoan(oLegacy,'dan');
   out.legacy_giaTriNgay = giaTriCongDoanNgay(oLegacy,'11/09/2026','dan');

   // --- (2) Du lieu MOI: 2 to CUNG 1 ngay, dang object ---
   const oMulti={id:'O_MULTI',date:'11/09/2026',so_luong:10};
   assignments['O_MULTI']={to:'Tổ 1',stage_by_date:{'11/09/2026':{dan:{'Tổ 1':6,'Tổ 2':4}}}};
   out.multi_tongCongDoan = tongCongDoan(oMulti,'dan');
   out.multi_giaTriNgay = giaTriCongDoanNgay(oMulti,'11/09/2026','dan');
   out.multi_mucTheoTo = mucCongDoanTheoTo(assignments['O_MULTI'].stage_by_date['11/09/2026'],'dan');

   // --- (3) khoa outbox: 2 to cung ngay cung cong doan phai la 2 khoa khac nhau ---
   currentUser={auth_user_id:'x',role:'quan_ly',name:'x'};
   queueStagePatchForSupabase(oMulti,'11/09/2026','dan',6,'Tổ 1',null,false);
   queueStagePatchForSupabase(oMulti,'11/09/2026','dan',4,'Tổ 2',null,false);
   out.outbox_keys = Object.keys(supabaseStageOutbox).filter(k=>k.startsWith('O_MULTI|'));
   out.outbox_to1_value = supabaseStageOutbox['O_MULTI|11/09/2026|dan|Tổ 1']?.value;
   out.outbox_to2_value = supabaseStageOutbox['O_MULTI|11/09/2026|dan|Tổ 2']?.value;

   return out;
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.legacy_tongCongDoan, 6, 'du lieu cu (1 to/ngay) phai tinh dung y het truoc gio');
 assert.equal(result.legacy_giaTriNgay, 6, 'du lieu cu doc gia tri ngay phai dung y het truoc gio');
 assert.equal(result.multi_tongCongDoan, 10, 'nhieu to cung ngay phai CONG DUNG tong (6+4=10), khong duoc mat so');
 assert.equal(result.multi_giaTriNgay, 10, 'giaTriCongDoanNgay phai tra ve tong ca ngay (10) khi nhieu to');
 assert.deepEqual(result.multi_mucTheoTo, {'Tổ 1':6,'Tổ 2':4}, 'phai doc dung tung to rieng');
 assert.equal(result.outbox_keys.length, 2, 'phai co 2 khoa outbox rieng cho 2 to, khong duoc de mat gui cua nhau');
 assert.equal(result.outbox_to1_value, 6, 'goi outbox cua To 1 phai giu dung gia tri 6');
 assert.equal(result.outbox_to2_value, 4, 'goi outbox cua To 2 phai giu dung gia tri 4, khong bi to 1 de mat');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: doc du lieu cu 1 to/ngay dung y het truoc gio; nhieu to cung ngay tinh dung tong, dung outbox rieng (capacity-core Ke hoach theo tung to: chua lam, tinh nang dang tam dung)');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
