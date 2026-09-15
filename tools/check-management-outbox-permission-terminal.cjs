// 2026-09-15 bug that: sendSupabaseManagementItem gap loi thieu quyen (42501,
// vd ASSIGN_TEAM_FORBIDDEN) tung tra ve false ("thu lai") thay vi 'terminal'.
// Loi thieu quyen KHONG tu het theo thoi gian -> goi ket vinh vien trong
// supabaseManagementOutbox -> dieu kien chan tai lai (refreshFromPrimarySupabase/
// scheduleSupabaseReload: Object.keys(supabaseManagementOutbox).length) luon dung
// -> may do NGUNG nhan du lieu moi tu nguoi khac vinh vien, ke ca sau khi mo lai
// app (hang doi luu localStorage). Sua: 42501 tra ve 'terminal' nhu 2 nhanh loi
// con lai (40001/23503/22P02) - duoc xoa khoi hang doi ngay, het chan tai lai.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
(async()=>{
 // 1) Kiem tra source: nhanh 42501 phai ton tai VA tra ve 'terminal', dat TRUOC
 // nhanh fallback chung (con lai la 'thu lai').
 const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const fnStart=src.indexOf('async function sendSupabaseManagementItem');
 const fnBody=src.slice(fnStart, fnStart+6000);
 const idx42501=fnBody.indexOf("code==='42501'");
 const idxFallback=fnBody.indexOf('Lỗi nghiệp vụ khác');
 if(idx42501<0) throw new Error('FATAL: khong tim thay nhanh xu ly ma loi 42501 trong sendSupabaseManagementItem');
 if(idxFallback<0) throw new Error('FATAL: khong tim thay nhanh fallback chung');
 if(idx42501>=idxFallback) throw new Error('FATAL: nhanh 42501 phai dat TRUOC fallback chung, neu khong fallback se bat truoc');
 const branch42501=fnBody.slice(idx42501, idx42501+300);
 if(!/return\s+'terminal'/.test(branch42501)) throw new Error("FATAL: nhanh 42501 phai return 'terminal', khong duoc return false");

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

 // 2) Kiem tra hanh vi phia flushSupabaseManagementOutbox: gia lap dung ket qua
 // ham sendSupabaseManagementItem se tra ve cho 1 loi 42501 ('terminal') va cho
 // 1 loi thu lai binh thuong (false) - xac nhan dung 1 cai duoc xoa, 1 cai con.
 const result=await page.evaluate(async ()=>{
   supabaseManagementOutbox={
     'terminal_item':{key:'terminal_item',kind:'owner',order_id:'ORDER_A',revision:'r1'},
     'retry_item':{key:'retry_item',kind:'owner',order_id:'ORDER_B',revision:'r2'}
   };
   sendSupabaseManagementItem = async(item)=> item.key==='terminal_item' ? 'terminal' : false;
   await flushSupabaseManagementOutbox();
   const keysAfter=Object.keys(supabaseManagementOutbox);
   // Dieu kien chan tai lai dung y het o refreshFromPrimarySupabase/scheduleSupabaseReload
   const conBiChanTaiLai = keysAfter.length>0;
   return {keysAfter, conBiChanTaiLai};
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.deepEqual(result.keysAfter, ['retry_item'], "Goi 'terminal' (loi 42501) phai bi XOA khoi hang doi; goi con lai (loi thu lai) phai GIU LAI");
 assert.equal(result.conBiChanTaiLai, true, "Con 1 goi retry_item that (chua sua o day) thi dieu kien chan tai lai van dung - dung nhu thiet ke goc, khong phai loi");
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log("PASS: loi thieu quyen (42501) trong sendSupabaseManagementItem tra ve 'terminal', duoc xoa khoi hang doi ngay, khong con ket vinh vien chan tai lai");
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
