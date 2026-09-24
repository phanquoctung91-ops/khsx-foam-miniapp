// Đợt giảm tải 2026-09-24: đọc đơn gọn (bỏ live_row), gom lần đọc lại, khách hỏi "có gì mới".
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const lay=(ten)=>{
  const i=html.indexOf(`function ${ten}(`); assert.ok(i>=0,`Không tìm thấy hàm ${ten}`);
  let sau=0,j=html.indexOf('){',i)+1;
  for(let k=j;k<html.length;k++){ if(html[k]==='{')sau++; else if(html[k]==='}'){ sau--; if(!sau) return html.slice(i,k+1); } }
};
const ctx={}; vm.createContext(ctx); vm.runInContext(lay('ghepPayloadDon'),ctx);

// Dựng lại source_payload đúng các khoá app đang đọc
const bh=ctx.ghepPayloadDon({id:'w',p_source:'warranty',p_review:null,p_edit:null,p_bh_to:{'Tổ 1':3},p_bh_ct:[{ten:'A'}]});
assert.equal(bh.source_payload.source,'warranty');
assert.deepEqual({...bh.source_payload.live_row.bh_theo_to},{'Tổ 1':3});
assert.equal(bh.source_payload.live_row.bh_chi_tiet.length,1);
assert.ok(!('p_bh_to' in bh) && !('p_source' in bh),'Còn sót cột phụ trên dòng đơn');
const sua=ctx.ghepPayloadDon({id:'r',p_source:'sheet_live_sync_v123',p_review:{removed:true,reason:'manual_edit'},p_edit:{before:{ma:'X'}}});
assert.equal(sua.source_payload.sheet_sync_review.reason,'manual_edit');
assert.equal(sua.source_payload.manual_edit.before.ma,'X');
assert.equal(sua.source_payload.live_row,undefined);
const tach=ctx.ghepPayloadDon({id:'s',p_source:'support_split'});
assert.equal(tach.source_payload.source,'support_split');
console.log('PASS  đọc đơn gọn dựng lại đủ khoá: nguồn, cần kiểm tra, sửa tay, bảo hành');

// Mọi chỗ app đọc source_payload chỉ dùng các khoá đã có trong danh sách cột gọn
const khoaDung=new Set([...html.matchAll(/source_payload\??\.(\w+)/g)].map(m=>m[1]));
['source','sheet_sync_review','manual_edit','live_row'].forEach(k=>khoaDung.delete(k));
assert.deepEqual([...khoaDung],[],`App đọc thêm khoá source_payload chưa có trong cột gọn: ${[...khoaDung]}`);
const lr=new Set([...html.matchAll(/live_row\??\.(\w+)|liveRow\.(\w+)/g)].map(m=>m[1]||m[2]));
['bh_theo_to','bh_chi_tiet'].forEach(k=>lr.delete(k));
assert.deepEqual([...lr],[],`App đọc thêm khoá live_row chưa có trong cột gọn: ${[...lr]}`);
console.log('PASS  không chỗ nào đọc khoá đã bị bỏ khỏi lượt tải');

// Bảng đơn không còn tải '*' ở lượt đọc cả sổ
assert.ok(!/supabaseSelectAll\('khsx_orders','\*'/.test(html.replace(/return supabaseSelectAll\('khsx_orders','\*',configure\)/,'')),'Còn chỗ tải cả bảng đơn kiểu *');
// Sự kiện tiến độ/công gom 20 giây, sự kiện khác 3 giây; không truyền nhầm payload vào hẹn giờ
assert.match(html,/table:'khsx_stage_progress'\},\(\)=>scheduleSupabaseReload\(CHO_DOC_LAI_CONG_DOAN_MS\)\)/);
assert.match(html,/table:'khsx_stage_credits'\},\(\)=>scheduleSupabaseReload\(CHO_DOC_LAI_CONG_DOAN_MS\)\)/);
assert.ok(!/\},scheduleSupabaseReload\)/.test(html),'Realtime gọi thẳng scheduleSupabaseReload(payload) — hẹn giờ sẽ thành NaN');
console.log('PASS  gom lần đọc: tiến độ 20 giây, còn lại 3 giây');

// Khách: hỏi dấu trước, lỗi thì tải đủ như cũ
assert.match(html,/rpc\('khsx_guest_version_v1'\)[\s\S]{0,200}dauMoi===guestDauDaTai/);
assert.ok(fs.existsSync(path.resolve(__dirname,'..','supabase','migrations','20260924110000_khach_hoi_co_gi_moi.sql')));
console.log('PASS  link khách hỏi "có gì mới" trước khi tải cả gói');
