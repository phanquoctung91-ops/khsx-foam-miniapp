// 2026-09-14 Phan A: 3 cho quan_ly_2 (Phuoc) dang bi khoa cung theo role, doc
// lap voi 40 quyen tick - phat hien khi rao lai toan bo canManage()/canManage2().
// assign_team: o gan to KHSX (autoPlanTable) truoc day chi mo cho quan_ly (quy
// hoi do doi TDSX thanh chi xem o dot truoc). khsx_priority: o tick + handler
// truoc day "chi Quan ly". settings_guest_link: nut + handler truoc day
// "chi Quan ly". Test ca 2 chieu: KHONG co quyen -> van nhu cu; CO quyen ->
// dung nhu quan_ly.
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
   currentUser={auth_user_id:'5c7fbd28-0bff-47da-9d25-9ecccce68e5b',role:'quan_ly_2',name:'Le Huu Phuoc'};
   myPermissionKeys=new Set(); // chua co quyen gi ca luc dau
   applyRoleUI();
   applyPermissionTabGates();
   sheetRows=[{id:'O1',date:'14/09/2026',ma:'X',dong:'Test',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''}];
   assignments['O1']={to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{}};
   recomputeAllDayKeys();
   populateMonthYearFilters();
   refreshForMonthYear();
   renderAutoPlanDaySelect();
   document.getElementById('autoPlanDaySelect').value='all';
   renderAutoPlan();

   const out={};

   // --- assign_team: CHUA co quyen -> o gan to phai la chu tinh (khong tick) ---
   const rowNoPerm=document.querySelector('#autoPlanTable tbody tr[data-order-id="O1"]');
   out.assignTeamTickCountNoPerm = rowNoPerm?rowNoPerm.querySelectorAll('button.to-select.to-tick-btn').length:-1;

   // --- khsx_priority: CHUA co quyen -> khong co checkbox uu tien ---
   out.priorityCheckboxNoPerm = !!rowNoPerm?.querySelector('.uutien-tick');

   // --- settings_guest_link: CHUA co quyen -> nut an ---
   out.guestLinkDisplayNoPerm = getComputedStyle(document.getElementById('customerViewLinkBtn')).display;

   // --- Cap quyen ---
   myPermissionKeys=new Set(['assign_team','khsx_priority','settings_guest_link']);
   applyPermissionTabGates();
   renderAutoPlan();

   const rowWithPerm=document.querySelector('#autoPlanTable tbody tr[data-order-id="O1"]');
   out.assignTeamTickCountWithPerm = rowWithPerm?rowWithPerm.querySelectorAll('button.to-select.to-tick-btn').length:-1;
   // Da gan (Tổ 1) nen gon 2 o (xoa + Tổ 1 active) - bam xoa truoc de hien lai 5 to, roi tick To 3
   rowWithPerm.querySelector('button.to-select.to-tick-remove')?.click();
   const rowAfterClear=document.querySelector('#autoPlanTable tbody tr[data-order-id="O1"]');
   const to3=[...rowAfterClear.querySelectorAll('button.to-select.to-tick-btn')].find(b=>b.dataset.team==='Tổ 3');
   to3?.click();
   out.assignTeamAfterClickWithPerm = assignments['O1'].to;

   const rowFresh=document.querySelector('#autoPlanTable tbody tr[data-order-id="O1"]');
   out.priorityCheckboxWithPerm = !!rowFresh?.querySelector('.uutien-tick');
   const box=rowFresh.querySelector('.uutien-tick');
   box.checked=true; box.dispatchEvent(new Event('change',{bubbles:true}));
   out.priorityAfterClickWithPerm = !!assignments['O1'].priority;

   out.guestLinkDisplayWithPerm = getComputedStyle(document.getElementById('customerViewLinkBtn')).display;

   return out;
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.assignTeamTickCountNoPerm, 0, 'Phuoc CHUA co assign_team: khong duoc thay tick gan to');
 assert.equal(result.priorityCheckboxNoPerm, false, 'Phuoc CHUA co khsx_priority: khong duoc thay o tick uu tien');
 assert.equal(result.guestLinkDisplayNoPerm, 'none', 'Phuoc CHUA co settings_guest_link: nut phai an');

 assert.equal(result.assignTeamTickCountWithPerm, 2, 'Phuoc CO assign_team: phai thay tick gan to (gon 2 o)');
 assert.equal(result.assignTeamAfterClickWithPerm, 'Tổ 3', 'Phuoc CO assign_team: bam tick phai doi duoc to that su, khong chi hien nut suong');
 assert.equal(result.priorityCheckboxWithPerm, true, 'Phuoc CO khsx_priority: phai thay o tick uu tien');
 assert.equal(result.priorityAfterClickWithPerm, true, 'Phuoc CO khsx_priority: tick phai luu duoc gia tri that');
 assert.notEqual(result.guestLinkDisplayWithPerm, 'none', 'Phuoc CO settings_guest_link: nut phai hien');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: quan_ly_2 (Phuoc) dung theo tick that cho assign_team, khsx_priority, settings_guest_link (ca hien nut lan hanh vi bam)');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
