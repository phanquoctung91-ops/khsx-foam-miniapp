// Sidebar Nang luc lech filter: (1) doi ngay tu doi phai render lai ngay, khong
// can bam nut; (2) roi tab roi quay lai giu nguyen khoang ngay da chon, khong
// bi ep ve "tuan nay"; (3) doi thang/nam header cung render lai neu tab da mo.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table};for(const m of ['select','range','eq','is','not','in','gte','lte','update'])q[m]=()=>q;
  q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async()=>({data:[],error:null}),
 channel(){const c={on:(t,f,cb)=>c,subscribe:cb=>{c.cb=cb;cb('SUBSCRIBED');return c}};return c},removeChannel(c){c.cb?.('CLOSED')}
})};`;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(u.pathname.includes('xlsx'))return route.continue();
   return route.fulfill({contentType:'application/json',body:'[]'});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 const result=await page.evaluate(async()=>{
   currentUser={auth_user_id:'owner-test',role:'quan_ly',name:'x'};
   applyRoleUI();
   document.querySelector('.tab-btn[data-tab="capacity"]').click();
   const fromEl=document.getElementById('capacityFromDate'), toEl=document.getElementById('capacityToDate');
   const rangeAfterFirstOpen=document.getElementById('capacityStatsRange').textContent;

   // (1) doi ngay tu -> phai tu render lai (range text doi), khong can bam nut
   fromEl.value='2026-01-05';
   fromEl.dispatchEvent(new Event('change'));
   const rangeAfterDateChange=document.getElementById('capacityStatsRange').textContent;

   // roi tab sang progress roi quay lai capacity -> phai GIU khoang ngay vua chon
   document.querySelector('.tab-btn[data-tab="progress"]').click();
   document.querySelector('.tab-btn[data-tab="capacity"]').click();
   const fromAfterReenter=fromEl.value;

   // (3) doi thang/nam header -> phai render lai (khong loi, khong reset ve rong)
   const before=document.getElementById('capacityStatsRange').textContent;
   yearFilterSelect.value=String(Number(yearFilterSelect.value)-1);
   yearFilterSelect.dispatchEvent(new Event('change'));
   const afterHeaderChange=document.getElementById('capacityStatsRange').textContent;

   return {rangeAfterFirstOpen, rangeAfterDateChange, fromAfterReenter, before, afterHeaderChange};
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.match(result.rangeAfterFirstOpen, /→/, 'lan dau mo tab phai tu dong ve tuan nay va render duoc');
 assert.match(result.rangeAfterDateChange, /05\/01\/2026/, 'doi ngay tu phai tu render lai ngay, khong can bam nut');
 assert.equal(result.fromAfterReenter, '2026-01-05', 'roi tab roi quay lai phai GIU dung khoang ngay da chon, khong bi ep ve tuan nay');
 assert.notEqual(result.afterHeaderChange, '', 'doi thang/nam header phai render lai, khong de trong/loi');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS sidebar Nang luc: auto-refresh khi doi ngay, giu filter khi doi tab, render lai khi doi header');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
