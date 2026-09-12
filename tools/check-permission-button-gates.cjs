// Dot 4.3: 2 nut (Bang dat phoi, Hoan thanh hang loat) phai an/hien dung theo
// permission_key that (phoi_board_use, progress_bulk_complete), khong con
// thuan theo canManage2()/only-manager/only-manager2 CSS nua.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const OWNER='7ebce211-e3b0-4195-9207-ff46506e13d6';
const PHUOC='5c7fbd28-0bff-47da-9d25-9ecccce68e5b';
const NHANVIEN='da1bfeb6-0720-40fb-8432-ef42f51a3346';
const PHUOC_PERMS=['phoi_board_use','progress_bulk_complete','assign_team','assign_support','khsx_priority','progress_lock'];
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table};for(const m of ['select','range','eq','is','not','in','gte','lte','update'])q[m]=()=>q;
  q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name,args)=>{
   if(name==='khsx_my_permissions'){
     const uid=window.__testSession?.user?.id;
     if(uid==='${OWNER}')return {data:[],error:null};
     if(uid==='${PHUOC}')return {data:${JSON.stringify(PHUOC_PERMS)},error:null};
     return {data:[],error:null};
   }
   return {data:null,error:{message:'unexpected rpc '+name}};
 },
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
   if(u.pathname.startsWith('/rest/v1/')){
     const table=u.pathname.split('/rest/v1/')[1]; let data=[];
     if(table==='khsx_profiles')data=[{user_id:'A',display_name:'x',role:'quan_ly',active:true}];
     return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   return route.fulfill({contentType:'application/javascript',body:''});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 async function buttonsAs(uid, role){
   return page.evaluate(async(payload)=>{
     const {uid,role}=payload;
     currentUser={auth_user_id:uid,role,name:'x'};window.__testSession={user:{id:uid}};
     applyRoleUI();
     await loadMyPermissions();
     const ids=['phoiBtn','bulkCompleteBtn'];
     const out={};
     ids.forEach(id=>{const b=document.getElementById(id);out[id]=b?getComputedStyle(b).display!=='none':null;});
     return out;
   }, {uid, role});
 }

 const asOwner=await buttonsAs(OWNER,'quan_ly');
 const asPhuoc=await buttonsAs(PHUOC,'quan_ly_2');
 const asNV=await buttonsAs(NHANVIEN,'nhan_vien');
 console.log('asOwner:', JSON.stringify(asOwner));
 console.log('asPhuoc:', JSON.stringify(asPhuoc));
 console.log('asNV:', JSON.stringify(asNV));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(asOwner.phoiBtn, true, 'chu tai khoan phai thay nut Bang dat phoi');
 assert.equal(asOwner.bulkCompleteBtn, true, 'chu tai khoan phai thay nut Hoan thanh hang loat');
 assert.equal(asPhuoc.phoiBtn, true, 'Phuoc co quyen phoi_board_use -> phai thay');
 assert.equal(asPhuoc.bulkCompleteBtn, true, 'Phuoc co quyen progress_bulk_complete -> phai thay');
 assert.equal(asNV.phoiBtn, false, 'nhan vien khong co quyen -> phai an nut Bang dat phoi');
 assert.equal(asNV.bulkCompleteBtn, false, 'nhan vien khong co quyen -> phai an nut Hoan thanh hang loat');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS Dot 4.3: nut Bang dat phoi + Hoan thanh hang loat an/hien dung theo permission_key');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
