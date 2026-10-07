// Xuất Excel điểm danh (bản 222): dựng bảng ddBangXuat từ index.html trong node:vm.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/const DD_CHUC_VU=[^\n]*\n/,/const DD_TO=[^\n]*\n/,/const ddThuTu=\(a,b\)=>\{[\s\S]*?\n\};/,/function ddBangXuat\([\s\S]*?\n\}\n/].map(lay).join('\n');
const ctx={isoCuaNgay:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
vm.createContext(ctx); vm.runInContext(code+';this.ddBangXuat=ddBangXuat;',ctx);
const nguoi=[
  {id:'a',ten:'An',chuc_vu:'Công nhân',to_lam:'Tổ may',con_dung:true},
  {id:'b',ten:'Bình',chuc_vu:'Trưởng Nhóm',to_lam:null,con_dung:true},
  {id:'c',ten:'Cúc',chuc_vu:null,to_lam:null,con_dung:true},
  {id:'d',ten:'Đã nghỉ có công',chuc_vu:'Thủ kho',to_lam:null,con_dung:false},
  {id:'e',ten:'Đã nghỉ không công',chuc_vu:null,to_lam:null,con_dung:false}];
const dd=[
  {nguoi_id:'a',ngay:'2026-10-01',sang:true,chieu:true},   // cả ngày, đã phát
  {nguoi_id:'a',ngay:'2026-10-02',sang:true,chieu:false},  // sáng
  {nguoi_id:'a',ngay:'2026-10-03',sang:false,chieu:true},  // chiều
  {nguoi_id:'b',ngay:'2026-10-02',sang:true,chieu:true},
  {nguoi_id:'d',ngay:'2026-10-03',sang:true,chieu:true},
  {nguoi_id:'a',ngay:'2026-10-09',sang:true,chieu:true}];  // ngoài khoảng: bỏ qua
const ps=[{nguoi_id:'a',ngay:'2026-10-01'}];
const J=x=>JSON.parse(JSON.stringify(x));   // mảng tạo trong vm khác prototype, so sánh qua JSON
const t=J(ctx.ddBangXuat(nguoi,dd,ps,'2026-10-01','2026-10-03'));
assert.deepEqual(t[0],['Tên','Chức vụ','Tổ','01/10','02/10','03/10','Ngày công','Tổng hộp','Hộp đã phát','Hộp chưa phát']);
assert.deepEqual(t.map(r=>r[0]),['Tên','Bình','Đã nghỉ có công','An','Cúc'],'thứ tự: chức vụ, rồi tổ; người nghỉ không có công bị bỏ');
assert.deepEqual(t[3],['An','Công nhân','Tổ may','Cả ngày 🥛','Sáng','Chiều',2,4,2,2]);
assert.deepEqual(t[1],['Bình','Trưởng Nhóm','','','Cả ngày','',1,2,0,2]);
assert.deepEqual(t[2],['Đã nghỉ có công','Thủ kho','','','','Cả ngày',1,2,0,2]);
assert.deepEqual(t[4],['Cúc','','','','','',0,0,0,0]);
console.log('PASS bảng xuất: cột ngày đúng, thứ tự theo chức vụ, người nghỉ chỉ hiện khi có điểm danh trong khoảng');
console.log('PASS ngày công (cả ngày 1, một buổi 0,5), hộp (2 / 1), hộp đã phát 🥛 / chưa phát; ngày ngoài khoảng bị bỏ qua');
const t2=J(ctx.ddBangXuat(nguoi,dd,ps,'2026-10-31','2026-11-02'));
assert.deepEqual(t2[0].slice(3,6),['31/10','01/11','02/11'],'khoảng qua tháng');
console.log('PASS khoảng ngày qua tháng');
// Ghi chú: ghép sau trạng thái; ngày không điểm danh mà có ghi chú thì chỉ ghi chú; không đổi ngày công / hộp
const gc=[{nguoi_id:'a',ngay:'2026-10-02',ghi_chu:'đi trễ'},{nguoi_id:'a',ngay:'2026-10-01',ghi_chu:'  làm bù '},{nguoi_id:'c',ngay:'2026-10-03',ghi_chu:'Nghỉ phép'},{nguoi_id:'b',ngay:'2026-10-20',ghi_chu:'ngoài khoảng'}];
const t3=J(ctx.ddBangXuat(nguoi,dd,ps,'2026-10-01','2026-10-03',gc));
assert.deepEqual(t3[3],['An','Công nhân','Tổ may','Cả ngày 🥛 — làm bù','Sáng — đi trễ','Chiều',2,4,2,2]);
assert.deepEqual(t3[4],['Cúc','','','','','Nghỉ phép',0,0,0,0]);
assert.deepEqual(t3[1],t[1],'ghi chú ngoài khoảng ngày bị bỏ qua');
assert.equal(t3[0].length,t[0].length,'không thêm cột');
console.log('PASS ghi chú trong file xuất: ghép sau trạng thái, ngày nghỉ chỉ ghi chú, không thêm cột, không đổi số liệu');
