-- Điểm danh: chức vụ + tổ (anh Tùng duyệt plan 05/10/2026).
-- - chuc_vu: Trưởng Nhóm / Tổ trưởng sản xuất / Thủ kho / Công nhân. Để trống được.
-- - to_lam: chỉ đi với Công nhân (Tổ dán 1-5, Tổ may, Tổ đóng gói). Đổi sang chức vụ khác thì tổ tự xóa.
-- - Chỉ chủ tài khoản đặt chức vụ / tổ. Chỉ hiển thị, không ảnh hưởng cách đếm sữa.

alter table public.khsx_diem_danh_nguoi add column if not exists chuc_vu text;
alter table public.khsx_diem_danh_nguoi add column if not exists to_lam text;
alter table public.khsx_diem_danh_nguoi drop constraint if exists khsx_diem_danh_nguoi_chuc_vu_check;
alter table public.khsx_diem_danh_nguoi add constraint khsx_diem_danh_nguoi_chuc_vu_check
  check (chuc_vu is null or chuc_vu in ('Trưởng Nhóm','Tổ trưởng sản xuất','Thủ kho','Công nhân'));
alter table public.khsx_diem_danh_nguoi drop constraint if exists khsx_diem_danh_nguoi_to_lam_check;
alter table public.khsx_diem_danh_nguoi add constraint khsx_diem_danh_nguoi_to_lam_check
  check (to_lam is null or (chuc_vu = 'Công nhân' and to_lam in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói')));

create or replace function public.khsx_diem_danh_dat_chuc_vu_v1(p_id uuid, p_chuc_vu text, p_to text) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_cv text := nullif(pg_catalog.btrim(coalesce(p_chuc_vu,'')),''); v_to text := nullif(pg_catalog.btrim(coalesce(p_to,'')),'');
begin
  if v_actor is null or not private.khsx_is_permission_owner(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_LIST_FORBIDDEN';
  end if;
  if v_cv is not null and v_cv not in ('Trưởng Nhóm','Tổ trưởng sản xuất','Thủ kho','Công nhân') then
    raise exception using errcode='22023', message='ATTENDEE_ROLE_INVALID';
  end if;
  if v_cv is distinct from 'Công nhân' then v_to := null; end if;
  if v_to is not null and v_to not in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói') then
    raise exception using errcode='22023', message='ATTENDEE_TEAM_INVALID';
  end if;
  update public.khsx_diem_danh_nguoi set chuc_vu = v_cv, to_lam = v_to where id = p_id and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
end;
$function$;

-- Bảng đếm sữa trả thêm chức vụ và tổ (đổi kiểu trả về nên phải tạo lại hàm).
drop function if exists public.khsx_phat_sua_bang_v1(date, date);
create function public.khsx_phat_sua_bang_v1(p_tu date, p_den date)
returns table(nguoi_id uuid, ten text, chuc_vu text, to_lam text, ngay_chua_nhan integer, hop_chua_nhan integer, hop_da_nhan integer)
language plpgsql stable security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_has_permission('phat_sua', v_actor) then
    raise exception using errcode='42501', message='MILK_FORBIDDEN';
  end if;
  if p_tu is null or p_den is null or p_tu > p_den or p_den - p_tu > 400 then raise exception using errcode='22023', message='MILK_RANGE_INVALID'; end if;
  return query
    select n.id, n.ten, n.chuc_vu, n.to_lam,
           (count(d.ngay) filter (where s.ngay is null))::integer,
           (coalesce(sum(case when d.sang and d.chieu then 2 else 1 end) filter (where s.ngay is null),0))::integer,
           (coalesce(sum(s.so_hop),0))::integer
    from public.khsx_diem_danh_nguoi n
    join public.khsx_diem_danh d on d.nguoi_id=n.id and d.ngay between p_tu and p_den
    left join public.khsx_phat_sua s on s.nguoi_id=d.nguoi_id and s.ngay=d.ngay
    group by n.id, n.ten, n.chuc_vu, n.to_lam
    order by pg_catalog.lower(n.ten);
end;
$function$;

revoke all on function public.khsx_diem_danh_dat_chuc_vu_v1(uuid,text,text), public.khsx_phat_sua_bang_v1(date,date) from public, anon;
grant execute on function public.khsx_diem_danh_dat_chuc_vu_v1(uuid,text,text), public.khsx_phat_sua_bang_v1(date,date) to authenticated;
