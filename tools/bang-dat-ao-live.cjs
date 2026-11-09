// Bảng Đặt áo của một ngày, tính BẰNG CHÍNH mã của mini-app (không viết lại công thức) trên dữ liệu thật (khách xem, chỉ đọc).
// Dùng cho bot giám sát sản xuất (anh chốt 07/11/2026). In ra đúng một dòng JSON:
//   { ngay, soDon, thieuBom:{mã:SL}, khongCoAo:[mã], chuaGanTo:[{ma,dong,sl}], bang:{cacTo,coLe,...}, daGan:{chuan,coLe} (chỉ các tổ đã gán), hash }
// Cách dùng:  node tools/bang-dat-ao-live.cjs dd/mm/yyyy [--bom-file file.json]
//   BOM mặc định đọc bằng RPC khsx_bom_ao_guest_v1 (khách xem). --bom-file chỉ để chạy thử khi RPC chưa lên máy chủ:
//   file là mảng [{ma_hang, stt, ma_vt, ten_vt, dinh_muc, dvt}] (tất cả dòng BOM).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const ngay=process.argv[2]; const ixBom=process.argv.indexOf('--bom-file'); const bomFile=ixBom>0?process.argv[ixBom+1]:null;
if(!/^\d{2}\/\d{2}\/\d{4}$/.test(ngay||'')){ console.error('Cách dùng: node tools/bang-dat-ao-live.cjs dd/mm/yyyy [--bom-file file.json]'); process.exit(2); }
let browser,server;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.end();try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.KHSX_BROWSER_PATH||path.join('C:','Program Files','Google','Chrome','Application','chrome.exe')});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/index.html?view=guest&source=supabase`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.documentElement.dataset.primarySource==='supabase-public',null,{timeout:45000});
 const bomRows=bomFile?JSON.parse(fs.readFileSync(bomFile,'utf8')):null;
 const kq=await page.evaluate(async({ngay,bomRows})=>{
   // 1) BOM: RPC khách xem (hoặc file chạy thử) -> bomTheoMa đúng dạng mini-app dùng
   let rows=bomRows;
   if(!rows){
     const {data,error}=await guestDashboardClient.rpc('khsx_bom_ao_guest_v1');
     if(error) return {loi:'Không đọc được BOM: '+(error.message||JSON.stringify(error))};
     rows=data;
   }
   const theoMa={}; rows.forEach(r=>{ (theoMa[maHangBom(r.ma_hang)]||(theoMa[maHangBom(r.ma_hang)]=[])).push(r); });
   Object.values(theoMa).forEach(l=>l.sort((a,b)=>a.stt-b.stt));
   const don=donTrongKhoangAo(ngay,ngay);
   don.forEach(o=>{ const m=maHangBom(o.ma); bomTheoMa[m]=theoMa[m]||[]; });
   // 2) cùng phép tính của nút "Bảng đặt áo"
   const t=tinhDonDatAo(ngay,ngay);
   const coBomKhongAo=[]; const khongBom=[];
   Object.keys(t.thieuBom).forEach(k=>{ const m=maHangBom(k); ((theoMa[m]&&theoMa[m].length)?coBomKhongAo:khongBom).push(k); });
   const thieuBom={}; khongBom.forEach(k=>thieuBom[k]=t.thieuBom[k]);
   const chuaGanTo=don.filter(o=>!toTheToCuaDon(o)).map(o=>({ma:o.ma,dong:o.dong,sl:Number(o.so_luong)||0}));
   const gon=r=>({ma:r.ma,ten:r.ten,sl:r.tong});
   const bang={cacTo:t.cacTo.map(x=>({to:x.to,dongHang:x.dongHang.map(gon),coLe:x.coLe.map(gon),tong:x.tongChung})),tong:t.tongChung,dongHang:t.dongHang.map(gon),coLe:t.coLe.map(gon)};
   // Phần của các tổ ĐÃ gán (bỏ khối "Chưa gán tổ"): dùng cho nhánh bổ sung ngày đang sản xuất — đơn chưa gán tổ chưa tính vào phiếu
   const gop=(ds)=>{ const m={}; ds.forEach(r=>{ const k=r.ma+'|'+r.ten; (m[k]||(m[k]={ma:r.ma,ten:r.ten,sl:0})).sl+=r.tong; }); return Object.values(m); };
   const toDaGan=t.cacTo.filter(x=>x.to!==TO_CHUA_GAN);
   const daGan={chuan:gop(toDaGan.flatMap(x=>x.dongHang)),coLe:gop(toDaGan.flatMap(x=>x.coLe))};
   return {ngay,soDon:don.length,tongSL:don.reduce((s,o)=>s+(Number(o.so_luong)||0),0),thieuBom,khongCoAo:coBomKhongAo,chuaGanTo,bang,daGan};
 },{ngay,bomRows});
 if(kq.loi){ console.error(kq.loi); process.exitCode=1; return; }
 if(errors.length){ console.error('Lỗi JS trong trang: '+errors.join(' | ')); process.exitCode=1; return; }
 kq.hash=crypto.createHash('sha1').update(JSON.stringify(kq.bang)).digest('hex').slice(0,12);
 process.stdout.write(JSON.stringify(kq)+'\n');
})().catch(e=>{console.error('LỖI: '+(e.message||e));process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r))});
