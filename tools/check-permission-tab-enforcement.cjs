// Dot 4.1: 6 tab (Tong thong ke, KHSX, Nang luc, Bao cao, Luong, Nhan su) phai
// an/hien theo dung permission_key that (goi RPC khsx_my_permissions that su),
// khong con thuan theo role nua. Test bang 3 loai tai khoan that: chu tai khoan
// (luon thay het), Le Huu Phuoc (24 quyen that), 1 nhan vien (chi 1 quyen).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const OWNER='7ebce211-e3b0-4195-9207-ff46506e13d6';
const PHUOC='5c7fbd28-0bff-47da-9d25-9ecccce68e5b';
const NHANVIEN='da1bfeb6-0720-40fb-8432-ef42f51a3346';
// Dung DUNG danh sach 24 quyen that cua Phuoc (sau khi sua) de mo phong RPC that.
const PHUOC_PERMS=['assign_support','assign_team','capacity_export','capacity_view','hr_view','khsx_edit_order',
 'khsx_priority','khsx_view_plan','order_view_cancelled','overtime_manage','payroll_view','progress_enter_dan',
 'progress_enter_dong_goi','progress_enter_for_other','progress_enter_may','progress_lock','progress_reduce',
 'progress_view_all','view_overview','warranty_import_temp','warranty_view','hr_edit_profile','report_export',
 'progress_bulk_complete'];
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table};for(const m of ['select','range','eq','is','not','in','gte','lte','update'])q[m]=()=>q;
  q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name,args)=>{
   if(name==='khsx_my_permissions'){
     const uid=window.__testSession?.user?.id;
     if(uid==='${OWNER}')return {data:['view_overview','khsx_view_plan','capacity_view','report_export','report_sign_off','payroll_view','hr_view'],error:null};
     if(uid==='${PHUOC}')return {data:${JSON.stringify(PHUOC_PERMS)},error:null};
     if(uid==='${NHANVIEN}')return {data:['progress_enter_dan'],error:null};
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

 async function visibleTabsAs(uid, role){
   return page.evaluate(async(payload)=>{
     const {uid,role}=payload;
     currentUser={auth_user_id:uid,role,name:'x'};window.__testSession={user:{id:uid}};
     applyRoleUI();
     await loadMyPermissions();
     const tabs=['monthly','autoplan','progress','capacity','report','wage','staff','settings'];
     const out={};
     tabs.forEach(t=>{const b=document.querySelector(`.tab-btn[data-tab="${t}"]`);out[t]=b?getComputedStyle(b).display!=='none':null;});
     return out;
   }, {uid, role});
 }

 const asOwner=await visibleTabsAs(OWNER,'quan_ly');
 const asPhuoc=await visibleTabsAs(PHUOC,'quan_ly_2');
 const asNV=await visibleTabsAs(NHANVIEN,'nhan_vien');
 console.log('asOwner:', JSON.stringify(asOwner));
 console.log('asPhuoc:', JSON.stringify(asPhuoc));
 console.log('asNV:', JSON.stringify(asNV));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 // Chu tai khoan: luon thay het (dung is_owner bypass, khong phu thuoc mang quyen mock)
 Object.values(asOwner).forEach(v=>assert.equal(v,true,'chu tai khoan phai thay moi tab'));
 // Phuoc: co du 24 quyen, co the xem duoc: monthly,autoplan,progress(luon co),capacity,wage,staff,report
 // KHONG co settings_* nao -> settings phai an
 assert.equal(asPhuoc.monthly, true);
 assert.equal(asPhuoc.autoplan, true);
 assert.equal(asPhuoc.progress, true);
 assert.equal(asPhuoc.capacity, true);
 assert.equal(asPhuoc.wage, true);
 assert.equal(asPhuoc.staff, true);
 assert.equal(asPhuoc.report, true); // co report_export
 assert.equal(asPhuoc.settings, false, 'Phuoc khong co quyen settings_* nao -> phai an tab Cai dat');
 // Nhan vien: chi co progress_enter_dan -> CHI thay duoc tab progress, moi thu con lai an het
 assert.equal(asNV.progress, true);
 assert.equal(asNV.monthly, false);
 assert.equal(asNV.autoplan, false);
 assert.equal(asNV.capacity, false);
 assert.equal(asNV.report, false);
 assert.equal(asNV.wage, false);
 assert.equal(asNV.staff, false);
 assert.equal(asNV.settings, false);
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS Dot 4.1: an/hien 6 tab dung theo permission_key that cho ca 3 loai tai khoan');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
