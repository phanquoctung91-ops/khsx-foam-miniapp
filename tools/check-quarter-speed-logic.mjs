import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function isoSoNgay');
const end=html.indexOf('function mauTocDo',start);
if(start<0||end<0) throw new Error('Không tìm thấy khối logic tốc độ trong index.html');

const context={
  console,
  allDays:{},
  quarterTargets:{'2026_Q3':100},
  target:100,
  workDates:['2026-07-01','2026-07-02','2026-08-03','2026-08-04'],
  isoDayNumber(iso){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return NaN;
    return Date.parse(`${iso}T00:00:00Z`)/86400000;
  },
  dmyToIso(value){
    const raw=String(value||'');
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const m=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m?`${m[3]}-${m[2]}-${m[1]}`:'';
  },
  parseDMY(value){
    const m=String(value||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m?{d:Number(m[1]),m:Number(m[2]),y:Number(m[3])}:null;
  },
  isoDateLocal(){ return '2026-08-03'; },
  workDatesForQuarter(){ return context.workDates.slice(); },
  tinhTienDoQuyHienTai(){ return {nam:2026,quy:3,mucTieu:context.target}; },
  tongKpiTuRowsTheoKeys(keys){
    return {throughput:keys.reduce((sum,key)=>sum+Number(context.allDays[key]?.output||0),0)};
  },
};
vm.createContext(context);
vm.runInContext(html.slice(start,end),context);
context.ngayHienTaiIso=()=> '2026-08-03';

function assert(ok,message){ if(!ok) throw new Error(message); }

context.allDays={aug03:{date:'03/08/2026',output:30}};
let result=context.tinhTocDoQuy();
assert(result.dataComplete===false,'Thiếu tháng 7 phải khóa tốc độ quý');
assert(result.output===30&&result.partialWorkdays===1&&result.elapsedWorkdays===3,'Độ phủ dữ liệu thiếu không đúng');
assert(result.thucTe===null&&result.duBao===null&&result.tocDoCanChoPhanConLai===null,'Không được dự báo khi nguồn quý chưa đủ');
assert(result.missingElapsedDates.join(',')==='2026-07-01,2026-07-02','Danh sách ngày thiếu không đúng');
console.log('PASS  incomplete quarter data blocks official speed and forecast');

context.allDays={
  jul01:{date:'01/07/2026',output:10},
  jul02:{date:'02/07/2026',output:20},
  aug03:{date:'03/08/2026',output:30},
  sunday:{date:'05/07/2026',output:999},
};
result=context.tinhTocDoQuy();
assert(result.dataComplete===true,'Đủ ngày đã qua phải cho tính tốc độ quý');
assert(result.output===60,'Sản lượng ngày ngoài lịch không được chen vào tốc độ quý');
assert(result.thucTe===20&&result.duBao===80,'Tốc độ/dự báo quý đủ dữ liệu không đúng');
assert(result.tocDoCanChoPhanConLai===40&&result.canThemMoiNgay===20,'Tốc độ cần cho phần còn lại không đúng');
console.log('PASS  complete quarter uses the same registered dates for numerator and denominator');

context.target=1000;
result=context.tinhTocDoQuy();
assert(result.vuotNangLuc11h===true&&result.capacity11h===180,'Phải cảnh báo khi tốc độ cần vượt trần 11 giờ');
assert(/Không khả thi/.test(result.danhGia),'Đánh giá phải nói rõ không khả thi');
console.log('PASS  required speed above 180 sheets/day is flagged as infeasible');
