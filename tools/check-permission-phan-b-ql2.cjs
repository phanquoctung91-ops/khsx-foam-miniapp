// 2026-09-14 Phan B: nut lockPlanBtn + progress_unlock cho quan_ly_2 (Phuoc).
// lockPlanBtn: truoc day "only-manager" (chi quan_ly), gio hien theo
// khsx_lock_plan/khsx_unlock_plan, va nut Luu ben trong (saveLockPlanBtn)
// khong con chan cung canManage(). progress_unlock: sua lo "quan_ly_2 bi tu
// dong merge lai ngay da bo tick" - neu co progress_unlock thi gui dung danh
// sach da tick (mo khoa duoc that su).
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
   if(u.pathname.includes('/rpc/khsx_set_day_locks'))return route.fulfill({contentType:'application/json',body:'1'});
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
   sheetRows=[{id:'O1',date:'14/09/2026',ma:'X',dong:'Test',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''}];
   assignments['O1']={to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{}};
   recomputeAllDayKeys();
   populateMonthYearFilters();
   refreshForMonthYear();
   renderAutoPlanDaySelect();
   renderAutoPlan();

   // Gia lap luon thanh cong de kiem dung "danh sach gui di" quyet dinh boi
   // quyen, khong phu thuoc phien dang nhap/RPC that (ngoai pham vi test nay).
   const savedCalls=[];
   saveSupabaseDayLocks = async (kind,picked,allDates,snapshots)=>{ savedCalls.push({kind,picked:[...picked]}); return {ok:true}; };

   const out={};
   out.lockPlanBtnDisplayNoPerm = getComputedStyle(document.getElementById('lockPlanBtn')).display;

   // --- progress_unlock: gia lap 1 ngay dang chot san (KHONG co progress_unlock) ---
   lockedProgressDates=['14/09/2026'];
   document.getElementById('lockProgressBtn').click();
   let box=[...document.querySelectorAll('#lockProgressDates input')].find(i=>i.value==='14/09/2026');
   out.progressCheckboxDisabledNoPerm = box?box.disabled:null;
   box.checked=false; // co gang bo tick de mo khoa (se khong tac dung vi disabled/merge lai)
   document.getElementById('saveLockProgressBtn').click();
   await new Promise(r=>setTimeout(r,80));
   out.lockedProgressDatesAfterNoPerm = [...lockedProgressDates];

   // --- Cap quyen ---
   myPermissionKeys=new Set(['khsx_lock_plan','khsx_unlock_plan','progress_unlock']);
   applyPermissionTabGates();

   out.lockPlanBtnDisplayWithPerm = getComputedStyle(document.getElementById('lockPlanBtn')).display;

   lockedProgressDates=['14/09/2026'];
   document.getElementById('lockProgressPanel').style.display='none';
   document.getElementById('lockProgressBtn').click();
   box=[...document.querySelectorAll('#lockProgressDates input')].find(i=>i.value==='14/09/2026');
   out.progressCheckboxDisabledWithPerm = box?box.disabled:null;
   box.checked=false;
   document.getElementById('saveLockProgressBtn').click();
   await new Promise(r=>setTimeout(r,80));
   out.lockedProgressDatesAfterWithPerm = [...lockedProgressDates];

   return out;
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.lockPlanBtnDisplayNoPerm, 'none', 'Phuoc CHUA co khsx_lock_plan/unlock_plan: nut Chot dau vao phai an');
 assert.equal(result.progressCheckboxDisabledNoPerm, true, 'Phuoc CHUA co progress_unlock: o tick ngay da chot phai khoa (khong bo tick duoc)');
 assert.deepEqual(result.lockedProgressDatesAfterNoPerm, ['14/09/2026'], 'Phuoc CHUA co progress_unlock: ngay da chot phai VAN CON sau khi bam Luu (khong mo khoa duoc)');

 assert.notEqual(result.lockPlanBtnDisplayWithPerm, 'none', 'Phuoc CO khsx_lock_plan/unlock_plan: nut Chot dau vao phai hien');
 assert.equal(result.progressCheckboxDisabledWithPerm, false, 'Phuoc CO progress_unlock: o tick phai bo khoa duoc');
 assert.deepEqual(result.lockedProgressDatesAfterWithPerm, [], 'Phuoc CO progress_unlock: bo tick xong bam Luu phai THAT SU mo khoa (danh sach rong)');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: lockPlanBtn + progress_unlock dung theo tick that cho quan_ly_2 (Phuoc)');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
