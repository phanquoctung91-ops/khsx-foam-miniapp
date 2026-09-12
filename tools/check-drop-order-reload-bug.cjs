// Bug that: don ron LAEZ20-2020 dan ngay 11/9, may+dong goi ngay 12/9 (tron dung
// du lieu that tren production). Sau khi hoan thanh, tai lai toan bo (login/poll
// 120s) lam mat ngay_hoan_thanh vi loadSupabaseOperationalData khong goi lai
// dongBoSoHoanThanhCu -> don chi con hien o ngay goc (11/9), mat het so may/dong
// goi da nhap ngay 12/9. Test nay dung dung loadSupabaseOperationalData that.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
const ORDER_ID='r_11_09_2026_LAEZ20_2020_200_200_20_2_1';
const sdk=`window.supabase={createClient:(url,key,options)=>({
 auth:{getSession:async()=>({data:{session:{user:{id:'owner-test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),startAutoRefresh(){},stopAutoRefresh(){}},
 from(table){const q={_table:table};for(const m of ['select','range','eq','is','not','in','gte','lte','update'])q[m]=()=>q;
  q.then=(resolve,reject)=>(options.global?.fetch||fetch)(url+'/rest/v1/'+table).then(async r=>{const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data,status:r.status}}).then(resolve,reject);return q;},
 rpc:async()=>({data:[],error:null}),
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
     if(table==='khsx_orders') data=[{id:ORDER_ID,production_date:'2026-09-11',product_code:'LAEZ20-2020',product_name:'LAEZ20',width_mm:200,length_mm:200,thickness_mm:20,plan_qty:2,note:'',order_group:'',deleted_at:null}];
     if(table==='khsx_order_assignments') data=[{order_id:ORDER_ID,current_team:'To 4',plan_team:'To 4',spinoff_order_id:null,change_note:'',priority:false}];
     if(table==='khsx_stage_progress') data=[
       {order_id:ORDER_ID,work_date:'2026-09-11',stage:'dan',quantity:2,kpi_team:'To 4',entered_by:'x',completed_by_worker_id:null,updated_at:'2026-09-11T07:33:46Z'},
       {order_id:ORDER_ID,work_date:'2026-09-12',stage:'may',quantity:2,kpi_team:'To 4',entered_by:'x',completed_by_worker_id:null,updated_at:'2026-09-12T03:08:33Z'},
       {order_id:ORDER_ID,work_date:'2026-09-12',stage:'dong_goi',quantity:2,kpi_team:'To 4',entered_by:'x',completed_by_worker_id:null,updated_at:'2026-09-12T04:47:05Z'},
     ];
     return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   return route.fulfill({contentType:'application/json',body:'[]'});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 const result=await page.evaluate(async(orderId)=>{
   currentUser={auth_user_id:'owner-test',role:'quan_ly',name:'x'};
   applyRoleUI();
   const ok=await loadSupabaseOperationalData();
   const o=getOrderById(orderId);
   const a=assignments[orderId];
   return {
     ok,
     found:!!o,
     ngay_hoan_thanh: a?.ngay_hoan_thanh ?? null,
     so_luong_hoan_thanh: a?.so_luong_hoan_thanh ?? null,
     carryForwardDates: o ? getCarryForwardDates(o) : null,
     status: o ? getOrderStatus(o) : null,
     dan_11: o ? giaTriCongDoanNgay(o,'11/09/2026','dan') : null,
     may_12: o ? giaTriCongDoanNgay(o,'12/09/2026','may') : null,
     dongGoi_12: o ? giaTriCongDoanNgay(o,'12/09/2026','dong_goi') : null,
   };
 }, ORDER_ID);
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.equal(result.ok, true);
 assert.equal(result.found, true, 'phai tim thay don LAEZ20-2020');
 assert.equal(result.status, 'hoan_thanh', 'don da du 2/2/2 phai la hoan thanh');
 assert.equal(result.ngay_hoan_thanh, '12/09/2026', 'ngay_hoan_thanh phai duoc tinh lai = ngay dong goi thuc te (12/9), khong duoc null');
 assert.deepEqual(result.carryForwardDates.sort(), ['11/09/2026','12/09/2026'].sort(), 'don phai hien o CA ngay goc (11/9) VA ngay hoan thanh that (12/9), khong duoc mat ngay 12/9');
 assert.equal(result.dan_11, 2, 'ngay 11/9 phai con du so da dan');
 assert.equal(result.may_12, 2, 'ngay 12/9 phai con du so da may');
 assert.equal(result.dongGoi_12, 2, 'ngay 12/9 phai con du so da dong goi');
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: don ron hoan thanh khac ngay van hien du 2 ngay va du so sau khi tai lai toan bo');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
