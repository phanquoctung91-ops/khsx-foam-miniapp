// Tách đơn (15/10/2026): menu ⋯ gom Sửa/Tách/Xóa và điều kiện hiện mục ✂️ Tách, dựng từ index.html trong node:vm.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8').split('\r\n').join('\n');
const a=html.indexOf('const daLamDon='), b=html.indexOf('function dongMenuDon(){'); assert.ok(a>0&&b>a,'không thấy khối tách đơn');
const ctx={CONG_DOAN:['dan','may','dong_goi'],tongCongDoan:(o,st)=>(o.lam||{})[st]||0,SUPABASE_VARIANT:true,supabaseDb:{},PUBLIC_VIEW_MODE:false,
  canManage2:()=>true,hasPermOrOwner:k=>k==='khsx_split_order',isPlannedOrder:o=>!o.is_manual&&!o.is_drop&&!o.is_ghost&&!o.is_warranty,
  pendingSheetChanges:{},coTienDoDon:o=>Object.values(o.lam||{}).some(v=>v>0),duocSuaDon:o=>!o.is_manual};
vm.createContext(ctx); vm.runInContext(html.slice(a,b)+';this.f={duocTachDon,hanhDongDonHtml,conLaiDeTach,daLamDon};',ctx);
const {duocTachDon,hanhDongDonHtml,conLaiDeTach,daLamDon}=ctx.f;
const O=(extra)=>({id:'o1',so_luong:100,lam:{},...extra});
assert.equal(conLaiDeTach(O({lam:{dan:30,may:20}})),70); assert.equal(daLamDon(O({lam:{dan:30,may:50}})),50);
console.log('PASS còn lại để tách = SL trừ công đoạn cao nhất');
let h=hanhDongDonHtml(O());
assert.match(h,/dong-menu-btn/); assert.ok(h.indexOf('sua-don-btn')<h.indexOf('tach-don-btn')&&h.indexOf('tach-don-btn')<h.indexOf('trash-btn'),'thứ tự Sửa, Tách, Xóa');
console.log('PASS một nút ⋯, menu theo thứ tự Sửa → Tách → Xóa');
assert.equal(duocTachDon(O({lam:{dan:100}})),false); assert.ok(!hanhDongDonHtml(O({lam:{dan:100}})).includes('tach-don-btn'));
console.log('PASS đơn làm đủ: không có mục Tách');
ctx.hasPermOrOwner=()=>false; assert.ok(!hanhDongDonHtml(O()).includes('tach-don-btn')); assert.match(hanhDongDonHtml(O()),/trash-btn/); ctx.hasPermOrOwner=k=>k==='khsx_split_order';
console.log('PASS không có quyền khsx_split_order: không có mục Tách, Sửa/Xóa vẫn còn');
for(const bad of [{is_manual:true},{is_drop:true},{is_ghost:true},{is_warranty:true},{source_order_id:'x'},{source_removed:true}]) assert.equal(duocTachDon(O(bad)),false,JSON.stringify(bad));
ctx.pendingSheetChanges={o1:{old:O()}}; assert.equal(duocTachDon(O()),false); h=hanhDongDonHtml(O()); assert.match(h,/source-action-btn/); assert.ok(!h.includes('dong-menu-btn'));
console.log('PASS đơn phát sinh/rớt/bảo hành/đã tách/chờ xác nhận nguồn: không có mục Tách; chờ xác nhận nguồn giữ nút riêng');
ctx.pendingSheetChanges={}; ctx.PUBLIC_VIEW_MODE=true; assert.equal(duocTachDon(O()),false); ctx.PUBLIC_VIEW_MODE=false;
ctx.canManage2=()=>false; assert.equal(duocTachDon(O()),false);
console.log('PASS khách và người không phải quản lý: không tách');
