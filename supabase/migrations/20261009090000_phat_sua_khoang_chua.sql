-- Phát sữa: nút "Ngày chưa phát" tự đặt khoảng ngày (anh Tùng chốt 09/10/2026):
--   Từ ngày = ngày điểm danh đầu tiên còn chưa phát sữa, Đến ngày = ngày điểm danh mới nhất. Không có ngày nào chưa phát thì tu = null.
create or replace function public.khsx_phat_sua_chua_v1() returns table(tu date, den date)
language plpgsql stable security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_has_permission('phat_sua', v_actor) then
    raise exception using errcode='42501', message='MILK_FORBIDDEN';
  end if;
  return query
    select (select pg_catalog.min(d.ngay) from public.khsx_diem_danh d
            where not exists(select 1 from public.khsx_phat_sua s where s.nguoi_id = d.nguoi_id and s.ngay = d.ngay)),
           (select pg_catalog.max(d.ngay) from public.khsx_diem_danh d);
end;
$function$;
revoke all on function public.khsx_phat_sua_chua_v1() from public, anon;
grant execute on function public.khsx_phat_sua_chua_v1() to authenticated;
