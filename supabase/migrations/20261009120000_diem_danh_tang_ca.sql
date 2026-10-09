-- Tăng ca (OT) trong Điểm danh: 1h = 17-18h, 2h = 17-19h, 3h = 17-20h. Chọn một, chỉ báo được khi đã tick sáng/chiều.
-- Tăng ca nằm cùng dòng điểm danh nên bỏ hết tick sáng+chiều (xóa dòng) thì tăng ca mất theo. Không ảnh hưởng số hộp sữa.
alter table public.khsx_diem_danh add column if not exists tang_ca smallint;
alter table public.khsx_diem_danh drop constraint if exists khsx_diem_danh_tang_ca_check;
alter table public.khsx_diem_danh add constraint khsx_diem_danh_tang_ca_check check (tang_ca is null or tang_ca in (1,2,3));

create or replace function public.khsx_diem_danh_tang_ca_v1(p_nguoi uuid, p_ngay date, p_gio smallint) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_has_permission('diem_danh', v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if p_ngay is null or p_ngay > private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='ATTENDANCE_DATE_INVALID'; end if;
  if p_gio is not null and p_gio not in (1,2,3) then raise exception using errcode='22023', message='ATTENDANCE_OT_INVALID'; end if;
  if not exists(select 1 from public.khsx_diem_danh_nguoi where id=p_nguoi and con_dung) then
    raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND';
  end if;
  if exists(select 1 from public.khsx_phat_sua where nguoi_id=p_nguoi and ngay=p_ngay) then
    raise exception using errcode='22023', message='ATTENDANCE_LOCKED';
  end if;
  if not exists(select 1 from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay) then
    if p_gio is null then return; end if;
    raise exception using errcode='22023', message='ATTENDANCE_OT_NEEDS_CHECKIN';
  end if;
  update public.khsx_diem_danh set tang_ca=p_gio, sua_luc=pg_catalog.now(), sua_boi=v_actor where nguoi_id=p_nguoi and ngay=p_ngay;
end;
$function$;

revoke all on function public.khsx_diem_danh_tang_ca_v1(uuid,date,smallint) from public, anon;
grant execute on function public.khsx_diem_danh_tang_ca_v1(uuid,date,smallint) to authenticated;
