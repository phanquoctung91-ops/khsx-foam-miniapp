// Layer 1: pending stage outbox must survive a reload race (never silently vanish).
// Layer 2: the stage cell must show a visible sync badge (pending/error) so users
// never mistake "still saving" for "system broke and lost my number".
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={};for(const m of ['select','range','eq','is','not','order','limit','in','gte','lte','update','upsert','insert','delete'])q[m]=()=>q;q.maybeSingle=()=>{q.single=true;return q};q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data:q.single?(data[0]||null):data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name,args)=>{const r=await options.global.fetch(url+'/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args||{})});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}},
 channel(){const c={on:(t,f,cb)=>c,subscribe:cb=>{c.cb=cb;cb('SUBSCRIBED');return c}};return c},removeChannel(c){c.cb?.('CLOSED')}
})};`;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let restData=[]; // dieu khien duoc tu test: khsx_orders/khsx_order_assignments/... tra ve gi khi reload
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(u.pathname.includes('xlsx'))return route.continue();
   if(u.pathname.startsWith('/rest/v1/')){
     const table=u.pathname.split('/rest/v1/')[1];
     let data=[];
     if(table==='khsx_orders')data=[{id:'ORDER_A',production_date:'2026-09-11',deleted_at:null,product_code:'TEST',product_name:'Test',plan_qty:10,is_manual:false,is_drop:false,is_ghost:false,is_warranty:false}];
     if(table==='khsx_profiles')data=[{user_id:'A',display_name:'LOCAL TEST',role:'quan_ly',active:true}];
     // moi bang khac tra ve rong - khong lien quan test nay
     return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   return route.fulfill({contentType:'application/javascript',body:''});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});
 const result=await page.evaluate(async()=>{
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'};window.__testSession={user:{id:'A'}};
   applyRoleUI();document.getElementById('loginOverlay').style.display='none';
   const okLoad=await loadSupabaseOperationalData();
   // Gia lap: nguoi dung vua nhap 5 vao cong doan 'dan' cho ORDER_A ngay 11/09/2026,
   // RPC con dang bay (chua duoc server xac nhan) - dung dung shape ma
   // queueStagePatchForSupabase tao ra.
   const key='ORDER_A|11/09/2026|dan|'; // Dot D: khoa co them tổ (rong = chua ro to)
   supabaseStageOutbox[key]={key,operation_id:'op-test-1',device_id:'DEV1',order_id:'ORDER_A',work_date:'11/09/2026',stage:'dan',
     value:5,kpi_team:null,worker_id:null,occurred_at:new Date().toISOString(),status:'pending',attempts:0,next_attempt_at:0};
   assignments['ORDER_A']=assignments['ORDER_A']||{stage_by_date:{}};
   assignments['ORDER_A'].stage_by_date['11/09/2026']={dan:5};
   renderProgress();
   const badgeHtmlPending=stageSyncBadgeHtml('ORDER_A','11/09/2026','dan');

   // Bay gio gia lap 1 luot reload chay DUNG LUC do (server CHUA co gia tri nay -
   // dung y het RPC con dang xu ly) - day la kich ban gay bug "back lai chua co gi".
   const okReload=await loadSupabaseOperationalData();
   const valueAfterReload=assignments['ORDER_A']?.stage_by_date?.['11/09/2026']?.dan;

   // Gia lap RPC that bai han (loi nghiep vu, khong retry duoc)
   supabaseStageOutbox[key].status='failed';supabaseStageOutbox[key].error_code='INVALID_ASSIGNMENT_INPUT';
   const badgeHtmlError=stageSyncBadgeHtml('ORDER_A','11/09/2026','dan');

   // Gia lap RPC thanh cong -> item bi xoa khoi outbox
   delete supabaseStageOutbox[key];
   const badgeHtmlDone=stageSyncBadgeHtml('ORDER_A','11/09/2026','dan');

   return {okLoad, okReload, valueAfterReload, badgeHtmlPending, badgeHtmlError, badgeHtmlDone};
 }).catch(e=>({error:e.message+'\n'+e.stack}));
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);
 const assert=require('node:assert/strict');
 assert.equal(result.valueAfterReload, 5, 'LAYER 1 FAIL: gia tri dang cho gui bi tai lai xoa mat');
 assert.match(result.badgeHtmlPending, /sync-pending/, 'LAYER 2 FAIL: khong thay badge dang cho');
 assert.match(result.badgeHtmlError, /sync-error/, 'LAYER 2 FAIL: khong thay badge loi');
 assert.equal(result.badgeHtmlDone, '', 'LAYER 2 FAIL: badge phai bien mat khi da xac nhan xong');
 console.log('PASS Layer 1 (overlay bao ve gia tri dang cho gui qua reload) + Layer 2 (badge pending/error/done dung trang thai)');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
