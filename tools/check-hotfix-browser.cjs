// The page is real; every external request is intercepted. Never reaches Supabase/Sheets.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){},signOut:async()=>({}),setSession:async()=>({}),getUser:async()=>({data:{user:window.__testSession?.user}})},
 from(table){const q={};for(const m of ['select','range','eq','is','not','order','limit','in','gte','lte','update','upsert','insert','delete'])q[m]=()=>q;q.maybeSingle=()=>{q.single=true;return q};q.then=(resolve,reject)=>options.global.fetch(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data:q.single?(data[0]||null):data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name,args)=>{const r=await options.global.fetch(url+'/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args||{})});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}},
 channel(){const c={on:(type,filter,cb)=>{(window.__subscriptions||=[]).push(filter);return c},subscribe:cb=>{c.cb=cb;cb('SUBSCRIBED');return c}};return c},removeChannel(c){c.cb?.('CLOSED')}
})};`;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(u.pathname.startsWith('/rest/v1/')){
     requests.push(u.pathname);
     let data=[];if(u.pathname.endsWith('/khsx_hotfix_get_mode'))data={mode:'normal'};
     if(u.pathname.endsWith('/khsx_profiles'))data=[{user_id:'A',display_name:'LOCAL TEST',role:'quan_ly',active:true}];
     return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   return route.fulfill({contentType:'application/javascript',body:''});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.__khsxBootstrapDone);
 assert.deepEqual(errors,[]);
 const loaded=await page.evaluate(async()=>{
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'};window.__testSession={user:{id:'A'}};
   hotfixBindAccount();hotfixVerifiedVisible=true;applyRoleUI();document.getElementById('loginOverlay').style.display='none';
   return await loadSupabaseOperationalData();
 });assert.equal(loaded,true);assert.deepEqual(errors,[]);
 requests.length=0;
 await page.evaluate(()=>loadSupabaseOperationalData({tables:['khsx_stage_progress','khsx_stage_credits']}));
 assert.deepEqual(requests.sort(),['/rest/v1/khsx_stage_credits','/rest/v1/khsx_stage_progress']);
 console.log('PASS real app boots; progress invalidation rereads only progress/credits instead of all 12 datasets');
 const result=await page.evaluate(async()=>{
   const context={accountId:'A',deviceId:getSupabaseDeviceId()};const item=KhsxHotfixSync.bindItem({key:'x',operation_id:'x',order_id:'LOCAL',stage:'dan',work_date:'08/09/2026'},context);
   supabaseStageOutbox.x=item;persistSupabaseStageOutbox();renderHotfixStatus();showHotfixQueue();document.getElementById('hotfixQueueDialog').close();
   const old=supabaseStageOutbox,account=hotfixAccount,device=hotfixDevice;
   currentUser={auth_user_id:'B',role:'nhan_vien',name:'OTHER'};hotfixBindAccount();
   delete old.x;hotfixPersist(SUPABASE_STAGE_OUTBOX_KEY,old,account,device);
   const leaked=Object.keys(supabaseStageOutbox).length;
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'};hotfixBindAccount();
   supabasePrimaryActive=true;await Promise.all([startSupabaseRealtime(),startSupabaseRealtime()]);
   return {leaked,queue:Object.keys(supabaseStageOutbox).length,subscriptions:window.__subscriptions.length};
 });assert.equal(result.leaked,0);assert.equal(result.queue,0);assert.equal(result.subscriptions,9);
 console.log('PASS account isolation and old-account acknowledgment storage; concurrent realtime starts create one channel');
 await page.evaluate(()=>{renderHotfixStatus();showHotfixQueue()});
 assert(await page.locator('#hotfixQueueDialog').isVisible());
 await page.screenshot({path:path.join(root,'.hotfix-test/hotfix-queue.png')});
 assert.deepEqual(errors,[]);console.log('PASS queue dialog renders with no runtime errors; all external calls mocked');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
