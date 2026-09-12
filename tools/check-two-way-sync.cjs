// May khac nhap tien do -> may nay dang dung yen tab Tong thong ke/Nang luc phai
// tu ve lai, khong duoc dung im cho toi khi F5. Kiem tra applySupabaseProgressEvent
// (realtime instant patch) va nhanh tai lai toan bo (scheduleSupabaseReload/
// loadSupabaseOperationalData qua cac diem vao) co goi renderMonthly/renderCapacityStats.
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
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 const result=await page.evaluate(async()=>{
   currentUser={auth_user_id:'owner-test',role:'quan_ly',name:'x'};
   applyRoleUI();
   document.getElementById('capacityFromDate').value='2026-09-01';
   document.getElementById('capacityToDate').value='2026-09-12';
   let monthlyCalls=0, capacityCalls=0;
   const origMonthly=renderMonthly, origCapacity=renderCapacityStats;
   window.renderMonthly=function(){monthlyCalls++;return origMonthly.apply(this,arguments);};
   window.renderCapacityStats=function(){capacityCalls++;return origCapacity.apply(this,arguments);};
   applySupabaseProgressEvent({eventType:'INSERT',new:{order_id:'ZZZ_NOEXIST',work_date:'2026-09-12',stage:'dan',quantity:1,kpi_team:'To 1',completed_by_worker_id:null,updated_at:new Date().toISOString()}});
   return {monthlyCalls, capacityCalls};
 });
 console.log(JSON.stringify(result));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.monthlyCalls, 1, 'applySupabaseProgressEvent phai tu goi renderMonthly, khong duoc dung im');
 assert.equal(result.capacityCalls, 1, 'applySupabaseProgressEvent phai tu goi renderCapacityStats khi tab da mo (co gia tri ngay loc)');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: realtime patch tu ve lai ca tab Tong thong ke va Nang luc, khong doi F5');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
