const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){},signOut:async()=>({}),setSession:async()=>({}),getUser:async()=>({data:{user:window.__testSession?.user}})},
 from(table){const q={};for(const m of ['select','range','eq','is','not','order','limit','in','gte','lte','update','upsert','insert','delete'])q[m]=()=>q;q.maybeSingle=()=>{q.single=true;return q};q.then=(resolve,reject)=>options.global.fetch(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data:q.single?(data[0]||null):data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name,args)=>{window.__rpcCalls=window.__rpcCalls||[];window.__rpcCalls.push({name,args});if(name==='khsx_reconcile_sheet_plan')return {data:{ok:true,changed:true,inserted:args.p_source_orders.length,cancelled:0,review_count:0},error:null};const r=await options.global.fetch(url+'/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args||{})});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}},
 channel(){const c={on:(type,filter,cb)=>{(window.__subscriptions||=[]).push(filter);return c},subscribe:cb=>{c.cb=cb;cb('SUBSCRIBED');return c}};return c},removeChannel(c){c.cb?.('CLOSED')}
})};`;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(u.pathname.includes('xlsx'))return route.continue();
   if(u.pathname.startsWith('/rest/v1/')){requests.push(u.pathname);return route.fulfill({contentType:'application/json',body:'[]'});}
   return route.fulfill({contentType:'application/javascript',body:''});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});
 const fileBuf=fs.readFileSync(path.join(root,'.hotfix-test/KHSX_100926.xlsx'));
 const result=await page.evaluate(async(b64)=>{
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'};window.__testSession={user:{id:'A'}};
   const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
   const file=new File([bytes],'KHSX 100926.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   const tables=await readOfflineTables(file);
   const rows=tables.flatMap(t=>parseSheetTable(t).rows);
   const finalRows=applyLotSplitRule(assignStableIds(rows));
   window.__rpcCalls=[];
   const out=await reconcileSourceRowsToSupabase(finalRows,{silent:false});
   return {rowCount:rows.length,finalRowCount:finalRows.length,out,rpcCalls:window.__rpcCalls.map(c=>({name:c.name,orderCount:c.args.p_source_orders?.length,sample:c.args.p_source_orders?.slice(0,2)}))};
 }, fileBuf.toString('base64'));
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
