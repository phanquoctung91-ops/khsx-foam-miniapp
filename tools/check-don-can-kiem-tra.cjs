// "Đơn cần kiểm tra" (2026-09-24): đơn file mới không còn phải ghép đúng với dòng mới thay nó,
// KHÔNG ghép nhầm với đơn đã có sẵn từ trước (ghép nhầm = chuyển nhầm tổ/tiến độ).
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const lay=(ten)=>{
  const i=html.indexOf(`function ${ten}(`);
  assert.ok(i>=0,`Không tìm thấy hàm ${ten}`);
  let sau=0,j=html.indexOf('){',i)+1;
  for(let k=j;k<html.length;k++){ if(html[k]==='{')sau++; else if(html[k]==='}'){ sau--; if(!sau) return html.slice(i,k+1); } }
};
const layConst=(ten)=>{ const m=html.match(new RegExp(`const ${ten} = (\\[[\\s\\S]*?\\]|[^;]+);`)); assert.ok(m,`Không tìm thấy ${ten}`); return `var ${ten} = ${m[1]};`; };

const ctx={ds:[],thongTinNguonById:{},chuanHoaTenSP:s=>String(s||'').trim().toLowerCase()};
ctx.getOrders=()=>ctx.ds;
vm.createContext(ctx);
vm.runInContext([layConst('CHANGE_FIELDS'),layConst('MATCH_THRESHOLD'),
  ...['isPlannedOrder','sameVal','matchScore','matchDistance','timDonCanKiemTra'].map(lay)].join('\n'),ctx);

const T=Date.parse('2026-09-24T08:00:00Z'), iso=ms=>new Date(ms).toISOString();
const D='25/09/2026';
const don=(id,ma,qty,extra={})=>({id,date:D,ma,dong:'SORA',ngang:'160',dai:'200',day:'10',so_luong:qty,...extra});
const A=don('r_A','SORA10-6',15,{source_removed:true});
const B=don('r_B','SORA10-9',22);      // dòng mới của file, vẫn mã sai
const C=don('r_C','SORA10-9',9);       // đơn có sẵn từ trước, cùng mã
ctx.ds=[A,B,C];
ctx.thongTinNguonById={
  r_A:{sua_tay:{before:{ma:'SORA10-9',dong:'SORA',ngang:'160',dai:'200',day:'10'}},bo_luc:iso(T),tao_luc:iso(T-2*864e5)},
  r_B:{tao_luc:iso(T+1000)}, r_C:{tao_luc:iso(T-2*864e5)}};
let kq=ctx.timDonCanKiemTra();
assert.equal(kq.cap.length,1); assert.equal(kq.cap[0].b.id,'r_B','Ghép nhầm với đơn có sẵn từ trước');
console.log('PASS  đơn sửa tay ghép đúng dòng mới (theo mã lúc nạp), không ghép đơn có sẵn');

// Không có dòng mới thay thế -> vào danh sách lẻ, không ghép bừa
ctx.ds=[A,C]; kq=ctx.timDonCanKiemTra();
assert.equal(kq.cap.length,0); assert.equal(kq.le.length,1);
console.log('PASS  không có dòng thay thế thì để riêng, không ghép bừa');

// Lô: lô 1 ghép lô 1, lô 2 ghép lô 2
const A1=don('r_X_1__lo1','CLS10-6',15,{dong:'CLASSIC',source_removed:true}), A2=don('r_X_1__lo2','CLS10-6',5,{dong:'CLASSIC',source_removed:true});
const B1=don('r_Y_1__lo1','CLS10-6',15,{dong:'CLASSIC'}), B2=don('r_Y_1__lo2','CLS10-6',7,{dong:'CLASSIC'});
ctx.ds=[A1,A2,B2,B1];
ctx.thongTinNguonById={r_X_1__lo1:{bo_luc:iso(T)},r_X_1__lo2:{bo_luc:iso(T)},r_Y_1__lo1:{tao_luc:iso(T)},r_Y_1__lo2:{tao_luc:iso(T)}};
kq=ctx.timDonCanKiemTra();
assert.deepEqual([...kq.cap.map(x=>x.a.id+'>'+x.b.id)].sort(),['r_X_1__lo1>r_Y_1__lo1','r_X_1__lo2>r_Y_1__lo2']);
console.log('PASS  đơn chia lô ghép đúng lô với lô');

// Khác dòng sản phẩm thì không ghép; khác ngày thì không ghép
ctx.ds=[don('r_P','LUN10-6',5,{dong:'LUNA',source_removed:true}),don('r_Q','LUN10-6',9,{dong:'SORA'}),don('r_R','LUN10-6',9,{dong:'LUNA',date:'26/09/2026'})];
ctx.thongTinNguonById={r_P:{bo_luc:iso(T)},r_Q:{tao_luc:iso(T)},r_R:{tao_luc:iso(T)}};
assert.equal(ctx.timDonCanKiemTra().cap.length,0);
console.log('PASS  khác dòng sản phẩm hoặc khác ngày thì không ghép');
