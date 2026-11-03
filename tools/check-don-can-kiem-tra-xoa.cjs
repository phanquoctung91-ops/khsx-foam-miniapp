// Popup "Đơn cần kiểm tra": nút 🗑 Xóa đơn dùng chung hàm huỷ đơn của bảng; "Xem trong bảng" chuyển tab + tháng + bỏ lọc.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const lay=re=>{const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0];};
// --- chuỗi giao diện
assert.match(html,/data-kt="xoa" data-a="\$\{a\.id\}">🗑 Xóa đơn<\/button>/);
assert.match(html,/\(canManage\(\)\|\|hasPermOrOwner\('order_cancel'\)\)\?`<button[^`]*data-kt="xoa"/,'nút xóa chỉ hiện khi có quyền');
assert.match(html,/if\(viec==='xoa'\)\{ if\(await huyDonTheoId\(nut\.dataset\.a\)\)\{ capNhatNutDonKiemTra\(\); moDonKiemTra\(\); \} return; \}/);
assert.match(html,/if\(btn\)?[\s\S]{0,0}/);
assert.match(html,/await huyDonTheoId\(btn\.dataset\.orderId\);/,'nút 🗑 ở bảng cũng dùng hàm chung');
const huy=lay(/async function huyDonTheoId\(id\)\{[\s\S]*?\n\}\n(?=document\.querySelector\('#autoPlanTable tbody'\))/);
assert.ok(huy.includes('TRÙNG ĐƠN')&&huy.includes('Nhập lý do bắt buộc'),'giữ hai câu hỏi: trùng đơn + lý do');
assert.ok(/return true;/.test(huy)&&(huy.match(/return false;/g)||[]).length>=4);
// --- huyDonTheoId: hủy khi nhập lý do, không hủy khi để trống / không quyền
function chay(o){
  const log=[]; const ctx={ canManage:()=>o.quyen, hasPermOrOwner:()=>false, trashActionInFlight:new Set(),
    getOrderById:id=>o.don, coTienDoDon:()=>o.coTien, confirm:()=>o.trung, prompt:()=>o.lyDo, alert:m=>log.push('alert:'+m),
    assignments:{x1:{stage_by_date:{}}}, taoDonTachNguon:async()=>o.tach, cancelledOrderMeta:{}, persistCancelledOrders:()=>{}, orderEntityStore:null,
    deletedOrderIds:[], SUPABASE_VARIANT:false, purgeSupabaseOutboxForOrder(){}, queueSupabaseManagementPatch(){},
    renderAutoPlanDaySelect(){log.push('day');}, renderAutoPlan(){log.push('plan');}, renderProgress(){}, scheduleMonthlySync(){},
    dirtyAssignmentIds:new Map(), monthKeyOf:()=>'2026-09', queueSave(){}, saveLocalCache(){}, JSON };
  vm.createContext(ctx); vm.runInContext(huy+';this.f=huyDonTheoId;',ctx); return ctx.f('x1').then(r=>({r,log,ctx}));
}
(async()=>{
  const don={id:'x1',ma:'STD10-4',date:'29/09/2026'};
  let k=await chay({quyen:true,don,coTien:true,trung:false,lyDo:'Đơn treo',tach:{id:'x1__ps'}}); assert.equal(k.r,true); assert.ok(k.ctx.deletedOrderIds.includes('x1')); assert.ok(!k.ctx.assignments.x1);
  k=await chay({quyen:true,don,coTien:true,trung:true,lyDo:'Trùng',tach:null}); assert.equal(k.r,true,'trùng đơn: hủy luôn không cần đơn tách');
  k=await chay({quyen:true,don,coTien:true,trung:false,lyDo:'  ',tach:null}); assert.equal(k.r,false); assert.ok(k.log.some(x=>x.includes('Phải nhập lý do')));
  k=await chay({quyen:true,don,coTien:true,trung:false,lyDo:'x',tach:null}); assert.equal(k.r,false,'không tạo được đơn tách thì không hủy'); assert.ok(!k.ctx.deletedOrderIds.length);
  k=await chay({quyen:false,don,coTien:false,trung:false,lyDo:'x',tach:null}); assert.equal(k.r,false,'không quyền thì không hủy');
  // --- toiDongDon
  const td=lay(/function toiDongDon\(id\)\{[\s\S]*?\n\}\n(?=document\.getElementById\('nutDonCanKiemTra'\))/);
  function chayTd(trHien,thangDung){
    const ev=[]; const sel={value:'all',options:[{value:'all'},{value:'29/09/2026'}]};
    const mo={value:thangDung?'9':'11'}, nam={value:'2026'}, tim={value:'abc'}, loc={value:'unassigned'};
    const tr={offsetParent:trHien?{}:null,scrollIntoView(){ev.push('scroll');},classList:{add(){ev.push('nhay');},remove(){}}};
    const doc={querySelector:q=>q.includes('data-tab="autoplan"')?{click(){ev.push('tab');}}:q.includes('#autoPlanTable')?tr:null,
      getElementById:id=>({autoPlanSearchBox:tim,autoPlanAssignFilter:loc,autoPlanDaySelect:sel})[id]};
    const ctx={getOrderById:()=>don,dongDonKiemTra(){ev.push('dong');},document:doc,parseDMY:s=>{const [d,m,y]=s.split('/').map(Number);return{d,m,y};},
      monthFilterSelect:mo,yearFilterSelect:nam,onHeaderMonthYearChanged(){ev.push('thang');},renderAutoPlan(){ev.push('ve');},CSS:{escape:x=>x},setTimeout(){},alert:m=>ev.push('alert'),String,Number};
    vm.createContext(ctx); vm.runInContext(td+';this.f=toiDongDon;',ctx); ctx.f('x1'); return {ev,mo,tim,loc,sel};
  }
  let t=chayTd(true,false); assert.deepEqual(t.ev,['dong','tab','thang','ve','scroll','nhay']); assert.equal(t.mo.value,'9'); assert.equal(t.tim.value,''); assert.equal(t.loc.value,'all'); assert.equal(t.sel.value,'29/09/2026');
  t=chayTd(true,true); assert.ok(!t.ev.includes('thang'),'đúng tháng rồi thì không đổi tháng');
  t=chayTd(false,true); assert.ok(t.ev.includes('alert')&&!t.ev.includes('nhay'),'không thấy dòng thì báo');
  console.log('PASS đơn cần kiểm tra: nút Xóa đơn dùng hàm huỷ chung (giữ 2 câu hỏi, không quyền/không lý do thì không hủy); Xem trong bảng chuyển tab + tháng + bỏ lọc, không thấy thì báo');
})().catch(e=>{console.error(e);process.exit(1);});
