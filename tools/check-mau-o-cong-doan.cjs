// Màu 3 ô Dán/May/ĐG (bản 236): đủ kế hoạch = xanh, có số chưa đủ = vàng, 0 / không kế hoạch = như cũ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/function soCongDoan\([\s\S]*?\n\}\n/,/function tienDoGopHtml\([\s\S]*?\n\}\n/].map(lay).join('\n');
const ctx={tongCongDoan:(o,k)=>o.tong[k], giaTriCongDoanNgay:(o,ngay,k)=>o.ngay[k]};
vm.createContext(ctx); vm.runInContext(code+';this.t=tienDoGopHtml;',ctx);
const mau=(o,ngay)=>[...ctx.t(o,ngay).matchAll(/stage-summary-item( sd-\w+)?"/g)].map(m=>(m[1]||'').trim()||'none');
assert.deepEqual(mau({so_luong:15,tong:{dan:15,may:7,dong_goi:0},ngay:{}},'all'),['sd-xanh','sd-vang','none'],'đủ = xanh, thiếu = vàng, 0 = như cũ');
assert.deepEqual(mau({so_luong:15,tong:{dan:16,may:15,dong_goi:1},ngay:{}},'all'),['sd-xanh','sd-xanh','sd-vang'],'vượt kế hoạch vẫn xanh');
assert.deepEqual(mau({so_luong:0,tong:{dan:5,may:5,dong_goi:5},ngay:{}},'all'),['none','none','none'],'không kế hoạch = không tô màu');
assert.deepEqual(mau({so_luong:15,tong:{dan:99,may:99,dong_goi:99},ngay:{dan:15,may:3,dong_goi:0}},'12/10/2026'),['sd-xanh','sd-vang','none'],'chọn ngày: tô theo số của ngày đó');
assert.match(ctx.t({so_luong:15,tong:{dan:15,may:0,dong_goi:0},ngay:{}},'all'),/Dán<strong>15<\/strong>/,'số hiển thị không đổi');
console.log('PASS màu 3 ô công đoạn: đủ xanh, thiếu vàng, 0 và không kế hoạch như cũ, vượt vẫn xanh, theo ngày hoặc tổng');
