// 2026-09-14 bug that: Phuoc (quan_ly_2) duoc tick phoi_board_use, thay nut
// "Bang dat phoi" nhung bam vao khong ra popup. Nguyen nhan: #phoiModal con
// dinh class CSS cu "only-manager" (body:not(.role-quan-ly) .only-manager{
// display:none!important}) - JS mo dung nhung CSS cu de mat, giong loi da
// gap o Dot 4.1/4.3. Fix: bo class do khoi #phoiModal.
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
   // Phuoc: quan_ly_2, duoc tick phoi_board_use (khong phai chu tai khoan)
   currentUser={auth_user_id:'5c7fbd28-0bff-47da-9d25-9ecccce68e5b',role:'quan_ly_2',name:'Le Huu Phuoc'};
   myPermissionKeys=new Set(['phoi_board_use']);
   applyRoleUI();
   applyPermissionTabGates();
   sheetRows=[{id:'O1',date:'14/09/2026',ma:'X',dong:'Test',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''}];
   recomputeAllDayKeys();
   const btnVisible=getComputedStyle(document.getElementById('phoiBtn')).display!=='none';
   document.getElementById('phoiBtn').click();
   const modalDisplay=getComputedStyle(document.getElementById('phoiModal')).display;
   return {btnVisible, modalDisplay};
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.btnVisible, true, 'Phuoc co phoi_board_use thi phai thay nut Bang dat phoi');
 assert.equal(result.modalDisplay, 'block', 'Bam nut phai mo duoc popup Bang dat phoi (khong bi CSS only-manager de mat)');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: Phuoc (quan_ly_2) co phoi_board_use thi bam nut mo duoc popup Bang dat phoi');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
