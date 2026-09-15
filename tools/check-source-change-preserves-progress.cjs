// 2026-09-15 bug that (tra ra tu vu bao cao dong goi lech dashboard 7 don vi):
// xuLyThayDoiNguon() khi don nguon (sheet cong ty) doi thong tin ma tien do CU
// (da dan/may/dong goi) van nam gon trong ke hoach MOI, code cu chi gan tien do
// vao assignments[next.id] CUC BO, khong ghi that vao khsx_stage_progress cua
// next.id - don CU sau do bi xoa mem nen tien do that bien mat khoi dashboard
// (chi con tren bao cao/Sheet da chup truoc do). Tra ra dung 4 don thuc te bi
// mat dung 7 don vi trong khoang 07-13/9/2026, khop chinh xac so lech nguoi
// dung bao. Sua: ghi that qua recordStagePatch (dung RPC that) thay vi chi gan
// cuc bo.
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
 await page.addInitScript(()=>{
   class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;
   window.confirm=()=>true; // "Xac nhan nguon?" luon dong y trong test
 });
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 const result=await page.evaluate(async ()=>{
   currentUser={auth_user_id:'7ebce211-e3b0-4195-9207-ff46506e13d6',role:'quan_ly',name:'Owner Test'};
   applyRoleUI();

   const oldOrder={id:'r_old_test_1',date:'09/09/2026',ma:'TEST10-6',dong:'Test',ngang:'160',dai:'200',day:'10',so_luong:20};
   const nextOrder={id:'r_new_test_1',date:'09/09/2026',ma:'TEST10-6',dong:'Test',ngang:'160',dai:'200',day:'10',so_luong:25};
   orderEntityStore?.patch(oldOrder); orderEntityStore?.patch(nextOrder);

   // Don CU da co tien do that: dan 5, may 5, dong_goi 5 - nam gon trong ke hoach
   // MOI (25) -> roi dung nhanh cuoi (truoc day chi gan cuc bo, la nhanh co bug that).
   assignments[oldOrder.id]={to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{'09/09/2026':{dan:5,may:5,dong_goi:5}},support_by_date:{}};

   const calls=[];
   recordStagePatch=(o,ngay,congDoan,value,team)=>{ calls.push({orderId:o.id,ngay,congDoan,value,team}); };

   pendingSheetChanges['r_old_test_1']={old:oldOrder,next:nextOrder,onlyQty:true,desc:'Test doi so luong'};

   await xuLyThayDoiNguon('r_old_test_1');

   return {
     calls,
     assignedToNext: assignments[nextOrder.id]?.stage_by_date,
     oldOrderRemoved: !assignments[oldOrder.id],
   };
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.oldOrderRemoved, true, 'Don cu phai bi xoa khoi assignments cuc bo (hanh vi cu khong doi)');
 assert.equal(result.calls.length, 3, 'Phai ghi THAT ca 3 cong doan (dan/may/dong_goi) cua don MOI qua recordStagePatch, khong chi gan cuc bo');
 const byStage=Object.fromEntries(result.calls.map(c=>[c.congDoan,c]));
 assert.equal(byStage.dan?.orderId, 'r_new_test_1', 'Phai ghi vao DUNG don MOI (next.id), khong phai don cu');
 assert.equal(byStage.dan?.value, 5, 'Gia tri dan phai dung bang tien do cu (5)');
 assert.equal(byStage.may?.value, 5, 'Gia tri may phai dung bang tien do cu (5)');
 assert.equal(byStage.dong_goi?.value, 5, 'Gia tri dong_goi phai dung bang tien do cu (5) - day la con so tung bi mat trong bug that');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: xuLyThayDoiNguon ghi that tien do cu vao don moi qua RPC, khong con mat sau khi don cu bi xoa mem');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
