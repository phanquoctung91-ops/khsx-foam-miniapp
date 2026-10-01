// Đơn rớt trôi qua cả tháng mới (anh Tùng chốt 01/10/2026): đơn 30/09 chưa xong phải hiện ở 01/10 khi đang xem tháng 10;
// đơn đã xong / đã tách cho tổ hỗ trợ chỉ ở ngày gốc. Trước đây KHSX và TDSX lọc theo ngày gốc nên đơn tháng 9 biến mất.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('function getCarryForwardDates('), b=html.indexOf('function teamLabel(');
const ThatDate=Date;
class GiaDate extends ThatDate{ constructor(...x){ super(...(x.length?x:[2026,9,1,9,0])); } static now(){ return new ThatDate(2026,9,1,9,0).getTime(); } }
const ctx={Date:GiaDate,assignments:{},
  parseDMY:s=>{const m=String(s).match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m?{d:+m[1],m:+m[2],y:+m[3]}:null;},
  formatDMY:d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,
  getOrderStatus:o=>o.trangThai};
vm.createContext(ctx); vm.runInContext(html.slice(a,b),ctx);
const thang10=d=>/\/10\/2026$/.test(d);
const rot={date:'30/09/2026',trangThai:'rot'}, xong={date:'29/09/2026',trangThai:'hoan_thanh'};
assert.deepEqual([...ctx.getCarryForwardDates(rot)],['30/09/2026','01/10/2026']);
assert.equal(ctx.getCarryForwardDates(rot).some(thang10),true);
assert.equal(ctx.getCarryForwardDates(xong).some(thang10),false);
console.log('PASS đơn 30/09 còn rớt trôi tới 01/10; đơn đã xong tháng 9 không sang tháng 10');
// Cả hai bảng (KHSX, Tiến độ) phải lọc tháng bằng các ngày đơn trôi tới, không bằng ngày gốc.
const loc=html.match(/if\(!getCarryForwardDates\(r\)\.some\(ngayThuocThangHeader\)\) return false;/g)||[];
assert.equal(loc.length,2,'KHSX và Tiến độ đều phải lọc theo ngày trôi');
assert.equal(/if\(!ngayThuocThangHeader\(r\.date\)\) return false;/.test(html),false,'không còn chỗ lọc theo ngày gốc');
console.log('PASS trang KHSX và trang Tiến độ đều giữ đơn rớt từ tháng trước');
