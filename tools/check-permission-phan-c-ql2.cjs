// 2026-09-14 Phan C: trang Cai dat (settings) cho quan_ly_2 (Phuoc).
// initSettingsPage() truoc day "if(!canManage()) return;" - chan TOAN BO
// trang du tab da hien dung theo quyen. Gio mo theo dung 4 quyen settings_*
// (khop dieu kien PERM_TAB_RULES.settings). 3 hanh dong rieng (tai sao luu,
// nap lai sao luu, luu muc tieu quy) cung phai theo dung tung quyen cu the,
// khong chi mo trang la lam duoc het.
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

 const result=await page.evaluate(async ()=>{
   currentUser={auth_user_id:'5c7fbd28-0bff-47da-9d25-9ecccce68e5b',role:'quan_ly_2',name:'Le Huu Phuoc'};
   myPermissionKeys=new Set();
   applyRoleUI();
   applyPermissionTabGates();
   const out={};

   // --- CHUA co quyen settings_* nao ca ---
   document.getElementById('backupStatus').textContent='';
   document.getElementById('doBackupBtn').click();
   out.backupStatusNoPerm = document.getElementById('backupStatus').textContent;

   document.getElementById('quarterTargetStatus').textContent='UNTOUCHED';
   document.getElementById('quarterTargetSoLuong').value='100';
   document.getElementById('doSaveQuarterTargetBtn').click();
   await new Promise(r=>setTimeout(r,30));
   out.quarterStatusNoPerm = document.getElementById('quarterTargetStatus').textContent;

   // --- Cap du 4 quyen settings ---
   myPermissionKeys=new Set(['settings_backup_download','settings_backup_restore','settings_import_khsx_file','settings_edit_targets']);
   applyPermissionTabGates();

   document.getElementById('quarterTargetStatus').textContent='UNTOUCHED2';
   initSettingsPage(); // khong duoc return som nua - phai reset status ve rong
   out.statusAfterInitWithPerm = document.getElementById('quarterTargetStatus').textContent;

   document.getElementById('backupStatus').textContent='';
   document.getElementById('doBackupBtn').click();
   out.backupStatusWithPerm = document.getElementById('backupStatus').textContent;

   document.getElementById('quarterTargetSoLuong').value='100';
   document.getElementById('quarterTargetQuy').value='1';
   document.getElementById('quarterTargetNam').value='2026';
   document.querySelectorAll('.quarter-workday').forEach(x=>x.checked=true);
   document.getElementById('doSaveQuarterTargetBtn').click();
   await new Promise(r=>setTimeout(r,30));
   out.quarterStatusWithPerm = document.getElementById('quarterTargetStatus').textContent;

   return out;
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.backupStatusNoPerm, '', 'Phuoc CHUA co settings_backup_download: bam nut khong duoc doi gi (return som)');
 assert.equal(result.quarterStatusNoPerm, 'UNTOUCHED', 'Phuoc CHUA co settings_edit_targets: bam Luu khong duoc doi gi (return som)');
 assert.equal(result.statusAfterInitWithPerm, '', 'Phuoc CO 1 trong 4 quyen settings_*: trang Cai dat phai khoi tao that su (khong con return som toan trang)');
 assert.notEqual(result.backupStatusWithPerm, '', 'Phuoc CO settings_backup_download: bam nut phai chay ham that (co trang thai)');
 assert.match(result.quarterStatusWithPerm, /Đã lưu/, 'Phuoc CO settings_edit_targets: bam Luu phai luu thanh cong that su');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: trang Cai dat + 3 hanh dong rieng dung theo tick that cho quan_ly_2 (Phuoc)');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
