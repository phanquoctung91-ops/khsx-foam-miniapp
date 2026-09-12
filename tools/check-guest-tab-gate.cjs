// Dot 4.1 gay hoi quy: link khach xem (?view=guest) dung chung applyPermissionTabGates,
// khach khong co auth_user_id nen myPermissionKeys rong -> tab monthly/autoplan bi an mat.
// Test nay mo phong dung URL ?view=guest that (PUBLIC_VIEW_MODE doc tu URLSearchParams,
// khong the set qua JS) va kiem tab monthly/autoplan hien, cac tab con lai van an.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table};for(const m of ['select','range','eq','is','not','in','gte','lte','update'])q[m]=()=>q;
  q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name)=>{ if(name==='khsx_guest_dashboard_v116') return {data:{orders:[],lockedPlanDates:[],lockedProgressDates:[]},error:null}; return {data:null,error:null}; },
 channel(){const c={on:(t,f,cb)=>c,subscribe:cb=>{c.cb=cb;cb('SUBSCRIBED');return c}};return c},removeChannel(c){c.cb?.('CLOSED')}
})};`;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.split('?')[0]));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
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
 await page.goto(base+'/index.html?view=guest');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});
 await page.waitForTimeout(300);

 const tabs=await page.evaluate(()=>{
   const ids=['monthly','autoplan','progress','capacity','report','wage','staff','settings'];
   const out={};
   ids.forEach(t=>{const b=document.querySelector(`.tab-btn[data-tab="${t}"]`);out[t]=b?getComputedStyle(b).display!=='none':null;});
   return out;
 });
 console.log('tabs as guest (?view=guest):', JSON.stringify(tabs));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(tabs.monthly, true, 'khach phai thay Tong thong ke san xuat');
 assert.equal(tabs.autoplan, true, 'khach phai thay Ke hoach san xuat');
 assert.equal(tabs.capacity, false, 'khach khong duoc thay Nang luc');
 assert.equal(tabs.report, false, 'khach khong duoc thay Xuat bao cao');
 assert.equal(tabs.wage, false, 'khach khong duoc thay So lieu luong');
 assert.equal(tabs.staff, false, 'khach khong duoc thay Nhan su');
 assert.equal(tabs.settings, false, 'khach khong duoc thay Cai dat');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: link khach xem (?view=guest) thay dung 2 tab Tong thong ke + KHSX, cac tab con lai van an');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
