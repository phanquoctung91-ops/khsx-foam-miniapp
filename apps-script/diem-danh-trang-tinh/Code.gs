/**
 * Điểm danh -> Trang tính theo dõi (anh Tùng yêu cầu 11/11/2026).
 * Cài vào Google Sheet: Tiện ích mở rộng > Apps Script, dán file này (và appsscript.json), rồi chạy menu "Điểm danh" > "Cài đặt lần đầu".
 * Dữ liệu đọc từ Supabase bằng hàm khsx_diem_danh_sheet_v1, khóa bí mật nằm trong Script Properties (KHOA), không nằm trong mã.
 * Mỗi lần ghi tạo lại 3 tab của tháng: "Chấm công Tmm-yyyy", "Tổng hợp tổ Tmm-yyyy", "Ghi chú Tmm-yyyy". Tab các tháng khác giữ nguyên.
 */
var SB_URL = 'https://tydevlvcyvqwghinboif.supabase.co';
var SB_KEY = 'sb_publishable_Vy74jABl_0L-VGIKWAP1zw_YN1OZ4C2'; // khóa công khai của mini-app (không phải bí mật)
var TZ = 'Asia/Ho_Chi_Minh';
var GIO_SANG = 4.25, GIO_CHIEU = 3.75;
var SAU_TO = ['Tổ dán 1', 'Tổ dán 2', 'Tổ dán 3', 'Tổ dán 4', 'Tổ may', 'Tổ đóng gói'];
var NGOAI = 'Ngoài 6 tổ';
var MAU = { to: '#d9ead3', ho_tro: '#fff2cc', chu_nhat: '#eeeeee', dau: '#1f3864', tieu_de_tong: '#d9e2f3', vang: '#f4cccc' };
var THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ====================== phần tính (thuần, kiểm bằng node) ======================
function toCuaNguoi(p) { return p.chuc_vu === 'Công nhân' ? (p.to_lam || '') : (p.chuc_vu || ''); }
function nhomGio(p) { return SAU_TO.indexOf(p.to_lam) >= 0 ? p.to_lam : NGOAI; }
function soNgayThang(y, m) { return new Date(y, m, 0).getDate(); }
function iso(y, m, d) { return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
function thuCua(y, m, d) { return new Date(y, m - 1, d).getDay(); }

// buổi: sang/chieu = có mặt; ho_tro_* = buổi đó đi hỗ trợ (không làm ở tổ gốc)
function nhanBuoi(r) {
  if (!r || (!r.sang && !r.chieu)) return '';
  var s = r.sang ? (r.ho_tro_sang ? 'Hỗ trợ sáng' : 'Sáng') : '';
  var c = r.chieu ? (r.ho_tro_chieu ? 'Hỗ trợ chiều' : 'Chiều') : '';
  var nhan;
  if (r.sang && r.chieu && !r.ho_tro_sang && !r.ho_tro_chieu) nhan = 'Cả ngày';
  else if (r.sang && r.chieu && r.ho_tro_sang && r.ho_tro_chieu) nhan = 'Hỗ trợ cả ngày';
  else nhan = [s, c].filter(Boolean).join(' + ');
  return nhan + (r.tang_ca ? ' +TC ' + r.tang_ca + 'h' : '');
}
function coHoTro(r) { return !!(r && ((r.sang && r.ho_tro_sang) || (r.chieu && r.ho_tro_chieu))); }
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
function hopNguoiNgay(r) { return (r.sang ? 1 : 0) + (r.chieu ? 1 : 0); }

function chiMuc(du) {
  var diem = {}, phat = {}, ghi = {};
  (du.diem_danh || []).forEach(function (r) { (diem[r.nguoi_id] = diem[r.nguoi_id] || {})[r.ngay] = r; });
  (du.phat_sua || []).forEach(function (r) { (phat[r.nguoi_id] = phat[r.nguoi_id] || {})[r.ngay] = true; });
  (du.ghi_chu || []).forEach(function (r) { (ghi[r.nguoi_id] = ghi[r.nguoi_id] || {})[r.ngay] = r.ghi_chu; });
  return { diem: diem, phat: phat, ghi: ghi };
}
function sapNguoi(a, b) {
  var x = toCuaNguoi(a), y = toCuaNguoi(b);
  return x === y ? String(a.ten).localeCompare(String(b.ten), 'vi') : String(x).localeCompare(String(y), 'vi');
}

// Tab 1: mỗi người một dòng, mỗi ngày một cột.
function xayChamCong(du, y, m) {
  var ix = chiMuc(du), n = soNgayThang(y, m), cot0 = 3;
  var nguoi = (du.nguoi || []).filter(function (p) {
    var co = false; for (var d = 1; d <= n; d++) if ((ix.diem[p.id] || {})[iso(y, m, d)]) { co = true; break; }
    return p.con_dung || co;
  }).sort(sapNguoi);
  var dau1 = ['Tên', 'Chức vụ', 'Tổ'], dau2 = ['', '', ''];
  for (var d = 1; d <= n; d++) { dau1.push(d); dau2.push(THU[thuCua(y, m, d)]); }
  ['Ngày công', 'Giờ ở tổ', 'Giờ hỗ trợ', 'Giờ tăng ca', 'Hộp đã phát', 'Hộp chưa phát'].forEach(function (t) { dau1.push(t); dau2.push(''); });
  var giaTri = [dau1, dau2], nen = [], ngayCoDiem = {};
  nguoi.forEach(function (p) { for (var d = 1; d <= n; d++) if ((ix.diem[p.id] || {})[iso(y, m, d)]) ngayCoDiem[d] = true; });
  nguoi.forEach(function (p) {
    var dong = [p.ten, p.chuc_vu || '', toCuaNguoi(p)], mau = ['', '', ''], cong = 0, gTo = 0, gHt = 0, tc = 0, hop = 0, daPhat = 0;
    for (var d = 1; d <= n; d++) {
      var k = iso(y, m, d), r = (ix.diem[p.id] || {})[k], cn = thuCua(y, m, d) === 0;
      dong.push(nhanBuoi(r));
      if (r && (r.sang || r.chieu)) {
        mau.push(coHoTro(r) ? MAU.ho_tro : MAU.to);
        cong += congNguoiNgay(r); var g = gioNguoiNgay(r); gTo += g.to; gHt += g.hoTro; tc += Number(r.tang_ca) || 0;
        hop += hopNguoiNgay(r); if ((ix.phat[p.id] || {})[k]) daPhat += hopNguoiNgay(r);
      } else mau.push(cn ? MAU.chu_nhat : (ngayCoDiem[d] && p.con_dung ? MAU.vang : ''));
    }
    dong.push(cong, gTo, gHt, tc, daPhat, hop - daPhat);
    for (var i = 0; i < 6; i++) mau.push('');
    giaTri.push(dong); nen.push(mau);
  });
  return { giaTri: giaTri, nen: nen, soNguoi: nguoi.length, cot0: cot0, soNgay: n };
}

// Tab 2: mỗi ngày một dòng; mỗi nhóm 3 cột (người ở tổ, giờ ở tổ, giờ hỗ trợ tách ra).
function xayTongHopTo(du, y, m) {
  var n = soNgayThang(y, m), nhom = SAU_TO.concat([NGOAI]), pIdx = {};
  (du.nguoi || []).forEach(function (p) { pIdx[p.id] = p; });
  var dau1 = ['Ngày', 'Thứ'], dau2 = ['', ''];
  nhom.forEach(function (g) { dau1.push(g, '', ''); dau2.push('Người ở tổ', 'Giờ ở tổ', 'Giờ hỗ trợ'); });
  dau1.push('Cả xưởng', '', ''); dau2.push('Người', 'Giờ công', 'Giờ hỗ trợ');
  var kq = [dau1, dau2], tongThang = {};
  for (var d = 1; d <= n; d++) {
    var k = iso(y, m, d), t = {};
    nhom.forEach(function (g) { t[g] = { nguoi: 0, gTo: 0, gHt: 0 }; });
    var xuong = { nguoi: 0, gio: 0, ht: 0 };
    (du.diem_danh || []).forEach(function (r) {
      if (r.ngay !== k || !(r.sang || r.chieu)) return;
      var p = pIdx[r.nguoi_id]; if (!p) return;
      var g = nhomGio(p), gi = gioNguoiNgay(r);
      if (!hoTroTronNgay(r)) t[g].nguoi += 1;
      t[g].gTo += gi.to; t[g].gHt += gi.hoTro;
      xuong.nguoi += 1; xuong.gio += gi.to + gi.hoTro; xuong.ht += gi.hoTro;
    });
    var dong = [d, THU[thuCua(y, m, d)]], co = xuong.nguoi > 0;
    nhom.forEach(function (g) {
      dong.push(co ? t[g].nguoi : '', co ? t[g].gTo : '', co ? t[g].gHt : '');
      var a = tongThang[g] = tongThang[g] || { ng: 0, gTo: 0, gHt: 0 }; a.ng += t[g].nguoi; a.gTo += t[g].gTo; a.gHt += t[g].gHt;
    });
    dong.push(co ? xuong.nguoi : '', co ? xuong.gio : '', co ? xuong.ht : '');
    var tx = tongThang['__xuong'] = tongThang['__xuong'] || { ng: 0, gTo: 0, gHt: 0 }; tx.ng += xuong.nguoi; tx.gTo += xuong.gio; tx.gHt += xuong.ht;
    kq.push(dong);
  }
  var tong = ['Cộng tháng', ''];
  nhom.forEach(function (g) { var a = tongThang[g]; tong.push(a.ng, a.gTo, a.gHt); });
  var x = tongThang['__xuong']; tong.push(x.ng, x.gTo, x.gHt);
  kq.push(tong);
  return { giaTri: kq, soNgay: n, soNhom: nhom.length };
}

// Tab 3: ghi chú điểm danh
function xayGhiChu(du, y, m) {
  var pIdx = {}; (du.nguoi || []).forEach(function (p) { pIdx[p.id] = p; });
  var kq = [['Ngày', 'Tên', 'Tổ', 'Ghi chú']];
  (du.ghi_chu || []).slice().sort(function (a, b) { return a.ngay === b.ngay ? 0 : (a.ngay < b.ngay ? -1 : 1); }).forEach(function (g) {
    var p = pIdx[g.nguoi_id] || { ten: '?' }, a = g.ngay.split('-');
    kq.push([a[2] + '/' + a[1] + '/' + a[0], p.ten, p.ten === '?' ? '' : toCuaNguoi(p), g.ghi_chu]);
  });
  return { giaTri: kq };
}

// ====================== phần Apps Script ======================
function homNay() { var s = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-'); return { y: +s[0], m: +s[1], d: +s[2] }; }
function layKhoa() {
  var k = PropertiesService.getScriptProperties().getProperty('KHOA');
  if (!k) throw new Error('Chưa có khóa. Chạy menu Điểm danh > Nhập khóa.');
  return k;
}
function docDuLieu(y, m) {
  var n = soNgayThang(y, m);
  var res = UrlFetchApp.fetch(SB_URL + '/rest/v1/rpc/khsx_diem_danh_sheet_v1', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    payload: JSON.stringify({ p_khoa: layKhoa(), p_tu: iso(y, m, 1), p_den: iso(y, m, n) })
  });
  var ma = res.getResponseCode(), tx = res.getContentText();
  if (ma !== 200) throw new Error(ma === 400 || ma === 403 || /SHEET_KEY_INVALID/.test(tx) ? 'Khóa không đúng hoặc chưa được bật trên máy chủ.' : 'Máy chủ trả lỗi ' + ma + ': ' + tx.slice(0, 200));
  return JSON.parse(tx);
}
function tenTab(loai, y, m) { return loai + ' T' + (m < 10 ? '0' : '') + m + '-' + y; }
function trangMoi(ss, ten) {
  var sh = ss.getSheetByName(ten);
  if (sh) { sh.clear(); sh.clearFormats(); sh.setFrozenRows(0); sh.setFrozenColumns(0); } else sh = ss.insertSheet(ten);
  return sh;
}
function veTieuDe(sh, soDong, soCot) {
  sh.getRange(1, 1, soDong, soCot).setBackground(MAU.dau).setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
}
function ghiThang(y, m) {
  var du = docDuLieu(y, m), ss = SpreadsheetApp.getActiveSpreadsheet();
  var cc = xayChamCong(du, y, m), sh1 = trangMoi(ss, tenTab('Chấm công', y, m)), soCot = cc.giaTri[0].length, soDong = cc.giaTri.length;
  sh1.getRange(1, 1, soDong, soCot).setValues(cc.giaTri);
  veTieuDe(sh1, 2, soCot);
  if (cc.nen.length) {
    sh1.getRange(3, 1, cc.nen.length, soCot).setBackgrounds(cc.nen);
    sh1.getRange(3, 4, cc.nen.length, cc.soNgay).setHorizontalAlignment('center').setFontSize(9).setWrap(true);
    sh1.getRange(3, 4 + cc.soNgay, cc.nen.length, 6).setHorizontalAlignment('center').setFontWeight('bold').setBackground(MAU.tieu_de_tong);
  }
  sh1.setColumnWidth(1, 180); sh1.setColumnWidth(2, 130); sh1.setColumnWidth(3, 100);
  sh1.setColumnWidths(4, cc.soNgay, 78); sh1.setColumnWidths(4 + cc.soNgay, 6, 80);
  sh1.setFrozenRows(2); sh1.setFrozenColumns(3);
  sh1.getRange(soDong + 2, 1).setValue('Xanh: làm ở tổ · Vàng: có buổi đi hỗ trợ · Đỏ nhạt: vắng (ngày đã có người điểm danh) · Xám: Chủ nhật. Cập nhật: ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm')).setFontStyle('italic').setFontColor('#666666');

  var th = xayTongHopTo(du, y, m), sh2 = trangMoi(ss, tenTab('Tổng hợp tổ', y, m)), c2 = th.giaTri[0].length;
  sh2.getRange(1, 1, th.giaTri.length, c2).setValues(th.giaTri);
  veTieuDe(sh2, 2, c2);
  for (var i = 0; i <= th.soNhom; i++) sh2.getRange(1, 3 + i * 3, 1, 3).merge();
  sh2.getRange(th.giaTri.length, 1, 1, c2).setFontWeight('bold').setBackground(MAU.tieu_de_tong);
  sh2.getRange(3, 3, th.giaTri.length - 2, c2 - 2).setHorizontalAlignment('center').setNumberFormat('0.##');
  for (var d = 1; d <= th.soNgay; d++) if (thuCua(y, m, d) === 0) sh2.getRange(2 + d, 1, 1, c2).setBackground(MAU.chu_nhat);
  sh2.setFrozenRows(2); sh2.setFrozenColumns(2); sh2.setColumnWidths(3, c2 - 2, 74);

  var gc = xayGhiChu(du, y, m), sh3 = trangMoi(ss, tenTab('Ghi chú', y, m));
  sh3.getRange(1, 1, gc.giaTri.length, 4).setValues(gc.giaTri); veTieuDe(sh3, 1, 4);
  sh3.setColumnWidth(1, 100); sh3.setColumnWidth(2, 180); sh3.setColumnWidth(3, 110); sh3.setColumnWidth(4, 420); sh3.setFrozenRows(1);
  return { nguoi: cc.soNguoi, ghiChu: gc.giaTri.length - 1 };
}
function ghiThangNay() {
  var t = homNay();
  ghiThang(t.y, t.m);
  if (t.d <= 2) { var m = t.m - 1, y = t.y; if (m < 1) { m = 12; y--; } ghiThang(y, m); } // đầu tháng: chốt lại tháng trước
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
    .addSeparator().addItem('Cài đặt lần đầu (lịch 18:00)', 'caiDatLanDau').addItem('Nhập khóa', 'nhapKhoa').addToUi();
}
