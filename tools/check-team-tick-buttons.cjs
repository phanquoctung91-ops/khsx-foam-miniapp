// Doi dropdown gan to (to-select) va gan to ho tro theo ngay (support-day-select)
// tu <select> sang dau tick (button). Bam tick sang to khac -> doi to lam ngay
// (khong con dropdown). Bam "Bo ho tro" -> xoa to ho tro.
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
   sheetRows=[{id:'O_TICK',date:'11/09/2026',ma:'TICK',dong:'Test tick',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''}];
   assignments['O_TICK']={to:'Tổ 1',to_goc:'Tổ 1',stage_by_date:{}};
   recomputeAllDayKeys();
   populateMonthYearFilters();
   refreshForMonthYear();
   progressDaySelect.value='11/09/2026';
   renderProgress();

   const row=document.querySelector('#progressTable tbody tr[data-order-id="O_TICK"]');
   const chips=row?[...row.querySelectorAll('button.to-select.to-tick-btn')]:[];
   const activeBefore=chips.find(b=>b.classList.contains('active'))?.dataset.team;

   // Bam sang To 3 (khac to dang gan)
   const to3=chips.find(b=>b.dataset.team==='Tổ 3');
   to3?.click();
   const rowAfter=document.querySelector('#progressTable tbody tr[data-order-id="O_TICK"]');
   const chipsAfter=rowAfter?[...rowAfter.querySelectorAll('button.to-select.to-tick-btn')]:[];
   const activeAfter=chipsAfter.find(b=>b.classList.contains('active'))?.dataset.team;

   return {
     chipCount:chips.length,
     activeBefore,
     assignmentToAfterClick: assignments['O_TICK'].to,
     activeAfter,
   };
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.chipCount, 5, 'phai co du 5 tick To 1..5 thay cho dropdown');
 assert.equal(result.activeBefore, 'Tổ 1', 'luc dau phai tick dung To 1 dang gan');
 assert.equal(result.assignmentToAfterClick, 'Tổ 3', 'bam tick To 3 phai doi to lam sang To 3');
 assert.equal(result.activeAfter, 'Tổ 3', 'sau khi bam, tick To 3 phai hien active, khong con o To 1');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: dau tick thay dropdown gan to - bam tick sang to khac doi dung to lam');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
