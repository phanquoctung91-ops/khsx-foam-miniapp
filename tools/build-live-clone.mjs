import fs from 'node:fs';

const STORAGE='https://script.google.com/macros/s/AKfycbxqrbrDm9eGu6NuwhNYZLznho6SWgbSE6l9EcaI8xM9VyP2FE--bGcQNRhfJI751lyI/exec';
const READER='https://script.google.com/macros/s/AKfycbz2duSQjFEE8VqoL-RQ0Sh8_bGkQcaZ0PS8xVGRGHCG10i1w1U8M6-yiAeEM-Yvt2o/exec';
const REPORT='https://script.google.com/macros/s/AKfycbxnwBq-NJ58hiRvcveRJJLMcxscIj7DQt_thvrEZ5LuLaMpWYtfB8KBkufMfgio8uEVRQ/exec';
const LOT={10:15,12:15,15:9,17:9,20:5,22:5};
const WORKERS=[
  {id:'loan_anh',display_name:'Loan Anh',stage:'may',active:true},
  {id:'thao_vy',display_name:'Thảo Vy',stage:'may',active:true},
  {id:'bao_cham',display_name:'Bảo Chăm',stage:'may',active:true},
  {id:'minh_thuan',display_name:'Minh Thuận',stage:'dong_goi',active:true}
];
const runId=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14);

async function fetchJson(url){
  const r=await fetch(url,{redirect:'follow'}); if(!r.ok) throw new Error(`${r.status} ${url}`);
  const t=await r.text();
  try{return JSON.parse(t)}catch{}
  const m=t.match(/^[^(]+\((.*)\);?\s*$/s); if(!m) throw new Error(`Phản hồi không phải JSON/JSONP: ${url}`);
  return JSON.parse(m[1]);
}
async function getAll(keys){
  const d=await fetchJson(`${STORAGE}?action=getAll&keys=${encodeURIComponent(keys.join(','))}`);
  if(!d.ok||!d.values) throw new Error('Storage getAll thất bại');
  return Object.fromEntries(keys.map(k=>{try{return [k,d.values[k]?JSON.parse(d.values[k]):null]}catch{return [k,null]}}));
}
const pad=n=>String(n).padStart(2,'0');
function dmy(v){
  let m=String(v??'').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if(m) return `${pad(m[1])}/${pad(m[2])}/${m[3]}`;
  m=String(v??'').trim().match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  return m?`${pad(m[3])}/${pad(m[2])}/${m[1]}`:null;
}
function iso(v){const m=String(v||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:null}
function norm(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'')}
const canonical={SORA:'Sora',STANDARD:'Standard',CLASSIC:'Classic',PREMIUM:'Premium',LUNA:'Luna','LATEX GOLD':'Latex Gold','LATEX ENZO':'Latex Enzo',KINGHOME:'KingHome','KING HOME':'KingHome',HYBRID:'Hybrid','HYBRID PLUS':'Hybrid Plus',"3'ZONE":'3-Zone','3-ZONE':'3-Zone','3 ZONE':'3-Zone','3ZONE':'3-Zone'};
function product(v){const s=String(v??'').trim().replace(/\s+/g,' '),k=s.toUpperCase();return canonical[k]||s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase())}
function parseSheet(table){
  const header=table.findIndex(r=>(r||[]).some(c=>norm(c)==='ngay')&&(r||[]).some(c=>norm(c)==='ma'));
  if(header<0) throw new Error('Không tìm thấy tiêu đề sheet');
  const h=table[header].map(norm), aliases={date:['ngay'],team:['to'],code:['ma'],name:['dong'],width:['ngang'],length:['dai'],thickness:['day'],qty:['soluong'],note:['ghichu']};
  const col={}; for(const [k,aa] of Object.entries(aliases)){col[k]=h.findIndex(x=>aa.includes(x));}
  const rows=[]; for(const a of table.slice(header+1)){
    const date=dmy(a[col.date]); if(!date||String(a[col.team]||'').trim().toLowerCase()!=='foam') continue;
    rows.push({date,ma:String(a[col.code]||'').trim(),dong:product(a[col.name]),ngang:String(a[col.width]||'').trim(),dai:String(a[col.length]||'').trim(),day:String(a[col.thickness]||'').trim(),so_luong:Number(a[col.qty])||0,ghi_chu:String(a[col.note]||'').trim()});
  }
  const seen={}; return rows.flatMap(r=>{
    const base=[r.date,r.ma,r.ngang,r.dai,r.day,r.so_luong].join('|').replace(/[^a-zA-Z0-9À-ỹ]/g,'_');
    const n=seen[base]=(seen[base]||0)+1, root={...r,id:`r_${base}_${n}`,is_drop:false};
    const lot=LOT[Number(r.day)], qty=Number(r.so_luong)||0; if(!lot||qty<=lot) return [root];
    const parts=[]; for(let left=qty;left>0;left-=lot) parts.push(Math.min(lot,left));
    return parts.map((q,i)=>({...root,id:`${root.id}__lo${i+1}`,so_luong:q,is_lot:true,lot_label:`Lô ${i+1}/${parts.length}`}));
  });
}
const toDb=v=>{const m=String(v||'').match(/[1-5]/);return m?`To ${m[0]}`:null};
function workerId(v){
  const x=norm(v);
  if(x.includes('loananh')) return 'loan_anh';
  if(x.includes('thaovy')) return 'thao_vy';
  if(x.includes('baocham')||x==='cham') return 'bao_cham';
  if(x.includes('minhthuan')) return 'minh_thuan';
  return null;
}
function isHistoricalDrop(o){const x=iso(o.date);return !!o.is_drop&&x&&x<='2026-08-21'}
function dimKey(o){return [String(o.date||''),norm(o.dong||o.ten_hang),Number(o.ngang)||'',Number(o.dai)||200,Number(o.day)||''].join('|')}
function dimensions(o){
  const direct=[Number(o.ngang),Number(o.dai),Number(o.day)];
  if(direct.every(Number.isFinite) && direct.every(x=>x>0)) return direct;
  const parts=String(o.ngang||o.kich_thuoc||'').match(/\d+(?:[.,]\d+)?/g)?.map(x=>Number(x.replace(',','.')))||[];
  if(parts.length>=3) return parts.slice(0,3);
  if(parts.length===2) return [parts[0],200,parts[1]];
  return [Number.isFinite(direct[0])&&direct[0]>0?direct[0]:null,Number.isFinite(direct[1])&&direct[1]>0?direct[1]:200,Number.isFinite(direct[2])&&direct[2]>0?direct[2]:null];
}

const baseKeys=['khsx_assign_months','khsx_autoplan_assignments','khsx_dynamic_orders','khsx_deleted_orders','khsx_locked_plan_dates','khsx_locked_progress_dates','khsx_priority_orders','khsx_user_teams','khsx_muc_tieu_quy','khsx_snap_version'];
const base=await getAll(baseKeys);
const monthKeys=Array.isArray(base.khsx_assign_months)?base.khsx_assign_months:[];
const monthData=monthKeys.length?await getAll(monthKeys):{};
let assignments={...(base.khsx_autoplan_assignments||{})}; for(const k of monthKeys) assignments={...assignments,...(monthData[k]||{})};
const lockedPlan=Array.isArray(base.khsx_locked_plan_dates)?base.khsx_locked_plan_dates:[];
const snapKeys=lockedPlan.map(d=>`khsx_snap_${d.replaceAll('/','-')}`), snaps=snapKeys.length?await getAll(snapKeys):{};
const plan=(await fetchJson(`${READER}?_cb=${Date.now()}`)); if(!plan.ok||!Array.isArray(plan.rows)) throw new Error('Không đọc được kế hoạch live');
const current=parseSheet(plan.rows);
const warranty=(await fetchJson(`${READER}?action=baohanh&_cb=${Date.now()}`));
const groups=(await fetchJson(`${REPORT}?action=orderGroups&_cb=${Date.now()}`));
const groupMap=new Map(); for(const g of (groups.rows||[])){const k=[String(g.date||''),norm(g.dong),...String(g.kich_thuoc||'').match(/\d+/g)||[]].join('|');if(g.nhom)groupMap.set(k,String(g.nhom))}
const orderMap=new Map();
for(const d of lockedPlan){const rows=snaps[`khsx_snap_${d.replaceAll('/','-')}`];if(Array.isArray(rows)&&rows.length)for(const o of rows)orderMap.set(o.id,o)}
for(const o of current) if(!lockedPlan.includes(o.date)||!(snaps[`khsx_snap_${o.date.replaceAll('/','-')}`]||[]).length) orderMap.set(o.id,o);
for(const o of (base.khsx_dynamic_orders||[])) orderMap.set(o.id,o);
for(const [date,x] of Object.entries(warranty.ngay||{})){const qty=Number(x.tong)||0;if(qty>0)orderMap.set(`bh_${date.replaceAll('/','-')}`,{id:`bh_${date.replaceAll('/','-')}`,date,ma:'',dong:'Bảo hành',ngang:'',dai:'',day:'',so_luong:qty,ghi_chu:'',is_warranty:true,bh_theo_to:x.theoTo||{},bh_chi_tiet:x.chiTiet||[]})}
const deleted=new Set(base.khsx_deleted_orders||[]), priorities=new Set(base.khsx_priority_orders||[]);
for(const [id,o] of [...orderMap]) if(deleted.has(id)||isHistoricalDrop(o)) orderMap.delete(id);

// Áp đúng quy ước đang chạy trên live: đơn sản xuất đến hết 21/08 đã hoàn thành đủ
// ba công đoạn theo ngày kế hoạch. Đây là hiệu chỉnh đã được người dùng xác nhận,
// không phải suy diễn kế hoạch thành thực tế cho dữ liệu mới.
const movedTo20=new Set([
  'r_20_08_2026_LAGO20_8_180_200_20_5_1',
  'r_20_08_2026_SORA15_8_180_220_15_1_1',
  'r_20_08_2026_SORA20_4_140_160_30_1_1'
]);
const fixedOnPlanDate=new Map([
  ['r_15_08_2026_LAEZ10_2_120_200_10_2_1',{date:'15/08/2026',qty:2,team:'Tổ 4'}]
]);
// Hiệu chỉnh dữ liệu cũ đã được quản lý xác nhận: hai dòng hoàn tất ngày 20/08
// nhưng sheet nguồn thiếu tổ. Gán Tổ 4 để KPI lịch sử không bị treo; dữ liệu mới
// không đi qua bảng này và vẫn lấy tổ/người từ tài khoản thực hiện.
const verifiedLegacyTeam4=new Set([
  'r_20_08_2026_SORA15_8_180_220_15_1_1',
  'r_20_08_2026_SORA20_4_140_160_30_1_1'
]);
const verifiedChainBalance=new Map([
  ['r_24_08_2026_SORA10_4_140_200_10_15_1',{date:'24/08/2026',may:15,team:'Tổ 4'}]
]);
for(const [id,o] of orderMap){
  const a=assignments[id]||(assignments[id]={});
  if(verifiedLegacyTeam4.has(id)){
    a.to='Tổ 4';
    Object.values(a.stage_by_date||{}).forEach(e=>{
      ['dan','may','dong_goi'].forEach(stage=>{ if(e[stage]!=null) e[`_${stage}_to`]='Tổ 4'; });
    });
  }
  const balance=verifiedChainBalance.get(id);
  if(balance){
    const e=a.stage_by_date?.[balance.date]||(a.stage_by_date||(a.stage_by_date={}))[balance.date]||{};
    e.may=balance.may; e._may_to=balance.team;
    a.stage_by_date[balance.date]=e;
  }
  if(movedTo20.has(id)&&a.stage_by_date?.['21/08/2026']) delete a.stage_by_date['21/08/2026'];
  const fixed=fixedOnPlanDate.get(id);
  if(fixed){
    a.to=fixed.team;
    a.stage_by_date={[fixed.date]:{dan:fixed.qty,may:fixed.qty,dong_goi:fixed.qty,_dan_to:fixed.team,_may_to:fixed.team,_dong_goi_to:fixed.team}};
  }
  if(iso(o.date)<='2026-08-21'&&!o.is_drop&&!o.is_manual&&!o.is_warranty){
    const qty=Math.max(0,Number(o.so_luong)||0), team=a.to||null;
    a.stage_by_date={...(a.stage_by_date||{}),[o.date]:{...((a.stage_by_date||{})[o.date]||{}),dan:qty,may:qty,dong_goi:qty,_dan_to:team,_may_to:team,_dong_goi_to:team}};
    a.so_luong_da_dan=qty;a.so_luong_da_may=qty;a.so_luong_hoan_thanh=qty;a.ngay_hoan_thanh=o.date;
  }
  // Đơn phát sinh cũ không phải lúc nào cũng có stage_by_date, nhưng bản live vẫn
  // lưu tổng hoàn thành và ngày hoàn thành. Chỉ dựng tiến độ khi bằng chứng này có đủ.
  const legacyDone=Math.max(0,Number(a.so_luong_hoan_thanh)||0), qty=Math.max(0,Number(o.so_luong)||0);
  const doneDate=dmy(a.ngay_hoan_thanh);
  const hasStage=Object.values(a.stage_by_date||{}).some(s=>['dan','may','dong_goi'].some(k=>s?.[k]!=null));
  if(o.is_manual&&!hasStage&&doneDate&&qty>0&&legacyDone>=qty){
    const team=a.to||null;
    a.stage_by_date={...(a.stage_by_date||{}),[doneDate]:{dan:qty,may:qty,dong_goi:qty,_dan_to:team,_may_to:team,_dong_goi_to:team,_legacy:true}};
  }
}

const orders=[], orderAssignments=[], dailyAssignments=[], progress=[];
for(const [id,o] of orderMap){
  const a=assignments[id]||{}, sizeNums=dimensions(o), gk=[String(o.date||''),norm(o.dong||o.ten_hang),...sizeNums.filter(Number.isFinite)].join('|');
  orders.push({id,production_date:iso(o.date),product_code:String(o.ma||''),product_name:String(o.dong||o.ten_hang||''),width_mm:Number.isFinite(sizeNums[0])?sizeNums[0]:null,length_mm:Number.isFinite(sizeNums[1])?sizeNums[1]:null,thickness_mm:Number.isFinite(sizeNums[2])?sizeNums[2]:null,plan_qty:Math.max(0,Number(o.so_luong)||0),note:String(o.ghi_chu||''),order_group:String(o.nhom_don_hang||o.nhom_khsx||groupMap.get(gk)||(o.is_warranty?'Bảo hành':o.is_manual?'Phát sinh':'KHSX Tuần Foam')),source_order_id:null,is_manual:!!o.is_manual,is_drop:!!o.is_drop,is_ghost:!!o.is_ghost,is_warranty:!!o.is_warranty,is_lot:!!o.is_lot,lot_label:String(o.lot_label||''),source_payload:{clone_run:runId,live_row:o,live_assignment:a}});
  const team=toDb(a.to); if(team||priorities.has(id)) orderAssignments.push({order_id:id,plan_team:team,current_team:team,spinoff_order_id:null,change_note:String(a.change_note||''),priority:priorities.has(id)});
  for(const [date,t] of Object.entries(a.support_by_date||{})){const teamName=toDb(t);if(teamName)dailyAssignments.push({order_id:id,work_date:iso(date),team_name:teamName,assignment_kind:'support'})}
  for(const [date,s] of Object.entries(a.stage_by_date||{})) for(const stage of ['dan','may','dong_goi']) if(s[stage]!==undefined&&s[stage]!==null){
    const kpi=toDb(s[`_${stage}_to`]||a.to);
    const who=workerId(s[`_${stage}_by_name`]||s[`_${stage}_by_code`]);
    progress.push({order_id:id,work_date:iso(date),stage,quantity:Math.max(0,Number(s[stage])||0),kpi_team:kpi,completed_by_worker_id:who});
  }
}

// Không tự sửa chuỗi công đoạn khi clone. Sai lệch phải được liệt kê riêng để
// quản lý duyệt; nếu tự nâng công đoạn trước thì bản clone không còn đúng nguồn.
const orderById=new Map(orders.map(o=>[o.id,o]));
const progressByOrder=new Map();
for(const row of progress){
  const plan=Math.max(0,Number(orderById.get(row.order_id)?.plan_qty)||0);
  row.quantity=Math.min(plan,Math.max(0,Number(row.quantity)||0));
  if(!progressByOrder.has(row.order_id)) progressByOrder.set(row.order_id,[]);
  progressByOrder.get(row.order_id).push(row);
}
function totalStage(rows,stage){return rows.filter(x=>x.stage===stage).reduce((s,x)=>s+x.quantity,0)}
const chainIssues=[];
for(const [id,rows] of progressByOrder){
  const order=orderById.get(id); if(!order) continue;
  const dan=totalStage(rows,'dan'),may=totalStage(rows,'may'),dong_goi=totalStage(rows,'dong_goi');
  if(may>dan||dong_goi>may) chainIssues.push({order_id:id,production_date:order.production_date,product_code:order.product_code,dan,may,dong_goi});
}

// KPI cũ: May theo tổ Dán đã chốt; Đóng gói do Minh Thuận nhận toàn bộ.
// Tổ 5 chia đôi, số lẻ dư tính cho Thảo Vy. Dữ liệu mới ưu tiên người hoàn thành thật.
const stageCredits=[];
for(const row of progress){
  if(row.quantity<=0||!['may','dong_goi'].includes(row.stage)) continue;
  if(row.completed_by_worker_id){
    stageCredits.push({order_id:row.order_id,work_date:row.work_date,stage:row.stage,worker_id:row.completed_by_worker_id,quantity:row.quantity,source:'actual'});
    continue;
  }
  if(row.stage==='dong_goi'){
    stageCredits.push({order_id:row.order_id,work_date:row.work_date,stage:row.stage,worker_id:'minh_thuan',quantity:row.quantity,source:'legacy_rule'});
    continue;
  }
  const team=String(row.kpi_team||'');
  if(team==='To 5'){
    const vy=Math.ceil(row.quantity/2),cham=row.quantity-vy;
    if(vy) stageCredits.push({order_id:row.order_id,work_date:row.work_date,stage:row.stage,worker_id:'thao_vy',quantity:vy,source:'legacy_rule'});
    if(cham) stageCredits.push({order_id:row.order_id,work_date:row.work_date,stage:row.stage,worker_id:'bao_cham',quantity:cham,source:'legacy_rule'});
  }else{
    const worker=team==='To 1'?'thao_vy':team==='To 2'?'bao_cham':['To 3','To 4'].includes(team)?'loan_anh':null;
    if(worker) stageCredits.push({order_id:row.order_id,work_date:row.work_date,stage:row.stage,worker_id:worker,quantity:row.quantity,source:'legacy_rule'});
  }
}
const dayLocks=[...new Set([...(base.khsx_locked_plan_dates||[]),...(base.khsx_locked_progress_dates||[])])].map(date=>({work_date:iso(date),plan_locked:(base.khsx_locked_plan_dates||[]).includes(date),progress_locked:(base.khsx_locked_progress_dates||[]).includes(date)}));
const planSnapshots=lockedPlan.flatMap(date=>{const rows=snaps[`khsx_snap_${date.replaceAll('/','-')}`];return Array.isArray(rows)&&rows.length?[{work_date:iso(date),rows_json:rows,version:Number(base.khsx_snap_version)||1}]:[]});
const quarterTargets=Object.entries(base.khsx_muc_tieu_quy||{}).flatMap(([k,v])=>{const m=k.match(/^(\d{4})_Q([1-4])$/);return m?[{year:Number(m[1]),quarter:Number(m[2]),target_qty:Math.max(0,Number(v)||0)}]:[]});
const payload={runId,sourceAt:new Date().toISOString(),workers:WORKERS,orders,orderAssignments,dailyAssignments,progress,stageCredits,dayLocks,planSnapshots,quarterTargets,chainIssues,summary:{sheetRows:current.length,orders:orders.length,assignments:orderAssignments.length,dailyAssignments:dailyAssignments.length,progress:progress.length,stageCredits:stageCredits.length,chainIssues:chainIssues.length,lockedDays:dayLocks.length,snapshots:planSnapshots.length,warrantyOrders:orders.filter(x=>x.is_warranty).length,dates:[...new Set(orders.map(x=>x.production_date))].sort()}};
const out=process.argv[2]; if(out) fs.writeFileSync(out,JSON.stringify(payload));
console.log(JSON.stringify({output:out||null,runId:payload.runId,...payload.summary},null,2));
