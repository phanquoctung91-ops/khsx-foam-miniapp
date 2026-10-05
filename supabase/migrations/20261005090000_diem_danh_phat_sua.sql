-- Điểm danh + Phát sữa + việc nhắc điểm danh 7h (anh Tùng duyệt plan 05/10/2026).
-- - Quyền mới: diem_danh (tick điểm danh, sửa ngày cũ, nhận việc nhắc 7h) và phat_sua (xem bảng đếm, tick đã phát).
--   Chủ tài khoản có đủ quyền như mọi chức năng; người khác do anh cấp ở mục Phân quyền.
-- - Danh sách người điểm danh do anh nạp (thêm / xóa). Xóa là ẩn, giữ lịch sử.
-- - Mỗi người mỗi ngày hai cờ sáng / chiều. "Cả ngày" = cả hai cờ. Cả ngày = 2 hộp sữa, một buổi = 1 hộp.
-- - Phát sữa chỉ đọc dữ liệu điểm danh; đã phát thì ngày đó khóa không sửa điểm danh nữa.
-- - 7h sáng (giờ VN) mỗi ngày: mỗi tài khoản có quyền điểm danh nhận 1 việc "Điểm danh tổ dd/mm", hạn trong ngày.
--   Chỉ tạo khi quý có lịch ngày làm việc đã lưu VÀ (ngày nằm trong lịch HOẶC có đơn KHSX mang ngày đó).

insert into public.khsx_permissions(permission_key, display_name, group_name, description, sort_order) values
  ('diem_danh', 'Điểm danh', 'Nhân sự', 'Tick điểm danh sáng / chiều cho tổ, sửa ngày cũ (trừ ngày đã phát sữa); nhận việc nhắc điểm danh 7h mỗi ngày', 45),
  ('phat_sua',  'Phát sữa',  'Nhân sự', 'Xem bảng đếm số hộp sữa theo điểm danh và tick đã phát', 46)
on conflict (permission_key) do nothing;

create table if not exists public.khsx_diem_danh_nguoi(
  id uuid primary key default gen_random_uuid(),
  ten text not null check (pg_catalog.length(pg_catalog.btrim(ten)) between 1 and 100),
  con_dung boolean not null default true,
  tao_luc timestamptz not null default pg_catalog.now(),
  tao_boi uuid
);
create table if not exists public.khsx_diem_danh(
  nguoi_id uuid not null references public.khsx_diem_danh_nguoi(id),
  ngay date not null,
  sang boolean not null default false,
  chieu boolean not null default false,
  sua_luc timestamptz not null default pg_catalog.now(),
  sua_boi uuid,
  primary key (nguoi_id, ngay),
  check (sang or chieu)
);
create table if not exists public.khsx_phat_sua(
  nguoi_id uuid not null references public.khsx_diem_danh_nguoi(id),
  ngay date not null,
  so_hop integer not null check (so_hop in (1,2)),
  phat_luc timestamptz not null default pg_catalog.now(),
  phat_boi uuid,
  primary key (nguoi_id, ngay)
);
create index if not exists khsx_diem_danh_ngay on public.khsx_diem_danh(ngay);

alter table public.khsx_diem_danh_nguoi enable row level security;
alter table public.khsx_diem_danh enable row level security;
alter table public.khsx_phat_sua enable row level security;
revoke all on public.khsx_diem_danh_nguoi, public.khsx_diem_danh, public.khsx_phat_sua from anon, authenticated;
grant select on public.khsx_diem_danh_nguoi, public.khsx_diem_danh, public.khsx_phat_sua to authenticated;
drop policy if exists khsx_diem_danh_nguoi_select on public.khsx_diem_danh_nguoi;
create policy khsx_diem_danh_nguoi_select on public.khsx_diem_danh_nguoi for select to authenticated
  using ((select private.khsx_has_permission('diem_danh', (select auth.uid()))) or (select private.khsx_has_permission('phat_sua', (select auth.uid()))));
drop policy if exists khsx_diem_danh_select on public.khsx_diem_danh;
create policy khsx_diem_danh_select on public.khsx_diem_danh for select to authenticated
  using ((select private.khsx_has_permission('diem_danh', (select auth.uid()))) or (select private.khsx_has_permission('phat_sua', (select auth.uid()))));
drop policy if exists khsx_phat_sua_select on public.khsx_phat_sua;
create policy khsx_phat_sua_select on public.khsx_phat_sua for select to authenticated
  using ((select private.khsx_has_permission('diem_danh', (select auth.uid()))) or (select private.khsx_has_permission('phat_sua', (select auth.uid()))));

-- Thêm / xóa người trong danh sách: chỉ chủ tài khoản (anh nạp danh sách).
create or replace function public.khsx_diem_danh_them_nguoi_v1(p_ten text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_ten text := pg_catalog.btrim(coalesce(p_ten,'')); v_id uuid;
begin
  if v_actor is null or not private.khsx_is_permission_owner(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_LIST_FORBIDDEN';
  end if;
  if pg_catalog.length(v_ten) not between 1 and 100 then raise exception using errcode='22023', message='ATTENDEE_NAME_INVALID'; end if;
  if exists(select 1 from public.khsx_diem_danh_nguoi where con_dung and pg_catalog.lower(ten)=pg_catalog.lower(v_ten)) then
    raise exception using errcode='22023', message='ATTENDEE_EXISTS';
  end if;
  insert into public.khsx_diem_danh_nguoi(ten,tao_boi) values(v_ten,v_actor) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.khsx_diem_danh_xoa_nguoi_v1(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_is_permission_owner(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_LIST_FORBIDDEN';
  end if;
  update public.khsx_diem_danh_nguoi set con_dung=false where id=p_id and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
end;
$function$;

-- Tick điểm danh một người một ngày. Hai cờ cùng tắt = xóa dòng. Ngày đã phát sữa thì khóa.
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
  if exists(select 1 from public.khsx_phat_sua where nguoi_id=p_nguoi and ngay=p_ngay) then
    raise exception using errcode='22023', message='ATTENDANCE_LOCKED';
  end if;
  if coalesce(p_sang,false) or coalesce(p_chieu,false) then
    insert into public.khsx_diem_danh(nguoi_id,ngay,sang,chieu,sua_boi) values(p_nguoi,p_ngay,coalesce(p_sang,false),coalesce(p_chieu,false),v_actor)
    on conflict (nguoi_id,ngay) do update set sang=excluded.sang, chieu=excluded.chieu, sua_luc=pg_catalog.now(), sua_boi=excluded.sua_boi;
  else
    delete from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay;
  end if;
end;
$function$;

-- Bảng đếm sữa theo khoảng ngày: mỗi người số ngày + số hộp chưa nhận, và số hộp đã nhận trong khoảng.
create or replace function public.khsx_phat_sua_bang_v1(p_tu date, p_den date)
returns table(nguoi_id uuid, ten text, ngay_chua_nhan integer, hop_chua_nhan integer, hop_da_nhan integer)
language plpgsql stable security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_has_permission('phat_sua', v_actor) then
    raise exception using errcode='42501', message='MILK_FORBIDDEN';
  end if;
  if p_tu is null or p_den is null or p_tu > p_den or p_den - p_tu > 400 then raise exception using errcode='22023', message='MILK_RANGE_INVALID'; end if;
  return query
    select n.id, n.ten,
           (count(d.ngay) filter (where s.ngay is null))::integer,
           (coalesce(sum(case when d.sang and d.chieu then 2 else 1 end) filter (where s.ngay is null),0))::integer,
           (coalesce(sum(s.so_hop),0))::integer
    from public.khsx_diem_danh_nguoi n
    join public.khsx_diem_danh d on d.nguoi_id=n.id and d.ngay between p_tu and p_den
    left join public.khsx_phat_sua s on s.nguoi_id=d.nguoi_id and s.ngay=d.ngay
    group by n.id, n.ten
    order by pg_catalog.lower(n.ten);
end;
$function$;

-- Tick "Đã phát": mọi ngày chưa nhận của người đó trong khoảng thành đã nhận, ghi số hộp từng ngày. Trả tổng hộp.
create or replace function public.khsx_phat_sua_v1(p_nguoi uuid, p_tu date, p_den date) returns integer
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_hop integer;
begin
  if v_actor is null or not private.khsx_has_permission('phat_sua', v_actor) then
    raise exception using errcode='42501', message='MILK_FORBIDDEN';
  end if;
  if p_tu is null or p_den is null or p_tu > p_den or p_den - p_tu > 400 then raise exception using errcode='22023', message='MILK_RANGE_INVALID'; end if;
  with moi as (
    insert into public.khsx_phat_sua(nguoi_id,ngay,so_hop,phat_boi)
    select d.nguoi_id, d.ngay, case when d.sang and d.chieu then 2 else 1 end, v_actor
    from public.khsx_diem_danh d
    where d.nguoi_id=p_nguoi and d.ngay between p_tu and p_den
      and not exists(select 1 from public.khsx_phat_sua s where s.nguoi_id=d.nguoi_id and s.ngay=d.ngay)
    returning so_hop)
  select coalesce(sum(so_hop),0)::integer into v_hop from moi;
  if v_hop = 0 then raise exception using errcode='22023', message='MILK_NOTHING_TO_GIVE'; end if;
  return v_hop;
end;
$function$;

-- Việc tự động: cột đánh dấu + chống tạo trùng một người một ngày.
alter table public.khsx_tasks add column if not exists tu_dong text;
alter table public.khsx_tasks add column if not exists ngay_tu_dong date;
create unique index if not exists khsx_tasks_tu_dong_moi_ngay on public.khsx_tasks(nguoi_nhan, tu_dong, ngay_tu_dong) where tu_dong is not null;

-- 7h sáng: nhắc điểm danh. Quý chưa lưu lịch ngày làm việc thì không tạo (anh chốt 05/10/2026).
create or replace function private.khsx_tao_viec_diem_danh() returns integer
language plpgsql security definer set search_path = '' as $function$
declare v_hn date := private.khsx_hom_nay_vn(); v_lich date[]; v_u record; v_id uuid; v_n integer := 0; v_td text;
begin
  select work_dates into v_lich from public.khsx_quarter_targets
   where year = pg_catalog.date_part('year', v_hn)::integer and quarter = pg_catalog.date_part('quarter', v_hn)::integer;
  if v_lich is null or pg_catalog.cardinality(v_lich) = 0 then return 0; end if;
  if not (v_hn = any(v_lich)) and not exists(
       select 1 from public.khsx_orders o
       where o.production_date = v_hn and o.deleted_at is null and not o.is_warranty and not o.is_drop and not o.is_ghost) then
    return 0;
  end if;
  v_td := 'Điểm danh tổ ' || pg_catalog.to_char(v_hn,'DD/MM');
  for v_u in
    select distinct a.user_id from public.khsx_account_permissions a
    join public.khsx_profiles p on p.user_id = a.user_id and p.active
    where a.permission_key = 'diem_danh'
  loop
    insert into public.khsx_tasks(tieu_de,noi_dung,nguoi_giao,nguoi_nhan,trang_thai,han,nhan_luc,tu_dong,ngay_tu_dong)
    values(v_td,'Mở Nhân sự, tick điểm danh từng người rồi bấm Xong.',v_u.user_id,v_u.user_id,'dang_lam',v_hn,pg_catalog.now(),'diem_danh',v_hn)
    on conflict (nguoi_nhan,tu_dong,ngay_tu_dong) where tu_dong is not null do nothing
    returning id into v_id;
    if v_id is not null then
      perform private.khsx_xep_tin(v_id,'giao',v_u.user_id,
        '📋 '||v_td||chr(10)||'Mở app, vào Nhân sự, tick điểm danh từng người rồi bấm "Xong" ở việc này (hạn hôm nay).');
      v_n := v_n+1;
    end if;
    v_id := null;
  end loop;
  return v_n;
end;
$function$;

-- Việc tự giao cho chính mình: không báo "xong" / "trễ" cho người giao (là chính người nhận, tránh nhận hai tin).
create or replace function public.khsx_xong_viec_v1(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_t public.khsx_tasks%rowtype;
begin
  select * into v_t from public.khsx_tasks where id=p_id for update;
  if not found or v_t.nguoi_nhan is distinct from v_actor then raise exception using errcode='42501', message='TASK_NOT_YOURS'; end if;
  if v_t.trang_thai<>'dang_lam' then raise exception using errcode='22023', message='TASK_NOT_IN_PROGRESS'; end if;
  update public.khsx_tasks set trang_thai='xong', xong_luc=pg_catalog.now() where id=p_id;
  if v_t.nguoi_giao is distinct from v_t.nguoi_nhan then
    perform private.khsx_xep_tin(p_id,'xong',v_t.nguoi_giao,
      '✅ '||private.khsx_ten_nguoi(v_actor)||' đã xong việc:'||chr(10)||v_t.tieu_de||
      case when v_t.han is not null then chr(10)||'Hẹn '||pg_catalog.to_char(v_t.han,'DD/MM')||', xong '||pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI') else '' end);
  end if;
end;
$function$;

create or replace function private.khsx_nhac_viec_tre() returns integer
language plpgsql security definer set search_path = '' as $function$
declare v_t public.khsx_tasks%rowtype; v_hn date := private.khsx_hom_nay_vn(); v_n integer := 0; v_tre integer;
begin
  for v_t in select * from public.khsx_tasks where trang_thai='dang_lam' and han <= v_hn and (nhac_tre_ngay is null or nhac_tre_ngay < v_hn) for update loop
    v_tre := v_hn - v_t.han;
    perform private.khsx_xep_tin(v_t.id,'nhac',v_t.nguoi_nhan,
      '⏰ Việc tới hạn hôm nay mà chưa bấm Xong'||case when v_tre>0 then ' (trễ '||v_tre||' ngày)' else '' end||':'||chr(10)||v_t.tieu_de||chr(10)||
      'Làm xong nhớ mở app bấm "Xong".');
    if v_t.nguoi_giao is distinct from v_t.nguoi_nhan then
      perform private.khsx_xep_tin(v_t.id,'bao_tre',v_t.nguoi_giao,
        '⚠ '||private.khsx_ten_nguoi(v_t.nguoi_nhan)||' chưa xong việc hẹn '||pg_catalog.to_char(v_t.han,'DD/MM')||
        case when v_tre>0 then ' (trễ '||v_tre||' ngày)' else '' end||':'||chr(10)||v_t.tieu_de);
    end if;
    update public.khsx_tasks set nhac_tre_ngay=v_hn where id=v_t.id;
    v_n := v_n+1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.khsx_diem_danh_them_nguoi_v1(text), public.khsx_diem_danh_xoa_nguoi_v1(uuid),
  public.khsx_diem_danh_ghi_v1(uuid,date,boolean,boolean), public.khsx_phat_sua_bang_v1(date,date),
  public.khsx_phat_sua_v1(uuid,date,date) from public, anon;
grant execute on function public.khsx_diem_danh_them_nguoi_v1(text), public.khsx_diem_danh_xoa_nguoi_v1(uuid),
  public.khsx_diem_danh_ghi_v1(uuid,date,boolean,boolean), public.khsx_phat_sua_bang_v1(date,date),
  public.khsx_phat_sua_v1(uuid,date,date) to authenticated;
revoke all on function private.khsx_tao_viec_diem_danh() from public, anon, authenticated;

-- 7h sáng giờ VN = 00:00 UTC. Có pg_cron (production) thì đặt lịch; không có (môi trường thử) thì bỏ qua.
do $cron$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'khsx-viec-diem-danh';
    perform cron.schedule('khsx-viec-diem-danh', '0 0 * * *', 'select private.khsx_tao_viec_diem_danh(); select private.khsx_goi_gui_tin();');
  end if;
end;
$cron$;
