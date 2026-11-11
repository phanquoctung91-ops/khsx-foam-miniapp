-- Đọc điểm danh cho trang tính Google Sheet theo dõi (anh Tùng yêu cầu 11/11/2026).
-- Apps Script của anh gọi hàm này bằng khóa bí mật (lưu trong Script Properties của trang tính). Máy chủ chỉ giữ mã băm SHA-256 của khóa
-- trong private.khsx_sheet_khoa (đặt lúc cài, KHÔNG nằm trong migration). Khóa sai hoặc chưa đặt thì không trả gì.
-- Chỉ đọc. Có tên người nên không mở cho khách xem như các hàm giờ công.
create table if not exists private.khsx_sheet_khoa (ten text primary key, hash text not null, dat_luc timestamptz not null default now());
revoke all on private.khsx_sheet_khoa from public, anon, authenticated;

create or replace function public.khsx_diem_danh_sheet_v1(p_khoa text, p_tu date, p_den date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare v_hash text; v_kq jsonb;
begin
  select hash into v_hash from private.khsx_sheet_khoa where ten = 'diem_danh';
  if v_hash is null or p_khoa is null or pg_catalog.length(p_khoa) < 16
     or pg_catalog.encode(extensions.digest(p_khoa, 'sha256'), 'hex') <> v_hash then
    raise exception using errcode = '42501', message = 'SHEET_KEY_INVALID';
  end if;
  if p_tu is null or p_den is null or p_tu > p_den or p_den - p_tu > 400 then
    raise exception using errcode = '22023', message = 'SHEET_RANGE_INVALID';
  end if;
  select pg_catalog.jsonb_build_object(
    'nguoi', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', n.id, 'ten', n.ten, 'chuc_vu', n.chuc_vu, 'to_lam', n.to_lam, 'con_dung', n.con_dung, 'an_tu_ngay', n.an_tu_ngay) order by n.ten) from public.khsx_diem_danh_nguoi n), '[]'::jsonb),
    'diem_danh', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('nguoi_id', d.nguoi_id, 'ngay', d.ngay, 'sang', d.sang, 'chieu', d.chieu, 'tang_ca', d.tang_ca, 'ho_tro_sang', d.ho_tro_sang, 'ho_tro_chieu', d.ho_tro_chieu) order by d.ngay, d.nguoi_id) from public.khsx_diem_danh d where d.ngay between p_tu and p_den), '[]'::jsonb),
    'ghi_chu', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('nguoi_id', g.nguoi_id, 'ngay', g.ngay, 'ghi_chu', g.ghi_chu) order by g.ngay, g.nguoi_id) from public.khsx_diem_danh_ghi_chu g where g.ngay between p_tu and p_den), '[]'::jsonb),
    'phat_sua', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('nguoi_id', s.nguoi_id, 'ngay', s.ngay, 'so_hop', s.so_hop) order by s.ngay, s.nguoi_id) from public.khsx_phat_sua s where s.ngay between p_tu and p_den), '[]'::jsonb)
  ) into v_kq;
  return v_kq;
end;
$$;
revoke all on function public.khsx_diem_danh_sheet_v1(text, date, date) from public;
grant execute on function public.khsx_diem_danh_sheet_v1(text, date, date) to anon, authenticated;
