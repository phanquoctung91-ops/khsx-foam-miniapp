// Gợi ý mã khi sửa BOM: view khsx_bom_vat_tu gộp vật tư trong BOM + sổ danh mục chép từ ERP
// (migration 20260925130000). Mã chỉ có trong sổ (vd TPET214) phải hiện; trùng mã thì lấy tên trong BOM.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.resolve(__dirname,'..','supabase','migrations','20260925130000_danh_muc_vat_tu_erp.sql'),'utf8');
(async()=>{
  const db=await PGlite.create();
  await db.exec(`create role anon; create role authenticated;
    create table public.khsx_bom_lines(ma_hang text, ma_vt text, ten_vt text, dvt text, dong_bo_luc timestamptz default now());
    insert into public.khsx_bom_lines(ma_hang,ma_vt,ten_vt,dvt) values('SORA10-6','TPET234','Túi PE (tên trong BOM)','Cái');`);
  await db.exec(sql);
  await db.exec(`insert into public.khsx_vat_tu(ma_vt,ten_vt,dvt) values('TPET234','Túi PE (tên ERP)','Cái'),('TPET214','Túi PE trong 15cm-2m','Cái');`);
  const r=(await db.query(`select ma_vt,ten_vt from public.khsx_bom_vat_tu order by ma_vt`)).rows;
  assert.deepEqual(r,[{ma_vt:'TPET214',ten_vt:'Túi PE trong 15cm-2m'},{ma_vt:'TPET234',ten_vt:'Túi PE (tên trong BOM)'}]);
  console.log('PASS gợi ý có cả mã chỉ có trong sổ ERP (TPET214); trùng mã thì giữ tên trong BOM');
  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
