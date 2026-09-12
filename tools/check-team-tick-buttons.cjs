// 2026-09-12 thiet ke lai lan 2: tick gan to CHI o KHSX (bang Ke hoach tuan),
// da chon roi thi CHI CON 2 O (xoa do + to dang chon) cho gon trong cot hep -
// tranh 5 nut xep hang doc gay xau/mat can doi. Doi to: bam xoa truoc, danh
// sach 5 to hien lai, tick to moi. TDSX (Tien do) chi hien 1 tick tinh (khong
// bam duoc) cho to da gan; can doi to phai qua KHSX. To ho tro theo ngay
// (TDSX) dung lai kieu tick gon giong het KHSX, va chi cho tick khi to dan
// NGAY DO chua dien so (=0); da dien so > 0 thi khoa lai (con ho tro da gan
// thi van hien ten, khong tick doi duoc).
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
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'};
   applyRoleUI();
   document.getElementById('loginOverlay').style.display='none';
   sheetRows=[
     {id:'O_TICK',date:'11/09/2026',ma:'TICK',dong:'Test tick',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''},
     {id:'O_SUP',date:'11/09/2026',ma:'SUP',dong:'Test ho tro',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''},
   ];
   assignments['O_TICK']={to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{}};
   assignments['O_SUP']={to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{'11/09/2026':{dan:0}},support_by_date:{}};
   recomputeAllDayKeys();
   populateMonthYearFilters();
   refreshForMonthYear();
   // renderProgress() lan dau de sinh cac <option> ngay; luc nay <select> chua
   // co option '11/09/2026' nen gan .value truoc do se bi bo qua (select
   // khong nhan value khong khop option nao). Sau khi co option roi, gan lai
   // va renderProgress() lan 2 thi cac lan render sau (goi lai tu ben trong
   // handleAssignChange khi doi to o KHSX) se giu dung ngay dang xem.
   renderProgress();
   progressDaySelect.value='11/09/2026';
   renderProgress();
   renderAutoPlanDaySelect();
   document.getElementById('autoPlanDaySelect').value='11/09/2026';
   renderAutoPlan();

   const out={};
   const planChipsOf=()=>{
     const row=document.querySelector('#autoPlanTable tbody tr[data-order-id="O_TICK"]');
     return row?[...row.querySelectorAll('button.to-select.to-tick-btn')]:[];
   };

   // --- (1) KHSX: da gan thi chi con 2 o (xoa + to dang chon) ---
   let chips=planChipsOf();
   out.planChipCountSelected=chips.length;
   out.planActiveTeam=chips.find(b=>b.classList.contains('active'))?.dataset.team;
   out.planHasRemoveBtn=chips.some(b=>b.classList.contains('to-tick-remove'));

   // --- (2) TDSX luc dau (chua doi gi): to la 1 tick tinh, khong bam duoc ---
   const progRowBefore=document.querySelector('#progressTable tbody tr[data-order-id="O_TICK"]');
   const progToBtnsBefore=progRowBefore?[...progRowBefore.querySelectorAll('button.to-select.to-tick-btn')]:[];
   out.progressToBtnCount=progToBtnsBefore.length;
   out.progressToBtnDisabled=progToBtnsBefore.every(b=>b.disabled);
   out.progressToBtnText=progToBtnsBefore.map(b=>b.textContent.trim()).join(',');

   // Bam xoa o KHSX -> phai hien lai du 5 to de chon
   chips.find(b=>b.classList.contains('to-tick-remove'))?.click();
   chips=planChipsOf();
   out.planChipCountAfterClear=chips.length;
   out.planAssignmentAfterClear=assignments['O_TICK'].to;

   // Tick To 3 trong danh sach 5 to -> gan xong, gap lai con 2 o
   chips.find(b=>b.dataset.team==='Tổ 3')?.click();
   chips=planChipsOf();
   out.planChipCountAfterPick=chips.length;
   out.planActiveAfterPick=chips.find(b=>b.classList.contains('active'))?.dataset.team;
   out.planAssignmentAfterPick=assignments['O_TICK'].to;

   // Doi to o KHSX phai dong bo sang TDSX ngay (van la 1 tick tinh, gio hien To 3)
   const progRowAfter=document.querySelector('#progressTable tbody tr[data-order-id="O_TICK"]');
   out.progressToTextAfterKhsxChange=progRowAfter?.querySelector('button.to-select.to-tick-btn')?.textContent.trim();

   // --- (3) To ho tro TDSX: dan ngay do = 0 -> duoc tick, dang gon 2 o khi da gan ---
   const supRow=document.querySelector('#progressTable tbody tr[data-order-id="O_SUP"]');
   out.supportChipsWhenZero=supRow?[...supRow.querySelectorAll('button.support-day-select.to-tick-btn')].length:-1;

   // Dan ngay do > 0, CHUA gan ho tro -> an han (khong nut, khong ten)
   assignments['O_SUP'].stage_by_date['11/09/2026'].dan=6;
   renderProgress();
   const supRow2=document.querySelector('#progressTable tbody tr[data-order-id="O_SUP"]');
   out.supportChipsWhenNonZeroNoAssign=supRow2?[...supRow2.querySelectorAll('button.support-day-select.to-tick-btn')].length:-1;
   out.supportCellWhenNonZeroNoAssign=supRow2?.querySelector('td.col-support')?.textContent.trim();

   // Dan ngay do > 0, DA co ho tro tu truoc -> hien ten, khoa tick
   assignments['O_SUP'].support_by_date['11/09/2026']='Tổ 4';
   renderProgress();
   const supRow3=document.querySelector('#progressTable tbody tr[data-order-id="O_SUP"]');
   out.supportChipsWhenNonZeroAssigned=supRow3?[...supRow3.querySelectorAll('button.support-day-select.to-tick-btn')].length:-1;
   out.supportCellWhenNonZeroAssigned=supRow3?.querySelector('td.col-support')?.textContent.trim();

   return out;
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.planChipCountSelected, 2, 'KHSX da gan roi thi chi con 2 o (xoa + to dang chon)');
 assert.equal(result.planActiveTeam, 'Tổ 1', 'KHSX luc dau phai hien dung To 1 dang gan');
 assert.equal(result.planHasRemoveBtn, true, 'KHSX phai co o xoa (do) ben canh to dang chon');
 assert.equal(result.planChipCountAfterClear, 5, 'Bam xoa xong phai hien lai du 5 to de chon');
 assert.equal(result.planAssignmentAfterClear, null, 'Bam xoa phai bo gan to (ve null)');
 assert.equal(result.planChipCountAfterPick, 2, 'Tick To 3 xong phai gap lai chi con 2 o');
 assert.equal(result.planActiveAfterPick, 'Tổ 3', 'Sau khi tick, o con lai phai la To 3 dang active');
 assert.equal(result.planAssignmentAfterPick, 'Tổ 3', 'Tick To 3 phai doi to lam sang To 3');
 assert.equal(result.progressToBtnCount, 1, 'TDSX chi duoc 1 tick tinh the hien to dang gan');
 assert.equal(result.progressToBtnDisabled, true, 'TDSX tick to phai la disabled, khong bam doi duoc');
 assert.equal(result.progressToBtnText, 'Tổ 1', 'TDSX phai hien dung ten to dang gan');
 assert.equal(result.progressToTextAfterKhsxChange, 'Tổ 3', 'Doi to o KHSX phai dong bo ngay sang tick tinh ben TDSX');
 assert.equal(result.supportChipsWhenZero>0, true, 'Dan ngay do = 0 thi phai duoc tick to ho tro');
 assert.equal(result.supportChipsWhenNonZeroNoAssign, 0, 'Dan ngay do > 0 va chua gan ho tro thi phai khoa (khong nut)');
 assert.equal(result.supportCellWhenNonZeroNoAssign, '—', 'Dan ngay do > 0 va chua gan ho tro thi o phai an han (gach ngang)');
 assert.equal(result.supportChipsWhenNonZeroAssigned, 0, 'Dan ngay do > 0 nhung DA gan ho tro truoc do thi khong con tick doi duoc');
 assert.ok(result.supportCellWhenNonZeroAssigned && result.supportCellWhenNonZeroAssigned.includes('Tổ 4'), 'Ho tro da gan tu truoc van phai hien ten to, khong mat du lieu');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: KHSX tick gon 2 o (xoa+dang chon), xoa xong hien lai 5 to; TDSX chi 1 tick tinh; to ho tro TDSX cung kieu gon, chi tick duoc khi dan ngay do = 0');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
