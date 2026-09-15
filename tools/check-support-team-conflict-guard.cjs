// 2026-09-15 yeu cau anh Tung: "kiem tra het cac kha nang nghi ngo" - gan/bo to
// ho tro (kind='support') cung mac loi nhu Huy/Khoi phuc don truoc khi sua: ghi
// thang qua PostgREST upsert/delete, khong khoa dong, khong kiem tra xung dot.
// Doi sang RPC khsx_set_support_team_v1 (khoa dong + kiem tra updated_at).
//
// Bay ngang phat hien khi sua: RPC moi tra ve MANG cac dong (returns table),
// nhung buoc xac nhan thanh cong cu doc result.data.team_name nhu the ket qua
// la 1 object don (kieu cu tu .upsert().maybeSingle()) - neu khong sua, MOI lan
// gan to ho tro se bi coi la that bai va thu lai vo han du server da luu dung.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');let browser,server;
(async()=>{
 const src=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const fnStart=src.indexOf('async function sendSupabaseManagementItem');
 const fnBody=src.slice(fnStart, fnStart+7500);

 if(!fnBody.includes("khsx_set_support_team_v1")) throw new Error('FATAL: khong tim thay goi RPC khsx_set_support_team_v1');
 if(/from\('khsx_daily_assignments'\)\s*\n?\s*\.upsert/.test(fnBody)) throw new Error('FATAL: van con upsert() truc tiep cho support, chua doi sang RPC');
 if(!fnBody.includes('SUPPORT_TEAM_CONFLICT')) throw new Error('FATAL: khong tim thay xu ly loi SUPPORT_TEAM_CONFLICT');
 const conflictIdx=fnBody.indexOf('SUPPORT_TEAM_CONFLICT');
 if(!/return\s+'terminal'/.test(fnBody.slice(conflictIdx-50, conflictIdx+200))) throw new Error("FATAL: nhanh SUPPORT_TEAM_CONFLICT phai return 'terminal'");
 // Bay da sua: xac nhan thanh cong phai doc resultRow.out_team_name (dung voi
 // returns table tra ve mang), KHONG con doc result.data.team_name (kieu cu).
 if(fnBody.includes('result.data.team_name')) throw new Error('FATAL: van con doc result.data.team_name (kieu cu, sai voi RPC tra ve mang) - se lam moi lan gan to ho tro bi coi la that bai');
 if(!fnBody.includes('resultRow.out_team_name')) throw new Error('FATAL: khong tim thay buoc xac nhan doc dung resultRow.out_team_name');

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

 const result=await page.evaluate(async ()=>{
   supabaseManagementOutbox={
     'conflict_item':{key:'conflict_item',kind:'support',order_id:'ORDER_A',revision:'r1'},
     'retry_item':{key:'retry_item',kind:'support',order_id:'ORDER_B',revision:'r2'}
   };
   sendSupabaseManagementItem = async(item)=> item.key==='conflict_item' ? 'terminal' : false;
   await flushSupabaseManagementOutbox();
   return {keysAfter: Object.keys(supabaseManagementOutbox)};
 });
 console.log(JSON.stringify(result,null,2));
 console.log('page errors:', errors);

 const assert=require('node:assert/strict');
 assert.deepEqual(result.keysAfter, ['retry_item'], "Goi bi xung dot (terminal) phai bi XOA khoi hang doi ngay");
 assert.equal(errors.length, 0, 'khong duoc co loi JS');
 console.log('PASS: To ho tro gio di qua RPC co khoa dong + kiem tra xung dot, dung dung ten truong ket qua moi (out_team_name)');
})().catch(e=>{console.error('FATAL',e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
