// Kiem tra ghi cong KPI ca nhan (May / Dong goi) sau ban va 22/09/2026:
//  1. Nut "Hoan thanh" hang loat phai tu ghi nguoi mac dinh, khong con bo trong.
//  2. Nhap le phai hoi nguoi MOI lan, khong con cho den khi khep du cong doan.
//  3. Dong goi phai co nguoi mac dinh (truoc day bang anh xa chi co tho May).
//  4. Don To 5 khong co nguoi mac dinh -> giu nguyen nguoi cu, khong ghi de null.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');

const lay=(re,ten)=>{const m=html.match(re);assert.ok(m,`Khong tim thay ${ten} trong index.html`);return m[0];};

// --- 1. Nut hang loat truyen nguoi vao ca hai cong doan tinh KPI ca nhan ---
const bulk=lay(/document\.getElementById\('bulkCompleteBtn'\)[\s\S]*?\n}\);/,'handler bulkCompleteBtn');
assert.match(bulk,/nguoiMacDinhCongDoan\('may',r,ngay\)/,'Nut hang loat khong lay nguoi May mac dinh');
assert.match(bulk,/nguoiMacDinhCongDoan\('dong_goi',r,ngay\)/,'Nut hang loat khong lay nguoi Dong goi mac dinh');
assert.match(bulk,/recordStagePatch\(r,ngay,'may',entry\.may,toMay,mayWorker\)/,'Nut hang loat ghi May ma khong kem nguoi');
assert.match(bulk,/recordStagePatch\(r,ngay,'dong_goi',entry\.dong_goi,toDongGoi,packWorker\)/,'Nut hang loat ghi Dong goi ma khong kem nguoi');
// To 5 khong co mac dinh -> khong duoc xoa nguoi da ghi dung truoc do
assert.match(bulk,/ganNguoiHoanThanhCongDoan\(entry,'may',mayActor\|\|undefined\)/,'To 5 bi xoa nguoi da ghi o cong doan May');
assert.match(bulk,/ganNguoiHoanThanhCongDoan\(entry,'dong_goi',packActor\|\|undefined\)/,'To 5 bi xoa nguoi da ghi o cong doan Dong goi');
console.log('PASS nut "Hoan thanh" hang loat tu ghi nguoi mac dinh cho May va Dong goi');

// --- 2. Nhap le hoi moi lan, khong con dieu kien "khep du cong doan" ---
const nhapLe=lay(/async function handleStageQtyChange\([\s\S]*?\n  \} finally \{[\s\S]*?\n\}/,'handleStageQtyChange');
assert.ok(!/daHoanTat/.test(nhapLe),'Nhap le van con dieu kien daHoanTat (chi hoi khi khep du)');
assert.match(nhapLe,/actor=parsed==null\?null:await chonNguoiHoanThanhCongDoan\(congDoan,o,ngay\)/,'Nhap le khong hoi nguoi moi lan');
assert.match(nhapLe,/if\(parsed!=null&&!actor\)\{ renderProgress\(\); return; \}/,'Nhap le van ghi so khi Quan ly bo qua chon nguoi');
console.log('PASS nhap le hoi nguoi moi lan Quan ly nhap, khong doi khep du cong doan');

// --- 3+4. Bang nguoi mac dinh: chay that ham tenNguoiMacDinhCongDoan ---
const sandbox={toThucHienCongDoanNgay:(o,ngay,stage)=>o.to};
vm.createContext(sandbox);
vm.runInContext([
  lay(/const NGUOI_MAY_DONG_GOI_MAC_DINH_THEO_TO = \{[^}]*\};/,'bang nguoi May mac dinh'),
  lay(/const NGUOI_DONG_GOI_MAC_DINH = '[^']*';/,'nguoi Dong goi mac dinh'),
  lay(/function tenNguoiMacDinhCongDoan\([\s\S]*?\n\}/,'tenNguoiMacDinhCongDoan')
].join('\n'),sandbox);
const ten=(stage,to)=>sandbox.tenNguoiMacDinhCongDoan(stage,{to},'22/09/2026');

assert.equal(ten('may','Tổ 1'),'Thảo Vy');
assert.equal(ten('may','Tổ 2'),'Bảo Chăm');
assert.equal(ten('may','Tổ 3'),'Loan Anh');
assert.equal(ten('may','Tổ 4'),'Loan Anh');
console.log('PASS May lay nguoi mac dinh theo to da Dan');

assert.equal(ten('may','Tổ 5'),null,'To 5 phai KHONG co nguoi May mac dinh');
console.log('PASS To 5 khong co nguoi May mac dinh (dung chu dich)');

['Tổ 1','Tổ 2','Tổ 3','Tổ 4','Tổ 5'].forEach(to=>assert.equal(ten('dong_goi',to),'Minh Thuận'));
console.log('PASS Dong goi luon mac dinh Minh Thuan, khong chia theo to');
