/**
 * Điểm danh -> Trang tính theo dõi (anh Tùng yêu cầu 11/11/2026, bản gọn 12/11/2026, thêm xuất tay từ app 12/11/2026).
 * Mỗi Google Sheet là MỘT tổ: Script Property TO = mut (Tổ Mút gồm Kho, Quản lý) hoặc may (11 người Tổ May). Chưa đặt thì coi là mut.
 * Cài vào Sheet: Tiện ích mở rộng > Apps Script, dán file này, menu "Điểm danh" > "Chọn tổ của Sheet này" (nếu là May), "Nhập khóa", "Cài đặt lần đầu".
 * Dữ liệu đọc từ Supabase bằng hàm khsx_diem_danh_sheet_v1, khóa bí mật nằm trong Script Properties (KHOA), không nằm trong mã.
 * Lịch 18:00 mỗi ngày ghi lại 3 tab của tháng: "Chấm công Tmm-yyyy", "Tổng hợp tổ Tmm-yyyy", "Ghi chú Tmm-yyyy".
 * Nút "Xuất lên Sheet" trong app gọi doPost (triển khai Ứng dụng web) -> ghi lại CHÍNH 3 tab của tháng này ngay, không chờ 18:00 (12/11/2026, bỏ chọn khoảng ngày).
 * Tab Chấm công: mỗi người HAI dòng liền nhau. Dòng trên = điểm danh (X, S, C, HT, off...). Dòng dưới (chữ nhỏ, nền xám) = số giờ tăng ca của đúng ngày đó.
 */
var SB_URL = 'https://tydevlvcyvqwghinboif.supabase.co';
var SB_KEY = 'sb_publishable_Vy74jABl_0L-VGIKWAP1zw_YN1OZ4C2'; // khóa công khai của mini-app (không phải bí mật)
var TZ = 'Asia/Ho_Chi_Minh';
var GIO_SANG = 4.25, GIO_CHIEU = 3.75;
var DS_MUT = ['Tổ dán 1', 'Tổ dán 2', 'Tổ dán 3', 'Tổ dán 4', 'Tổ may (Mút)', 'Tổ đóng gói', 'Kho', 'Quản lý'];   // dải của bảng tổng hợp Mút
var DS_TO = ['Tổ dán 1', 'Tổ dán 2', 'Tổ dán 3', 'Tổ dán 4', 'Tổ dán 5', 'Tổ may (Mút)', 'Tổ đóng gói', 'Kho', 'Quản lý', 'Hỗ trợ', 'Tổ May'];   // thứ tự dải ở tab Chấm công
var VIEC_MAY = ['May mẫu & cắt hàng', 'May áo niệm', 'May áo gối'];
var NGOAI = 'Khác';
var MAU = { to: '#d9ead3', ho_tro: '#fff2cc', chu_nhat: '#eeeeee', cn_lam: '#ffd966', dau: '#1f3864', dai_to: '#d9e2f3', tc: '#f3f3f3' };
var THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
var CHU_GIAI = 'X = cả ngày ở tổ · S / C = chỉ sáng / chỉ chiều · HT = đi hỗ trợ cả ngày · S+HT = sáng ở tổ, chiều hỗ trợ · HT+C = sáng hỗ trợ, chiều ở tổ · dòng nhỏ bên dưới = giờ tăng ca · off = nghỉ (ngày thường vắng) · ô xám trống = Chủ nhật · ô vàng đậm = đi làm Chủ nhật';

// ====================== phần tính (thuần, kiểm bằng node) ======================
// Tổ của người: tách khỏi việc làm. Việc May áo niệm / May áo gối / May mẫu & cắt hàng đều thuộc Tổ May.
function toCuaNguoi(p) {
  var cv = p.chuc_vu, t = p.to_lam || '';
  if (cv === 'Trưởng Nhóm' || cv === 'Tổ trưởng sản xuất' || cv === 'Thủ kho') return 'Quản lý';
  if (cv === 'Tổ trưởng may') return 'Tổ May';
  if (cv !== 'Công nhân') return cv || '';
  if (t === 'Phụ kho') return 'Kho';
  if (VIEC_MAY.indexOf(t) >= 0) return 'Tổ May';
  if (t === 'Tổ may') return 'Tổ may (Mút)';
  return t;
}
function viecCuaNguoi(p) { return p.chuc_vu === 'Công nhân' && VIEC_MAY.indexOf(p.to_lam) >= 0 ? p.to_lam : (p.chuc_vu === 'Tổ trưởng may' ? 'Tổ trưởng may' : ''); }
function laToMay(p) { return toCuaNguoi(p) === 'Tổ May'; }
// Mỗi Sheet một tổ: to = 'may' giữ 11 người Tổ May, còn lại (mọi giá trị khác) giữ phần còn lại = Tổ Mút. Bỏ luôn điểm danh / ghi chú / phát sữa của người bị loại.
function locTo(du, to) {
  var may = to === 'may', giu = {};
  var nguoi = (du.nguoi || []).filter(function (p) { var ok = laToMay(p) === may; if (ok) giu[p.id] = true; return ok; });
  function loc(a) { return (a || []).filter(function (r) { return giu[r.nguoi_id]; }); }
  return { nguoi: nguoi, diem_danh: loc(du.diem_danh), ghi_chu: loc(du.ghi_chu), phat_sua: loc(du.phat_sua) };
}
function nhomGio(p, to) {
  if (to === 'may') return viecCuaNguoi(p) || NGOAI;
  var t = toCuaNguoi(p); return DS_MUT.indexOf(t) >= 0 ? t : NGOAI;
}
function dsNhom(to) { return (to === 'may' ? VIEC_MAY.concat(['Tổ trưởng may']) : DS_MUT).concat([NGOAI]); }
function thuTuTo(t) { var i = DS_TO.indexOf(t); return i < 0 ? 99 : i; }

function soNgayThang(y, m) { return new Date(y, m, 0).getDate(); }
function iso(y, m, d) { return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
// Khoảng ngày: ngay[] = {iso, d, m, thu}. Cùng một tháng thì nhãn cột là số ngày, khác tháng thì d/m.
function taoKhoang(tuIso, denIso) {
  var a = tuIso.split('-'), b = denIso.split('-'), c = new Date(+a[0], +a[1] - 1, +a[2]), z = new Date(+b[0], +b[1] - 1, +b[2]), ngay = [];
  while (c <= z && ngay.length < 400) { ngay.push({ iso: iso(c.getFullYear(), c.getMonth() + 1, c.getDate()), d: c.getDate(), m: c.getMonth() + 1, thu: c.getDay() }); c.setDate(c.getDate() + 1); }
  return { ngay: ngay, nhieuThang: ngay.length > 0 && ngay[0].iso.slice(0, 7) !== ngay[ngay.length - 1].iso.slice(0, 7) };
}
function khoangThang(y, m) { return taoKhoang(iso(y, m, 1), iso(y, m, soNgayThang(y, m))); }
function nhanNgay(kh, x) { return kh.nhieuThang ? x.d + '/' + x.m : x.d; }

// Ký hiệu một ngày. sang/chieu = có mặt buổi đó; ho_tro_* = buổi đó đi hỗ trợ (không làm ở tổ gốc).
function kyHieu(r) {
  if (!r || (!r.sang && !r.chieu)) return '';
  var hs = !!r.ho_tro_sang, hc = !!r.ho_tro_chieu;
  if (r.sang && r.chieu) {
    if (!hs && !hc) return 'X';
    if (hs && hc) return 'HT';
    return hs ? 'HT+C' : 'S+HT';
  }
  if (r.sang) return hs ? 'HT-S' : 'S';
  return hc ? 'HT-C' : 'C';
}
function coHoTro(r) { return !!(r && ((r.sang && r.ho_tro_sang) || (r.chieu && r.ho_tro_chieu))); }
function soBuoiHoTro(r) { return r ? ((r.sang && r.ho_tro_sang ? 1 : 0) + (r.chieu && r.ho_tro_chieu ? 1 : 0)) : 0; }
function hoTroTronNgay(r) { return !!(r && (r.sang || r.chieu) && (!r.sang || r.ho_tro_sang) && (!r.chieu || r.ho_tro_chieu)); }
function gioNguoiNgay(r) {
  // trả {to, hoTro}: giờ làm ở tổ gốc và giờ đi hỗ trợ (tăng ca của người hỗ trợ trọn ngày tính vào hỗ trợ)
  var gTo = 0, gHt = 0, tc = Number(r.tang_ca) || 0;
  if (r.sang) { if (r.ho_tro_sang) gHt += GIO_SANG; else gTo += GIO_SANG; }
  if (r.chieu) { if (r.ho_tro_chieu) gHt += GIO_CHIEU; else gTo += GIO_CHIEU; }
  if (hoTroTronNgay(r)) gHt += tc; else gTo += tc;
  return { to: gTo, hoTro: gHt };
}
function congNguoiNgay(r) { return ((r.sang ? 1 : 0) + (r.chieu ? 1 : 0)) / 2; }

function chiMuc(du) {
  var diem = {};
  (du.diem_danh || []).forEach(function (r) { (diem[r.nguoi_id] = diem[r.nguoi_id] || {})[r.ngay] = r; });
  return { diem: diem };
}
function sapNguoi(a, b) {
  var x = toCuaNguoi(a), y = toCuaNguoi(b), d = thuTuTo(x) - thuTuTo(y);
  if (d) return d;
  if (x !== y) return String(x).localeCompare(String(y), 'vi');
  return String(a.ten).localeCompare(String(b.ten), 'vi');
}
function lamTron(x) { return Math.round(x * 100) / 100; }

// Tab 1: mỗi người hai dòng (điểm danh + tăng ca), nhóm theo tổ, mỗi ngày một cột. hetIso = ngày cuối được ghi "off" (không ghi off ngày chưa tới).
// Trả về lưới giá trị và các thông tin để tô màu: loai[i] = 'dau' | 'dai' | 'diem' | 'tc'; nen[i] = mảng màu theo cột.
function xayChamCong(du, kh, hetIso) {
  var ix = chiMuc(du), ngay = kh.ngay, n = ngay.length, cotNgay0 = 2, tongCot = cotNgay0 + n + 3;
  if (hetIso == null) hetIso = n ? ngay[n - 1].iso : '';
  var nguoi = (du.nguoi || []).filter(function (p) {
    var co = false; for (var d = 0; d < n; d++) if ((ix.diem[p.id] || {})[ngay[d].iso]) { co = true; break; }
    return p.con_dung || co;
  }).sort(sapNguoi);
  var dau1 = ['Tên', 'Việc làm'], dau2 = ['', ''];
  ngay.forEach(function (x) { dau1.push(nhanNgay(kh, x)); dau2.push(THU[x.thu]); });
  ['Ngày công', 'Buổi hỗ trợ', 'Giờ tăng ca'].forEach(function (t) { dau1.push(t); dau2.push(''); });
  var giaTri = [dau1, dau2], loai = ['dau', 'dau'], nen = [[], []];
  for (var i = 0; i < tongCot; i++) { nen[0].push(''); nen[1].push(''); }
  var theoTo = {}, thuTu = [];
  nguoi.forEach(function (p) { var t = toCuaNguoi(p) || '(chưa có tổ)'; if (!theoTo[t]) { theoTo[t] = []; thuTu.push(t); } theoTo[t].push(p); });
  thuTu.forEach(function (to) {
    var dsT = theoTo[to], band = [to.toUpperCase() + ' · ' + dsT.length + ' người'], bn = [MAU.dai_to];
    for (var i = 1; i < tongCot; i++) { band.push(''); bn.push(MAU.dai_to); }
    giaTri.push(band); loai.push('dai'); nen.push(bn);
    dsT.forEach(function (p) {
      var dA = [p.ten, viecCuaNguoi(p)], dB = ['   tăng ca', ''], nA = ['', ''], nB = [MAU.tc, MAU.tc], cong = 0, ht = 0, tc = 0;
      var anTu = p.an_tu_ngay ? String(p.an_tu_ngay).slice(0, 10) : '';
      ngay.forEach(function (x) {
        var r = (ix.diem[p.id] || {})[x.iso], cn = x.thu === 0, co = r && (r.sang || r.chieu);
        var off = !co && !cn && x.iso <= hetIso && !(anTu && x.iso >= anTu);
        dA.push(co ? kyHieu(r) : (off ? 'off' : ''));
        dB.push(co && r.tang_ca ? Number(r.tang_ca) : '');
        nA.push(co ? (cn ? MAU.cn_lam : (coHoTro(r) ? MAU.ho_tro : MAU.to)) : (cn ? MAU.chu_nhat : ''));
        nB.push(cn && !co ? MAU.chu_nhat : MAU.tc);
        if (co) { cong += congNguoiNgay(r); ht += soBuoiHoTro(r); tc += Number(r.tang_ca) || 0; }
      });
      dA.push(cong, ht, tc); dB.push('', '', '');
      for (var k = 0; k < 3; k++) { nA.push(MAU.dai_to); nB.push(MAU.tc); }
      giaTri.push(dA, dB); loai.push('diem', 'tc'); nen.push(nA, nB);
    });
  });
  return { giaTri: giaTri, loai: loai, nen: nen, soNguoi: nguoi.length, cotNgay0: cotNgay0, soNgay: n };
}

// Tab 2: bảng tổng theo nhóm (Mút: theo tổ; May: theo việc làm) + bảng số người đi làm mỗi ngày.
function xayTongHopTo(du, kh, to) {
  var ngay = kh.ngay, nhom = dsNhom(to), pIdx = {}, trongKhoang = {};
  (du.nguoi || []).forEach(function (p) { pIdx[p.id] = p; });
  var tong = {}, coMat = {}, theoNgay = {};   // coMat[nhom][nguoi_id]; theoNgay[iso][nhom] = số người có mặt
  nhom.forEach(function (g) { tong[g] = { cong: 0, gTo: 0, gHt: 0, tc: 0 }; coMat[g] = {}; });
  ngay.forEach(function (x) { trongKhoang[x.iso] = true; theoNgay[x.iso] = {}; nhom.forEach(function (g) { theoNgay[x.iso][g] = 0; }); });
  (du.diem_danh || []).forEach(function (r) {
    if (!(r.sang || r.chieu) || !trongKhoang[r.ngay]) return;
    var p = pIdx[r.nguoi_id]; if (!p) return;
    var g = nhomGio(p, to), gi = gioNguoiNgay(r);
    tong[g].cong += congNguoiNgay(r); tong[g].gTo += gi.to; tong[g].gHt += gi.hoTro; tong[g].tc += Number(r.tang_ca) || 0;
    coMat[g][r.nguoi_id] = true; theoNgay[r.ngay][g] += 1;
  });
  var bang1 = [[to === 'may' ? 'Việc làm' : 'Tổ', 'Số người', 'Ngày công', 'Giờ làm ở tổ', 'Giờ đi hỗ trợ', 'Giờ tăng ca']], x = { ng: 0, c: 0, a: 0, b: 0, t: 0 };
  nhom.forEach(function (g) {
    var t = tong[g], ng = Object.keys(coMat[g]).length;
    bang1.push([g, ng, lamTron(t.cong), lamTron(t.gTo), lamTron(t.gHt), lamTron(t.tc)]);
    x.ng += ng; x.c += t.cong; x.a += t.gTo; x.b += t.gHt; x.t += t.tc;
  });
  bang1.push(['Cả xưởng', x.ng, lamTron(x.c), lamTron(x.a), lamTron(x.b), lamTron(x.t)]);
  var dau = ['Ngày', 'Thứ'].concat(nhom).concat(['Tổng']), bang2 = [dau], chuNhat = [];
  ngay.forEach(function (d) {
    var tg = 0, dong = [nhanNgay(kh, d), THU[d.thu]];
    nhom.forEach(function (g) { tg += theoNgay[d.iso][g]; });
    nhom.forEach(function (g) { dong.push(tg ? theoNgay[d.iso][g] : ''); });
    dong.push(tg ? tg : ''); bang2.push(dong); chuNhat.push(d.thu === 0);
  });
  return { bang1: bang1, bang2: bang2, chuNhat: chuNhat, soNhom: nhom.length, soNgay: ngay.length };
}

// Tab 3: ghi chú điểm danh
function xayGhiChu(du) {
  var pIdx = {}; (du.nguoi || []).forEach(function (p) { pIdx[p.id] = p; });
  var kq = [['Ngày', 'Tên', 'Tổ', 'Ghi chú']];
  (du.ghi_chu || []).slice().sort(function (a, b) { return a.ngay === b.ngay ? 0 : (a.ngay < b.ngay ? -1 : 1); }).forEach(function (g) {
    var p = pIdx[g.nguoi_id] || { ten: '?' }, a = g.ngay.split('-');
    kq.push([a[2] + '/' + a[1] + '/' + a[0], p.ten, p.ten === '?' ? '' : toCuaNguoi(p), g.ghi_chu]);
  });
  return { giaTri: kq };
}

// ====================== phần Apps Script ======================
function homNay() { var s = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-'); return { y: +s[0], m: +s[1], d: +s[2], iso: s.join('-') }; }
function layKhoa() {
  var k = PropertiesService.getScriptProperties().getProperty('KHOA');
  if (!k) throw new Error('Chưa có khóa. Chạy menu Điểm danh > Nhập khóa.');
  return k;
}
function layTo() { return PropertiesService.getScriptProperties().getProperty('TO') === 'may' ? 'may' : 'mut'; }
function tenTo(to) { return to === 'may' ? 'Tổ May' : 'Tổ Mút'; }
function dmy(i) { var a = i.split('-'); return a[2] + '/' + a[1] + '/' + a[0]; }
function docDuLieu(tuIso, denIso, to) {
  var res = UrlFetchApp.fetch(SB_URL + '/rest/v1/rpc/khsx_diem_danh_sheet_v1', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    payload: JSON.stringify({ p_khoa: layKhoa(), p_tu: tuIso, p_den: denIso })
  });
  var ma = res.getResponseCode(), tx = res.getContentText();
  if (ma !== 200) throw new Error(ma === 400 || ma === 403 || /SHEET_KEY_INVALID/.test(tx) ? 'Khóa không đúng hoặc chưa được bật trên máy chủ.' : 'Máy chủ trả lỗi ' + ma + ': ' + tx.slice(0, 200));
  return locTo(JSON.parse(tx), to);
}
function tenTab(loai, y, m) { return loai + ' T' + (m < 10 ? '0' : '') + m + '-' + y; }
function trangMoi(ss, ten) {
  var sh = ss.getSheetByName(ten);
  if (sh) {
    var f = sh.getFilter(); if (f) f.remove();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    sh.clear(); sh.clearFormats(); sh.setFrozenRows(0); sh.setFrozenColumns(0);
  } else sh = ss.insertSheet(ten);
  return sh;
}
function veTieuDe(rg) { rg.setBackground(MAU.dau).setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle'); }

// Ghi 3 tab cho một khoảng ngày. ten = {cc, th, gc}; moTa = chữ khoảng ngày; nhan = "Cập nhật ..."
function ghiBoBa(ss, tuIso, denIso, ten, moTa, nhan) {
  var to = layTo(), kh = taoKhoang(tuIso, denIso), du = docDuLieu(tuIso, denIso, to), hetIso = homNay().iso;

  // ---- Tab 1: Chấm công
  var cc = xayChamCong(du, kh, hetIso), sh1 = trangMoi(ss, ten.cc), soCot = cc.giaTri[0].length, soDong = cc.giaTri.length, c0 = cc.cotNgay0 + 1;
  sh1.getRange(1, 1).setValue(tenTo(to) + ' · ' + moTa + '  |  ' + CHU_GIAI + '  |  ' + nhan).setFontStyle('italic').setFontColor('#555555').setFontSize(9);
  sh1.getRange(2, 1, soDong, soCot).setValues(cc.giaTri);
  veTieuDe(sh1.getRange(2, 1, 2, soCot));
  for (var i = 2; i < soDong; i++) {
    var dong = 2 + i, rg = sh1.getRange(dong, 1, 1, soCot);
    rg.setBackgrounds([cc.nen[i]]);
    if (cc.loai[i] === 'dai') rg.setFontWeight('bold').setHorizontalAlignment('left');
    else if (cc.loai[i] === 'diem') {
      sh1.getRange(dong, c0, 1, cc.soNgay + 3).setHorizontalAlignment('center');
      sh1.getRange(dong, 1, 1, 2).setFontWeight('bold');
      sh1.getRange(dong, c0 + cc.soNgay, 1, 3).setFontWeight('bold');
    } else sh1.getRange(dong, 1, 1, soCot).setFontSize(8).setFontColor('#555555').setHorizontalAlignment('center');
  }
  sh1.getRange(2, 1, soDong, soCot).setBorder(null, null, null, null, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  sh1.setColumnWidth(1, 190); sh1.setColumnWidth(2, 150);
  sh1.setColumnWidths(c0, cc.soNgay, kh.nhieuThang ? 46 : 38); sh1.setColumnWidths(c0 + cc.soNgay, 3, 78);
  sh1.setFrozenRows(3); sh1.setFrozenColumns(2);

  // ---- Tab 2: Tổng hợp
  var th = xayTongHopTo(du, kh, to), sh2 = trangMoi(ss, ten.th), rong = th.bang2[0].length;
  sh2.getRange(1, 1).setValue(tenTo(to) + ' · ' + moTa + '  |  ' + nhan).setFontWeight('bold').setFontSize(11);
  sh2.getRange(2, 1, th.bang1.length, 6).setValues(th.bang1); veTieuDe(sh2.getRange(2, 1, 1, 6));
  sh2.getRange(3, 2, th.bang1.length - 1, 5).setHorizontalAlignment('center').setNumberFormat('0.##');
  sh2.getRange(2 + th.bang1.length - 1, 1, 1, 6).setFontWeight('bold').setBackground(MAU.dai_to);
  var r2 = th.bang1.length + 4;
  sh2.getRange(r2 - 1, 1).setValue('Số người đi làm mỗi ngày (kể cả người đi hỗ trợ)').setFontWeight('bold').setFontSize(11);
  sh2.getRange(r2, 1, th.bang2.length, rong).setValues(th.bang2); veTieuDe(sh2.getRange(r2, 1, 1, rong));
  sh2.getRange(r2 + 1, 3, th.bang2.length - 1, rong - 2).setHorizontalAlignment('center');
  th.chuNhat.forEach(function (cn, k) { if (cn) sh2.getRange(r2 + 1 + k, 1, 1, rong).setBackground(MAU.chu_nhat); });
  sh2.setColumnWidth(1, 150); sh2.setColumnWidths(2, rong - 1, 95);

  // ---- Tab 3: Ghi chú
  var gc = xayGhiChu(du), sh3 = trangMoi(ss, ten.gc);
  sh3.getRange(1, 1, gc.giaTri.length, 4).setValues(gc.giaTri); veTieuDe(sh3.getRange(1, 1, 1, 4));
  sh3.setColumnWidth(1, 100); sh3.setColumnWidth(2, 190); sh3.setColumnWidth(3, 200); sh3.setColumnWidth(4, 440); sh3.setFrozenRows(1);
  sh3.getRange(1, 1, gc.giaTri.length, 4).createFilter();
  return { nguoi: cc.soNguoi, ghiChu: gc.giaTri.length - 1 };
}
function nhanCapNhat() { return 'Cập nhật ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'); }
function ghiThang(y, m) {
  return ghiBoBa(SpreadsheetApp.getActiveSpreadsheet(), iso(y, m, 1), iso(y, m, soNgayThang(y, m)),
    { cc: tenTab('Chấm công', y, m), th: tenTab('Tổng hợp tổ', y, m), gc: tenTab('Ghi chú', y, m) }, 'tháng ' + m + '/' + y, nhanCapNhat());
}
function ghiThangNay() {
  var t = homNay(), r = ghiThang(t.y, t.m);
  if (t.d <= 2) { var m = t.m - 1, y = t.y; if (m < 1) { m = 12; y--; } ghiThang(y, m); } // đầu tháng: chốt lại tháng trước
  r.thang = t.m + '/' + t.y; return r;
}

// ---- Nút "Xuất lên Sheet" trong app: triển khai Ứng dụng web (Chạy với quyền: Tôi · Ai có quyền truy cập: Bất kỳ ai).
// App POST {token} -> ghi lại 3 tab tháng này ngay (cùng việc với lịch 18:00), rồi hỏi kết quả bằng GET ?action=result&token=...&callback=... (giống xuất báo cáo đóng gói).
function doPost(e) {
  var tok = '', kq;
  try {
    var b = JSON.parse(e.postData.contents);
    tok = String(b.token || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    var khoa = LockService.getScriptLock(); khoa.waitLock(30000);
    var r; try { r = ghiThangNay(); } finally { khoa.releaseLock(); }
    kq = { done: true, success: true, message: tenTo(layTo()) + ': đã cập nhật tháng ' + r.thang + ' (' + r.nguoi + ' người, ' + r.ghiChu + ' ghi chú).', url: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
  } catch (err) { kq = { done: true, success: false, message: err.message }; }
  if (tok) CacheService.getScriptCache().put('kq_' + tok, JSON.stringify(kq), 600);
  return ContentService.createTextOutput('ok');
}
function doGet(e) {
  var cb = String((e && e.parameter && e.parameter.callback) || '').replace(/[^A-Za-z0-9_]/g, '');
  var tok = String((e && e.parameter && e.parameter.token) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  var v = (tok && CacheService.getScriptCache().get('kq_' + tok)) || JSON.stringify({ done: false });
  return ContentService.createTextOutput(cb ? cb + '(' + v + ')' : v).setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function ghiNgay() {
  try { var t = homNay(), r = ghiThang(t.y, t.m); SpreadsheetApp.getActive().toast('Đã ghi ' + r.nguoi + ' người, ' + r.ghiChu + ' ghi chú.', 'Điểm danh', 6); }
  catch (e) { SpreadsheetApp.getUi().alert('Chưa ghi được: ' + e.message); }
}
function ghiThangTruoc() {
  try { var t = homNay(), m = t.m - 1, y = t.y; if (m < 1) { m = 12; y--; } var r = ghiThang(y, m); SpreadsheetApp.getActive().toast('Đã ghi tháng ' + m + '/' + y + ': ' + r.nguoi + ' người.', 'Điểm danh', 6); }
  catch (e) { SpreadsheetApp.getUi().alert('Chưa ghi được: ' + e.message); }
}
function nhapKhoa() {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt('Nhập khóa trang tính (do anh Tùng cấp)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
  PropertiesService.getScriptProperties().setProperty('KHOA', r.getResponseText().trim());
  ui.alert('Đã lưu khóa.');
}
function chonTo() {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt('Sheet này là tổ nào? Gõ: mut hoặc may (hiện tại: ' + layTo() + ')', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var v = r.getResponseText().trim().toLowerCase();
  if (v !== 'mut' && v !== 'may') { ui.alert('Chỉ nhận "mut" hoặc "may".'); return; }
  PropertiesService.getScriptProperties().setProperty('TO', v);
  ui.alert('Đã đặt: ' + tenTo(v) + '. Chạy "Ghi ngay" để vẽ lại.');
}
function caiLich() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ghiThangNay') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('ghiThangNay').timeBased().everyDays(1).atHour(18).inTimezone(TZ).create();
}
function caiDatLanDau() {
  caiLich(); ghiNgay();
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Điểm danh')
    .addItem('Ghi ngay (tháng này)', 'ghiNgay').addItem('Ghi tháng trước', 'ghiThangTruoc')
    .addSeparator().addItem('Cài đặt lần đầu (lịch 18:00)', 'caiDatLanDau').addItem('Nhập khóa', 'nhapKhoa').addItem('Chọn tổ của Sheet này', 'chonTo').addToUi();
}
