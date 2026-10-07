-- Điểm danh: ghi chú theo từng người, từng ngày (anh Tùng duyệt plan 07/10/2026).
-- - Bảng riêng (không thêm cột vào khsx_diem_danh): bảng đó chỉ có dòng khi người đó đi làm, còn ghi chú cần cả cho người nghỉ.
-- - Ghi chú tối đa 200 ký tự. Rỗng = xóa dòng. Ngày đã phát sữa vẫn sửa được (ghi chú không ảnh hưởng số hộp).
-- - Đọc: quyền diem_danh hoặc phat_sua (qua hàm bọc không tham số, authenticated không gọi được khsx_has_permission). Ghi: chỉ qua hàm, cần quyền diem_danh.

create table if not exists public.khsx_diem_danh_ghi_chu(
  nguoi_id uuid not null references public.khsx_diem_danh_nguoi(id),
  ngay date not null,
  ghi_chu text not null check (pg_catalog.length(pg_catalog.btrim(ghi_chu)) between 1 and 200),
  sua_luc timestamptz not null default pg_catalog.now(),
  sua_boi uuid,
  primary key (nguoi_id, ngay)
);
create index if not exists khsx_diem_danh_ghi_chu_ngay on public.khsx_diem_danh_ghi_chu(ngay);

alter table public.khsx_diem_danh_ghi_chu enable row level security;
revoke all on public.khsx_diem_danh_ghi_chu from anon, authenticated;
grant select on public.khsx_diem_danh_ghi_chu to authenticated;
drop policy if exists khsx_diem_danh_ghi_chu_select on public.khsx_diem_danh_ghi_chu;
create policy khsx_diem_danh_ghi_chu_select on public.khsx_diem_danh_ghi_chu for select to authenticated
  using ((select private.khsx_toi_co_quyen_diem_danh()) or (select private.khsx_toi_co_quyen_phat_sua()));

create or replace function public.khsx_diem_danh_ghi_chu_v1(p_nguoi uuid, p_ngay date, p_ghi_chu text) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_gc text := pg_catalog.btrim(coalesce(p_ghi_chu,''));
begin
  if v_actor is null or not private.khsx_has_permission('diem_danh', v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if p_ngay is null or p_ngay > private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='ATTENDANCE_DATE_INVALID'; end if;
  if pg_catalog.length(v_gc) > 200 then raise exception using errcode='22023', message='ATTENDANCE_NOTE_INVALID'; end if;
  if not exists(select 1 from public.khsx_diem_danh_nguoi where id=p_nguoi and con_dung) then
    raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND';
  end if;
  if v_gc = '' then
    delete from public.khsx_diem_danh_ghi_chu where nguoi_id=p_nguoi and ngay=p_ngay;
  else
    insert into public.khsx_diem_danh_ghi_chu(nguoi_id,ngay,ghi_chu,sua_boi) values(p_nguoi,p_ngay,v_gc,v_actor)
    on conflict (nguoi_id,ngay) do update set ghi_chu=excluded.ghi_chu, sua_luc=pg_catalog.now(), sua_boi=excluded.sua_boi;
  end if;
end;
$function$;

revoke all on function public.khsx_diem_danh_ghi_chu_v1(uuid,date,text) from public, anon;
grant execute on function public.khsx_diem_danh_ghi_chu_v1(uuid,date,text) to authenticated;
