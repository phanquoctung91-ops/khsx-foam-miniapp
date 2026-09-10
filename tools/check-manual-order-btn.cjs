const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={};for(const m of ['select','range','eq','is','not','order','limit','in','gte','lte','update','upsert','insert','delete'])q[m]=()=>q;q.maybeSingle=()=>{q.single=true;return q};q.then=(resolve,reject)=>options.global.fetch(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data:q.single?(data[0]||null):data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name,args)=>{const r=await options.global.fetch(url+'/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args||{})});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}},
 channel(){const c={on:(t,f,cb)=>{return c},subscribe:cb=>{c.cb=cb;cb('SUBSCRIBED');return c}};return c},removeChannel(c){c.cb?.('CLOSED')}
})};`;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage(),errors=[],consoleErrors=[];
 page.on('pageerror',e=>errors.push(e.message+'\n'+e.stack));
 page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:sdk});
   if(u.pathname.includes('xlsx'))return route.continue();
   if(u.pathname.startsWith('/rest/v1/')){let data=[];if(u.pathname.endsWith('/khsx_profiles'))data=[{user_id:'A',display_name:'LOCAL TEST',role:'quan_ly',active:true}];return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});}
   return route.fulfill({contentType:'application/javascript',body:''});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(e=>errors.push('bootstrap timeout: '+e.message));
 const loginResult=await page.evaluate(async()=>{
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'};window.__testSession={user:{id:'A'}};
   applyRoleUI();document.getElementById('loginOverlay').style.display='none';
   return await loadSupabaseOperationalData();
 }).catch(e=>({error:e.message}));
 console.log('loginResult:', loginResult);
 console.log('errors after bootstrap:', errors.length, errors);
 console.log('consoleErrors:', consoleErrors.slice(0,10));
 // Thu bam nut Them don phat sinh
 const clickResult=await page.evaluate(()=>{
   const test=(btnId,formId)=>{
     const btn=document.getElementById(btnId), form=document.getElementById(formId);
     if(!btn) return {ok:false, reason:'khong tim thay '+btnId};
     if(!form) return {ok:false, reason:'khong tim thay '+formId};
     const btnVisible=!!(btn.offsetWidth||btn.offsetHeight||btn.getClientRects().length);
     const btnComputedDisplay=getComputedStyle(btn).display;
     const before=form.style.display;
     btn.click();
     const after=form.style.display;
     return {ok:true, before, after, btnVisible, btnComputedDisplay, btnHasOnlyManagerClass:btn.classList.contains('only-manager'), btnHasOnlyManager2Class:btn.classList.contains('only-manager2')};
   };
   return {autoplan:test('addManualOrderBtn','manualOrderForm'), progress:test('addManualOrderBtnProgress','manualOrderFormProgress'), canManage: typeof canManage==='function'?canManage():'n/a', canManage2: typeof canManage2==='function'?canManage2():'n/a', role: currentUser?.role};
 }).catch(e=>({ok:false, reason:e.message}));
 console.log('clickResult:', JSON.stringify(clickResult, null, 2));
 console.log('errors total:', errors.length, errors);
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
