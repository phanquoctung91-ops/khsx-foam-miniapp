// Điểm danh có "đi hỗ trợ" theo buổi (anh duyệt 09/11/2026): 4 ô tick, mỗi buổi chỉ một trong hai; giờ công tách khỏi tổ gốc, Toàn xưởng đủ.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..'+'/index.html'),'utf8').split('\r\n').join('\n');
const sql=fs.readFileSync(path.resolve(__dirname,'..','supabase/migrations/20261109100000_diem_danh_ho_tro.sql'),'utf8');
const lay=re=>{ const m=html.match(re); assert.ok(m,'không thấy '+re); return m[0]; };
const code=[/function ddBatO\([^\n]*\n/,/function ddDoiO\([\s\S]*?\n\}\n/,/function ddNhanBuoi\([\s\S]*?\n\}\n/,/const NS_GIO_SANG=[^\n]*\n/,/const NS_TO_DAN=[^\n]*\n/,/const NS_MOI_TO=[^\n]*\n/,/function nsGioCong\([^\n]*\n/,/function nsGom\([\s\S]*?\n\}\n/,/function nsTinhBang\([\s\S]*?\n\}\n/].map(lay).join('\n');
const ctx={}; vm.createContext(ctx); vm.runInContext(code+';this.f={ddBatO,ddDoiO,ddNhanBuoi,nsGom,nsTinhBang};',ctx);
const F=ctx.f, J=x=>JSON.parse(JSON.stringify(x)), gần=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' ≠ '+b);

// 1) 4 ô tick, mỗi buổi chỉ một trong hai
let r=null;
r=J(F.ddDoiO(r,'sang',true));                       assert.deepEqual(r,{sang:true,chieu:false,hs:false,hc:false});
r=J(F.ddDoiO(r,'hc',true));                         assert.deepEqual(r,{sang:true,chieu:true,hs:false,hc:true},'An: sáng ở tổ, chiều hỗ trợ');
assert.equal(F.ddBatO(r,'sang'),true); assert.equal(F.ddBatO(r,'chieu'),false,'chiều đang hỗ trợ thì ô Chiều không bật'); assert.equal(F.ddBatO(r,'hc'),true); assert.equal(F.ddBatO(r,'ca'),false);
r=J(F.ddDoiO(r,'chieu',true));                      assert.deepEqual(r,{sang:true,chieu:true,hs:false,hc:false},'tick Chiều thì Hỗ trợ chiều tự bỏ');
assert.equal(F.ddBatO(r,'ca'),true);
r=J(F.ddDoiO(r,'hs',true));                         assert.deepEqual(r,{sang:true,chieu:true,hs:true,hc:false},'tick Hỗ trợ sáng thì ô Sáng tự bỏ');
r=J(F.ddDoiO(r,'hs',false));                        assert.deepEqual(r,{sang:false,chieu:true,hs:false,hc:false},'bỏ Hỗ trợ sáng = vắng sáng, không tự thành làm ở tổ');
r=J(F.ddDoiO(r,'ca',true));                         assert.deepEqual(r,{sang:true,chieu:true,hs:false,hc:false});
r=J(F.ddDoiO(r,'ca',false));                        assert.deepEqual(r,{sang:false,chieu:false,hs:false,hc:false});
console.log('PASS 4 ô tick: mỗi buổi chỉ một trong hai (ở tổ / hỗ trợ), Cả ngày bật tắt cả hai buổi ở tổ');

// 2) Nhãn trong file Excel
assert.equal(F.ddNhanBuoi({sang:true,chieu:true},true),'Cả ngày'); assert.equal(F.ddNhanBuoi({sang:true,chieu:false},false),'Sáng'); assert.equal(F.ddNhanBuoi({sang:false,chieu:true},false),'Chiều');
assert.equal(F.ddNhanBuoi({sang:true,chieu:true,hs:true,hc:true},true),'Hỗ trợ cả ngày');
assert.equal(F.ddNhanBuoi({sang:true,chieu:true,hs:false,hc:true},true),'Sáng + Hỗ trợ chiều');
assert.equal(F.ddNhanBuoi({sang:true,chieu:true,hs:true,hc:false},true),'Hỗ trợ sáng + Chiều');
assert.equal(F.ddNhanBuoi({sang:false,chieu:true,hs:false,hc:true},false),'Hỗ trợ chiều');
console.log('PASS nhãn Excel: Cả ngày / Hỗ trợ cả ngày / Sáng + Hỗ trợ chiều');

// 3) Tách giờ công: số của demo. Tổ dán 1 có 5 người; Cường hỗ trợ cả ngày, Em hỗ trợ sáng, An hỗ trợ chiều (An: sáng ở tổ)
const rows=[{ngay:'2026-11-09',nhom:'Tổ dán 1',nguoi:5,sang:5,chieu:5,tang_ca:0,ht_sang:2,ht_chieu:2,nguoi_ht:1,tang_ca_ht:0},
            {ngay:'2026-11-09',nhom:'Ngoài 6 tổ',nguoi:10,sang:10,chieu:10,tang_ca:0,ht_sang:0,ht_chieu:0,nguoi_ht:0,tang_ca_ht:0}];
const g1=F.nsGom(rows,['Tổ dán 1'],'2026-11-09','2026-11-09',true), g0=F.nsGom(rows,['Tổ dán 1'],'2026-11-09','2026-11-09');
gần(g0.gio,5*8); gần(g1.gio,(5-2)*4.25+(5-2)*3.75); assert.equal(g1.nguoiNgay,4,'người hỗ trợ trọn ngày không tính vào tổ gốc'); assert.equal(g0.nguoiNgay,5,'không tách thì đủ như cũ');
const sl={'Tổ dán 1':120,'Tổ dán 2':0,'Tổ dán 3':0,'Tổ dán 4':0,'Tổ may':0,'Tổ đóng gói':200};
const t=Object.fromEntries(F.nsTinhBang(rows,sl,'2026-11-09','2026-11-09').map(x=>[x.ten,x]));
gần(t['Tổ dán 1'].gio,24); gần(t['Tổ dán 1'].slNguoiGio,120/24);
gần(t['Toàn xưởng'].gio,40+80,'Toàn xưởng tính đủ giờ công kể cả buổi hỗ trợ');
// tăng ca: người hỗ trợ trọn ngày tách theo, nửa ngày giữ ở tổ gốc
const rt=[{ngay:'2026-11-09',nhom:'Tổ dán 1',nguoi:3,sang:3,chieu:3,tang_ca:5,ht_sang:1,ht_chieu:1,nguoi_ht:1,tang_ca_ht:2}];
gần(F.nsGom(rt,['Tổ dán 1'],'2026-11-09','2026-11-09',true).gio,2*8+3); gần(F.nsGom(rt,['Tổ dán 1'],'2026-11-09','2026-11-09').gio,3*8+5);
// máy chủ cũ chưa có cột mới: số như trước
gần(F.nsGom([{ngay:'2026-11-09',nhom:'Tổ may',nguoi:3,sang:3,chieu:3,tang_ca:0}],['Tổ may'],'2026-11-09','2026-11-09',true).gio,24);
console.log('PASS tách giờ công: tổ gốc trừ buổi hỗ trợ, Toàn xưởng đủ, tăng ca người hỗ trợ trọn ngày tách theo, dữ liệu cũ giữ nguyên');

// 4) Giao diện và máy chủ
for(const k of ['<th class="c-cb c-ht" title="Buổi sáng đi hỗ trợ','data-dd-n="${k}"','khsx_diem_danh_ghi_v2','ho_tro_sang,ho_tro_chieu','<div class="dd-nut-ht">']) assert.ok(html.includes(k),'thiếu '+k);
assert.ok(!html.includes("rpc('khsx_diem_danh_ghi_v1'"),'ghi điểm danh dùng v2');
for(const k of ['add column if not exists ho_tro_sang','khsx_diem_danh_ho_tro_co_mat','khsx_diem_danh_ghi_v2','ATTENDANCE_SUPPORT_NEEDS_PRESENT','nguoi_ht','tang_ca_ht']) assert.ok(sql.includes(k),'migration thiếu '+k);
console.log('PASS giao diện + máy chủ: cột/ô mới, ghi v2, ràng buộc hỗ trợ cần có mặt');
