// Chốt đầu vào: chốt → mở chốt → nạp dữ liệu mới → chốt lại phải ra SỐ MỚI.
// Lỗi thật 24/09/2026 (anh Tùng): chốt lại thì app hiện lại số cũ, vì mở chốt không xoá ảnh
// chụp trên máy chủ, lượt tải lại đưa ảnh cũ về máy, lúc chốt lại app thấy "đã có ảnh" nên
// không chụp mới.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const goc=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(goc,'index.html'),'utf8');

const lay=(ten)=>{
  let i=html.indexOf(`function ${ten}(`);
  assert.ok(i>=0,`Không tìm thấy hàm ${ten}`);
  if(html.slice(i-6,i)==='async ') i-=6;
  let sau=0,j=html.indexOf('){',i)+1;   // bo qua ngoac nhon cua tham so mac dinh
  for(let k=j;k<html.length;k++){ if(html[k]==='{')sau++; else if(html[k]==='}'){ sau--; if(!sau) return html.slice(i,k+1); } }
};

const goiRpc=[];
const ctx={
  SUPABASE_VARIANT:true,
  dmyToIso:d=>{const m=String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';},
  isoToDMY:iso=>{const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';},
  supabaseDb:{
    auth:{getSession:async()=>({data:{session:{}}})},
    rpc:async(ten,args)=>{goiRpc.push({ten,args});return {error:null};}
  },
  console
};
vm.createContext(ctx);
vm.runInContext(['ngayCanChupLai','saveSupabaseDayLocks'].map(lay).join('\n'),ctx);

const anhCu=[{id:'r_cu',so_luong:5}];

// Ca 1: đúng lỗi anh gặp — ngày 22/09 đã mở chốt, máy tải lại có ảnh cũ, giờ chốt lại
assert.deepEqual([...ctx.ngayCanChupLai(['22/09/2026'],[],{'22/09/2026':anhCu})],['22/09/2026'],
  'Chốt lại ngày vừa mở mà không chụp mới — sẽ hiện lại số cũ');
console.log('PASS  chốt lại ngày vừa mở → chụp mới, không dùng ảnh cũ');

// Ca 2: ngày đang chốt, ảnh tốt → giữ nguyên, không chụp đè
assert.deepEqual([...ctx.ngayCanChupLai(['20/09/2026'],['20/09/2026'],{'20/09/2026':anhCu})],[],
  'Ngày đang chốt bị chụp đè — chốt không còn giữ được danh sách đơn');
console.log('PASS  ngày đang chốt giữ nguyên ảnh cũ');

// Ca 3: ngày đang chốt mà ảnh rỗng → chụp lại (lỗi cũ tháng 8)
assert.deepEqual([...ctx.ngayCanChupLai(['21/09/2026'],['21/09/2026'],{'21/09/2026':[]})],['21/09/2026']);
console.log('PASS  ngày đang chốt mà ảnh rỗng → chụp lại');

(async()=>{
  // Ca 4: chỉ gửi ngày đổi trạng thái + ảnh vừa chụp, không đè ảnh các ngày khác
  await ctx.saveSupabaseDayLocks('plan',['20/09/2026','22/09/2026'],['22/09/2026','19/09/2026'],{'22/09/2026':anhCu});
  const {args}=goiRpc.pop();
  assert.deepEqual({...args.p_lock_changes},{'2026-09-22':true,'2026-09-19':false},'Gửi thừa ngày không đổi — máy chưa tải kịp sẽ mở nhầm ngày máy khác vừa chốt');
  assert.deepEqual(Object.keys(args.p_snapshot_rows),['2026-09-22'],'Gửi thừa ảnh chụp — đè ảnh mới của máy khác bằng ảnh cũ');
  console.log('PASS  Lưu chỉ gửi ngày đổi trạng thái và ảnh vừa chụp');

  assert.match(html,/saveSupabaseDayLocks\('plan',picked,\[\.\.\.needsSnapshot,\.\.\.removed\],\s*Object\.fromEntries\(needsSnapshot\.map/,
    'Nút Lưu chốt đầu vào lại gửi cả danh sách ngày/ảnh');
  console.log('PASS  nút Lưu dùng đúng danh sách ngày đổi');

  // Ca 5: máy chủ mở chốt thì xoá ảnh chụp
  const mig=fs.readFileSync(path.join(goc,'supabase','migrations','20260924090000_bo_chot_dau_vao_xoa_anh_chup.sql'),'utf8');
  assert.match(mig,/set plan_locked=false[\s\S]{0,200}delete from public\.khsx_plan_snapshots where work_date=v_date;/,
    'Mở chốt đầu vào không xoá ảnh chụp trên máy chủ');
  console.log('PASS  máy chủ mở chốt → xoá ảnh chụp cũ');
})().catch(e=>{console.error(e);process.exit(1);});
