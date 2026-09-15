// 2026-09-15 yeu cau anh Tung: popup "Them don phat sinh" moi - bang nhieu
// dong (Ma, Dong, Kich thuoc, So luong, To phu trach tick nhu KHSX, Ghi chu),
// nut "Them dong" de nhap nhieu don 1 luc, ngay luon mac dinh ve HIEN TAI moi
// lan mo popup (khong giu ngay lan truoc).
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
   currentUser={auth_user_id:'7ebce211-e3b0-4195-9207-ff46506e13d6',role:'quan_ly',name:'Owner Test'};
   applyRoleUI();

   const todayIso=new Date().toISOString().slice(0,10);
   const calls=[];
   createManualOrder = async (arg)=>{ calls.push(arg); return {id:'fake_'+calls.length}; };

   // 1) Bam nut KHSX -> popup mo, mac dinh 1 dong trong, ngay = hom nay
   document.getElementById('addManualOrderBtn').click();
   const modalVisibleAfterKhsx = document.getElementById('manualOrderModal').style.display;
   const dateAfterOpen1 = document.getElementById('manualOrderModalDate').value;
   const rowCountAfterOpen1 = document.querySelectorAll('#manualOrderModalTable tbody tr').length;

   // Doi ngay sang 1 ngay khac roi dong popup
   document.getElementById('manualOrderModalDate').value = '2020-01-01';
   document.getElementById('closeManualOrderModalBtn').click();
   const modalHiddenAfterClose = document.getElementById('manualOrderModal').style.display;

   // 2) Bam nut o tab Tien do -> phai mo LAI dung popup nay, ngay phai VE LAI hom nay (khong giu 2020-01-01)
   document.getElementById('addManualOrderBtnProgress').click();
   const modalVisibleAfterProgress = document.getElementById('manualOrderModal').style.display;
   const dateResetOnReopen = document.getElementById('manualOrderModalDate').value;
   const rowCountAfterOpen2 = document.querySelectorAll('#manualOrderModalTable tbody tr').length;

   // 3) Them dong x2 -> phai co 3 dong
   document.getElementById('manualOrderAddRowBtn').click();
   document.getElementById('manualOrderAddRowBtn').click();
   const rowCountAfterAdd = document.querySelectorAll('#manualOrderModalTable tbody tr').length;

   const rows=[...document.querySelectorAll('#manualOrderModalTable tbody tr')];
   // Dong 1: dien du + tick To 2
   rows[0].querySelector('.mo-ma').value='SORA10-6';
   rows[0].querySelector('.mo-dong').value='Sora';
   rows[0].querySelector('.mo-size').value='160x200x10';
   rows[0].querySelector('.mo-qty').value='5';
   rows[0].querySelector('.mo-note').value='don thu 1';
   rows[0].querySelector('.mo-team-tick[data-team="Tổ 2"]').click();
   const activeTeamRow1 = rows[0].querySelector('.mo-team-tick.active')?.dataset.team;

   // Dong 2: de trong hoan toan (phai bi bo qua khi luu, khong bao loi)
   // Dong 3: dien du, KHONG tick to (to phai la null/khong bat buoc)
   rows[2].querySelector('.mo-dong').value='Luna';
   rows[2].querySelector('.mo-size').value='160x200x15';
   rows[2].querySelector('.mo-qty').value='3';

   document.getElementById('saveManualOrderModalBtn').click();
   await new Promise(r=>setTimeout(r,50));
   const statusText = document.getElementById('manualOrderModalStatus').textContent;
   const rowCountAfterSave = document.querySelectorAll('#manualOrderModalTable tbody tr').length;

   return {
     modalVisibleAfterKhsx, dateAfterOpen1, todayIso, rowCountAfterOpen1,
     modalHiddenAfterClose, modalVisibleAfterProgress, dateResetOnReopen, rowCountAfterOpen2,
     rowCountAfterAdd, activeTeamRow1, calls, statusText, rowCountAfterSave
   };
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.modalVisibleAfterKhsx, 'block', 'Bam nut KHSX phai mo popup');
 assert.equal(result.dateAfterOpen1, result.todayIso, 'Mo popup lan dau phai mac dinh ngay hien tai');
 assert.equal(result.rowCountAfterOpen1, 1, 'Mo popup mac dinh phai co dung 1 dong trong');
 assert.equal(result.modalHiddenAfterClose, 'none', 'Bam Dong phai an popup');
 assert.equal(result.modalVisibleAfterProgress, 'block', 'Bam nut o tab Tien do phai mo DUNG popup dung chung');
 assert.equal(result.dateResetOnReopen, result.todayIso, 'Moi lan mo popup ngay phai VE LAI hien tai, khong giu ngay lan truoc');
 assert.equal(result.rowCountAfterOpen2, 1, 'Mo popup lai cung phai reset ve 1 dong trong, khong cong don len dong cu');
 assert.equal(result.rowCountAfterAdd, 3, 'Bam Them dong 2 lan phai ra 3 dong');
 assert.equal(result.activeTeamRow1, 'Tổ 2', 'Tick Tổ 2 o dong 1 phai chon dung To 2');
 assert.equal(result.calls.length, 2, 'Dong trong (dong 2) phai bi bo qua, chi luu 2 don co du lieu');
 assert.equal(result.calls[0].team, 'Tổ 2', 'Don 1 phai gui dung to da tick');
 assert.equal(result.calls[1].team, null, 'Don 3 khong tick to thi phai gui null (khong bat buoc chon to)');
 assert.equal(result.calls[0].dateVal, result.todayIso, 'Ca 2 don phai dung chung 1 ngay cua popup');
 assert.match(result.statusText, /Đã thêm 2 đơn hàng/, 'Phai bao dung so don da luu thanh cong');
 assert.equal(result.rowCountAfterSave, 1, 'Dong da luu bi xoa khoi bang, chi con lai dong trong (dong 2) chua dien');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: Popup them don phat sinh - nhieu dong, to tick nhu KHSX, ngay luon mac dinh hien tai');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
