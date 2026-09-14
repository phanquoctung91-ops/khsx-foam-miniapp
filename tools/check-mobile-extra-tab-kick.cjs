// 2026-09-14 bug that (Phuoc bao): tren dien thoai (<=1023px), bam "☰ Thêm" mo
// drawer roi bam tab "Nhân sự" (hoac Cai dat/Luong/Bao cao - deu la .tab-extra)
// thi drawer tu thu gon xong, sau ~24s (lan revalidateSupabaseSession dinh ky
// goi applyRoleUI()) bi tu dong day ve tab Tong thong ke. Nguyen nhan: thu gon
// drawer an TOAN BO .tab-extra (ke ca chinh nut tab dang active), khien logic
// "tab dang mo bi an -> tu chuyen ve tab dau" (applyRoleUI, dong 4030) hieu
// nham la tab bi an vi doi quyen. Fix: khong thu gon drawer neu tab vua bam
// chinh la 1 muc trong drawer.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('xlsx'))return route.continue();
   return route.fulfill({contentType:'application/json',body:'[]'});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 const result=await page.evaluate(async ()=>{
   currentUser={auth_user_id:'5c7fbd28-0bff-47da-9d25-9ecccce68e5b',role:'quan_ly_2',name:'Le Huu Phuoc'};
   myPermissionKeys=new Set(['hr_view']);
   applyRoleUI();
   applyPermissionTabGates();

   // Bam mo drawer "☰ Thêm" (mobile <=1023px, da set viewport 390px)
   document.getElementById('tabsMoreToggle').click();
   const openedExtra = document.getElementById('mainTabs').classList.contains('show-extra');

   // Bam tab Nhan su (1 muc trong drawer)
   document.querySelector('.tab-btn[data-tab="staff"]').click();
   const staffTabDisplayRightAfterClick = getComputedStyle(document.querySelector('.tab-btn[data-tab="staff"]')).display;
   const activeTabRightAfterClick = document.querySelector('.tab-btn.active')?.dataset.tab;

   // Gia lap dung dinh ky 24s (revalidateSupabaseSession goi applyRoleUI())
   applyRoleUI();
   const activeTabAfter24s = document.querySelector('.tab-btn.active')?.dataset.tab;
   const panelStaffStillActive = document.getElementById('panel-staff').classList.contains('active');

   return {openedExtra, staffTabDisplayRightAfterClick, activeTabRightAfterClick, activeTabAfter24s, panelStaffStillActive};
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.openedExtra, true, 'Bam Thêm phai mo duoc drawer (show-extra)');
 assert.notEqual(result.staffTabDisplayRightAfterClick, 'none', 'Bam vao tab Nhan su thi CHINH nut tab do khong duoc tu an');
 assert.equal(result.activeTabRightAfterClick, 'staff', 'Bam xong phai dang o tab Nhan su');
 assert.equal(result.activeTabAfter24s, 'staff', 'Sau lan kiem tra phien dinh ky (24s) VAN PHAI o lai tab Nhan su, khong bi day ve Tong thong ke');
 assert.equal(result.panelStaffStillActive, true, 'Noi dung trang Nhan su van phai hien');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: bam tab trong drawer "Thêm" (Nhan su/Cai dat/Luong/Bao cao) tren dien thoai khong con bi day ve Tong thong ke sau 24s');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
