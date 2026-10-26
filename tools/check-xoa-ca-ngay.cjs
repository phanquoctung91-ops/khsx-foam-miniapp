// Nút "Xóa đơn chưa làm của ngày" (26/10/2026): chỉ xóa đơn kế hoạch chưa làm, giữ đơn đã có số/đã tách/chờ xác nhận, qua đúng đường hủy mềm từng đơn.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const a=html.indexOf('function donCoTheXoaCaNgay(ngay){'), b=html.indexOf("document.getElementById('xoaCaNgayBtn')?.addEventListener('click',moXoaCaNgay);");
assert.ok(a>0&&b>a,'không thấy khối xóa cả ngày');
const el=()=>({style:{},textContent:'',innerHTML:'',value:''});
const doms={xoaCaNgayBtn:el(),autoPlanDaySelect:{value:'25/10/2026'},xoaNgayModal:el(),xoaNgayThan:el(),xoaNgayTitle:el(),xoaNgayLyDo:{value:'Công ty đổ nhầm đơn'},xoaNgayStatus:el()};
const log={queue:[],purge:[],toast:[],status:[],persist:0,rerender:0,dirty:[]};
const O=(id,extra={})=>({id,date:'25/10/2026',ma:'M'+id,dong:'D',so_luong:10,...extra});
let orders=[O('a'),O('b'),O('c',{is_manual:true}),O('d',{is_warranty:true}),O('e'),O('f'),O('g',{source_order_id:'x'}),O('h',{date:'26/10/2026'}),O('i')];
const ctx={SUPABASE_VARIANT:true,supabaseDb:{},PUBLIC_VIEW_MODE:false,canManage:()=>true,hasPermOrOwner:()=>false,
  getOrders:()=>orders.filter(o=>!ctx.deletedOrderIds.includes(o.id)),   // như app thật: đơn đã xóa không còn trong danh sách
  isPlannedOrder:o=>!o.is_manual&&!o.is_drop&&!o.is_ghost&&!o.is_warranty,
  coTienDoDon:o=>o.id==='b',assignments:{a:{to:'Tổ 1'},f:{spinoff_id:'z'}},pendingSheetChanges:{e:{old:{}}},
  thoatHtml:v=>String(v),isPlanLocked:()=>false,lockedProgressDates:[],cancelledOrderMeta:{},deletedOrderIds:[],
  orderEntityStore:{remove:()=>{}},purgeSupabaseOutboxForOrder:id=>log.purge.push(id),queueSupabaseManagementPatch:(k,o)=>log.queue.push(k+':'+o.id),
  dirtyAssignmentIds:{set:(i)=>log.dirty.push(i)},monthKeyOf:()=>'2026-10',persistCancelledOrders:()=>{log.persist++},
  renderAutoPlanDaySelect:()=>{log.rerender++},renderAutoPlan:()=>{},renderProgress:()=>{},scheduleMonthlySync:()=>{},saveLocalCache:()=>{},queueSave:()=>{},
  supabaseStatus:(m,ok)=>log.status.push(m),hienThanhCong:(t,p)=>log.toast.push(t+'|'+p),JSON,Number,Date,
  document:{getElementById:id=>doms[id]||null}};
vm.createContext(ctx); vm.runInContext(html.slice(a,b)+';this.api={donCoTheXoaCaNgay,capNhatNutXoaCaNgay,moXoaCaNgay,xacNhanXoaCaNgay};',ctx);
const {donCoTheXoaCaNgay,capNhatNutXoaCaNgay,moXoaCaNgay,xacNhanXoaCaNgay}=ctx.api;
// 1) phân loại
const {duoc,giu}=donCoTheXoaCaNgay('25/10/2026');
assert.deepEqual([...duoc.map(o=>o.id)],['a','i'],'chỉ đơn kế hoạch chưa làm'); assert.deepEqual([...giu.map(o=>o.id)],['b','e','f','g'],'giữ đơn có số / chờ xác nhận / đã tách / có đơn gốc');
console.log('PASS phân loại: xóa đơn kế hoạch chưa làm; giữ đơn đã có số, chờ xác nhận nguồn, đã tách, có đơn gốc; bỏ qua đơn phát sinh, bảo hành, ngày khác');
// 2) nút theo ngày và quyền
capNhatNutXoaCaNgay(); assert.equal(doms.xoaCaNgayBtn.style.display,''); assert.match(doms.xoaCaNgayBtn.textContent,/Xóa 2 đơn chưa làm của 25\/10/);
doms.autoPlanDaySelect.value='all'; capNhatNutXoaCaNgay(); assert.equal(doms.xoaCaNgayBtn.style.display,'none'); doms.autoPlanDaySelect.value='25/10/2026';
ctx.canManage=()=>false; capNhatNutXoaCaNgay(); assert.equal(doms.xoaCaNgayBtn.style.display,'none','không quyền thì ẩn nút'); ctx.hasPermOrOwner=k=>k==='order_cancel'; capNhatNutXoaCaNgay(); assert.equal(doms.xoaCaNgayBtn.style.display,'','có quyền order_cancel thì hiện'); ctx.canManage=()=>true; ctx.hasPermOrOwner=()=>false;
console.log('PASS nút chỉ hiện khi chọn một ngày, có đơn để xóa, và có quyền (quản lý hoặc order_cancel); nhãn ghi đúng số đơn và ngày');
// 3) hộp xác nhận: ngày chốt bị chặn
ctx.isPlanLocked=()=>true; moXoaCaNgay(); assert.match(doms.xoaNgayThan.innerHTML,/đang chốt/); ctx.isPlanLocked=()=>false;
moXoaCaNgay(); assert.match(doms.xoaNgayThan.innerHTML,/Xóa <b>2 đơn<\/b>/); assert.match(doms.xoaNgayThan.innerHTML,/Giữ lại 4 đơn/);
console.log('PASS hộp xác nhận: ngày đang chốt thì chặn; ngày thường hiện số đơn xóa và số đơn giữ lại');
// 4) xác nhận: lý do trống bị chặn; xóa đúng 2 đơn qua đúng đường hủy mềm
doms.xoaNgayLyDo.value=' '; (async()=>{
  await xacNhanXoaCaNgay(); assert.equal(log.queue.length,0,'lý do trống vẫn xóa'); doms.xoaNgayLyDo.value='Công ty đổ nhầm đơn';
  await xacNhanXoaCaNgay();
  assert.deepEqual(log.queue,['cancel:a','cancel:i']); assert.deepEqual(log.purge,['a','i']); assert.deepEqual([...ctx.deletedOrderIds],['a','i']);
  assert.equal(ctx.cancelledOrderMeta.a.reason,'Công ty đổ nhầm đơn'); assert.equal(ctx.cancelledOrderMeta.a.assignment.to,'Tổ 1'); assert.ok(!('a' in ctx.assignments)); assert.ok('f' in ctx.assignments,'đơn giữ lại bị đụng');
  assert.ok(!ctx.cancelledOrderMeta.b&&!ctx.cancelledOrderMeta.e&&!ctx.cancelledOrderMeta.f&&!ctx.cancelledOrderMeta.c&&!ctx.cancelledOrderMeta.h);
  assert.equal(doms.xoaNgayModal.style.display,'none'); assert.match(log.toast[0],/Đã xóa\|2 đơn · 20 tấm/); assert.match(log.status[0],/Đã xóa 2 đơn chưa làm của ngày 25\/10\/2026/);
  console.log('PASS xác nhận: bắt buộc có lý do; xóa đúng 2 đơn qua cancel từng đơn, lưu bản khôi phục, không đụng đơn giữ lại; đóng hộp, báo Thành công 2 đơn · 20 tấm');
  // 5) bấm đúp không xóa hai lần
  log.queue.length=0; orders=[O('p'),O('q')]; ctx.deletedOrderIds.length=0; const p1=xacNhanXoaCaNgay(); const p2=xacNhanXoaCaNgay(); await Promise.all([p1,p2]);
  assert.equal(log.queue.length,2,'bấm đúp xóa hai lần'); console.log('PASS bấm đúp (hoặc bấm lại) không xóa hai lần: lần hai không còn đơn nào');
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
