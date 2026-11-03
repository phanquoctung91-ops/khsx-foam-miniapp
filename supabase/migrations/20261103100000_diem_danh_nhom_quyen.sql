-- Điểm danh chia 4 nhóm + quyền theo nhóm (anh Tùng duyệt 03/11/2026).
-- Nhóm xếp TỰ ĐỘNG theo chức vụ / tổ, không gán sẵn từng người (khôi phục hay thêm người mới thì vào nhóm theo tổ của họ):
--   quan_ly : Trưởng Nhóm, Tổ trưởng sản xuất, Thủ kho
--   kho     : Công nhân tổ Phụ kho
--   mut     : Công nhân Tổ dán 1-5, Tổ may (mút), Tổ đóng gói, Hỗ trợ
--   may     : Tổ trưởng may + Công nhân tổ May mẫu & cắt hàng / May áo niệm / May áo gối   (Tổ May, khác "Tổ may" của mút)
--   chua    : chưa chọn chức vụ / tổ
-- Quyền: diem_danh_mut, diem_danh_kho, diem_danh_may (thay quyền chung diem_danh). Nhóm quản lý và "chưa phân nhóm" chỉ chủ tài khoản tick.
-- Máy chủ kiểm quyền theo nhóm của người được tick (lưu, tăng ca, ghi chú) và chỉ trả danh sách đúng nhóm được phép xem.

alter table public.khsx_diem_danh_nguoi add column if not exists viec_lam text;
alter table public.khsx_diem_danh_nguoi drop constraint if exists khsx_diem_danh_nguoi_viec_lam_check;
alter table public.khsx_diem_danh_nguoi add constraint khsx_diem_danh_nguoi_viec_lam_check
  check (viec_lam is null or pg_catalog.length(viec_lam) <= 100);

alter table public.khsx_diem_danh_nguoi drop constraint if exists khsx_diem_danh_nguoi_chuc_vu_check;
alter table public.khsx_diem_danh_nguoi add constraint khsx_diem_danh_nguoi_chuc_vu_check
  check (chuc_vu is null or chuc_vu in ('Trưởng Nhóm','Tổ trưởng sản xuất','Tổ trưởng may','Thủ kho','Công nhân'));
alter table public.khsx_diem_danh_nguoi drop constraint if exists khsx_diem_danh_nguoi_to_lam_check;
alter table public.khsx_diem_danh_nguoi add constraint khsx_diem_danh_nguoi_to_lam_check
  check (to_lam is null or (chuc_vu = 'Công nhân' and to_lam in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói','Phụ kho','Hỗ trợ','May mẫu & cắt hàng','May áo niệm','May áo gối')));

-- ===== Xếp nhóm + kiểm quyền =====
create or replace function private.khsx_dd_nhom(p_chuc_vu text, p_to text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_chuc_vu in ('Trưởng Nhóm','Tổ trưởng sản xuất','Thủ kho') then 'quan_ly'
    when p_chuc_vu = 'Tổ trưởng may' then 'may'
    when p_chuc_vu = 'Công nhân' and p_to = 'Phụ kho' then 'kho'
    when p_chuc_vu = 'Công nhân' and p_to in ('May mẫu & cắt hàng','May áo niệm','May áo gối') then 'may'
    when p_chuc_vu = 'Công nhân' and p_to in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói','Hỗ trợ') then 'mut'
    else 'chua' end
$$;

create or replace function private.khsx_dd_duoc(p_nhom text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.khsx_is_permission_owner(p_user)
      or (p_nhom in ('mut','kho','may') and private.khsx_has_permission('diem_danh_' || p_nhom, p_user))
$$;

create or replace function private.khsx_dd_co_quyen_bat_ky(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.khsx_is_permission_owner(p_user)
      or exists(select 1 from public.khsx_account_permissions
                where user_id = p_user and permission_key in ('diem_danh_mut','diem_danh_kho','diem_danh_may'))
$$;

-- Xem được người này không: có quyền điểm danh đúng nhóm, hoặc có quyền Phát sữa (xem mọi nhóm như trước)
create or replace function private.khsx_dd_xem_nguoi(p_chuc_vu text, p_to text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.khsx_dd_duoc(private.khsx_dd_nhom(p_chuc_vu, p_to), (select auth.uid()))
      or private.khsx_has_permission('phat_sua', (select auth.uid()))
$$;

create or replace function private.khsx_dd_xem_nguoi_id(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.khsx_dd_xem_nguoi(n.chuc_vu, n.to_lam) from public.khsx_diem_danh_nguoi n where n.id = p_id), false)
$$;

-- Hàm bọc cũ (dùng ở chính sách đọc): giờ là "có ít nhất một quyền điểm danh theo nhóm"
create or replace function private.khsx_toi_co_quyen_diem_danh() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.khsx_dd_co_quyen_bat_ky((select auth.uid()))
$$;

revoke all on function private.khsx_dd_nhom(text,text), private.khsx_dd_duoc(text,uuid), private.khsx_dd_co_quyen_bat_ky(uuid),
  private.khsx_dd_xem_nguoi(text,text), private.khsx_dd_xem_nguoi_id(uuid) from public, anon;
grant execute on function private.khsx_dd_nhom(text,text), private.khsx_dd_duoc(text,uuid), private.khsx_dd_co_quyen_bat_ky(uuid),
  private.khsx_dd_xem_nguoi(text,text), private.khsx_dd_xem_nguoi_id(uuid) to authenticated;

-- ===== Chính sách đọc theo nhóm =====
drop policy if exists khsx_diem_danh_nguoi_select on public.khsx_diem_danh_nguoi;
create policy khsx_diem_danh_nguoi_select on public.khsx_diem_danh_nguoi for select to authenticated
  using ((select private.khsx_dd_xem_nguoi(chuc_vu, to_lam)));
drop policy if exists khsx_diem_danh_select on public.khsx_diem_danh;
create policy khsx_diem_danh_select on public.khsx_diem_danh for select to authenticated
  using ((select private.khsx_dd_xem_nguoi_id(nguoi_id)));
drop policy if exists khsx_diem_danh_ghi_chu_select on public.khsx_diem_danh_ghi_chu;
create policy khsx_diem_danh_ghi_chu_select on public.khsx_diem_danh_ghi_chu for select to authenticated
  using ((select private.khsx_dd_xem_nguoi_id(nguoi_id)));
drop policy if exists khsx_phat_sua_select on public.khsx_phat_sua;
create policy khsx_phat_sua_select on public.khsx_phat_sua for select to authenticated
  using ((select private.khsx_dd_xem_nguoi_id(nguoi_id)));

-- ===== Lưu điểm danh / tăng ca / ghi chú: kiểm quyền theo nhóm của người được tick =====
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
    on conflict (nguoi_id,ngay) do update set sang=excluded.sang, chieu=excluded.chieu, sua_luc=pg_catalog.now(), sua_boi=excluded.sua_boi;
  else
    delete from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay;
  end if;
end;
$function$;

create or replace function public.khsx_diem_danh_tang_ca_v1(p_nguoi uuid, p_ngay date, p_gio smallint) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_cv text; v_to text;
begin
  if v_actor is null or not private.khsx_dd_co_quyen_bat_ky(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if p_ngay is null or p_ngay > private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='ATTENDANCE_DATE_INVALID'; end if;
  if p_gio is not null and p_gio not in (1,2,3) then raise exception using errcode='22023', message='ATTENDANCE_OT_INVALID'; end if;
  select chuc_vu, to_lam into v_cv, v_to from public.khsx_diem_danh_nguoi where id = p_nguoi and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
  if not private.khsx_dd_duoc(private.khsx_dd_nhom(v_cv, v_to), v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if not exists(select 1 from public.khsx_diem_danh where nguoi_id=p_nguoi and ngay=p_ngay) then
    if p_gio is null then return; end if;
    raise exception using errcode='22023', message='ATTENDANCE_OT_NEEDS_CHECKIN';
  end if;
  update public.khsx_diem_danh set tang_ca=p_gio, sua_luc=pg_catalog.now(), sua_boi=v_actor where nguoi_id=p_nguoi and ngay=p_ngay;
end;
$function$;

create or replace function public.khsx_diem_danh_ghi_chu_v1(p_nguoi uuid, p_ngay date, p_ghi_chu text) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_gc text := pg_catalog.btrim(coalesce(p_ghi_chu,'')); v_cv text; v_to text;
begin
  if v_actor is null or not private.khsx_dd_co_quyen_bat_ky(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if p_ngay is null or p_ngay > private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='ATTENDANCE_DATE_INVALID'; end if;
  if pg_catalog.length(v_gc) > 200 then raise exception using errcode='22023', message='ATTENDANCE_NOTE_INVALID'; end if;
  select chuc_vu, to_lam into v_cv, v_to from public.khsx_diem_danh_nguoi where id = p_nguoi and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
  if not private.khsx_dd_duoc(private.khsx_dd_nhom(v_cv, v_to), v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_FORBIDDEN';
  end if;
  if v_gc = '' then
    delete from public.khsx_diem_danh_ghi_chu where nguoi_id=p_nguoi and ngay=p_ngay;
  else
    insert into public.khsx_diem_danh_ghi_chu(nguoi_id,ngay,ghi_chu,sua_boi) values(p_nguoi,p_ngay,v_gc,v_actor)
    on conflict (nguoi_id,ngay) do update set ghi_chu=excluded.ghi_chu, sua_luc=pg_catalog.now(), sua_boi=excluded.sua_boi;
  end if;
end;
$function$;

-- ===== Đặt chức vụ / tổ (chỉ chủ tài khoản) + đặt việc làm =====
create or replace function public.khsx_diem_danh_dat_chuc_vu_v1(p_id uuid, p_chuc_vu text, p_to text) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_cv text := nullif(pg_catalog.btrim(coalesce(p_chuc_vu,'')),''); v_to text := nullif(pg_catalog.btrim(coalesce(p_to,'')),'');
begin
  if v_actor is null or not private.khsx_is_permission_owner(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_LIST_FORBIDDEN';
  end if;
  if v_cv is not null and v_cv not in ('Trưởng Nhóm','Tổ trưởng sản xuất','Tổ trưởng may','Thủ kho','Công nhân') then
    raise exception using errcode='22023', message='ATTENDEE_ROLE_INVALID';
  end if;
  if v_cv is distinct from 'Công nhân' then v_to := null; end if;
  if v_to is not null and v_to not in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ dán 5','Tổ may','Tổ đóng gói','Phụ kho','Hỗ trợ','May mẫu & cắt hàng','May áo niệm','May áo gối') then
    raise exception using errcode='22023', message='ATTENDEE_TEAM_INVALID';
  end if;
  update public.khsx_diem_danh_nguoi set chuc_vu = v_cv, to_lam = v_to where id = p_id and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
end;
$function$;

create or replace function public.khsx_diem_danh_dat_viec_lam_v1(p_id uuid, p_viec text) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_viec text := nullif(pg_catalog.btrim(coalesce(p_viec,'')),'');
begin
  if v_actor is null or not private.khsx_is_permission_owner(v_actor) then
    raise exception using errcode='42501', message='ATTENDANCE_LIST_FORBIDDEN';
  end if;
  if v_viec is not null and pg_catalog.length(v_viec) > 100 then raise exception using errcode='22023', message='ATTENDEE_JOB_INVALID'; end if;
  update public.khsx_diem_danh_nguoi set viec_lam = v_viec where id = p_id and con_dung;
  if not found then raise exception using errcode='22023', message='ATTENDEE_NOT_FOUND'; end if;
end;
$function$;
revoke all on function public.khsx_diem_danh_dat_viec_lam_v1(uuid,text) from public, anon;
grant execute on function public.khsx_diem_danh_dat_viec_lam_v1(uuid,text) to authenticated;

-- ===== Việc nhắc 7h: theo nhóm mà tài khoản được điểm danh =====
create or replace function private.khsx_tao_viec_diem_danh() returns integer
language plpgsql security definer set search_path = '' as $function$
declare v_hn date := private.khsx_hom_nay_vn(); v_lich date[]; v_u record; v_id uuid; v_n integer := 0; v_td text;
begin
  v_lich := private.khsx_lich_lam_viec(v_hn);
  if v_lich is null or pg_catalog.cardinality(v_lich) = 0 then return 0; end if;
  if not (v_hn = any(v_lich)) and not exists(
       select 1 from public.khsx_orders o
       where o.production_date = v_hn and o.deleted_at is null and not o.is_warranty and not o.is_drop and not o.is_ghost) then
    return 0;
  end if;
  for v_u in
    select a.user_id,
           pg_catalog.string_agg(case a.permission_key when 'diem_danh_mut' then 'Sản xuất mút' when 'diem_danh_kho' then 'Kho' else 'Tổ may' end, ', '
                                 order by a.permission_key) as nhom
    from public.khsx_account_permissions a
    join public.khsx_profiles p on p.user_id = a.user_id and p.active
    where a.permission_key in ('diem_danh_mut','diem_danh_kho','diem_danh_may')
    group by a.user_id
  loop
    v_td := 'Điểm danh ' || v_u.nhom || ' ' || pg_catalog.to_char(v_hn,'DD/MM');
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

-- ===== Giờ công khối Năng suất: không tính nhóm Tổ may (khác Tổ may của mút, 11 người xưởng may) =====
create or replace function public.khsx_gio_cong_theo_to_v1(p_tu date, p_den date)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'ngay', t.ngay, 'nhom', t.nhom, 'nguoi', t.nguoi, 'sang', t.sang, 'chieu', t.chieu, 'tang_ca', t.tang_ca
    ) order by t.ngay, t.nhom), '[]'::jsonb)
  from (
    select d.ngay,
      case when n.to_lam in ('Tổ dán 1','Tổ dán 2','Tổ dán 3','Tổ dán 4','Tổ may','Tổ đóng gói') then n.to_lam else 'Ngoài 6 tổ' end as nhom,
      count(*)::int as nguoi,
      (count(*) filter (where d.sang))::int as sang,
      (count(*) filter (where d.chieu))::int as chieu,
      coalesce(sum(d.tang_ca), 0)::int as tang_ca
    from public.khsx_diem_danh d
    join public.khsx_diem_danh_nguoi n on n.id = d.nguoi_id
    where p_tu is not null and p_den is not null
      and private.khsx_dd_nhom(n.chuc_vu, n.to_lam) <> 'may'
      and d.ngay between greatest(p_tu, p_den - 400) and least(p_den, (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh')::date)
    group by d.ngay, 2
  ) t;
$$;
revoke all on function public.khsx_gio_cong_theo_to_v1(date, date) from public;
grant execute on function public.khsx_gio_cong_theo_to_v1(date, date) to anon, authenticated;

-- ===== Danh mục quyền: 3 quyền theo nhóm thay quyền chung =====
insert into public.khsx_permissions(permission_key, display_name, group_name, description, sort_order) values
  ('diem_danh_mut', 'Điểm danh Sản xuất mút', 'Nhân sự', 'Tick điểm danh sáng / chiều, tăng ca, ghi chú cho nhóm Sản xuất mút (Tổ dán, Tổ may mút, Tổ đóng gói, Hỗ trợ); nhận việc nhắc điểm danh 7h', 42),
  ('diem_danh_kho', 'Điểm danh Kho', 'Nhân sự', 'Tick điểm danh sáng / chiều, tăng ca, ghi chú cho nhóm Kho (Phụ kho); nhận việc nhắc điểm danh 7h', 43),
  ('diem_danh_may', 'Điểm danh Tổ may', 'Nhân sự', 'Tick điểm danh sáng / chiều, tăng ca, ghi chú cho nhóm Tổ may (xưởng may); nhận việc nhắc điểm danh 7h', 44)
on conflict (permission_key) do nothing;

-- Chuyển quyền hiện có (anh chốt 03/11): Lê Hữu Phước → Sản xuất mút, Đông Triều → Kho, Văn Thanh (Nguyễn Thanh, Tổ may) → Tổ may
insert into public.khsx_account_permissions(user_id, permission_key, granted_by)
select v.uid::uuid, v.key, '7ebce211-e3b0-4195-9207-ff46506e13d6'::uuid
from (values ('5c7fbd28-0bff-47da-9d25-9ecccce68e5b','diem_danh_mut'),
             ('9de124b8-b4fb-46cb-b8ca-3791c92c1947','diem_danh_kho'),
             ('d9159b51-bff4-4ee8-bb4d-97c2f2145772','diem_danh_may')) as v(uid, key)
where exists(select 1 from public.khsx_profiles p where p.user_id = v.uid::uuid)
  and exists(select 1 from public.khsx_profiles p where p.user_id = '7ebce211-e3b0-4195-9207-ff46506e13d6'::uuid)
on conflict do nothing;
delete from public.khsx_account_permissions where permission_key = 'diem_danh';
delete from public.khsx_permissions where permission_key = 'diem_danh';

-- ===== Nạp 11 người Tổ may =====
insert into public.khsx_diem_danh_nguoi(ten, chuc_vu, to_lam, viec_lam)
select v.ten, v.cv, v.tl, v.viec
from (values
  ('Nguyễn Thanh',        'Tổ trưởng may', null::text,           null::text),
  ('Đỗ Sơn',              'Công nhân', 'May mẫu & cắt hàng', 'Cắt hàng'),
  ('Dương Nhật Qui',      'Công nhân', 'May mẫu & cắt hàng', 'Hỗ trợ'),
  ('Hồ Thành Tuấn',       'Công nhân', 'May mẫu & cắt hàng', 'Hỗ trợ'),
  ('Huỳnh Thị Thúy Duy',  'Công nhân', 'May áo niệm', 'May áo niệm'),
  ('Hoàng Thị Đến',       'Công nhân', 'May áo niệm', 'May áo niệm'),
  ('Đinh Thị Ngọc Thúy',  'Công nhân', 'May áo niệm', 'May áo niệm'),
  ('Trần Anh Đào',        'Công nhân', 'May áo niệm', 'May áo niệm'),
  ('Trần Thị Yến Phương', 'Công nhân', 'May áo gối', 'May áo gối'),
  ('Giáp Minh Quyên',     'Công nhân', 'May áo gối', 'May áo gối'),
  ('Đỗ Thị Thuỳ Dương',   'Công nhân', 'May áo gối', 'May áo gối')
) as v(ten, cv, tl, viec)
where not exists(select 1 from public.khsx_diem_danh_nguoi n where n.con_dung and pg_catalog.lower(n.ten) = pg_catalog.lower(v.ten));
