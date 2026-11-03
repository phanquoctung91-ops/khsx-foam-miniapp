// 2026-09-14 yeu cau anh Tung: danh sach loc ngay trong Bang dat phoi truoc
// day liet ke TAT CA ngay co don (moi thang), mac dinh chon tu ngay dau tien
// toi ngay cuoi cung -> bang qua rong/lan thang. Sua: chi liet ke ngay trong
// THANG DANG CHON o header (cuon them van chi ra ngay khac trong CUNG thang),
// mac dinh chon 7 ngay gan nhat trong thang do.
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
   currentUser={auth_user_id:'7ebce211-e3b0-4195-9207-ff46506e13d6',role:'quan_ly',name:'Owner Test'};
   applyRoleUI();
   // 12 ngay thang 9/2026 (thang header hien tai) + 3 ngay thang 8/2026 (thang khac)
   sheetRows=[
     ...Array.from({length:12},(_,i)=>({id:'S'+(i+1),date:`0${i+1<10?'0'+(i+1):(i+1)}`.slice(-2)+'/09/2026',ma:'X'+i,dong:'Test',ngang:'100',dai:'100',day:'10',so_luong:10,ghi_chu:'',nhom_don_hang:''})),
     {id:'A1',date:'20/08/2026',ma:'A1',dong:'Test',ngang:'100',dai:'100',day:'10',so_luong:5,ghi_chu:'',nhom_don_hang:''},
     {id:'A2',date:'21/08/2026',ma:'A2',dong:'Test',ngang:'100',dai:'100',day:'10',so_luong:5,ghi_chu:'',nhom_don_hang:''},
   ];
   recomputeAllDayKeys();
   populateMonthYearFilters(); // mac dinh mo o thang/nam thuc te hien tai (2026-09)
   refreshForMonthYear();

   moBangDatPhoi();

   // Từ 26/09/2026 hai ô là ô lịch (type=date), mở ra luôn là hôm nay.
   const tuEl=document.getElementById('phoiTuNgay'), denEl=document.getElementById('phoiDenNgay');
   const t=new Date(), hom=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
   return {tuType:tuEl.type, denType:denEl.type, tu:tuEl.value, den:denEl.value, hom, modal:document.getElementById('phoiModal').style.display};
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.tuType, 'date', 'Tu ngay la o lich'); assert.equal(result.denType, 'date', 'Den ngay la o lich');
 assert.equal(result.modal, 'block', 'Bang dat phoi phai mo');
 assert.equal(result.tu, result.hom, 'Mac dinh Tu ngay la hom nay'); assert.equal(result.den, result.hom, 'Mac dinh Den ngay la hom nay');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: Bang dat phoi mo ra voi o lich Tu ngay / Den ngay mac dinh la hom nay');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
