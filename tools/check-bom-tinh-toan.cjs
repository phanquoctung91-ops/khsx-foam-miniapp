// Xác nhận BOM (bộ khung 2026-09-25): phần tính toán trên app.
// Luật anh Tùng: lô đóng gói ĐỦ mới xác nhận; file xuất theo ngày đóng gói — ngày nào đóng bao
// nhiêu tấm thì tính vật tư bấy nhiêu, số tấm từng ngày phải khớp báo cáo đóng gói; phần sửa
// khác BOM ghi vào ngày lô đóng xong.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const lay=(ten)=>{
  const i=html.indexOf(`function ${ten}(`); assert.ok(i>=0,`Không tìm thấy hàm ${ten}`);
  let sau=0,j=html.indexOf('){',i)+1;
  for(let k=j;k<html.length;k++){ if(html[k]==='{')sau++; else if(html[k]==='}'){ sau--; if(!sau) return html.slice(i,k+1); } }
};
const layConst=(ten)=>{ const m=html.match(new RegExp(`const ${ten}=([^;]+);`)); assert.ok(m,`Không tìm thấy ${ten}`); return `var ${ten}=${m[1]};`; };

const ctx={
  don:[], dongGoi:{}, bomTheoMa:{}, bomXacNhan:{},
  khoaNgayDMY:d=>{const m=String(d||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?Number(m[3]+m[2]+m[1]):0;},
  soCongDoan:v=>Math.max(0,Number(v)||0), assignments:{},
};
ctx.getOrders=()=>ctx.don;
ctx.dongGoiTheoNgayCuaDon=o=>ctx.dongGoi[o.id]||{};
vm.createContext(ctx);
vm.runInContext([layConst('maHangBom'),layConst('lamTronBom'),layConst('BOM_NGAY_BAT_DAU'),layConst('canXacNhanBom'),
  ...['laDonCanBom','thongTinLoBom','dongBomChuan','chenhLechXacNhanBom','duLieuXuatBom','chuanHoaTenSP','chuanHoaMaBaoCao','chuanBiDongBaoCao','dongHienThiDaXacNhanBom'].map(lay),
  layConst('nhanTrangThaiNhomBom')].join('\n'),ctx);

const BOM=[{stt:1,ma_vt:'MTS716',ten_vt:'Mút ép 7cm-1m6',dinh_muc:1,dvt:'Tấm'},{stt:2,ma_vt:'MD18K-163',ten_vt:'Mút xốp',dinh_muc:0.13,dvt:'Tấm'},{stt:3,ma_vt:'ANSORA10-6',ten_vt:'Áo nệm',dinh_muc:1,dvt:'Cái'}];
ctx.bomTheoMa={'SORA10-6':BOM,'LUN10-4':[]};
const A={id:'A',date:'26/09/2026',ma:'SORA10-6',dong:'SORA',ngang:'160',dai:'200',day:'10',so_luong:15};
const B={id:'B',date:'27/09/2026',ma:'sora10-6',dong:'SORA',ngang:'160',dai:'200',day:'10',so_luong:9};   // chữ thường vẫn khớp BOM
const C={id:'C',date:'28/09/2026',ma:'LUN10-4',dong:'LUNA',ngang:'140',dai:'200',day:'10',so_luong:5};     // không có BOM
const W={id:'W',date:'28/09/2026',ma:'SORA10-6',dong:'SORA',so_luong:3,is_warranty:true};
ctx.don=[A,B,C,W];
ctx.dongGoi={A:{'27/09/2026':10,'28/09/2026':5},B:{'28/09/2026':4},C:{'28/09/2026':5},W:{'28/09/2026':3}};

// Lô đủ / chưa đủ, ngày xong
let lo=ctx.thongTinLoBom(A);
assert.equal(lo.du,true); assert.equal(lo.ngayXong,'28/09/2026'); assert.equal(lo.soTam,15);
assert.equal(ctx.thongTinLoBom(B).du,false,'Lô 4/9 chưa đủ mà coi là đủ');
assert.equal(ctx.laDonCanBom(W),false,'Bảo hành không xác nhận BOM');
console.log('PASS  lô đủ khi đóng gói đủ kế hoạch; ngày xong là ngày chạm đủ; bảo hành bỏ qua');

// File theo ngày: ngày nào đóng bao nhiêu tính vật tư bấy nhiêu
let dl=ctx.duLieuXuatBom(['27/09/2026','28/09/2026']);
const g23=dl.theoNgay['27/09/2026'][0], g24=dl.theoNgay['28/09/2026'].find(g=>g.ma.toUpperCase()==='SORA10-6');
assert.equal(g23.soTam,10); assert.equal(g23.vt.MTS716.theo_bom,10); assert.equal(g23.vt['MD18K-163'].theo_bom,1.3);
assert.equal(g24.soTam,9,'Ngày 28: 5 tấm lô A + 4 tấm lô B gộp một dòng như báo cáo đóng gói');
assert.equal(g24.vt.MTS716.theo_bom,9);
console.log('PASS  vật tư chia đúng theo số tấm đóng gói từng ngày');

// Khớp báo cáo đóng gói, bảo hành không vào
dl.kiemTra.forEach(k=>assert.equal(k.tamBom,k.tamBaoCao,`Ngày ${k.ngay} lệch: BOM ${k.tamBom}, báo cáo ${k.tamBaoCao}`));
assert.deepEqual([...dl.kiemTra.map(k=>k.tamBom)],[10,14]);
console.log('PASS  số tấm từng ngày khớp báo cáo đóng gói (không tính bảo hành)');

// Trạng thái
const gC=dl.theoNgay['28/09/2026'].find(g=>g.ma==='LUN10-4');
assert.equal(ctx.nhanTrangThaiNhomBom(gC.tt),'Không có BOM');
assert.equal(ctx.nhanTrangThaiNhomBom(g24.tt),'Chưa xác nhận');
console.log('PASS  ghi rõ "Không có BOM" / "Chưa xác nhận"');

// Lô A xác nhận CÓ THAY ĐỔI: MTS716 14 thay 15, thêm MTS715 1 -> chênh ghi vào ngày xong 28/09
ctx.bomXacNhan={A:{trang_thai:'co_thay_doi',dong:[
  {ma_vt:'MTS716',thuc_dung:14},{ma_vt:'MD18K-163',thuc_dung:1.95},{ma_vt:'ANSORA10-6',thuc_dung:15},{ma_vt:'MTS715',ten_vt:'Mút ép 7cm-1m5',dvt:'Tấm',thuc_dung:1}]}};
dl=ctx.duLieuXuatBom(['27/09/2026','28/09/2026']);
const n23=dl.theoNgay['27/09/2026'][0], n24=dl.theoNgay['28/09/2026'].find(g=>g.ma.toUpperCase()==='SORA10-6');
assert.equal(n23.vt.MTS716.thuc_dung,10,'Ngày 27 không được nhận phần chênh');
assert.equal(n24.vt.MTS716.thuc_dung,8,'Ngày 28: 9 theo BOM - 1 chênh = 8');
assert.equal(n24.vt.MTS715.thuc_dung,1); assert.equal(n24.vt.MTS715.theo_bom,0);
assert.equal(dl.tong.MTS716.thuc_dung,18); assert.equal(dl.tong.MTS716.theo_bom,19);
assert.equal(ctx.nhanTrangThaiNhomBom(n24.tt),'Chưa xác nhận hết','Ngày 28 có lô A đã xác nhận, lô B chưa');
console.log('PASS  phần sửa khác BOM ghi vào ngày lô đóng xong, tổng vật tư đúng');

// Bỏ hẳn một vật tư khi xác nhận -> chênh âm đủ số theo BOM
const ch=ctx.chenhLechXacNhanBom({dong:[{ma_vt:'MTS716',thuc_dung:15},{ma_vt:'ANSORA10-6',thuc_dung:15}]},BOM,15);
assert.equal(ch['MD18K-163'].chenh,-1.95);
console.log('PASS  bỏ một vật tư khi xác nhận thì trừ đủ số theo BOM');

// Lô đóng gói xong TRƯỚC 25/09 (anh chốt ngày bắt đầu): không cần xác nhận, file vẫn tính BOM chuẩn
const D={id:'D',date:'20/09/2026',ma:'SORA10-6',dong:'SORA',ngang:'160',dai:'200',day:'10',so_luong:5};
ctx.don=[D]; ctx.dongGoi={D:{'23/09/2026':5}}; ctx.bomXacNhan={};
assert.equal(ctx.canXacNhanBom(ctx.thongTinLoBom(D)),false,'Lô xong 23/09 vẫn bắt xác nhận');
const E={id:'E',date:'23/09/2026',ma:'SORA10-6',dong:'SORA',ngang:'160',dai:'200',day:'10',so_luong:5};
ctx.don=[D,E]; ctx.dongGoi={D:{'23/09/2026':5},E:{'23/09/2026':2,'24/09/2026':3}};
assert.equal(ctx.canXacNhanBom(ctx.thongTinLoBom(E)),true,'Lô đóng vắt qua ngày bắt đầu phải xác nhận');
dl=ctx.duLieuXuatBom(['23/09/2026']);
assert.equal(dl.theoNgay['23/09/2026'][0].vt.MTS716.theo_bom,7);
assert.equal(ctx.nhanTrangThaiNhomBom(new Set(['truoc'])),'Trước 24/09, không cần xác nhận');
assert.equal(ctx.nhanTrangThaiNhomBom(dl.theoNgay['23/09/2026'][0].tt),'Chưa xác nhận hết');
console.log('PASS  lô xong trước ngày bắt đầu không cần xác nhận, vẫn tính vật tư; lô vắt qua ngày bắt đầu vẫn phải xác nhận');

// Đổi mã một dòng (MTS716 -> MTS715) và bỏ hẳn một dòng (MD18K-163)
const luu={dong:[{ma_vt:'MTS715',thay_cho:'MTS716',thuc_dung:15},{ma_vt:'ANSORA10-6',thuc_dung:15}]};
const ch2=ctx.chenhLechXacNhanBom(luu,BOM,15);
assert.equal(ch2.MTS716.chenh,-15); assert.equal(ch2.MTS715.chenh,15); assert.equal(ch2['MD18K-163'].chenh,-1.95);
const hien=ctx.dongHienThiDaXacNhanBom(luu,ctx.dongBomChuan(BOM,15));
assert.equal(hien.length,3,'Bảng đã xác nhận phải hiện đủ 3 dòng BOM (không nhân đôi dòng đổi mã)');
assert.equal(hien[0].ma_vt,'MTS715'); assert.equal(hien[0].goc,'MTS716');
assert.equal(hien[1].xoa,true,'Dòng đã bỏ phải hiện gạch ngang');
console.log('PASS  đổi mã và bỏ dòng: tính chênh đúng, bảng đã xác nhận hiện đúng');
