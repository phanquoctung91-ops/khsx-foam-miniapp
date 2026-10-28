-- Lịch ngày làm việc theo khoảng của quý (anh chốt 28/10/2026): quý đã lưu lịch có khoảng = từ ngày đăng ký đầu tới ngày đăng ký cuối
-- (vd Quý 4 kéo hết tháng 1 năm sau). Ngày nằm trong khoảng nào thì lấy lịch của quý đó (chồng nhau: quý đứng trước giữ);
-- không nằm trong khoảng nào thì lấy lịch của quý lịch như cũ. Null nếu quý đó chưa lưu lịch.
create or replace function private.khsx_lich_lam_viec(p_ngay date) returns date[]
language sql stable security definer set search_path = '' as $$
  select s.w from (
    select t.work_dates w, 0 pri, t.year, t.quarter
    from public.khsx_quarter_targets t
    where pg_catalog.cardinality(t.work_dates) > 0
      and p_ngay between (select pg_catalog.min(d) from pg_catalog.unnest(t.work_dates) d)
                     and (select pg_catalog.max(d) from pg_catalog.unnest(t.work_dates) d)
    union all
    select t.work_dates, 1, t.year, t.quarter
    from public.khsx_quarter_targets t
    where pg_catalog.cardinality(t.work_dates) > 0
      and t.year = pg_catalog.date_part('year', p_ngay)::integer and t.quarter = pg_catalog.date_part('quarter', p_ngay)::integer
  ) s
  order by s.pri, s.year, s.quarter
  limit 1
$$;

-- 7h sáng: nhắc điểm danh. Quý chưa lưu lịch ngày làm việc thì không tạo; tra lịch theo khoảng của quý (khsx_lich_lam_viec).
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
