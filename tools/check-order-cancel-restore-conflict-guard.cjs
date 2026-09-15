// 2026-09-15 yeu cau anh Tung: "chac chan" khong bi ghi de khi 2 nguoi cung
// Huy/Khoi phuc dung 1 don cung luc. Truoc day sendSupabaseManagementItem cho
// kind delete/cancel/restore update THANG qua PostgREST, khong khoa dong,
// khong kiem tra xung dot - khac voi duong gan to (kind='owner') da co kiem
// tra qua khsx_save_order_assignment_impl. Doi ca 2 sang goi chung 1 RPC moi
// (khsx_cancel_restore_order_v1) co khoa dong (for update) + kiem tra
// updated_at nhu duong gan to.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
(async()=>{
 // 1) Kiem tra source: kind delete/cancel VA restore phai goi RPC
 // khsx_cancel_restore_order_v1, khong con .from('khsx_orders').update(...) truc tiep.
 const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const fnStart=src.indexOf('async function sendSupabaseManagementItem');
 const fnBody=src.slice(fnStart, fnStart+3500);
 const rpcCallCount=(fnBody.match(/khsx_cancel_restore_order_v1/g)||[]).length;
 if(rpcCallCount<2) throw new Error(`FATAL: phai co it nhat 2 lan goi khsx_cancel_restore_order_v1 (cancel + restore), tim thay ${rpcCallCount}`);
 if(/from\('khsx_orders'\)\s*\n?\s*\.update\(\{deleted_at/.test(fnBody)) throw new Error('FATAL: van con update() truc tiep cho delete/cancel, chua doi sang RPC');
 const idxConflict=fnBody.indexOf('ORDER_CANCEL_CONFLICT');
 if(idxConflict<0) throw new Error('FATAL: khong tim thay xu ly loi ORDER_CANCEL_CONFLICT');
 const conflictBranch=fnBody.slice(idxConflict-50, idxConflict+200);
 if(!/return\s+'terminal'/.test(conflictBranch)) throw new Error("FATAL: nhanh ORDER_CANCEL_CONFLICT phai return 'terminal' (dung hen, khong duoc thu lai vo han)");

 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||require('node:path').join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===base)return route.continue();
   if(u.pathname.includes('xlsx'))return route.continue();
   return route.fulfill({contentType:'application/json',body:'[]'});
 });
 await page.addInitScript(()=>{class Chart{constructor(el,c={}){this.data=c.data||{datasets:[]};this.options=c.options||{}}destroy(){}resize(){}update(){}}Chart.register=()=>{};window.Chart=Chart;});
 await page.goto(base+'/index.html');
 await page.waitForFunction(()=>window.__khsxBootstrapDone,{timeout:15000}).catch(()=>{});

 // 2) Kiem tra hanh vi phia flushSupabaseManagementOutbox: gia lap dung 1 loi
 // ORDER_CANCEL_CONFLICT ('terminal') va 1 loi thu lai binh thuong (false) -
 // xac nhan dung 1 cai duoc xoa (het ket), 1 cai con o lai hang doi.
 const result=await page.evaluate(async ()=>{
   supabaseManagementOutbox={
     'conflict_item':{key:'conflict_item',kind:'cancel',order_id:'ORDER_A',revision:'r1'},
     'retry_item':{key:'retry_item',kind:'cancel',order_id:'ORDER_B',revision:'r2'}
   };
   sendSupabaseManagementItem = async(item)=> item.key==='conflict_item' ? 'terminal' : false;
   await flushSupabaseManagementOutbox();
   return {keysAfter: Object.keys(supabaseManagementOutbox)};
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.deepEqual(result.keysAfter, ['retry_item'], "Goi bi xung dot (terminal) phai bi XOA khoi hang doi ngay, khong ket lai vinh vien");
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: Huy/Khoi phuc don gio di qua RPC co khoa dong + kiem tra xung dot, khong con ghi de am tham khi 2 nguoi bam cung luc');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
