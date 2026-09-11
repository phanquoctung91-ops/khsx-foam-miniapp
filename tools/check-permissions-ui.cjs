// Man hinh Cai dat > Phan quyen tai khoan: chi chu tai khoan thay duoc, chon tai
// khoan -> tick dung trang thai hien co -> luu -> goi dung RPC that.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const OWNER='7ebce211-e3b0-4195-9207-ff46506e13d6';
const OTHER='5c7fbd28-0bff-47da-9d25-9ecccce68e5b';
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table};for(const m of ['select','range','eq','is','not','in','gte','lte','update'])q[m]=()=>q;
  q.order=()=>{q._ordered=true;return q};
  q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async(name,args)=>{window.__rpcCalls=window.__rpcCalls||[];window.__rpcCalls.push({name,args});
   if(name==='khsx_get_account_permissions')return {data:{user_id:args.p_target_user_id,is_owner:false,permission_keys:['view_overview','khsx_view_plan'],version:3},error:null};
   if(name==='khsx_save_account_permissions')return {data:{ok:true,added:['assign_team'],removed:['khsx_view_plan'],version:4},error:null};
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
     const table=u.pathname.split('/rest/v1/')[1];
     let data=[];
     if(table==='khsx_permissions')data=[
       {permission_key:'view_overview',display_name:'Xem tổng thống kê',group_name:'Tổng thống kê',description:'Xem thống kê chung',sort_order:1},
       {permission_key:'khsx_view_plan',display_name:'Xem kế hoạch sản xuất',group_name:'KHSX',description:'Mở danh sách kế hoạch',sort_order:2},
       {permission_key:'assign_team',display_name:'Gán, đổi tổ phụ trách',group_name:'Phân công',description:'Đổi tổ khi ngày cho phép',sort_order:6},
     ];
     if(table==='khsx_profiles')data=[
       {user_id:OWNER,display_name:'Phan Quốc Tùng',role:'quan_ly',unit_name:null,active:true,worker_id:null,telegram_user_id:'1'},
       {user_id:OTHER,display_name:'Lê Hữu Phước',role:'quan_ly_2',unit_name:null,active:true,worker_id:null,telegram_user_id:'2'},
     ];
     if(table==='khsx_telegram_registrations')data=[];
     return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   return route.fulfill({contentType:'application/javascript',body:''});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 const asOwner=await page.evaluate(async(OWNER)=>{
   currentUser={auth_user_id:OWNER,role:'quan_ly',name:'Tung'};window.__testSession={user:{id:OWNER}};
   applyRoleUI();document.getElementById('loginOverlay').style.display='none';
   await loadSupabaseOperationalData();
   document.querySelector('.tab-btn[data-tab="settings"]')?.click();
   initSettingsPage();
   await new Promise(r=>setTimeout(r,50));
   return {
     cardVisible: document.getElementById('permissionsCard').style.display !== 'none',
     optionCount: document.getElementById('permAccountSelect').options.length,
   };
 }, OWNER);
 console.log('asOwner:', JSON.stringify(asOwner));

 const flow=await page.evaluate(async(OTHER)=>{
   const sel=document.getElementById('permAccountSelect');
   sel.value=OTHER; sel.dispatchEvent(new Event('change'));
   await new Promise(r=>setTimeout(r,50));
   const checks=[...document.querySelectorAll('.perm-check')].map(c=>({key:c.dataset.key,checked:c.checked}));
   document.querySelector('.perm-check[data-key="assign_team"]').checked=true;
   document.querySelector('.perm-check[data-key="khsx_view_plan"]').checked=false;
   document.getElementById('permSaveBtn').click();
   await new Promise(r=>setTimeout(r,50));
   return {
     initialChecks:checks,
     saveStatus: document.getElementById('permSaveStatus').textContent,
     rpcCalls: (window.__rpcCalls||[]).map(c=>({name:c.name,args:c.args})),
   };
 }, OTHER);
 console.log('flow:', JSON.stringify(flow,null,2));

 const asOther=await page.evaluate(async(OTHER)=>{
   currentUser={auth_user_id:OTHER,role:'quan_ly_2',name:'Phuoc'};window.__testSession={user:{id:OTHER}};
   applyRoleUI();
   initSettingsPage();
   await new Promise(r=>setTimeout(r,50));
   const card=document.getElementById('permissionsCard');
   return {cardVisible: card ? card.style.display!=='none' : null};
 }, OTHER);
 console.log('asOther:', JSON.stringify(asOther));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(asOwner.cardVisible, true, 'Card phai hien voi chu tai khoan');
 assert.equal(asOwner.optionCount, 2, 'Danh sach chi con Phuoc (loai Tung ra), + 1 dong placeholder');
 assert.deepEqual(flow.initialChecks.sort((a,b)=>a.key.localeCompare(b.key)),
   [{key:'assign_team',checked:false},{key:'khsx_view_plan',checked:true},{key:'view_overview',checked:true}].sort((a,b)=>a.key.localeCompare(b.key)),
   'Checkbox phai khop dung trang thai RPC tra ve');
 const saveCall=flow.rpcCalls.find(c=>c.name==='khsx_save_account_permissions');
 assert.ok(saveCall,'phai goi RPC luu');
 assert.equal(saveCall.args.p_target_user_id, OTHER);
 assert.deepEqual(saveCall.args.p_permission_keys.sort(), ['assign_team','view_overview'].sort(), 'phai gui dung danh sach da tick');
 assert.equal(saveCall.args.p_expected_version, 3, 'phai gui dung phien ban da doc');
 assert.match(flow.saveStatus, /Đã lưu/);
 assert.equal(asOther.cardVisible, false, 'Card PHAI an voi tai khoan khong phai chu');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS man hinh Phan quyen tai khoan: chi chu tai khoan thay, tick dung trang thai, luu dung RPC/tham so');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
