-- Điểm danh độc lập với Phát sữa (anh chốt 12/10/2026): bấm "Đã phát" chỉ ghi việc phát sữa, không khóa điểm danh.
-- Phát sữa chỉ ĐỌC điểm danh để tính số hộp; số hộp đã phát giữ nguyên như lúc bấm, sửa điểm danh sau đó không tính lại.
create or replace function public.khsx_diem_danh_ghi_v1(p_nguoi uuid, p_ngay date, p_sang boolean, p_chieu boolean) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_has_permission('diem_danh', v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if p_ngay is null or p_ngay > private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='ATTENDANCE_DATE_INVALID'; end if;
  if not exists(select 1 from public.khsx_diem_danh_nguoi where id=p_nguoi and con_dung) then
    raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND';
  end if;
  if coalesce(p_sang,false) or coalesce(p_chieu,false) then
    insert into public.khsx_diem_danh(nguoi_id,ngay,sang,chieu,sua_boi) values(p_nguoi,p_ngay,coalesce(p_sang,false),coalesce(p_chieu,false),v_actor)
    on conflict (nguoi_id,ngay) do update set sang=excluded.sang, chieu=excluded.chieu, sua_luc=pg_catalog.now(), sua_boi=excluded.sua_boi;
  else
    delete from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay;
  end if;
end;
$function$;

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
  if not exists(select 1 from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay) then
    if p_gio is null then return; end if;
    raise exception using errcode='22023', message='ATTENDANCE_OT_NEEDS_CHECKIN';
  end if;
  update public.khsx_diem_danh set tang_ca=p_gio, sua_luc=pg_catalog.now(), sua_boi=v_actor where nguoi_id=p_nguoi and ngay=p_ngay;
end;
$function$;

update public.khsx_permissions set description='Tick điểm danh sáng / chiều và báo tăng ca cho tổ, sửa ngày cũ; nhận việc nhắc điểm danh 7h mỗi ngày'
  where permission_key='diem_danh';

revoke all on function public.khsx_diem_danh_ghi_v1(uuid,date,boolean,boolean), public.khsx_diem_danh_tang_ca_v1(uuid,date,smallint) from public, anon;
grant execute on function public.khsx_diem_danh_ghi_v1(uuid,date,boolean,boolean), public.khsx_diem_danh_tang_ca_v1(uuid,date,smallint) to authenticated;
