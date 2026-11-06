// Tab KHSX trên điện thoại: ô tìm hiện sẵn trên dãy chọn tổ, dùng chung với ô tìm của bảng, tìm cả ghi chú; không còn nút ⚙.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||path.join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.pathname.includes('xlsx'))return route.continue();return route.fulfill({contentType:'application/json',body:'[]'});});
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});
 const kq=await page.evaluate(async()=>{
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'}; applyRoleUI(); document.getElementById('loginOverlay').style.display='none'; document.getElementById('mainContent').style.display='block';
   sheetRows=[
     {id:'O1',date:'11/09/2026',ma:'SORA10-1',dong:'Sora',ngang:'100',dai:'200',day:'10',so_luong:5,ghi_chu:'giao gấp cho đại lý',nhom_don_hang:''},
     {id:'O2',date:'11/09/2026',ma:'ZONE22-8',dong:'3-Zone',ngang:'180',dai:'200',day:'22',so_luong:5,ghi_chu:'',nhom_don_hang:''},
   ];
   recomputeAllDayKeys(); populateMonthYearFilters(); monthFilterSelect.value='9'; yearFilterSelect.value='2026'; refreshForMonthYear();
   renderAutoPlanDaySelect(); document.getElementById('autoPlanDaySelect').value='11/09/2026';
   document.querySelector('[data-tab="autoplan"]')?.click();
   document.getElementById('mainContent').style.setProperty('display','block','important');
   const mb=document.getElementById('autoPlanSearchMobile'), hop=document.getElementById('autoPlanSearchBox');
   const out={mobileView:document.body.classList.contains('mobile-view'),coNutBanhRang:!!document.getElementById('nutLocKhsx')};
   const vis=el=>{const r=el.getBoundingClientRect();const cs=getComputedStyle(el);return cs.display!=='none'&&r.width>0&&r.height>0;};
   out.oTimHien=vis(mb);
   const chip=document.getElementById('chipLocTo'); out.oTimTrenChip=mb.getBoundingClientRect().bottom<=chip.getBoundingClientRect().top+1;
   const dem=()=>document.querySelectorAll('#autoPlanTable tbody tr[data-order-id]').length;
   renderAutoPlan(); out.tong=dem();
   const go=async v=>{mb.value=v; mb.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,400));};
   await go('giao gấp'); out.theoGhiChu=dem(); out.hopDongBo=hop.value;
   await go('zone22'); out.theoMa=dem();
   await go('khong co'); out.khongKhop=dem();
   hop.value='sora'; hop.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,400)); out.moBangDongBo=mb.value; out.theoTenTuBang=dem();
   mb.parentElement.querySelector('.search-clear-btn').click(); await new Promise(r=>setTimeout(r,100)); out.sauXoa=dem(); out.xoaCaHai=(mb.value===''&&hop.value==='');
   return out;
 });
 console.log(JSON.stringify(kq));
 assert.equal(kq.mobileView,true,'phải ở chế độ điện thoại'); assert.equal(kq.coNutBanhRang,false,'không còn nút ⚙');
 assert.equal(kq.oTimHien,true,'ô tìm hiện sẵn'); assert.equal(kq.oTimTrenChip,true,'ô tìm nằm trên dãy chọn tổ');
 assert.equal(kq.tong,2); assert.equal(kq.theoGhiChu,1,'tìm được theo ghi chú'); assert.equal(kq.hopDongBo,'giao gấp','đồng bộ sang ô của bảng');
 assert.equal(kq.theoMa,1); assert.equal(kq.khongKhop,0); assert.equal(kq.moBangDongBo,'sora','ô bảng đổi thì ô điện thoại đổi theo'); assert.equal(kq.theoTenTuBang,1);
 assert.equal(kq.sauXoa,2); assert.equal(kq.xoaCaHai,true);
 assert.equal(errors.length,0,'không lỗi JS: '+errors.join('|'));
 console.log('PASS KHSX điện thoại: ô tìm hiện sẵn trên dãy tổ, đồng bộ với ô bảng, tìm cả ghi chú, nút xóa chạy, không còn ⚙');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
