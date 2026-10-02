-- Sửa việc khi chưa xong (anh Tùng chốt 02/10/2026): cả 'cho_nhan' lẫn 'dang_lam'; việc đã xong khoá lại.
-- Sửa chữ: giữ ngày hẹn. Đổi người nhận: người mới nhận lại từ đầu (về 'cho_nhan', bỏ ngày hẹn).
create or replace function public.khsx_sua_viec_v1(p_id uuid, p_tieu_de text, p_chi_tiet text, p_nguoi_nhan uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_t public.khsx_tasks%rowtype;
        v_td text := pg_catalog.btrim(coalesce(p_tieu_de,'')); v_ct text := pg_catalog.btrim(coalesce(p_chi_tiet,''));
        v_cu text; v_moi text; v_them text; v_ten text;
begin
  select * into v_t from public.khsx_tasks where id=p_id for update;
  if not found then raise exception using errcode='22023', message='TASK_NOT_FOUND'; end if;
  if v_t.nguoi_giao is distinct from v_actor then raise exception using errcode='42501', message='TASK_EDIT_FORBIDDEN'; end if;
  if v_t.trang_thai='xong' then raise exception using errcode='22023', message='TASK_DONE_LOCKED'; end if;
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
    update public.khsx_tasks set tin_giao_gui_luc=null, tin_giao_loi=null, trang_thai='cho_nhan', han=null, nhan_luc=null, nhac_tre_ngay=null where id=p_id;
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
