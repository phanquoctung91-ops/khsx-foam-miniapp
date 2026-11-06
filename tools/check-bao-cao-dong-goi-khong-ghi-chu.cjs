// Báo cáo đóng gói: cột Ghi chú luôn rỗng (anh chốt 06/11/2026), vẫn đủ 8 cột; gom/sắp xếp như cũ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{const m=html.match(re);assert.ok(m,'không thấy '+re);return m[0];};
const code=[/function chuanHoaTenSP\([\s\S]*?\n\}\n/,/function chuanHoaMaBaoCao\([\s\S]*?\n\}\n/,/function chuanBiDongBaoCao\([\s\S]*?\n\}\n/].map(lay).join('\n');
const don=(id,ma,dong,ngang,dai,day,sl,gc)=>({id,date:'05/11/2026',ma,dong,ngang,dai,day,so_luong:sl,ghi_chu:gc});
const ds=[don('a','SORA10-1','Sora','100','200','10',41,'ghi chú A'),don('b','SORA10-1','Sora','100','190','10',40,'ghi chú B'),don('c','ZONE17-8','3-Zone','180','200','17',5,'')];
const ctx={getOrders:()=>ds,assignments:{},dongGoiTheoNgayCuaDon:o=>({'05/11/2026':o.so_luong})};
vm.createContext(ctx); vm.runInContext(code+';this.f=chuanBiDongBaoCao;',ctx);
const r=JSON.parse(JSON.stringify(ctx.f('05/11/2026')));
assert.equal(r.length,3); r.forEach(x=>{assert.equal(x.length,8,'đủ 8 cột'); assert.equal(x[7],'','Ghi chú rỗng');});
assert.deepEqual(r.map(x=>x[0]+'|'+x[3]),['ZONE17-8|200','SORA10-1|190','SORA10-1|200'],'thứ tự: tên, mã, kích thước');
assert.deepEqual(r.map(x=>[x[5],x[6]]),[[5,5],[40,40],[41,41]]);
console.log('PASS báo cáo đóng gói: cột Ghi chú rỗng, đủ 8 cột, gom và sắp xếp như cũ');
