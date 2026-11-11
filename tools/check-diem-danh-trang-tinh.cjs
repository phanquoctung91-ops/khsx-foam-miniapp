// Apps Script điểm danh -> trang tính (11/11/2026): kiểm phần tính thuần của Code.gs bằng node:vm, số khớp demo hỗ trợ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const gs=fs.readFileSync(path.resolve(__dirname,'..','apps-script/diem-danh-trang-tinh/Code.gs'),'utf8');
const ctx={}; vm.createContext(ctx); vm.runInContext(gs+';this.F={nhanBuoi,gioNguoiNgay,congNguoiNgay,hopNguoiNgay,xayChamCong,xayTongHopTo,xayGhiChu,toCuaNguoi,nhomGio,soNgayThang};',ctx);
const F=ctx.F, J=x=>JSON.parse(JSON.stringify(x)), gần=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' ≠ '+b);

assert.equal(F.nhanBuoi({sang:true,chieu:true}),'Cả ngày'); assert.equal(F.nhanBuoi({sang:true,chieu:false}),'Sáng'); assert.equal(F.nhanBuoi({sang:false,chieu:true}),'Chiều');
assert.equal(F.nhanBuoi({sang:true,chieu:true,ho_tro_sang:true,ho_tro_chieu:true}),'Hỗ trợ cả ngày');
assert.equal(F.nhanBuoi({sang:true,chieu:true,ho_tro_chieu:true}),'Sáng + Hỗ trợ chiều');
assert.equal(F.nhanBuoi({sang:true,chieu:true,tang_ca:2}),'Cả ngày +TC 2h'); assert.equal(F.nhanBuoi(null),''); assert.equal(F.nhanBuoi({sang:false,chieu:false}),'');
const g1=J(F.gioNguoiNgay({sang:true,chieu:true,ho_tro_sang:true,ho_tro_chieu:true,tang_ca:2})); gần(g1.to,0); gần(g1.hoTro,8+2);   // hỗ trợ trọn ngày: tăng ca đi theo
const g2=J(F.gioNguoiNgay({sang:true,chieu:true,ho_tro_chieu:true,tang_ca:2}));                                                         gần(g2.to,4.25+2); gần(g2.hoTro,3.75);
gần(F.congNguoiNgay({sang:true,chieu:false}),0.5); assert.equal(F.hopNguoiNgay({sang:true,chieu:true}),2);
assert.equal(F.soNgayThang(2026,11),30); assert.equal(F.soNgayThang(2028,2),29);

// Dữ liệu mẫu: Tổ dán 1 có 5 người ngày 09/11 (T2); Cường hỗ trợ cả ngày, Em hỗ trợ sáng, An hỗ trợ chiều
const ng=(id,ten,to,cv)=>({id,ten,chuc_vu:cv||'Công nhân',to_lam:to,con_dung:true});
const du={nguoi:[ng('a','An','Tổ dán 1'),ng('b','Bình','Tổ dán 1'),ng('c','Cường','Tổ dán 1'),ng('d','Dũng','Tổ dán 1'),ng('e','Em','Tổ dán 1'),ng('k','Kho1','Phụ kho'),ng('q','Quản','', 'Thủ kho')],
  diem_danh:[],ghi_chu:[{nguoi_id:'k',ngay:'2026-11-09',ghi_chu:'kiểm kho'}],phat_sua:[{nguoi_id:'b',ngay:'2026-11-09',so_hop:2}]};
const ngay='2026-11-09'; const cd=(id,x)=>du.diem_danh.push(Object.assign({nguoi_id:id,ngay,sang:true,chieu:true,tang_ca:0,ho_tro_sang:false,ho_tro_chieu:false},x));
cd('a',{ho_tro_chieu:true}); cd('b',{}); cd('c',{ho_tro_sang:true,ho_tro_chieu:true}); cd('d',{}); cd('e',{ho_tro_sang:true}); cd('k',{});
const cc=F.xayChamCong(J(du),2026,11), gt=J(cc.giaTri);
assert.equal(gt[0].length,3+30+6); assert.equal(gt[0][3],1); assert.equal(gt[1][3],'CN'); assert.equal(gt[1][3+8],'T2');   // 01/11/2026 là Chủ nhật, 09/11 là Thứ 2
assert.equal(gt[0][3+8],9);
const dong=ten=>gt.find(r=>r[0]===ten), cot9=3+8;
assert.equal(dong('An')[cot9],'Sáng + Hỗ trợ chiều'); assert.equal(dong('Bình')[cot9],'Cả ngày'); assert.equal(dong('Cường')[cot9],'Hỗ trợ cả ngày'); assert.equal(dong('Em')[cot9],'Hỗ trợ sáng + Chiều');
const cuoi=r=>r.slice(3+30);   // Ngày công, Giờ ở tổ, Giờ hỗ trợ, Giờ tăng ca, Hộp đã phát, Hộp chưa phát
assert.deepEqual(cuoi(dong('An')),[1,4.25,3.75,0,0,2]); assert.deepEqual(cuoi(dong('Cường')),[1,0,8,0,0,2]); assert.deepEqual(cuoi(dong('Bình')),[1,8,0,0,2,0],'Bình đã phát 2 hộp');
const hang=ten=>gt.findIndex(r=>r[0]===ten)-2; assert.equal(cc.nen[hang('An')][cot9],'#fff2cc','có buổi hỗ trợ tô vàng'); assert.equal(cc.nen[hang('Bình')][cot9],'#d9ead3','làm ở tổ tô xanh');
console.log('PASS Chấm công: nhãn buổi, ngày công, giờ ở tổ / hỗ trợ, hộp phát, màu ô');

const th=J(F.xayTongHopTo(J(du),2026,11)).giaTri;
assert.equal(th[0][2],'Tổ dán 1'); const d9=th.find(r=>r[0]===9);
gần(d9[2],4);   gần(d9[3],24); gần(d9[4],16);     // Tổ dán 1: 4 người ở tổ (Cường đi trọn ngày), 24 giờ, 16 giờ hỗ trợ
gần(d9[2+6*3+0],1);                              // Ngoài 6 tổ: Kho1 (Phụ kho) và không có Quản (không điểm danh)
const xuong=d9.slice(-3); assert.equal(xuong[0],6); gần(xuong[1],6*8); gần(xuong[2],16);   // Cả xưởng đủ giờ, gồm cả giờ hỗ trợ
assert.equal(th[th.length-1][0],'Cộng tháng'); gần(th[th.length-1][3],24);
console.log('PASS Tổng hợp tổ: Tổ dán 1 = 24 giờ ở tổ, 16 giờ hỗ trợ, Cả xưởng tính đủ');

const ghc=J(F.xayGhiChu(J(du),2026,11)).giaTri; assert.deepEqual(ghc[1],['09/11/2026','Kho1','Phụ kho','kiểm kho']);
console.log('PASS Ghi chú: ngày dd/mm/yyyy, tên, tổ, nội dung');
// người đã ẩn nhưng có điểm danh trong tháng vẫn hiện; người ẩn không có điểm danh thì ẩn
const du2=J(du); du2.nguoi.push(Object.assign(ng('z','Nghỉ','Tổ dán 2'),{con_dung:false}),Object.assign(ng('y','NghiCo','Tổ dán 2'),{con_dung:false})); du2.diem_danh.push({nguoi_id:'y',ngay:'2026-11-03',sang:true,chieu:false,tang_ca:0,ho_tro_sang:false,ho_tro_chieu:false});
const t2=J(F.xayChamCong(du2,2026,11)).giaTri.map(r=>r[0]); assert.ok(t2.includes('NghiCo')&&!t2.includes('Nghỉ'));
console.log('PASS người đã ẩn: còn điểm danh trong tháng thì hiện, không thì ẩn');
