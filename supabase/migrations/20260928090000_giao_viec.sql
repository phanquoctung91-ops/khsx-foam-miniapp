-- Giao việc ngoài KHSX (anh Tùng duyệt 28/09/2026):
-- - Người có quyền "Giao việc" (tạm thời chỉ anh Tùng — chủ tài khoản; sau này tick cho QL2) giao việc cho
--   một người trong danh sách nhân sự; bot của app nhắn Telegram cho người đó.
-- - Người nhận bấm "Nhận việc" (bắt buộc chọn ngày hẹn xong, không từ chối được), làm xong bấm "Xong"
--   thì bot báo người giao.
-- - 17:00 (giờ VN) ngày hẹn mà chưa xong: bot nhắc người nhận và báo người giao; trễ tiếp thì mỗi ngày
--   17:00 nhắc lại (bộ hẹn giờ ở migration 20260928090100).
-- Tin nhắn không gửi thẳng từ SQL: xếp vào hàng chờ khsx_tin_nhan_cho, hàm khsx-gui-tin (edge function) gửi.

insert into public.khsx_permissions(permission_key, display_name, group_name, description, sort_order)
values ('task_assign', 'Giao việc', 'Giao việc',
        'Giao việc ngoài KHSX cho nhân sự, bot nhắn Telegram; xem và theo dõi mọi việc đã giao', 43)
on conflict (permission_key) do nothing;

create table if not exists public.khsx_tasks(
  id uuid primary key default gen_random_uuid(),
  noi_dung text not null check (length(btrim(noi_dung)) between 1 and 1000),
  nguoi_giao uuid not null,
  nguoi_nhan uuid not null,
  trang_thai text not null default 'cho_nhan' check (trang_thai in ('cho_nhan','dang_lam','xong')),
  han date,
  giao_luc timestamptz not null default now(),
  nhan_luc timestamptz,
  xong_luc timestamptz,
  nhac_tre_ngay date,
  tin_giao_gui_luc timestamptz,
  tin_giao_loi text
);
create index if not exists khsx_tasks_nguoi_nhan on public.khsx_tasks(nguoi_nhan, trang_thai);
alter table public.khsx_tasks enable row level security;
revoke all on public.khsx_tasks from anon, authenticated;
grant select on public.khsx_tasks to authenticated;
drop policy if exists khsx_tasks_select on public.khsx_tasks;
create policy khsx_tasks_select on public.khsx_tasks for select to authenticated
  using (nguoi_nhan = (select auth.uid()) or (select private.khsx_has_permission('task_assign', (select auth.uid()))));

create table if not exists public.khsx_tin_nhan_cho(
  id bigserial primary key,
  task_id uuid references public.khsx_tasks(id) on delete cascade,
  loai text not null,
  chat_id bigint not null,
  noi_dung text not null,
  tao_luc timestamptz not null default now(),
  gui_luc timestamptz,
  so_lan integer not null default 0,
  loi text
);
alter table public.khsx_tin_nhan_cho enable row level security;
revoke all on public.khsx_tin_nhan_cho from anon, authenticated;   -- chỉ hàm gửi tin (service role) đọc / ghi
revoke all on sequence public.khsx_tin_nhan_cho_id_seq from anon, authenticated;

-- Hôm nay theo giờ Việt Nam.
create or replace function private.khsx_hom_nay_vn() returns date
language sql stable set search_path = '' as $$ select (pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

create or replace function private.khsx_xep_tin(p_task uuid, p_loai text, p_user uuid, p_noi_dung text) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_chat bigint;
begin
  select nullif(pg_catalog.btrim(p.telegram_user_id::text),'')::bigint into v_chat from public.khsx_profiles p where p.user_id=p_user;
  if v_chat is null then
    if p_loai='giao' then update public.khsx_tasks set tin_giao_loi='Người này chưa có Telegram ID' where id=p_task; end if;
    return;
  end if;
  insert into public.khsx_tin_nhan_cho(task_id,loai,chat_id,noi_dung) values(p_task,p_loai,v_chat,p_noi_dung);
end;
$function$;

create or replace function private.khsx_ten_nguoi(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(pg_catalog.btrim(p.display_name),''),'Không rõ tên') from public.khsx_profiles p where p.user_id=p_user
$$;

create or replace function public.khsx_giao_viec_v1(p_nguoi_nhan uuid, p_noi_dung text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_nd text := pg_catalog.btrim(coalesce(p_noi_dung,''));
begin
  if v_actor is null or not private.khsx_has_permission('task_assign', v_actor) then
    raise exception using errcode='42501', message='TASK_ASSIGN_FORBIDDEN';
  end if;
  if v_nd='' or length(v_nd)>1000 then raise exception using errcode='22023', message='TASK_TEXT_INVALID'; end if;
  if not exists(select 1 from public.khsx_profiles p where p.user_id=p_nguoi_nhan and p.active) then
    raise exception using errcode='22023', message='TASK_ASSIGNEE_INVALID';
  end if;
  insert into public.khsx_tasks(noi_dung,nguoi_giao,nguoi_nhan) values(v_nd,v_actor,p_nguoi_nhan) returning id into v_id;
  perform private.khsx_xep_tin(v_id,'giao',p_nguoi_nhan,
    '📝 '||private.khsx_ten_nguoi(v_actor)||' giao việc cho bạn:'||chr(10)||v_nd||chr(10)||chr(10)||
    'Mở app, bấm "Nhận việc" và chọn ngày hẹn xong.');
  return v_id;
end;
$function$;

create or replace function public.khsx_nhan_viec_v1(p_id uuid, p_han date) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_t public.khsx_tasks%rowtype;
begin
  select * into v_t from public.khsx_tasks where id=p_id for update;
  if not found or v_t.nguoi_nhan is distinct from v_actor then raise exception using errcode='42501', message='TASK_NOT_YOURS'; end if;
  if v_t.trang_thai<>'cho_nhan' then raise exception using errcode='22023', message='TASK_ALREADY_TAKEN'; end if;
  if p_han is null or p_han < private.khsx_hom_nay_vn() then raise exception using errcode='22023', message='TASK_DUE_INVALID'; end if;
  update public.khsx_tasks set trang_thai='dang_lam', han=p_han, nhan_luc=pg_catalog.now() where id=p_id;
end;
$function$;

create or replace function public.khsx_xong_viec_v1(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_t public.khsx_tasks%rowtype;
begin
  select * into v_t from public.khsx_tasks where id=p_id for update;
  if not found or v_t.nguoi_nhan is distinct from v_actor then raise exception using errcode='42501', message='TASK_NOT_YOURS'; end if;
  if v_t.trang_thai<>'dang_lam' then raise exception using errcode='22023', message='TASK_NOT_IN_PROGRESS'; end if;
  update public.khsx_tasks set trang_thai='xong', xong_luc=pg_catalog.now() where id=p_id;
  perform private.khsx_xep_tin(p_id,'xong',v_t.nguoi_giao,
    '✅ '||private.khsx_ten_nguoi(v_actor)||' đã xong việc:'||chr(10)||v_t.noi_dung||
    case when v_t.han is not null then chr(10)||'Hẹn '||pg_catalog.to_char(v_t.han,'DD/MM')||', xong '||pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI') else '' end);
end;
$function$;

-- Tin giao việc chưa tới được người nhận (vd người đó chưa bấm Start bot): người giao bấm "Gửi lại".
create or replace function public.khsx_gui_lai_tin_viec_v1(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_t public.khsx_tasks%rowtype;
begin
  if v_actor is null or not private.khsx_has_permission('task_assign', v_actor) then
    raise exception using errcode='42501', message='TASK_ASSIGN_FORBIDDEN';
  end if;
  select * into v_t from public.khsx_tasks where id=p_id;
  if not found then raise exception using errcode='22023', message='TASK_NOT_FOUND'; end if;
  update public.khsx_tin_nhan_cho set so_lan=0, gui_luc=null, loi=null where task_id=p_id and loai='giao' and gui_luc is null;
  if not found then
    perform private.khsx_xep_tin(p_id,'giao',v_t.nguoi_nhan,
      '📝 '||private.khsx_ten_nguoi(v_t.nguoi_giao)||' giao việc cho bạn:'||chr(10)||v_t.noi_dung||chr(10)||chr(10)||
      'Mở app, bấm "Nhận việc" và chọn ngày hẹn xong.');
  end if;
  update public.khsx_tasks set tin_giao_loi=null where id=p_id;
end;
$function$;

-- Chạy 17:00 mỗi ngày (bộ hẹn giờ): việc đang làm tới hạn / quá hạn mà chưa xong -> nhắc người nhận + báo người giao.
create or replace function private.khsx_nhac_viec_tre() returns integer
language plpgsql security definer set search_path = '' as $function$
declare v_t public.khsx_tasks%rowtype; v_hn date := private.khsx_hom_nay_vn(); v_n integer := 0; v_tre integer;
begin
  for v_t in select * from public.khsx_tasks where trang_thai='dang_lam' and han <= v_hn and (nhac_tre_ngay is null or nhac_tre_ngay < v_hn) for update loop
    v_tre := v_hn - v_t.han;
    perform private.khsx_xep_tin(v_t.id,'nhac',v_t.nguoi_nhan,
      '⏰ Việc tới hạn hôm nay mà chưa bấm Xong'||case when v_tre>0 then ' (trễ '||v_tre||' ngày)' else '' end||':'||chr(10)||v_t.noi_dung||chr(10)||
      'Làm xong nhớ mở app bấm "Xong".');
    perform private.khsx_xep_tin(v_t.id,'bao_tre',v_t.nguoi_giao,
      '⚠ '||private.khsx_ten_nguoi(v_t.nguoi_nhan)||' chưa xong việc hẹn '||pg_catalog.to_char(v_t.han,'DD/MM')||
      case when v_tre>0 then ' (trễ '||v_tre||' ngày)' else '' end||':'||chr(10)||v_t.noi_dung);
    update public.khsx_tasks set nhac_tre_ngay=v_hn where id=v_t.id;
    v_n := v_n+1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.khsx_giao_viec_v1(uuid,text), public.khsx_nhan_viec_v1(uuid,date), public.khsx_xong_viec_v1(uuid),
  public.khsx_gui_lai_tin_viec_v1(uuid) from public, anon;
grant execute on function public.khsx_giao_viec_v1(uuid,text), public.khsx_nhan_viec_v1(uuid,date), public.khsx_xong_viec_v1(uuid),
  public.khsx_gui_lai_tin_viec_v1(uuid) to authenticated;
revoke all on function private.khsx_xep_tin(uuid,text,uuid,text), private.khsx_nhac_viec_tre(), private.khsx_ten_nguoi(uuid) from public, anon, authenticated;
