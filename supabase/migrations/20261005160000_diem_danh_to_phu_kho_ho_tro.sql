-- Điểm danh: ô Tổ của Công nhân thêm 2 lựa chọn "Phụ kho" và "Hỗ trợ" (anh Tùng chốt 05/10/2026).
alter table public.khsx_diem_danh_nguoi drop constraint if exists khsx_diem_danh_nguoi_to_lam_check;
alter table public.khsx_diem_danh_nguoi add constraint khsx_diem_danh_nguoi_to_lam_check
  check (to_lam is null or (chuc_vu = 'Công nhân' and to_lam in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói','Phụ kho','Hỗ trợ')));

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
  if v_to is not null and v_to not in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói','Phụ kho','Hỗ trợ') then
    raise exception using errcode='22023', message='ATTENDEE_TEAM_INVALID';
  end if;
  update public.khsx_diem_danh_nguoi set chuc_vu = v_cv, to_lam = v_to where id = p_id and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
end;
$function$;
