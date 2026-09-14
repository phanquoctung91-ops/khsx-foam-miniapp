// 2026-09-14 Phan D: order_cancel/order_restore (phat hien da co san tinh
// nang, khong phai lam moi nhu tuong ban dau) + hien thi sua duoc theo
// hr_edit_profile/hr_revoke_restore tren bang tai khoan Telegram (SUPABASE_VARIANT
// dung nhanh nay, KHONG phai .staff-team-select - do la nhanh cu, da chet).
// LUU Y: nut Luu/Thu hoi/Khoi phuc tai khoan Telegram con bi Edge Function
// khsx-telegram-account chan cung rieng (MANAGER2_NEW_EMPLOYEE_ONLY) - chi
// test duoc phan hien thi/dieu huong o client, CHUA test duoc luong luu
// that vi can sua ca Edge Function (viec khac, ngoai pham vi file nay).
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
   sheetRows=[{id:'O1',date:'14/09/2026',ma:'X',dong:'Test',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''}];
   assignments['O1']={to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{}};
   recomputeAllDayKeys();
   populateMonthYearFilters();
   refreshForMonthYear();
   renderAutoPlanDaySelect();
   renderAutoPlan();
   window.prompt=()=>'ly do test';
   window.confirm=()=>true;

   const out={};

   // --- order_cancel: CHUA co quyen -> bam Xoa khong duoc tien hanh ---
   let row=document.querySelector('#autoPlanTable tbody tr[data-order-id="O1"]');
   out.trashBtnVisibleNoPerm = !!row.querySelector('.trash-btn');
   row.querySelector('.trash-btn')?.click();
   await new Promise(r=>setTimeout(r,20));
   out.orderDeletedNoPerm = deletedOrderIds.includes('O1');

   // --- Cap quyen order_cancel ---
   myPermissionKeys=new Set(['order_cancel']);
   applyPermissionTabGates();
   renderAutoPlan();
   row=document.querySelector('#autoPlanTable tbody tr[data-order-id="O1"]');
   row.querySelector('.trash-btn')?.click();
   await new Promise(r=>setTimeout(r,20));
   out.orderDeletedWithPerm = deletedOrderIds.includes('O1');
   out.cancelledMetaSavedWithPerm = !!cancelledOrderMeta['O1'];

   // --- order_restore: cap them order_restore, bam Khoi phuc ---
   myPermissionKeys=new Set(['order_cancel','order_restore']);
   applyPermissionTabGates();
   renderCancelledOrders();
   const restoreBtn=document.querySelector('.restore-order-btn[data-restore-order-id="O1"]');
   out.restoreBtnFound = !!restoreBtn;
   restoreBtn?.click();
   await new Promise(r=>setTimeout(r,20));
   out.orderStillDeletedAfterRestore = deletedOrderIds.includes('O1');

   // --- hr_edit_profile / hr_revoke_restore: hien thi sua duoc tren bang Telegram ---
   supabaseAdminProfiles=[{user_id:'u-nv01',telegram_user_id:111,display_name:'NV Test',role:'nhan_vien',unit_name:'To 1',active:true}];
   myPermissionKeys=new Set();
   applyPermissionTabGates();
   renderStaffUsersList();
   out.telegramRowEditableNoPerm = !!document.querySelector('.save-telegram-account-btn');

   myPermissionKeys=new Set(['hr_edit_profile']);
   applyPermissionTabGates();
   renderStaffUsersList();
   out.telegramRowEditableWithHrEdit = !!document.querySelector('.save-telegram-account-btn');
   out.telegramRevokeBtnWithHrEditOnly = !!document.querySelector('.revoke-telegram-account-btn');

   return out;
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.trashBtnVisibleNoPerm, true, 'Nut Xoa/Huy don phai hien (chi khoa hanh vi bam, khong an nut)');
 assert.equal(result.orderDeletedNoPerm, false, 'Phuoc CHUA co order_cancel: bam Xoa khong duoc huy don that su');
 assert.equal(result.orderDeletedWithPerm, true, 'Phuoc CO order_cancel: bam Xoa phai huy don that su');
 assert.equal(result.cancelledMetaSavedWithPerm, true, 'Huy don xong phai luu duoc ly do/metadata don da huy');
 assert.equal(result.restoreBtnFound, true, 'Nut Khoi phuc phai hien trong danh sach don da huy');
 assert.equal(result.orderStillDeletedAfterRestore, false, 'Phuoc CO order_restore: bam Khoi phuc phai dua don tro lai (het nam trong deletedOrderIds)');
 assert.equal(result.telegramRowEditableNoPerm, false, 'Phuoc CHUA co hr_edit_profile/hr_revoke_restore: bang Telegram phai o che do Chi xem');
 assert.equal(result.telegramRowEditableWithHrEdit, true, 'Phuoc CO hr_edit_profile: bang Telegram phai hien duoc sua (nut Luu)');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: order_cancel + order_restore dung theo tick that; bang Telegram hien dung theo hr_edit_profile/hr_revoke_restore (luu y: nut Luu/Thu hoi con bi Edge Function chan rieng, chua sua trong dot nay)');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
