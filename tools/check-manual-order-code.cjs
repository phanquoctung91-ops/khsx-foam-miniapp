// Don phat sinh (them tay) phai mang du 'ma' (product_code) giong don nap tu file,
// khong con bi ghi cung 'product_code:""' nhu truoc.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table,_payload:null};for(const m of ['select','range','eq','is','not','order','limit','in','gte','lte','update'])q[m]=()=>q;
  q.insert=(payload)=>{q._payload=payload;window.__insertCalls=window.__insertCalls||[];window.__insertCalls.push({table,payload});return q;};
  q.maybeSingle=()=>{q.single=true;return q};q.single=()=>{q._single=true;return q};
  q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data:q._single?(Array.isArray(data)?data[0]:data)||{id:q._payload?.id}:data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
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
   if(u.pathname.startsWith('/rest/v1/')){let data=[];if(u.pathname.endsWith('/khsx_profiles'))data=[{user_id:'A',display_name:'LOCAL TEST',role:'quan_ly',active:true}];return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});}
   return route.fulfill({contentType:'application/javascript',body:''});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});
 await page.evaluate(async()=>{
   currentUser={auth_user_id:'A',role:'quan_ly',name:'LOCAL TEST'};window.__testSession={user:{id:'A'}};
   applyRoleUI();document.getElementById('loginOverlay').style.display='none';
   await loadSupabaseOperationalData();
 });
 // Chuyen sang tab Ke hoach san xuat truoc (form nam trong panel do, co the dang
 // an do khong phai tab mac dinh), roi dien form qua JS (khong phu thuoc hien thi CSS).
 await page.evaluate(()=>{
   document.querySelector('[data-tab="autoplan"]')?.click();
   document.getElementById('panel-autoplan')?.classList.add('active');
   document.querySelectorAll('.panel').forEach(p=>{if(p.id!=='panel-autoplan')p.style.display='none';});
   document.getElementById('panel-autoplan').style.display='block';
   document.getElementById('addManualOrderBtn').click();
   document.getElementById('manualOrderDate').value='2026-09-15';
   document.getElementById('manualOrderCode').value='SORA10-6';
   document.getElementById('manualOrderName').value='Sora';
   document.getElementById('manualOrderSize').value='160x200x10';
   document.getElementById('manualOrderQty').value='7';
 });
 await page.evaluate(()=>document.getElementById('saveManualOrderBtn').click());
 await page.waitForTimeout(300);
 const result=await page.evaluate(()=>({
   insertCalls:(window.__insertCalls||[]).map(c=>({table:c.table,product_code:c.payload.product_code,product_name:c.payload.product_name,width_mm:c.payload.width_mm,length_mm:c.payload.length_mm,thickness_mm:c.payload.thickness_mm,plan_qty:c.payload.plan_qty})),
   statusText:document.getElementById('manualOrderStatus').textContent,
   codeFieldClearedAfterSave:document.getElementById('manualOrderCode').value
 }));
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);
 const assert=require('node:assert/strict');
 const call=result.insertCalls.find(c=>c.table==='khsx_orders');
 assert.ok(call, 'khong thay lenh insert vao khsx_orders');
 assert.equal(call.product_code, 'SORA10-6', 'product_code phai la ma vua nhap, khong con rong');
 assert.equal(call.width_mm, 160); assert.equal(call.length_mm, 200); assert.equal(call.thickness_mm, 10);
 assert.equal(result.codeFieldClearedAfterSave, '', 'o ma phai duoc xoa sau khi luu thanh cong');
 console.log('PASS don phat sinh mang du ma hang (product_code) giong don nap tu file');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
