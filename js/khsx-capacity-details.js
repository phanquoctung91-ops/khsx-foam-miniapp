/* Capacity-only presentation and export. Does not write operational records. */
let capacityDetailState=null,capacityEventCache=null,capacityDetailRequest=0,capacityLastFocus=null;
const capNumber=n=>n==null?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:2});
const capDate=d=>d?d.split('-').reverse().join('/'):'—';
const capTime=t=>t==null||!Number.isFinite(t)?'—':new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
function capacityDetailButton(stage,who){return `<button type="button" class="capacity-quick-btn" data-capacity-stage="${stage}" data-capacity-who="${thoatHtml(who)}">Chi tiết năng lực</button>`;}
function capacityRange(){
 const from=document.getElementById('capacityFromDate').value,to=document.getElementById('capacityToDate').value;
 if(!from||!to||from>to)throw Error('Khoảng ngày không hợp lệ.');return {from,to,now:Date.now()};
}
async function readCapacityEvents(to){
 if(!canManage2())throw Error('Không có quyền xem Năng lực.');
 if(!SUPABASE_VARIANT||!supabaseDb)return [];
 const user=currentUser?.code||currentUser?.name||'';
 if(capacityEventCache?.to===to&&capacityEventCache.user===user&&Date.now()-capacityEventCache.at<15000)return capacityEventCache.events;
 const events=[];let cursor=0;
 for(;;){
  const {data,error}=await supabaseDb.rpc('khsx_read_capacity_events',{p_to:to,p_after:cursor});
  if(error)throw Error('Chưa tải được mốc giờ Dán. Vui lòng thử lại.');
  if(!Array.isArray(data))throw Error('Dữ liệu mốc giờ không đầy đủ.');
  events.push(...data);if(data.length<2000)break;
  const next=Number(data[data.length-1].id);if(next<=cursor||events.length>100000)throw Error('Nhật ký quá lớn; cần kiểm tra phạm vi đọc.');cursor=next;
 }
 capacityEventCache={to,user,at:Date.now(),events};return events;
}
function capacityGluingInputs(){
 const orders=[],production=[];
 getOrders().filter(o=>!o.is_warranty&&!o.is_ghost).forEach(o=>{
  orders.push({id:o.id,code:o.ma||o.id,product:o.dong||'',size:[o.ngang,o.dai].join('×'),thickness:String(o.day||''),sourceOrderId:o.source_order_id||'',support:laDongHoTroTach(o)});
  let total=0;
  Object.entries(lichSuCongDoanDeDoc(o)).sort((a,b)=>khoaNgayDMY(a[0])-khoaNgayDMY(b[0])).forEach(([d,e])=>{
   const n=Math.min(Math.max(0,Number(o.so_luong)-total),soCongDoan(e?.dan));total+=n;if(!n)return;
   production.push({orderId:o.id,date:dmyToIso(d),quantity:n,team:toThucHienCongDoanNgay(o,d,'dan'),completed:total>=Number(o.so_luong)});
  });
 });
 return {orders,production};
}
function capacityPersonReport(stage,who,range,people=null){
 const rows=people||duLieuNangLucCaNhan(stage,Number(range.from.replaceAll('-','')),Number(range.to.replaceAll('-',''))).rows;
 const r=rows.find(x=>(x.name||x.code)===who);
 return KhsxCapacityTiming.dailyReport({...range,details:r?.details||[],unknown:who.startsWith('Chưa ghi người')});
}
async function openCapacityDetails(stage,who){
 if(!canManage2())return;
 const request=++capacityDetailRequest,range=capacityRange(),modal=document.getElementById('capacityDetailsModal');
 capacityLastFocus=document.activeElement;
 capacityDetailState=null;modal.style.display='block';
 document.getElementById('capacityDetailsTitle').textContent=`Chi tiết năng lực · ${who} · ${stage==='dan'?'Dán':stage==='may'?'May':'Đóng gói'}`;
 document.getElementById('capacityDetailsMeta').textContent=`${capDate(range.from)} → ${capDate(range.to)}`;
 document.getElementById('capacityDetailsBody').textContent='Đang tải chi tiết…';
 document.getElementById('capacityDetailsFilters').innerHTML='';document.getElementById('exportCapacityDetailsBtn').disabled=true;
 document.getElementById('closeCapacityDetailsBtn').focus();
 try{
  const report=stage==='dan'?KhsxCapacityTiming.gluingReport({...range,...capacityGluingInputs(),events:await readCapacityEvents(range.to),team:who}):capacityPersonReport(stage,who,range);
  if(request!==capacityDetailRequest)return;
  capacityDetailState={stage,who,range,report};
  if(stage==='dan'){
   document.getElementById('capacityDetailsFilters').innerHTML=[['product','Dòng nệm'],['size','Kích thước'],['thickness','Độ dày']].map(([key,label])=>`<div><label for="capacityDetail-${key}">${label}</label><select id="capacityDetail-${key}" data-capacity-filter="${key}"><option value="">Tất cả</option>${[...new Set(report.rows.map(r=>r[key]).filter(Boolean))].sort().map(v=>`<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('')}</select></div>`).join('');
  }
  document.getElementById('exportCapacityDetailsBtn').disabled=false;renderCapacityDetails();
 }catch(error){if(request===capacityDetailRequest)document.getElementById('capacityDetailsBody').textContent=error.message;}
}
function filteredCapacityGluingRows(){
 let rows=capacityDetailState?.report.rows||[];
 document.querySelectorAll('[data-capacity-filter]').forEach(el=>{if(el.value)rows=rows.filter(r=>r[el.dataset.capacityFilter]===el.value);});return rows;
}
function capacityProductionTable(items){
 return `<table class="capacity-table"><thead><tr><th>ID / mã đơn</th><th>Dòng nệm / kích thước</th><th>Loại việc</th><th>Số tấm</th></tr></thead><tbody>${items.map(x=>`<tr><td>${thoatHtml(x.code)}<br><small>${thoatHtml(x.orderId)}</small></td><td>${thoatHtml(x.product)} ${thoatHtml(x.size)}</td><td>${x.warranty?'Bảo hành':'Sản xuất'}</td><td>${capNumber(x.quantity)}</td></tr>`).join('')||'<tr><td colspan="4">Không có sản lượng.</td></tr>'}</tbody></table>`;
}
function renderCapacityDetails(){
 const state=capacityDetailState;if(!state)return;
 const {stage,report,range}=state;
 document.getElementById('capacityDetailsMeta').textContent=`${capDate(range.from)} → ${capDate(range.to)} · Tính đến ${capTime(range.now)} (giờ Việt Nam)`;
 if(stage==='dan'){
  const rows=filteredCapacityGluingRows(),s=KhsxCapacityTiming.gluingSummary(rows);
  document.getElementById('capacityDetailsBody').innerHTML=`<p><strong>${capNumber(s.quantity)} tấm · ${capNumber(s.minutes)} phút có mốc · ${capNumber(s.perPiece)} phút/tấm</strong><br><small>Bình quân trên ${capNumber(s.measuredQuantity)} tấm có thời gian; ${s.missing} phần việc thiếu mốc. Bắt đầu theo quy tắc, kết thúc theo giờ ghi nhận hoàn thành; đã trừ giờ nghỉ. Các phần Dán chưa xong được ghi tạm tính.</small></p>
  <div class="table-scroll"><table class="capacity-table"><thead><tr><th>Ngày</th><th>Đơn / phần việc</th><th>Đã làm</th><th>Bắt đầu</th><th>Kết thúc</th><th>Phút làm</th><th>Phút/tấm</th><th>Căn cứ / trạng thái</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${capDate(r.date)}</td><td>${thoatHtml(r.code)}<br>${thoatHtml(r.product)} ${thoatHtml(r.size)}×${thoatHtml(r.thickness)}${r.support?'<br>Hỗ trợ':''}<br><small>${thoatHtml(r.orderId)}</small></td><td>${capNumber(r.quantity)}</td><td>${capTime(r.start)}</td><td>${capTime(r.end)}</td><td>${capNumber(r.minutes)}</td><td>${capNumber(r.perPiece)}</td><td>${thoatHtml(r.status)}${r.receivedAt?`<br><small>Nhận việc: ${capTime(r.receivedAt)}</small>`:''}${r.transferAt?`<br><small>Giao hỗ trợ: ${capTime(r.transferAt)}</small>`:''}</td></tr>`).join('')||'<tr><td colspan="8">Chưa có phần việc trong khoảng lọc.</td></tr>'}</tbody></table></div>`;
 }else{
  document.getElementById('capacityDetailsBody').innerHTML=`<p><strong>${capNumber(report.quantity)} tấm = ${capNumber(report.production)} sản xuất + ${capNumber(report.warranty)} bảo hành · ${capNumber(report.minutes)} phút · ${capNumber(report.perPiece)} phút/tấm bình quân theo ca</strong><br><small>Thứ Hai–thứ Bảy, 480 phút/ngày đã qua; hôm nay tính giờ làm đã trôi qua. Giữ ngày không có sản lượng, không trừ giờ vắng/chờ hàng.${report.outside?' Có sản lượng Chủ nhật chưa có lịch giờ; chưa tính bình quân cả khoảng.':''}</small></p><div class="table-scroll"><table class="capacity-table"><thead><tr><th>Ngày</th><th>Sản xuất</th><th>Bảo hành</th><th>Tổng tấm</th><th>Phút theo ca</th><th>Phút/tấm</th><th>Trạng thái</th><th>Đơn đóng góp</th></tr></thead><tbody>${report.rows.map(r=>`<tr><td>${capDate(r.date)}</td><td>${capNumber(r.production)}</td><td>${capNumber(r.warranty)}</td><td>${capNumber(r.quantity)}</td><td>${capNumber(r.minutes)}</td><td>${capNumber(r.perPiece)}</td><td>${thoatHtml(r.status)}</td><td><button type="button" data-capacity-day="${r.date}" aria-expanded="false">Xem đơn</button></td></tr><tr data-capacity-day-detail="${r.date}" hidden><td colspan="8">${capacityProductionTable(r.details)}</td></tr>`).join('')||'<tr><td colspan="8">Chưa có ngày làm việc trong khoảng lọc.</td></tr>'}</tbody></table></div>`;
 }
}
function closeCapacityDetails(){capacityDetailRequest++;document.getElementById('capacityDetailsModal').style.display='none';capacityLastFocus?.focus();}
function capacityExcelTime(t){
 if(t==null||!Number.isFinite(t))return null;
 // SheetJS serializes local date fields. Build VN wall time in the browser's
 // local zone so a device outside Vietnam still writes 07:00 as 07:00 in Excel.
 const vn=new Date(t+7*3600000);
 return new Date(vn.getUTCFullYear(),vn.getUTCMonth(),vn.getUTCDate(),vn.getUTCHours(),vn.getUTCMinutes(),vn.getUTCSeconds(),vn.getUTCMilliseconds());
}
function capacityExcelValue(v){return typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v;}
function addCapacitySheet(wb,name,headers,rows,range,note){
 const filters=range.filters?JSON.stringify(range.filters):'Toàn bộ đối tượng được chọn';
 const data=[['Chi tiết năng lực',range.who||'Tất cả'],['Từ ngày',range.from,'Đến ngày',range.to],['Thời điểm xuất (giờ VN)',capacityExcelTime(range.exportedAt),'Số liệu tính đến (giờ VN)',capacityExcelTime(range.now)],['Bộ lọc',filters],[note],headers,...rows];
 const sheet=XLSX.utils.aoa_to_sheet(data.map(r=>r.map(capacityExcelValue)),{cellDates:true,dateNF:'dd/mm/yyyy hh:mm:ss'});
 sheet['!cols']=headers.map(()=>({wch:20}));XLSX.utils.book_append_sheet(wb,sheet,name);
}
function addGluingDetailSheet(wb,rows,range){
 addCapacitySheet(wb,'Chi tiet Dan',['Ngày','Tổ','ID đơn','Đơn gốc','Mã','Dòng nệm','Kích thước','Độ dày','Loại việc','Đã làm','Nhận việc','Giao hỗ trợ','Bắt đầu','Kết thúc','Phút làm','Phút/tấm','Trạng thái','Căn cứ'],rows.map(r=>[r.date,r.team,r.orderId,r.sourceOrderId,r.code,r.product,r.size,r.thickness,r.support?'Hỗ trợ':'Kế hoạch',r.quantity,capacityExcelTime(r.receivedAt),capacityExcelTime(r.transferAt),capacityExcelTime(r.start),capacityExcelTime(r.end),r.minutes,r.perPiece,r.status,r.reason||'Bắt đầu theo quy tắc; hoàn thành theo thao tác']),range,'Chỉ tính phút làm việc trong khoảng xuất. Mốc thiếu để trống; phần chưa xong là tạm tính.');
}
function addPersonDetailSheets(wb,reports,range){
 addCapacitySheet(wb,'Ca May Dong goi',['Ngày','Công đoạn','Người','Sản xuất','Bảo hành','Tổng tấm','Phút theo ca','Phút/tấm','Trạng thái'],reports.flatMap(x=>x.report.rows.map(r=>[r.date,x.stage==='may'?'May':'Đóng gói',x.who,r.production,r.warranty,r.quantity,r.minutes,r.perPiece,r.status])),range,'Phút/tấm theo ca = tổng phút lịch làm việc / (sản xuất + bảo hành); không trừ vắng/chờ hàng.');
 addCapacitySheet(wb,'San luong doi chieu',['Ngày','Công đoạn','Người','ID đơn / dòng báo cáo','Mã','Dòng nệm','Kích thước','Loại việc','Số tấm'],reports.flatMap(x=>x.report.rows.flatMap(r=>r.details.map(d=>[r.date,x.stage==='may'?'May':'Đóng gói',x.who,d.orderId,d.code,d.product,d.size,d.warranty?'Bảo hành':'Sản xuất',d.quantity]))),range,'Sản lượng theo ngày thực hiện; mỗi báo cáo bảo hành dùng một nguồn duy nhất.');
}
async function exportCapacityWorkbook(detailOnly=false){
 if(!canManage2())return;
 try{
  if(!window.XLSX)throw Error('Chưa tải được công cụ Excel.');
  const state=detailOnly?capacityDetailState:null;if(detailOnly&&!state)return;
  const range=state?{...state.range,who:state.who,filters:Object.fromEntries([...document.querySelectorAll('[data-capacity-filter]')].map(el=>[el.dataset.capacityFilter,el.value]))}:capacityRange();
  range.exportedAt=Date.now();
  const wb=XLSX.utils.book_new(),a=Number(range.from.replaceAll('-','')),b=Number(range.to.replaceAll('-',''));
  if(!state){
   const teams=tinhNangLucToDan(a,b,{xuat:true}),events=await readCapacityEvents(range.to),input=capacityGluingInputs();
   const reports=teams.map(t=>({team:t.team,report:KhsxCapacityTiming.gluingReport({...range,...input,events,team:t.team})}));
   addCapacitySheet(wb,'To Dan',['Tổ','Kế hoạch','Hoàn thành','Rớt','Chưa xong hôm nay','Tỷ lệ (%)','Hỗ trợ','Bảo hành','KPI trong khoảng xuất','Phút có mốc','Tấm có mốc','Phút/tấm','Phần việc thiếu mốc'],teams.map((r,i)=>[r.team,r.keHoach,r.daDan,r.conCho,r.choHomNay,r.keHoach?100*r.daDan/r.keHoach:null,r.hoTro,r.baoHanh,r.tong,reports[i].report.minutes,reports[i].report.measuredQuantity,reports[i].report.perPiece,reports[i].report.missing]),range,'Số liệu theo kỳ; Hỗ trợ/Bảo hành không cộng vào tỷ lệ hoàn thành kế hoạch.');
   addGluingDetailSheet(wb,reports.flatMap(x=>x.report.rows),range);
   const all=[];
   for(const stage of ['may','dong_goi']){
    const people=duLieuNangLucCaNhan(stage,a,b).rows;
    const reports=people.map(r=>({who:r.name||r.code,stage,report:capacityPersonReport(stage,r.name||r.code,range,people)}));all.push(...reports);
    addCapacitySheet(wb,stage==='may'?'May':'Dong goi',['Người','Sản xuất','Đơn','TB/ngày','Ngày cao nhất','SL ngày cao nhất','Đúng ngày (%)','Bảo hành','Tổng năng lực / KPI trong khoảng xuất','Phút theo ca','Phút/tấm'],reports.map((x,i)=>[x.who,x.report.production,people[i].soDon,people[i].trungBinh,people[i].ngayCao,people[i].slNgayCao,people[i].tyLeDung,x.report.warranty,x.report.quantity,x.report.minutes,x.report.perPiece]),range,'Tổng năng lực = sản xuất + bảo hành trong khoảng lọc.');
   }
   addPersonDetailSheets(wb,all,range);
  }else if(state.stage==='dan'){
   const rows=filteredCapacityGluingRows(),s=KhsxCapacityTiming.gluingSummary(rows);
   addCapacitySheet(wb,'Tong hop chi tiet',['Tổ','Số tấm','Phút có mốc','Tấm có mốc','Phút/tấm','Phần việc thiếu mốc'],[[state.who,s.quantity,s.minutes,s.measuredQuantity,s.perPiece,s.missing]],range,'Tổng hợp đúng các phần việc đang hiển thị sau bộ lọc dòng nệm/kích thước/độ dày.');
   addGluingDetailSheet(wb,rows,range);
  }else{
   const r=state.report;
   addCapacitySheet(wb,'Tong hop chi tiet',['Người','Công đoạn','Sản xuất','Bảo hành','Tổng tấm','Phút theo ca','Phút/tấm'],[[state.who,state.stage==='may'?'May':'Đóng gói',r.production,r.warranty,r.quantity,r.minutes,r.perPiece]],range,'Bình quân theo ca = tổng phút / tổng tấm, gồm bảo hành.');
   addPersonDetailSheets(wb,[{stage:state.stage,who:state.who,report:r}],range);
  }
  XLSX.writeFile(wb,`Nang-luc_${range.from}_${range.to}${state?'_'+state.who.replace(/[^\p{L}\p{N} -]/gu,''):''}.xlsx`);
 }catch(error){alert(error.message||'Chưa xuất được dữ liệu.');}
}
function initCapacityDetails(){
 document.body.insertAdjacentHTML('beforeend',`<div id="capacityDetailsModal" class="capacity-modal" role="dialog" aria-modal="true" aria-labelledby="capacityDetailsTitle"><div class="capacity-dialog" style="max-width:1250px;max-height:90vh;overflow:auto;"><div class="capacity-head"><div><h3 id="capacityDetailsTitle">Chi tiết năng lực</h3><p id="capacityDetailsMeta" class="capacity-note"></p></div><button type="button" class="capacity-quick-btn" id="closeCapacityDetailsBtn" aria-label="Đóng chi tiết năng lực">Đóng</button></div><div class="capacity-filters" id="capacityDetailsFilters"></div><button type="button" class="capacity-quick-btn" id="exportCapacityDetailsBtn">Xuất chi tiết</button><div id="capacityDetailsBody" style="margin-top:14px;"></div><p class="capacity-note">Trên điện thoại, vuốt ngang bảng để xem đủ các cột.</p></div></div>`);
 document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-capacity-stage]');if(btn)openCapacityDetails(btn.dataset.capacityStage,btn.dataset.capacityWho);
  const day=e.target.closest('[data-capacity-day]');if(day){const row=document.querySelector(`[data-capacity-day-detail="${day.dataset.capacityDay}"]`);row.hidden=!row.hidden;day.setAttribute('aria-expanded',String(!row.hidden));}
 });
 document.getElementById('closeCapacityDetailsBtn').addEventListener('click',closeCapacityDetails);
 document.getElementById('capacityDetailsModal').addEventListener('click',e=>{if(e.target.id==='capacityDetailsModal')closeCapacityDetails();});
 document.getElementById('capacityDetailsFilters').addEventListener('change',renderCapacityDetails);
 document.getElementById('exportCapacityDetailsBtn').addEventListener('click',()=>exportCapacityWorkbook(true));
 document.getElementById('capacityDetailsModal').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeCapacityDetails();}
  if(e.key==='Tab'){const focus=[...e.currentTarget.querySelectorAll('button:not([disabled]),select')].filter(el=>el.getClientRects().length),first=focus[0],last=focus.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 });
}
