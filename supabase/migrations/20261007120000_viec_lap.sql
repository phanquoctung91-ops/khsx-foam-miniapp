-- Giao việc LẶP LẠI (anh Tùng duyệt plan 07/10/2026).
-- - Khi giao, chọn "Một lần" (như cũ) hoặc "Lặp lại": Hằng ngày / Hằng tuần (chọn thứ) / Hằng tháng (chọn ngày trong tháng).
-- - 7h sáng (giờ VN) mỗi ngày hệ thống tự tạo một việc "đang làm", hạn trong ngày, bot nhắn Telegram người nhận (giống việc Điểm danh):
--   người nhận chỉ bấm Xong. Không xong thì 17:00 bot nhắc người nhận và báo người giao (hệ thống Giao việc sẵn có). Hôm sau vẫn tạo việc mới.
-- - Chỉ tạo khi quý đã lưu Lịch ngày làm việc và ngày đó nằm trong lịch (bỏ Chủ nhật, lễ).
--   Hằng ngày / Hằng tuần: ngày nghỉ thì bỏ qua lần đó. Hằng tháng: ngày nghỉ (hoặc tháng không có ngày 29-31) thì dời sang ngày làm việc kế tiếp
--   TRONG THÁNG đó; hết ngày làm việc trong tháng thì bỏ qua lần đó.
-- - Danh sách việc lặp: tạm dừng / tiếp tục / xóa (xóa quy tắc, việc đã tạo giữ nguyên). Từ ngày, đến ngày (không bắt buộc).
-- - Vừa giao việc lặp mà hôm nay đến lượt thì tạo luôn việc hôm nay (không đợi sáng mai).

create table if not exists public.khsx_viec_lap(
  id uuid primary key default gen_random_uuid(),
  tieu_de text not null check (pg_catalog.length(pg_catalog.btrim(tieu_de)) between 1 and 150),
  noi_dung text not null default '' check (pg_catalog.length(noi_dung) <= 3000),
  nguoi_giao uuid not null,
  nguoi_nhan uuid not null,
  kieu text not null check (kieu in ('ngay','tuan','thang')),
  thu smallint[] not null default '{}',          -- 1 = Thứ 2 ... 7 = Chủ nhật
  ngay_thang smallint[] not null default '{}',   -- 1..31
  tu_ngay date not null,
  den_ngay date,
  tam_dung boolean not null default false,
  tao_luc timestamptz not null default pg_catalog.now(),
  check (kieu <> 'tuan'  or (pg_catalog.cardinality(thu) > 0 and thu <@ array[1,2,3,4,5,6,7]::smallint[])),
  check (kieu <> 'thang' or (pg_catalog.cardinality(ngay_thang) > 0 and ngay_thang <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]::smallint[])),
  check (den_ngay is null or den_ngay >= tu_ngay)
);
alter table public.khsx_viec_lap enable row level security;
revoke all on public.khsx_viec_lap from anon, authenticated;
grant select on public.khsx_viec_lap to authenticated;
drop policy if exists khsx_viec_lap_select on public.khsx_viec_lap;
create policy khsx_viec_lap_select on public.khsx_viec_lap for select to authenticated
  using ((select private.khsx_toi_co_quyen_giao_viec()));

-- Lịch ngày làm việc của quý chứa ngày p_ngay; null nếu quý chưa lưu lịch.
create or replace function private.khsx_lich_lam_viec(p_ngay date) returns date[]
language sql stable security definer set search_path = '' as $$
  select case when pg_catalog.cardinality(work_dates) > 0 then work_dates end
  from public.khsx_quarter_targets
  where year = pg_catalog.date_part('year', p_ngay)::integer and quarter = pg_catalog.date_part('quarter', p_ngay)::integer
$$;

-- Hôm nay (p_hn) có phải ngày đến lượt của quy tắc r không (đã tính ngày nghỉ, dời hằng tháng, tạm dừng, từ-đến).
create or replace function private.khsx_viec_lap_den_luot(r public.khsx_viec_lap, p_hn date, p_lich date[]) returns boolean
language plpgsql stable set search_path = '' as $function$
declare v_d integer; v_dau date; v_cuoi date; v_dich date;
begin
  if r.tam_dung or p_hn < r.tu_ngay or (r.den_ngay is not null and p_hn > r.den_ngay) then return false; end if;
  if p_lich is null or not (p_hn = any(p_lich)) then return false; end if;
  if r.kieu = 'ngay' then return true; end if;
  if r.kieu = 'tuan' then return pg_catalog.date_part('isodow', p_hn)::integer = any(r.thu::integer[]); end if;
  v_dau := pg_catalog.date_trunc('month', p_hn)::date;
  v_cuoi := (v_dau + interval '1 month')::date - 1;
  foreach v_d in array r.ngay_thang::integer[] loop
    v_dich := v_dau + (least(v_d, pg_catalog.date_part('day', v_cuoi)::integer) - 1);
    if v_dich >= r.tu_ngay
       and (select pg_catalog.min(x) from pg_catalog.unnest(p_lich) x where x >= v_dich and x <= v_cuoi) = p_hn then
      return true;
    end if;
  end loop;
  return false;
end;
$function$;

-- Tạo việc hôm nay cho một quy tắc nếu đến lượt. Trả true nếu vừa tạo.
create or replace function private.khsx_tao_viec_lap_mot(p_id uuid, p_hn date, p_lich date[]) returns boolean
language plpgsql security definer set search_path = '' as $function$
declare r public.khsx_viec_lap; v_tid uuid;
begin
  select * into r from public.khsx_viec_lap where id = p_id;
  if not found or not private.khsx_viec_lap_den_luot(r, p_hn, p_lich) then return false; end if;
  if not exists(select 1 from public.khsx_profiles p where p.user_id = r.nguoi_nhan and p.active) then return false; end if;
  insert into public.khsx_tasks(tieu_de,noi_dung,nguoi_giao,nguoi_nhan,trang_thai,han,nhan_luc,tu_dong,ngay_tu_dong)
  values(r.tieu_de, r.noi_dung, r.nguoi_giao, r.nguoi_nhan, 'dang_lam', p_hn, pg_catalog.now(), 'lap-'||r.id::text, p_hn)
  on conflict (nguoi_nhan,tu_dong,ngay_tu_dong) where tu_dong is not null do nothing
  returning id into v_tid;
  if v_tid is null then return false; end if;
  perform private.khsx_xep_tin(v_tid,'giao',r.nguoi_nhan,
    '🔁 Việc lặp: '||private.khsx_chu_viec(r.tieu_de,r.noi_dung)||chr(10)||chr(10)||'Hạn hôm nay. Làm xong mở app bấm "Xong".');
  return true;
end;
$function$;

-- 7h sáng mỗi ngày. Quý chưa lưu lịch ngày làm việc thì không tạo gì.
create or replace function private.khsx_tao_viec_lap() returns integer
language plpgsql security definer set search_path = '' as $function$
declare v_hn date := private.khsx_hom_nay_vn(); v_lich date[] := private.khsx_lich_lam_viec(private.khsx_hom_nay_vn()); v_id uuid; v_n integer := 0;
begin
  if v_lich is null then return 0; end if;
  for v_id in select id from public.khsx_viec_lap where not tam_dung and tu_ngay <= v_hn and (den_ngay is null or den_ngay >= v_hn) order by tao_luc loop
    if private.khsx_tao_viec_lap_mot(v_id, v_hn, v_lich) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$function$;

create or replace function public.khsx_giao_viec_lap_v1(p_nguoi_nhan uuid, p_tieu_de text, p_chi_tiet text, p_kieu text, p_thu integer[], p_ngay integer[], p_tu date, p_den date) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_hn date := private.khsx_hom_nay_vn();
        v_td text := pg_catalog.btrim(coalesce(p_tieu_de,'')); v_ct text := pg_catalog.btrim(coalesce(p_chi_tiet,''));
        v_thu smallint[]; v_ng smallint[]; v_tu date := coalesce(p_tu, private.khsx_hom_nay_vn());
begin
  if v_actor is null or not private.khsx_has_permission('task_assign', v_actor) then
    raise exception using errcode='42501', message='TASK_ASSIGN_FORBIDDEN';
  end if;
  if v_td = '' or pg_catalog.length(v_td) > 150 or pg_catalog.length(v_ct) > 3000 then raise exception using errcode='22023', message='TASK_TEXT_INVALID'; end if;
  if not exists(select 1 from public.khsx_profiles p where p.user_id = p_nguoi_nhan and p.active) then
    raise exception using errcode='22023', message='TASK_ASSIGNEE_INVALID';
  end if;
  if p_kieu not in ('ngay','tuan','thang') then raise exception using errcode='22023', message='TASK_REPEAT_INVALID'; end if;
  select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into v_thu from pg_catalog.unnest(coalesce(p_thu,'{}')) x where x between 1 and 7;
  select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into v_ng from pg_catalog.unnest(coalesce(p_ngay,'{}')) x where x between 1 and 31;
  if p_kieu = 'ngay' then v_thu := '{}'; v_ng := '{}'; end if;
  if p_kieu = 'tuan' then v_ng := '{}'; if pg_catalog.cardinality(v_thu) = 0 then raise exception using errcode='22023', message='TASK_REPEAT_DAYS_REQUIRED'; end if; end if;
  if p_kieu = 'thang' then v_thu := '{}'; if pg_catalog.cardinality(v_ng) = 0 then raise exception using errcode='22023', message='TASK_REPEAT_DAYS_REQUIRED'; end if; end if;
  if v_tu < v_hn or (p_den is not null and p_den < v_tu) then raise exception using errcode='22023', message='TASK_REPEAT_RANGE_INVALID'; end if;
  insert into public.khsx_viec_lap(tieu_de,noi_dung,nguoi_giao,nguoi_nhan,kieu,thu,ngay_thang,tu_ngay,den_ngay)
  values(v_td, v_ct, v_actor, p_nguoi_nhan, p_kieu, v_thu, v_ng, v_tu, p_den) returning id into v_id;
  perform private.khsx_tao_viec_lap_mot(v_id, v_hn, private.khsx_lich_lam_viec(v_hn));   -- hôm nay đến lượt thì tạo luôn
  return v_id;
end;
$function$;

create or replace function public.khsx_viec_lap_tam_dung_v1(p_id uuid, p_tam_dung boolean) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_has_permission('task_assign', v_actor) then
    raise exception using errcode='42501', message='TASK_ASSIGN_FORBIDDEN';
  end if;
  update public.khsx_viec_lap set tam_dung = coalesce(p_tam_dung,false) where id = p_id;
  if not found then raise exception using errcode='22023', message='TASK_NOT_FOUND'; end if;
end;
$function$;

create or replace function public.khsx_viec_lap_xoa_v1(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.khsx_has_permission('task_assign', v_actor) then
    raise exception using errcode='42501', message='TASK_ASSIGN_FORBIDDEN';
  end if;
  delete from public.khsx_viec_lap where id = p_id;
  if not found then raise exception using errcode='22023', message='TASK_NOT_FOUND'; end if;
end;
$function$;

revoke all on function public.khsx_giao_viec_lap_v1(uuid,text,text,text,integer[],integer[],date,date),
  public.khsx_viec_lap_tam_dung_v1(uuid,boolean), public.khsx_viec_lap_xoa_v1(uuid) from public, anon;
grant execute on function public.khsx_giao_viec_lap_v1(uuid,text,text,text,integer[],integer[],date,date),
  public.khsx_viec_lap_tam_dung_v1(uuid,boolean), public.khsx_viec_lap_xoa_v1(uuid) to authenticated;
revoke all on function private.khsx_lich_lam_viec(date), private.khsx_viec_lap_den_luot(public.khsx_viec_lap,date,date[]),
  private.khsx_tao_viec_lap_mot(uuid,date,date[]), private.khsx_tao_viec_lap() from public, anon, authenticated;

-- 7h sáng giờ VN = 00:00 UTC (cùng giờ việc Điểm danh). Có pg_cron (production) thì đặt lịch; môi trường thử thì bỏ qua.
do $cron$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'khsx-viec-lap';
    perform cron.schedule('khsx-viec-lap', '0 0 * * *', 'select private.khsx_tao_viec_lap(); select private.khsx_goi_gui_tin();');
  end if;
end;
$cron$;
