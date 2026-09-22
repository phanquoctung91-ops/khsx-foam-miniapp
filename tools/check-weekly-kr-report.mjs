// Cau bao cao tuan (nut "Bam xem bao cao tuan") - mau anh Tung chot 22/09/2026:
// 4 dong, moi dong mot moc, cung khuon "lam duoc / can lam den hom nay
// - du hay hut bao nhieu tam (bao nhieu %)". Phan tram am mang dau tru.
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function isoCuaNgay');
const end=html.indexOf('function computeAndRenderKpis',start);
if(start<0||end<0) throw new Error('Không tìm thấy khối câu báo cáo KR tuần');

const context={
  allDays:{
    j1:{date:'01/07/2026',plan:0,output:20},
    j2:{date:'02/07/2026',plan:0,output:20},
    j3:{date:'03/07/2026',plan:0,output:20},
    j4:{date:'04/07/2026',plan:0,output:20},
    j5:{date:'06/07/2026',plan:0,output:9},
    a1:{date:'03/08/2026',plan:25,output:20},
    a2:{date:'04/08/2026',plan:25,output:23},
    a3:{date:'24/08/2026',plan:25,output:21},
    a4:{date:'25/08/2026',plan:25,output:21},
  },
  quarterTargets:{'2026_Q3':200},
  dmyToIso(value){
    const m=String(value||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m?`${m[3]}-${m[2]}-${m[1]}`:'';
  },
  isoToDMY(value){
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?`${m[3]}/${m[2]}/${m[1]}`:'';
  },
  workDatesForQuarter(){
    return ['2026-07-01','2026-07-02','2026-07-03','2026-07-04','2026-07-06',
      '2026-08-03','2026-08-04','2026-08-24','2026-08-25','2026-08-31'];
  },
  tongKpiTuRowsTheoKeys(keys){
    return keys.reduce((sum,key)=>({
      plan:sum.plan+Number(context.allDays[key]?.plan||0),
      throughput:sum.throughput+Number(context.allDays[key]?.output||0),
    }),{plan:0,throughput:0});
  },
};
vm.createContext(context);
vm.runInContext(html.slice(start,end),context);

function assert(ok,message){if(!ok)throw new Error(message);}

const report=context.taoCauBaoCaoKrTuan(2026,8,new Date(2026,8,3));
assert(report.cutoffIso==='2026-08-29','Tháng cũ phải chốt ở Thứ 7 cuối cùng');

const dong=report.text.split('\n');
assert(dong.length===4,'Câu báo cáo phải có đúng 4 dòng');
assert(dong[0]==='Tuần 24-25/08 (2 ngày làm): 42/40 tấm — dư 2 tấm (+5,0%).','Dòng tuần sai mẫu');
assert(dong[1]==='Tháng 8 (4/5 ngày): 85/80 tấm — dư 5 tấm (+6,3%).','Dòng tháng sai mẫu');
assert(dong[3]==='Dự báo cuối quý: 193/200 tấm (96,7%) — thiếu 7 tấm nếu giữ tốc độ 19 tấm/ngày.','Dòng dự báo sai mẫu');
console.log('PASS  câu báo cáo tuần đúng mẫu 4 dòng đã chốt');

// Ba dong tuan/thang/quy phai lay muc tieu TINH DEN HOM NAY lam goc, khong lay
// muc tieu ca ky - neu khac goc thi ba dong khong so duoc voi nhau.
assert(dong[1].includes('85/80 tấm'),'Dòng tháng phải so với mục tiêu tính đến hôm nay (80), không phải mục tiêu cả tháng');
assert(dong[2].startsWith('Quý 3 (9/10 ngày): 174/180 tấm'),'Dòng quý phải so với mục tiêu tính đến hôm nay (180), không phải 200 của cả quý');
console.log('PASS  cả ba mốc dùng chung gốc "mục tiêu tính đến hôm nay"');

assert(dong[2].includes('hụt 6 tấm (−3,3%)'),'Phần trăm âm phải mang dấu trừ');
console.log('PASS  phần trăm âm hiện dấu trừ');

assert(dong[2].includes('tuần rồi bớt hụt 2'),'Dòng quý phải nói thẳng tuần rồi đổi bao nhiêu tấm, không bắt người đọc tự trừ');
assert(dong[2].includes('Còn 1 ngày, cần 26 tấm/ngày.'),'Dòng quý phải nói còn mấy ngày và cần bao nhiêu mỗi ngày');
console.log('PASS  dòng quý nói rõ xu hướng và việc phải làm');

context.workDatesForQuarter=()=>['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30'];
const sundayCutoff=context.mocKetThucTuan(new Date(2026,7,31),new Set(context.workDatesForQuarter()));
assert(sundayCutoff==='2026-08-30','Chủ nhật đã đăng ký phải là mốc chốt tuần');
console.log('PASS  registered Sunday becomes the weekly cutoff');
