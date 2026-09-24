-- Sửa 2026-09-24 (anh Tùng duyệt đợt 1): chốt đầu vào → mở chốt → nạp dữ liệu mới → chốt lại
-- thì app hiện lại số cũ.
--
-- Nguyên nhân phía máy chủ: mở chốt (plan_locked=false) chỉ gỡ cờ, KHÔNG xoá ảnh chụp trong
-- khsx_plan_snapshots. Lượt tải lại kế tiếp đưa ảnh cũ về máy, lúc chốt lại app thấy "đã có
-- ảnh" nên không chụp mới (phía app sửa riêng trong index.html).
--
-- Sửa: mở chốt đầu vào ngày nào thì xoá luôn ảnh chụp ngày đó. Ngày không còn chốt thì ảnh
-- chụp không còn tác dụng gì (app, link khách đều chỉ dùng ảnh của ngày đang chốt), nên xoá
-- là an toàn. Thân hàm giữ nguyên bản đang chạy trên máy chủ, chỉ thêm đúng một câu delete.
CREATE OR REPLACE FUNCTION public.khsx_set_day_locks(
  p_lock_kind text,
  p_lock_changes jsonb DEFAULT '{}'::jsonb,
  p_snapshot_rows jsonb DEFAULT '{}'::jsonb
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_catalog'
    AS $$
declare
  v_count integer := 0;
  v_date date;
  v_locked boolean;
  v_entry record;
begin
  if not private.khsx_is_manager() then
    raise exception using errcode='42501',message='MANAGER_REQUIRED';
  end if;
  if p_lock_kind not in ('plan','progress') then
    raise exception using errcode='22023',message='INVALID_LOCK_KIND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('khsx-day-locks',0));
  for v_entry in select * from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) loop
    v_date:=v_entry.key::date;
    v_locked:=v_entry.value::boolean;
    v_count:=v_count+1;
    if p_lock_kind='plan' then
      -- Khoa/mo khoa KE HOACH: dung permission_key khsx_lock_plan/khsx_unlock_plan.
      if not private.khsx_has_permission(case when v_locked then 'khsx_lock_plan' else 'khsx_unlock_plan' end, auth.uid()) then
        raise exception using errcode='42501',message='LOCKED_NO_UNLOCK';
      end if;
    else
      -- Khoa/mo khoa TIEN DO: theo dung permission_key progress_lock/progress_unlock.
      if not private.khsx_has_permission(case when v_locked then 'progress_lock' else 'progress_unlock' end, auth.uid()) then
        raise exception using errcode='42501',message='LOCKED_NO_UNLOCK';
      end if;
    end if;
    if p_lock_kind='plan' then
      if v_locked then
        insert into public.khsx_day_locks(work_date,plan_locked,locked_by)
          values(v_date,true,auth.uid())
          on conflict(work_date) do update set plan_locked=true,locked_by=auth.uid(),updated_at=now();
      else
        update public.khsx_day_locks
           set plan_locked=false,locked_by=auth.uid(),updated_at=now()
         where work_date=v_date;
        -- Mo chot thi bo anh chup cu, de lan chot sau bat buoc chup lai tu du lieu moi.
        delete from public.khsx_plan_snapshots where work_date=v_date;
      end if;
    else
      if v_locked then
        insert into public.khsx_day_locks(work_date,progress_locked,locked_by)
          values(v_date,true,auth.uid())
          on conflict(work_date) do update set progress_locked=true,locked_by=auth.uid(),updated_at=now();
      else
        update public.khsx_day_locks
           set progress_locked=false,locked_by=auth.uid(),updated_at=now()
         where work_date=v_date;
      end if;
    end if;
  end loop;
  if p_lock_kind='plan' and jsonb_typeof(coalesce(p_snapshot_rows,'{}'::jsonb))='object' then
    insert into public.khsx_plan_snapshots(work_date,rows_json,version,created_by)
      select (e.key)::date,e.value,extract(epoch from clock_timestamp())::bigint,auth.uid()
      from jsonb_each(coalesce(p_snapshot_rows,'{}'::jsonb)) e
      where exists (
        select 1 from jsonb_each_text(coalesce(p_lock_changes,'{}'::jsonb)) c
        where c.key=e.key and c.value::boolean
      )
      on conflict(work_date) do update set rows_json=excluded.rows_json,version=excluded.version,
        created_by=excluded.created_by,created_at=now();
  end if;
  return v_count;
end;
$$;
