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
assert(report.monthActual===85&&report.monthSchedule===80,'Tiến độ tháng phải là 85% so với 80%');
assert(Math.round(report.previousGap*10)/10===-4&&Math.round(report.quarterGap*10)/10===-3,'Mức chậm quý phải giảm từ 4% còn 3%');
assert(report.text==='Đến hết tuần cuối tháng 8/2026, tiến độ hoàn thành KR đạt 85,0%, đang vượt 5,0% so với tiến độ tháng. So với tiến độ chung của quý, mức chậm giảm từ 4,0% còn 3,0%.','Câu báo cáo không đúng giọng đã chốt');
console.log('PASS  weekly KR report uses natural month and quarter wording');

context.workDatesForQuarter=()=>['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30'];
const sundayCutoff=context.mocKetThucTuan(new Date(2026,7,31),new Set(context.workDatesForQuarter()));
assert(sundayCutoff==='2026-08-30','Chủ nhật đã đăng ký phải là mốc chốt tuần');
console.log('PASS  registered Sunday becomes the weekly cutoff');
