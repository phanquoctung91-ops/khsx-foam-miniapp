// Su co 2026-09-11: thieu quyen doc bang danh muc lam checkbox khong hien ra, nhung
// nut Luu van bat -> bam Luu gui danh sach RONG -> RPC hieu la "bo tick het" -> that
// su thu hoi toan bo quyen dang co. Test nay mo phong DUNG kich ban do (catalog fetch
// loi) va xac nhan: khong con bat nut Luu, va neu co ai co tinh goi thang ham Luu thi
// van tu choi, khong bao gio gui mang quyen rong len RPC that.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const OWNER='7ebce211-e3b0-4195-9207-ff46506e13d6';
const OTHER='5c7fbd28-0bff-47da-9d25-9ecccce68e5b';
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:window.__testSession||null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table};for(const m of ['select','range','eq','is','not','in','gte','lte','update'])q[m]=()=>q;
  q.order=()=>{q._ordered=true;return q};
  q.then=(resolve,reject)=>{
    if(table==='khsx_permissions') return Promise.resolve({data:null,error:{message:'permission denied for table khsx_permissions'}}).then(resolve,reject);
    return (options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);
  };return q;},
 rpc:async(name,args)=>{window.__rpcCalls=window.__rpcCalls||[];window.__rpcCalls.push({name,args});
   if(name==='khsx_get_account_permissions')return {data:{user_id:args.p_target_user_id,is_owner:false,permission_keys:['view_overview','khsx_view_plan','assign_team'],version:5},error:null};
   if(name==='khsx_save_account_permissions')return {data:{ok:true,added:[],removed:['view_overview','khsx_view_plan','assign_team'],version:6},error:null};
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

 const result=await page.evaluate(async(payload)=>{
   const {OWNER,OTHER}=payload;
   currentUser={auth_user_id:OWNER,role:'quan_ly',name:'Tung'};window.__testSession={user:{id:OWNER}};
   applyRoleUI();document.getElementById('loginOverlay').style.display='none';
   await loadSupabaseOperationalData();
   document.querySelector('.tab-btn[data-tab="settings"]')?.click();
   initSettingsPage();
   await new Promise(r=>setTimeout(r,50));
   const sel=document.getElementById('permAccountSelect');
   sel.value=OTHER; sel.dispatchEvent(new Event('change'));
   await new Promise(r=>setTimeout(r,80));
   const saveBtnDisabled=document.getElementById('permSaveBtn').disabled;
   const checkboxCount=document.querySelectorAll('.perm-check').length;
   const infoText=document.getElementById('permAccountInfo').textContent;
   window.__rpcCalls=[]; // xoa lich su goi RPC truoc do (lan doc quyen), chi con theo doi tu day
   // Co tinh goi thang ham Luu du nut dang bi khoa, mo phong ai do bam bang JS/console
   await savePermAccountPermissions();
   const saveCallAfterForced=(window.__rpcCalls||[]).find(c=>c.name==='khsx_save_account_permissions');
   return {saveBtnDisabled, checkboxCount, infoText, saveCallAfterForced: saveCallAfterForced||null,
     saveStatusText: document.getElementById('permSaveStatus').textContent};
 }, {OWNER,OTHER});
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.checkboxCount, 0, 'khong duoc hien checkbox nao khi danh muc loi');
 assert.equal(result.saveBtnDisabled, true, 'nut Luu PHAI bi khoa khi danh muc tai loi');
 assert.equal(result.saveCallAfterForced, null, 'du co co tinh goi ham Luu, TUYET DOI khong duoc goi RPC that (se xoa mat quyen那)');
 assert.match(result.saveStatusText, /KHÔNG lưu|khong luu|chưa hiện đủ/i);
 console.log('PASS khi danh muc quyen loi tai: khong hien checkbox, khoa nut Luu, tu choi goi RPC du bi ep goi thang ham');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
