// Apps Script điểm danh -> trang tính (12/11/2026): kiểm phần tính thuần của Code.gs bằng node:vm, gồm khoảng ngày tuỳ chọn và tách Mút/May.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const gs = fs.readFileSync(path.resolve(__dirname, '..', 'apps-script/diem-danh-trang-tinh/Code.gs'), 'utf8');
const kho = {}, ctx = { CacheService: { getScriptCache: () => ({ get: k => (k === 'kq_ok1' ? '{"done":true,"success":true}' : kho[k] || null), put: (k, v) => { kho[k] = v; } }) }, ContentService: { createTextOutput: t => ({ t, setMimeType(m) { this.m = m; return this; } }), MimeType: { JAVASCRIPT: 'js', JSON: 'json' } } }; vm.createContext(ctx);
vm.runInContext(gs + ';this.F={locTo,taoKhoang,khoangThang,kyHieu,gioNguoiNgay,xayChamCong,xayTongHopTo,xayGhiChu,doGet,doPost,ngayHopLe};', ctx);
const F = ctx.F, J = x => JSON.parse(JSON.stringify(x)), gan = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
const T11 = () => F.khoangThang(2026, 11);

// 1) Ký hiệu
const kh = (s, c, hs, hc) => F.kyHieu({ sang: s, chieu: c, ho_tro_sang: hs, ho_tro_chieu: hc });
assert.equal(kh(true, true, false, false), 'X'); assert.equal(kh(true, false, false, false), 'S'); assert.equal(kh(false, true, false, false), 'C');
assert.equal(kh(true, true, true, true), 'HT'); assert.equal(kh(true, true, false, true), 'S+HT'); assert.equal(kh(true, true, true, false), 'HT+C');
assert.equal(kh(true, false, true, false), 'HT-S'); assert.equal(kh(false, true, false, true), 'HT-C');
assert.equal(F.kyHieu(null), ''); assert.equal(kh(false, false, false, false), '');
assert.equal(F.kyHieu({ sang: true, chieu: true, tang_ca: 3 }), 'X', 'tăng ca không nằm trong ô điểm danh');
const g1 = J(F.gioNguoiNgay({ sang: true, chieu: true, ho_tro_sang: true, ho_tro_chieu: true, tang_ca: 2 })); gan(g1.to, 0); gan(g1.hoTro, 10);
console.log('PASS ký hiệu');

// 2) Khoảng ngày
const k1 = J(F.taoKhoang('2026-11-28', '2026-12-03'));
assert.equal(k1.ngay.length, 6); assert.equal(k1.nhieuThang, true); assert.equal(k1.ngay[0].thu, 6); assert.equal(k1.ngay[3].iso, '2026-12-01');
assert.equal(J(F.taoKhoang('2026-11-05', '2026-11-05')).ngay.length, 1); assert.equal(J(T11()).nhieuThang, false);
assert.equal(J(F.taoKhoang('2026-02-27', '2026-03-02')).ngay.length, 4, 'qua tháng 2 không nhuận');
assert.ok(F.ngayHopLe('2026-11-09') && !F.ngayHopLe('2026-13-09') && !F.ngayHopLe('09/11/2026') && !F.ngayHopLe(''));
console.log('PASS khoảng ngày');

// 3) Dữ liệu mẫu (Mút)
const ng = (id, ten, to) => ({ id, ten, chuc_vu: 'Công nhân', to_lam: to, con_dung: true });
const du = { nguoi: [ng('a', 'An', 'Tổ dán 1'), ng('b', 'Bình', 'Tổ dán 1'), ng('c', 'Cường', 'Tổ dán 1'), ng('d', 'Dũng', 'Tổ dán 1'), ng('e', 'Em', 'Tổ dán 1'), ng('k', 'Kho1', 'Phụ kho')],
  diem_danh: [], ghi_chu: [{ nguoi_id: 'k', ngay: '2026-11-09', ghi_chu: 'kiểm kho' }] };
const cd = (id, ngay, x) => du.diem_danh.push(Object.assign({ nguoi_id: id, ngay, sang: true, chieu: true, tang_ca: 0, ho_tro_sang: false, ho_tro_chieu: false }, x));
cd('a', '2026-11-09', { ho_tro_chieu: true }); cd('b', '2026-11-09', { tang_ca: 3 }); cd('c', '2026-11-09', { ho_tro_sang: true, ho_tro_chieu: true });
cd('d', '2026-11-09', {}); cd('e', '2026-11-09', { ho_tro_sang: true }); cd('k', '2026-11-09', {});
cd('b', '2026-11-10', { tang_ca: 2 }); cd('a', '2026-11-03', { chieu: false });

const cc = F.xayChamCong(J(du), T11()), gt = J(cc.giaTri), loai = J(cc.loai), nen = J(cc.nen);
assert.equal(gt[0].length, 2 + 30 + 3); assert.equal(gt[0][2], 1); assert.equal(gt[1][2], 'CN'); assert.equal(gt[1][10], 'T2'); assert.equal(gt[0][1], 'Việc làm');
assert.equal(gt[0][32], 'Ngày công'); assert.equal(gt[0][34], 'Giờ tăng ca');
assert.equal(gt.length, nen.length); assert.equal(gt.length, loai.length);
gt.forEach((r, i) => assert.equal(r.length, nen[i].length, 'đủ ô màu dòng ' + i));
const iA = gt.findIndex(r => r[0] === 'An'), iB = gt.findIndex(r => r[0] === 'Bình'), iC = gt.findIndex(r => r[0] === 'Cường'), col = 10;
assert.equal(loai[iA], 'diem'); assert.equal(loai[iA + 1], 'tc'); assert.equal(gt[iA + 1][0], '   tăng ca');
assert.equal(gt[iA][col], 'S+HT'); assert.equal(gt[iB][col], 'X');
assert.equal(gt[iB + 1][col], 3); assert.equal(gt[iB + 1][col + 1], 2);
assert.equal(nen[iA][col], '#fff2cc'); assert.equal(nen[iB][col], '#d9ead3'); assert.equal(nen[iA + 1][col], '#f3f3f3');
assert.equal(gt[iA][4], 'S', '03/11 chỉ sáng');
const cuoi = r => r.slice(32);
assert.deepEqual(cuoi(gt[iB]), [2, 0, 5]); assert.deepEqual(cuoi(gt[iA]), [1.5, 1, 0]); assert.deepEqual(cuoi(gt[iC]), [1, 2, 0]);
assert.ok(gt.some((r, i) => loai[i] === 'dai' && r[0] === 'TỔ DÁN 1 · 5 người'), 'dải tiêu đề tổ');
const ngB = gt[iB].slice(2, 32);
assert.equal(ngB.filter(v => v === 'off').length, 23, 'ngày thường vắng ghi off');
assert.equal(ngB.filter(v => v === '').length, 5, 'Chủ nhật vắng để trống'); assert.equal(ngB[0], '');
assert.equal(nen[iB][2], '#eeeeee', 'Chủ nhật vắng nền xám');
const ccTo = J(F.xayChamCong(J(du), T11(), '2026-11-05')), iB2 = ccTo.giaTri.findIndex(r => r[0] === 'Bình');
assert.equal(ccTo.giaTri[iB2].slice(2, 32).filter(v => v === 'off').length, 4, 'chỉ ghi off tới hết ngày 5');
assert.ok(!JSON.stringify(nen).includes('#f4cccc'), 'không màu đỏ'); assert.ok(!gt[0].some(c => /Hộp/.test(String(c))), 'bỏ cột hộp sữa');
const duCn = J(du); duCn.diem_danh.push({ nguoi_id: 'd', ngay: '2026-11-08', sang: true, chieu: true, tang_ca: 0, ho_tro_sang: false, ho_tro_chieu: false });
const cn = J(F.xayChamCong(duCn, T11())), iD = cn.giaTri.findIndex(r => r[0] === 'Dũng');
assert.equal(cn.giaTri[iD][2 + 7], 'X'); assert.equal(cn.nen[iD][2 + 7], '#ffd966', 'CN đi làm: đánh dấu + vàng đậm');
console.log('PASS Chấm công: 2 dòng/người, tăng ca dòng dưới, xanh/vàng, off, Chủ nhật');

// 4) Khoảng tuỳ chọn qua tháng: nhãn d/m, chỉ đếm ngày trong khoảng
const kq2 = F.taoKhoang('2026-11-09', '2026-11-10'), c2 = J(F.xayChamCong(J(du), kq2)), t2 = J(F.xayTongHopTo(J(du), kq2, 'mut'));
assert.equal(c2.giaTri[0].length, 2 + 2 + 3); assert.equal(c2.giaTri.find(r => r[0] === 'An')[2], 'S+HT');
assert.equal(t2.bang2.length, 3); assert.equal(t2.bang2[1][0], 9); gan(t2.bang1.find(r => r[0] === 'Tổ dán 1')[3], 4.25 + 11 + 10 + 8 + 3.75);   // 03/11 của An nằm ngoài khoảng
const k3 = F.taoKhoang('2026-10-31', '2026-11-02'), c3 = J(F.xayChamCong(J(du), k3)); assert.deepEqual(c3.giaTri[0].slice(2, 5), ['31/10', '1/11', '2/11']);
console.log('PASS khoảng tuỳ chọn');

// 5) Tổng hợp tổ (tháng, Mút)
const th = J(F.xayTongHopTo(J(du), T11(), 'mut')), t = Object.fromEntries(th.bang1.map(r => [r[0], r]));
assert.deepEqual(th.bang1[0], ['Tổ', 'Số người', 'Ngày công', 'Giờ làm ở tổ', 'Giờ đi hỗ trợ', 'Giờ tăng ca']);
gan(t['Tổ dán 1'][3], 4.25 + 4.25 + 11 + 10 + 8 + 3.75); gan(t['Tổ dán 1'][4], 3.75 + 8 + 4.25); gan(t['Tổ dán 1'][5], 5);
assert.equal(t['Tổ dán 1'][1], 5); assert.equal(t['Kho'][1], 1); assert.equal(t['Cả xưởng'][1], 6);
const b2 = th.bang2, d9 = b2.find(r => r[0] === 9);
assert.equal(b2[0][2], 'Tổ dán 1'); assert.equal(d9[2], 5); assert.equal(d9[d9.length - 1], 6);
assert.equal(b2.find(r => r[0] === 8)[2], ''); assert.equal(th.chuNhat[7], true);
console.log('PASS Tổng hợp tổ');

// 6) Tách Mút / May
const duM = { nguoi: [{ id: 'm1', ten: 'Mây', chuc_vu: 'Công nhân', to_lam: 'May áo niệm', con_dung: true }, { id: 'm2', ten: 'Mưa', chuc_vu: 'Công nhân', to_lam: 'May áo gối', con_dung: true },
  { id: 'm3', ten: 'Mơ', chuc_vu: 'Công nhân', to_lam: 'Tổ may', con_dung: true }, { id: 'q', ten: 'Quản', chuc_vu: 'Thủ kho', to_lam: null, con_dung: true },
  { id: 'tm', ten: 'Tâm', chuc_vu: 'Tổ trưởng may', to_lam: null, con_dung: true }, { id: 'mc', ten: 'Mai', chuc_vu: 'Công nhân', to_lam: 'May mẫu & cắt hàng', con_dung: true }], diem_danh: [], ghi_chu: [] };
const dd = (id) => ({ nguoi_id: id, ngay: '2026-11-03', sang: true, chieu: true, tang_ca: 1, ho_tro_sang: false, ho_tro_chieu: false });
['m1', 'm2', 'm3', 'q', 'tm', 'mc'].forEach(id => duM.diem_danh.push(dd(id))); duM.ghi_chu.push({ nguoi_id: 'm2', ngay: '2026-11-03', ghi_chu: 'x' }, { nguoi_id: 'q', ngay: '2026-11-03', ghi_chu: 'y' });
const mut = J(F.locTo(J(duM), 'mut')), may = J(F.locTo(J(duM), 'may')), macDinh = J(F.locTo(J(duM), undefined));
assert.deepEqual(mut.nguoi.map(p => p.id), ['m3', 'q']); assert.equal(mut.diem_danh.length, 2); assert.equal(mut.ghi_chu.length, 1);
assert.deepEqual(may.nguoi.map(p => p.id).sort(), ['m1', 'm2', 'mc', 'tm']); assert.equal(may.diem_danh.length, 4); assert.equal(may.ghi_chu.length, 1); assert.equal(may.ghi_chu[0].nguoi_id, 'm2');
assert.deepEqual(macDinh.nguoi.map(p => p.id), ['m3', 'q'], 'chưa đặt tổ = Mút');
const gmut = J(F.xayChamCong(mut, T11()));
assert.deepEqual(gmut.giaTri.filter((r, i) => gmut.loai[i] === 'dai').map(r => r[0]), ['TỔ MAY (MÚT) · 1 người', 'QUẢN LÝ · 1 người']);
const gmay = J(F.xayChamCong(may, T11())), daiMay = gmay.giaTri.filter((r, i) => gmay.loai[i] === 'dai').map(r => r[0]);
assert.deepEqual(daiMay, ['TỔ MAY · 4 người']);
assert.equal(gmay.giaTri.find(r => r[0] === 'Mây')[1], 'May áo niệm'); assert.equal(gmay.giaTri.find(r => r[0] === 'Tâm')[1], 'Tổ trưởng may');
const tm = J(F.xayTongHopTo(may, T11(), 'may')), tmx = Object.fromEntries(tm.bang1.map(r => [r[0], r]));
assert.equal(tm.bang1[0][0], 'Việc làm'); assert.equal(tmx['May áo niệm'][1], 1); assert.equal(tmx['Tổ trưởng may'][1], 1); assert.equal(tmx['Cả xưởng'][1], 4); gan(tmx['Cả xưởng'][5], 4);
assert.ok(!tm.bang1.some(r => r[0] === 'Kho'));
console.log('PASS tách Mút / May');

// 7) Ghi chú + người đã ẩn
assert.deepEqual(J(F.xayGhiChu(J(du))).giaTri[1], ['09/11/2026', 'Kho1', 'Kho', 'kiểm kho']);
const du2 = J(du);
du2.nguoi.push(Object.assign(ng('z', 'Nghỉ', 'Tổ dán 2'), { con_dung: false }), Object.assign(ng('y', 'NghiCo', 'Tổ dán 2'), { con_dung: false }));
du2.diem_danh.push({ nguoi_id: 'y', ngay: '2026-11-03', sang: true, chieu: false, tang_ca: 0, ho_tro_sang: false, ho_tro_chieu: false });
const ten = J(F.xayChamCong(du2, T11())).giaTri.map(r => r[0]);
assert.ok(ten.includes('NghiCo') && !ten.includes('Nghỉ'));
const duAn = J(du); duAn.nguoi[1].an_tu_ngay = '2026-11-06';   // Bình bị thu hồi từ 06/11: không ghi off từ ngày đó
const bAn = J(F.xayChamCong(duAn, T11())).giaTri.find(r => r[0] === 'Bình').slice(2, 32);
assert.equal(bAn[4], 'off'); assert.equal(bAn[5], '', 'từ ngày thu hồi không còn off'); assert.equal(bAn[9], 'X');
console.log('PASS ghi chú + người ẩn');

// 8) Xuất tay: kiểm tra đầu vào của doPost/doGet (không chạm Sheet)
assert.equal(F.doGet({ parameter: { token: 'abc', callback: 'cb_1' } }).t, 'cb_1({"done":false})');
assert.equal(F.doGet({ parameter: { token: 'ok1', callback: 'cb<2>' } }).t, 'cb2({"done":true,"success":true})', 'callback được làm sạch');
assert.equal(F.doGet({ parameter: { token: 'ok1' } }).t, '{"done":true,"success":true}');
const dp = F.doPost({ postData: { contents: '{"token":"zz","tu":"2026-11-10","den":"2026-11-01"}' } }); assert.equal(dp.t, 'ok');   // khoảng sai: không chạm Sheet, kết quả lỗi lưu ở cache
assert.deepEqual(J(JSON.parse(F.doGet({ parameter: { token: 'zz' } }).t)), { done: true, success: false, message: 'Khoảng ngày không hợp lệ.' });
F.doPost({ postData: { contents: '{"token":"y1","tu":"2026-01-01","den":"2026-12-31"}' } });
assert.match(JSON.parse(F.doGet({ parameter: { token: 'y1' } }).t).message, /Tối đa 62 ngày/);
console.log('PASS điểm vào doGet/doPost');
