-- Phát sữa: bấm "Đã phát" là ghi luôn (bỏ hộp xác nhận) + nút Hoàn tác cho chủ tài khoản (anh Tùng duyệt 08/10/2026).
-- - Mỗi lần bấm Đã phát gắn một mã lô (lo) cho các ngày vừa ghi; hàm mới khsx_phat_sua_v2 trả {hop, lo}.
-- - Hoàn tác gỡ đúng các ngày của lô đó (không đụng lô khác); các ngày đó mở khóa điểm danh lại. Chỉ chủ tài khoản được hoàn tác.
-- - Hàm cũ khsx_phat_sua_v1 giữ nguyên (app chưa tải lại vẫn chạy).

alter table public.khsx_phat_sua add column if not exists lo uuid;
create index if not exists khsx_phat_sua_lo on public.khsx_phat_sua(lo) where lo is not null;

create or replace function public.khsx_phat_sua_v2(p_nguoi uuid, p_tu date, p_den date) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_hop integer; v_lo uuid := pg_catalog.gen_random_uuid();
begin
  if v_actor is null or not private.khsx_has_permission('phat_sua', v_actor) then
    raise exception using errcode='42501', message='MILK_FORBIDDEN';
  end if;
  if p_tu is null or p_den is null or p_tu > p_den or p_den - p_tu > 400 then raise exception using errcode='22023', message='MILK_RANGE_INVALID'; end if;
  with moi as (
    insert into public.khsx_phat_sua(nguoi_id,ngay,so_hop,phat_boi,lo)
    select d.nguoi_id, d.ngay, case when d.sang and d.chieu then 2 else 1 end, v_actor, v_lo
    from public.khsx_diem_danh d
    where d.nguoi_id=p_nguoi and d.ngay between p_tu and p_den
      and not exists(select 1 from public.khsx_phat_sua s where s.nguoi_id=d.nguoi_id and s.ngay=d.ngay)
    returning so_hop)
  select coalesce(sum(so_hop),0)::integer into v_hop from moi;
  if v_hop = 0 then raise exception using errcode='22023', message='MILK_NOTHING_TO_GIVE'; end if;
  return pg_catalog.jsonb_build_object('hop', v_hop, 'lo', v_lo);
end;
$function$;

create or replace function public.khsx_phat_sua_hoan_tac_v1(p_lo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_hop integer; v_ngay integer;
begin
  if v_actor is null or not private.khsx_is_permission_owner(v_actor) then
    raise exception using errcode='42501', message='MILK_UNDO_FORBIDDEN';
  end if;
  with xoa as (delete from public.khsx_phat_sua where lo = p_lo and p_lo is not null returning so_hop)
  select coalesce(sum(so_hop),0)::integer, count(*)::integer into v_hop, v_ngay from xoa;
  if v_ngay = 0 then raise exception using errcode='22023', message='MILK_UNDO_NOTHING'; end if;
  return pg_catalog.jsonb_build_object('hop', v_hop, 'ngay', v_ngay);
end;
$function$;

revoke all on function public.khsx_phat_sua_v2(uuid,date,date), public.khsx_phat_sua_hoan_tac_v1(uuid) from public, anon;
grant execute on function public.khsx_phat_sua_v2(uuid,date,date), public.khsx_phat_sua_hoan_tac_v1(uuid) to authenticated;
