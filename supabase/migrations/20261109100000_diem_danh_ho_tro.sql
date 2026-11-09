-- Điểm danh: "hỗ trợ" theo buổi (anh Tùng duyệt 09/11/2026).
-- Cột sang / chieu giữ nghĩa "có mặt buổi đó" (ngày công, hộp sữa, điều kiện tăng ca không đổi).
-- ho_tro_sang / ho_tro_chieu = buổi đó đi hỗ trợ tổ khác (không làm ở tổ gốc): mỗi buổi chỉ là một trong hai, vẫn tính một buổi công.
-- Khối "Năng suất theo giờ công" trừ buổi hỗ trợ khỏi tổ gốc; dòng Toàn xưởng vẫn tính đủ.

alter table public.khsx_diem_danh add column if not exists ho_tro_sang boolean not null default false;
alter table public.khsx_diem_danh add column if not exists ho_tro_chieu boolean not null default false;
alter table public.khsx_diem_danh drop constraint if exists khsx_diem_danh_ho_tro_co_mat;
alter table public.khsx_diem_danh add constraint khsx_diem_danh_ho_tro_co_mat
  check ((not ho_tro_sang or sang) and (not ho_tro_chieu or chieu));

-- Bản cũ (trang chưa tải lại vẫn gọi): giữ cờ hỗ trợ của buổi còn có mặt, bỏ cờ của buổi vừa bỏ tick.
create or replace function public.khsx_diem_danh_ghi_v1(p_nguoi uuid, p_ngay date, p_sang boolean, p_chieu boolean) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_cv text; v_to text;
begin
  if v_actor is null or not private.khsx_dd_co_quyen_bat_ky(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if p_ngay is null or p_ngay > private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='ATTENDANCE_DATE_INVALID'; end if;
  select chuc_vu, to_lam into v_cv, v_to from public.khsx_diem_danh_nguoi where id = p_nguoi and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
  if not private.khsx_dd_duoc(private.khsx_dd_nhom(v_cv, v_to), v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if coalesce(p_sang,false) or coalesce(p_chieu,false) then
    insert into public.khsx_diem_danh(nguoi_id,ngay,sang,chieu,sua_boi) values(p_nguoi,p_ngay,coalesce(p_sang,false),coalesce(p_chieu,false),v_actor)
    on conflict (nguoi_id,ngay) do update set sang=excluded.sang, chieu=excluded.chieu,
      ho_tro_sang = public.khsx_diem_danh.ho_tro_sang and excluded.sang,
      ho_tro_chieu = public.khsx_diem_danh.ho_tro_chieu and excluded.chieu,
      sua_luc=pg_catalog.now(), sua_boi=excluded.sua_boi;
  else
    delete from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay;
  end if;
end;
$function$;

-- Bản mới: ghi cả cờ hỗ trợ. Hỗ trợ chỉ hợp lệ khi buổi đó có mặt.
create or replace function public.khsx_diem_danh_ghi_v2(p_nguoi uuid, p_ngay date, p_sang boolean, p_chieu boolean, p_ho_tro_sang boolean, p_ho_tro_chieu boolean) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_cv text; v_to text;
  v_s boolean := coalesce(p_sang,false); v_c boolean := coalesce(p_chieu,false);
  v_hs boolean := coalesce(p_ho_tro_sang,false); v_hc boolean := coalesce(p_ho_tro_chieu,false);
begin
  if v_actor is null or not private.khsx_dd_co_quyen_bat_ky(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if p_ngay is null or p_ngay > private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='ATTENDANCE_DATE_INVALID'; end if;
  if (v_hs and not v_s) or (v_hc and not v_c) then raise exception using errcode='22023', message='ATTENDANCE_SUPPORT_NEEDS_PRESENT'; end if;
  select chuc_vu, to_lam into v_cv, v_to from public.khsx_diem_danh_nguoi where id = p_nguoi and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
  if not private.khsx_dd_duoc(private.khsx_dd_nhom(v_cv, v_to), v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if v_s or v_c then
    insert into public.khsx_diem_danh(nguoi_id,ngay,sang,chieu,ho_tro_sang,ho_tro_chieu,sua_boi) values(p_nguoi,p_ngay,v_s,v_c,v_hs,v_hc,v_actor)
    on conflict (nguoi_id,ngay) do update set sang=excluded.sang, chieu=excluded.chieu, ho_tro_sang=excluded.ho_tro_sang, ho_tro_chieu=excluded.ho_tro_chieu,
      sua_luc=pg_catalog.now(), sua_boi=excluded.sua_boi;
  else
    delete from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay;
  end if;
end;
$function$;
revoke all on function public.khsx_diem_danh_ghi_v2(uuid, date, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.khsx_diem_danh_ghi_v2(uuid, date, boolean, boolean, boolean, boolean) to authenticated;

-- Giờ công theo tổ: thêm số buổi hỗ trợ để mini-app tách khỏi tổ gốc. sang/chieu/nguoi/tang_ca giữ nguyên nghĩa (gồm cả buổi hỗ trợ)
-- nên dòng Toàn xưởng và trang chưa tải lại vẫn đúng.
--   ht_sang, ht_chieu : số người hỗ trợ buổi sáng / chiều
--   nguoi_ht          : số người hỗ trợ trọn ngày (mọi buổi có mặt đều hỗ trợ): không tính là người của tổ gốc
--   tang_ca_ht        : giờ tăng ca của những người hỗ trợ trọn ngày (tách khỏi tổ gốc)
create or replace function public.khsx_gio_cong_theo_to_v1(p_tu date, p_den date)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'ngay', t.ngay, 'nhom', t.nhom, 'nguoi', t.nguoi, 'sang', t.sang, 'chieu', t.chieu, 'tang_ca', t.tang_ca,
      'ht_sang', t.ht_sang, 'ht_chieu', t.ht_chieu, 'nguoi_ht', t.nguoi_ht, 'tang_ca_ht', t.tang_ca_ht
    ) order by t.ngay, t.nhom), '[]'::jsonb)
  from (
    select d.ngay,
      case when n.to_lam in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ may','Tổ đóng gói') then n.to_lam else 'Ngoài 6 tổ' end as nhom,
      count(*)::int as nguoi,
      (count(*) filter (where d.sang))::int as sang,
      (count(*) filter (where d.chieu))::int as chieu,
      coalesce(sum(d.tang_ca), 0)::int as tang_ca,
      (count(*) filter (where d.ho_tro_sang))::int as ht_sang,
      (count(*) filter (where d.ho_tro_chieu))::int as ht_chieu,
      (count(*) filter (where (d.sang or d.chieu) and (not d.sang or d.ho_tro_sang) and (not d.chieu or d.ho_tro_chieu)))::int as nguoi_ht,
      coalesce(sum(d.tang_ca) filter (where (d.sang or d.chieu) and (not d.sang or d.ho_tro_sang) and (not d.chieu or d.ho_tro_chieu)), 0)::int as tang_ca_ht
    from public.khsx_diem_danh d
    join public.khsx_diem_danh_nguoi n on n.id = d.nguoi_id
    where p_tu is not null and p_den is not null
      and d.ngay between greatest(p_tu, p_den - 400) and least(p_den, (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh')::date)
    group by d.ngay, 2
  ) t;
$$;
revoke all on function public.khsx_gio_cong_theo_to_v1(date, date) from public;
grant execute on function public.khsx_gio_cong_theo_to_v1(date, date) to anon, authenticated;
