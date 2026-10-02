-- Giao việc: tiêu đề + chi tiết, và sửa việc khi người nhận chưa nhận (anh Tùng chốt 30/09/2026, "làm đi" 02/10/2026).
-- - tieu_de bắt buộc (ngắn), noi_dung nay là phần chi tiết (được để trống).
-- - Việc cũ: dòng đầu làm tiêu đề, phần còn lại thành chi tiết.
-- - Chỉ người giao việc đó được sửa, chỉ khi việc còn 'cho_nhan'. Sửa chữ: bot nhắn phần bổ sung (viết thêm vào cuối)
--   hoặc nội dung mới kèm "Trước đó ghi". Đổi người nhận: người mới nhận tin giao việc, người cũ được báo đã chuyển.

alter table public.khsx_tasks add column if not exists tieu_de text;
alter table public.khsx_tasks drop constraint if exists khsx_tasks_noi_dung_check;

-- Tách "dòng đầu / phần còn lại". Dòng đầu dài quá 150 chữ thì lấy 100 chữ đầu làm tiêu đề và giữ nguyên chi tiết.
create or replace function private.khsx_tach_tieu_de(p_text text, out tieu_de text, out chi_tiet text)
language plpgsql immutable set search_path = '' as $function$
declare v text := pg_catalog.btrim(coalesce(p_text,'')); v_dau text; v_vi int;
begin
  v_vi := pg_catalog.strpos(v, chr(10));
  v_dau := pg_catalog.btrim(case when v_vi>0 then pg_catalog.left(v, v_vi-1) else v end);
  if pg_catalog.length(v_dau) <= 150 then
    tieu_de := v_dau;
    chi_tiet := pg_catalog.btrim(case when v_vi>0 then pg_catalog.substr(v, v_vi+1) else '' end);
  else
    tieu_de := pg_catalog.left(v_dau, 100) || '…';
    chi_tiet := v;
  end if;
end;
$function$;

update public.khsx_tasks t set tieu_de = x.tieu_de, noi_dung = x.chi_tiet
from (select id, (private.khsx_tach_tieu_de(noi_dung)).* from public.khsx_tasks where tieu_de is null) x
where t.id = x.id;

alter table public.khsx_tasks alter column tieu_de set not null;
alter table public.khsx_tasks add constraint khsx_tasks_tieu_de_check check (pg_catalog.length(pg_catalog.btrim(tieu_de)) between 1 and 150);
alter table public.khsx_tasks add constraint khsx_tasks_noi_dung_check check (pg_catalog.length(noi_dung) <= 3000);

-- Nội dung tin: tiêu đề, chi tiết (nếu có) xuống dòng bên dưới.
create or replace function private.khsx_chu_viec(p_tieu_de text, p_chi_tiet text) returns text
language sql immutable set search_path = '' as $$
  select p_tieu_de || case when pg_catalog.btrim(coalesce(p_chi_tiet,''))<>'' then chr(10)||p_chi_tiet else '' end
$$;

create or replace function private.khsx_tin_giao_viec(p_nguoi_giao uuid, p_tieu_de text, p_chi_tiet text) returns text
language sql stable security definer set search_path = '' as $$
  select '📝 '||private.khsx_ten_nguoi(p_nguoi_giao)||' giao việc cho bạn:'||chr(10)||private.khsx_chu_viec(p_tieu_de,p_chi_tiet)
         ||chr(10)||chr(10)||'Mở app, bấm "Nhận việc" và chọn ngày hẹn xong.'
$$;

create or replace function public.khsx_giao_viec_v2(p_nguoi_nhan uuid, p_tieu_de text, p_chi_tiet text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_id uuid;
        v_td text := pg_catalog.btrim(coalesce(p_tieu_de,'')); v_ct text := pg_catalog.btrim(coalesce(p_chi_tiet,''));
begin
  if v_actor is null or not private.khsx_has_permission('task_assign', v_actor) then
    raise exception using errcode='42501', message='TASK_ASSIGN_FORBIDDEN';
  end if;
  if v_td='' or pg_catalog.length(v_td)>150 or pg_catalog.length(v_ct)>3000 then raise exception using errcode='22023', message='TASK_TEXT_INVALID'; end if;
  if not exists(select 1 from public.khsx_profiles p where p.user_id=p_nguoi_nhan and p.active) then
    raise exception using errcode='22023', message='TASK_ASSIGNEE_INVALID';
  end if;
  insert into public.khsx_tasks(tieu_de,noi_dung,nguoi_giao,nguoi_nhan) values(v_td,v_ct,v_actor,p_nguoi_nhan) returning id into v_id;
  perform private.khsx_xep_tin(v_id,'giao',p_nguoi_nhan,private.khsx_tin_giao_viec(v_actor,v_td,v_ct));
  return v_id;
end;
$function$;

-- Bản cũ (app chưa tải lại) vẫn giao được: tự tách dòng đầu làm tiêu đề.
create or replace function public.khsx_giao_viec_v1(p_nguoi_nhan uuid, p_noi_dung text) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare x record;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_noi_dung,''))) not between 1 and 3000 then
    raise exception using errcode='22023', message='TASK_TEXT_INVALID';
  end if;
  select * into x from private.khsx_tach_tieu_de(p_noi_dung);
  return public.khsx_giao_viec_v2(p_nguoi_nhan, x.tieu_de, x.chi_tiet);
end;
$function$;

create or replace function public.khsx_sua_viec_v1(p_id uuid, p_tieu_de text, p_chi_tiet text, p_nguoi_nhan uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_t public.khsx_tasks%rowtype;
        v_td text := pg_catalog.btrim(coalesce(p_tieu_de,'')); v_ct text := pg_catalog.btrim(coalesce(p_chi_tiet,''));
        v_cu text; v_moi text; v_them text; v_ten text;
begin
  select * into v_t from public.khsx_tasks where id=p_id for update;
  if not found then raise exception using errcode='22023', message='TASK_NOT_FOUND'; end if;
  if v_t.nguoi_giao is distinct from v_actor then raise exception using errcode='42501', message='TASK_EDIT_FORBIDDEN'; end if;
  if v_t.trang_thai<>'cho_nhan' then raise exception using errcode='22023', message='TASK_ALREADY_TAKEN'; end if;
  if v_td='' or pg_catalog.length(v_td)>150 or pg_catalog.length(v_ct)>3000 then raise exception using errcode='22023', message='TASK_TEXT_INVALID'; end if;
  p_nguoi_nhan := coalesce(p_nguoi_nhan, v_t.nguoi_nhan);
  if not exists(select 1 from public.khsx_profiles p where p.user_id=p_nguoi_nhan and p.active) then
    raise exception using errcode='22023', message='TASK_ASSIGNEE_INVALID';
  end if;
  v_cu := private.khsx_chu_viec(v_t.tieu_de, v_t.noi_dung);
  v_moi := private.khsx_chu_viec(v_td, v_ct);
  if v_moi = v_cu and p_nguoi_nhan = v_t.nguoi_nhan then return; end if;   -- không đổi gì

  update public.khsx_tasks set tieu_de=v_td, noi_dung=v_ct, nguoi_nhan=p_nguoi_nhan where id=p_id;
  v_ten := private.khsx_ten_nguoi(v_actor);

  if p_nguoi_nhan <> v_t.nguoi_nhan then
    -- Tin giao việc cũ chưa tới người cũ thì thôi không gửi nữa.
    delete from public.khsx_tin_nhan_cho where task_id=p_id and gui_luc is null;
    update public.khsx_tasks set tin_giao_gui_luc=null, tin_giao_loi=null where id=p_id;
    perform private.khsx_xep_tin(p_id,'chuyen',v_t.nguoi_nhan,
      '↪ Việc "'||v_t.tieu_de||'" '||v_ten||' đã chuyển cho người khác, bạn không cần làm.');
    perform private.khsx_xep_tin(p_id,'giao',p_nguoi_nhan,private.khsx_tin_giao_viec(v_actor,v_td,v_ct));
    return;
  end if;

  if pg_catalog.length(v_moi) > pg_catalog.length(v_cu) and pg_catalog.left(v_moi, pg_catalog.length(v_cu)) = v_cu then
    v_them := pg_catalog.btrim(pg_catalog.substr(v_moi, pg_catalog.length(v_cu)+1), E' \n.,;:-');
    perform private.khsx_xep_tin(p_id,'sua',p_nguoi_nhan,
      '📝 '||v_ten||' bổ sung việc giao cho bạn:'||chr(10)||v_td||chr(10)||'➕ Bổ sung: '||v_them);
  else
    perform private.khsx_xep_tin(p_id,'sua',p_nguoi_nhan,
      '📝 '||v_ten||' sửa việc giao cho bạn:'||chr(10)||v_moi||chr(10)||chr(10)||'Trước đó ghi: '||pg_catalog.left(v_cu,500));
  end if;
end;
$function$;

-- Các tin khác dùng tiêu đề cho gọn.
create or replace function public.khsx_xong_viec_v1(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_t public.khsx_tasks%rowtype;
begin
  select * into v_t from public.khsx_tasks where id=p_id for update;
  if not found or v_t.nguoi_nhan is distinct from v_actor then raise exception using errcode='42501', message='TASK_NOT_YOURS'; end if;
  if v_t.trang_thai<>'dang_lam' then raise exception using errcode='22023', message='TASK_NOT_IN_PROGRESS'; end if;
  update public.khsx_tasks set trang_thai='xong', xong_luc=pg_catalog.now() where id=p_id;
  perform private.khsx_xep_tin(p_id,'xong',v_t.nguoi_giao,
    '✅ '||private.khsx_ten_nguoi(v_actor)||' đã xong việc:'||chr(10)||v_t.tieu_de||
    case when v_t.han is not null then chr(10)||'Hẹn '||pg_catalog.to_char(v_t.han,'DD/MM')||', xong '||pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI') else '' end);
end;
$function$;

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
    perform private.khsx_xep_tin(p_id,'giao',v_t.nguoi_nhan,private.khsx_tin_giao_viec(v_t.nguoi_giao,v_t.tieu_de,v_t.noi_dung));
  end if;
  update public.khsx_tasks set tin_giao_loi=null where id=p_id;
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
    perform private.khsx_xep_tin(v_t.id,'bao_tre',v_t.nguoi_giao,
      '⚠ '||private.khsx_ten_nguoi(v_t.nguoi_nhan)||' chưa xong việc hẹn '||pg_catalog.to_char(v_t.han,'DD/MM')||
      case when v_tre>0 then ' (trễ '||v_tre||' ngày)' else '' end||':'||chr(10)||v_t.tieu_de);
    update public.khsx_tasks set nhac_tre_ngay=v_hn where id=v_t.id;
    v_n := v_n+1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.khsx_giao_viec_v2(uuid,text,text), public.khsx_sua_viec_v1(uuid,text,text,uuid) from public, anon;
grant execute on function public.khsx_giao_viec_v2(uuid,text,text), public.khsx_sua_viec_v1(uuid,text,text,uuid) to authenticated;
revoke all on function private.khsx_tach_tieu_de(text), private.khsx_chu_viec(text,text), private.khsx_tin_giao_viec(uuid,text,text) from public, anon, authenticated;
