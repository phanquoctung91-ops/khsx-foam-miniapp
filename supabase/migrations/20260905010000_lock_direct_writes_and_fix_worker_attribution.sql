-- Phát hiện 2026-09-05 (đối chiếu RISK_REVIEW_V124_TO_V132.md với production thật):
--
-- 1) RLS của khsx_stage_progress / khsx_order_assignments cho phép client ghi TRỰC TIẾP qua
--    REST (PATCH/POST /rest/v1/...), chỉ cần đúng vai trò/tổ (khsx_can_edit_stage /
--    khsx_is_manager) — bỏ qua HOÀN TOÀN các RPC SECURITY DEFINER (khsx_apply_stage_progress_v2
--    / khsx_save_order_assignment_impl): không kiểm tra giới hạn kế hoạch, không kiểm tra
--    chuỗi Dán≥May≥Đóng gói, không kiểm tra worker có tồn tại/active, không chống trùng thao
--    tác (operation_id), không ghi nhật ký khsx_stage_operations. Xác nhận qua grep index.html:
--    KHÔNG có chỗ nào trong client ghi trực tiếp 2 bảng này (chỉ đọc qua .select()), toàn bộ
--    ghi đều qua RPC — nên khoá an toàn. khsx_stage_credits/khsx_stage_operations vốn ĐÃ đúng
--    (không có policy ghi nào). Các RPC này đều SECURITY DEFINER, owner=postgres có
--    rolbypassrls=true (đã xác nhận bằng query production) — khoá RLS này KHÔNG ảnh hưởng gì
--    tới việc RPC ghi bảng.
--    CỐ Ý KHÔNG khoá khsx_daily_assignments: bảng này có 1 đường ghi trực tiếp HỢP LỆ từ
--    client (sendSupabaseManagementItem, kind='support' — gán tổ hỗ trợ theo ngày), không đi
--    qua RPC nào cả, và hiện KHÔNG có RPC nào làm việc này để thay thế. Bảng đang 0 dòng, và
--    tính năng "tổ hỗ trợ" chỉ cần đúng vai trò (khsx_is_manager), không có logic nghiệp vụ
--    phức tạp (giới hạn kế hoạch/chuỗi công đoạn) nào bị bỏ qua như 2 bảng trên — khoá bây giờ
--    sẽ làm vỡ tính năng đang chạy. Để lại cho một đợt riêng nếu muốn viết RPC thay thế.
--
-- 2) khsx_apply_stage_progress_v2: khi Quản lý chọn người hoàn thành May/Đóng gói không có/
--    không hợp lệ trong khsx_workers, hàm tự đổi completed_by_worker_id sang worker_id của
--    chính Quản lý — ghi sai người thực tế (Quản lý là người XÁC NHẬN, không phải người
--    SẢN XUẤT; actor_user_id đã ghi đúng người xác nhận rồi, không cần ghi đè
--    completed_by_worker_id). Sửa: khi fallback, để completed_by_worker_id = NULL (giữ đúng
--    quy ước "chưa xác định" đã dùng ở nhánh "Quản lý không có worker_id" cũ) — sản lượng vẫn
--    được ghi bình thường (không mất), chỉ không tạo credit cá nhân sai người.

-- ============================================================================
-- Phần 1: khoá đường ghi trực tiếp, bắt buộc qua RPC (chỉ 2 bảng xác nhận không có
-- đường ghi trực tiếp hợp lệ nào từ client)
-- ============================================================================
drop policy if exists khsx_stage_progress_insert on public.khsx_stage_progress;
drop policy if exists khsx_stage_progress_update on public.khsx_stage_progress;
drop policy if exists khsx_stage_progress_delete on public.khsx_stage_progress;

drop policy if exists khsx_order_assignments_insert on public.khsx_order_assignments;
drop policy if exists khsx_order_assignments_update on public.khsx_order_assignments;
drop policy if exists khsx_order_assignments_delete on public.khsx_order_assignments;
-- Các policy *_select giữ nguyên — đọc vẫn qua RLS như cũ, chỉ khoá ghi.
-- khsx_daily_assignments: không đụng tới, xem lý do ở comment đầu file.

-- ============================================================================
-- Phần 2: sửa attribution — không gán completed_by_worker_id sang Quản lý khi
-- người được chọn không hợp lệ trong catalogue.
-- ============================================================================
create or replace function public.khsx_apply_stage_progress_v2(
  p_operation_id uuid,
  p_order_id text,
  p_work_date date,
  p_stage public.khsx_stage,
  p_quantity integer,
  p_kpi_team public.khsx_unit default null,
  p_worker_id text default null,
  p_device_id text default ''
)
returns table(operation_id uuid,applied_quantity integer,duplicate boolean,normalized_upstream boolean)
language plpgsql
security definer
set search_path=''
set lock_timeout='3s'
set statement_timeout='8s'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_unit public.khsx_unit;
  v_profile_worker text;
  v_is_manager boolean := false;
  v_order_team public.khsx_unit;
  v_credit_team public.khsx_unit;
  v_progress_locked boolean := false;
  v_plan integer;
  v_existing integer := 0;
  v_existing_op public.khsx_stage_operations%rowtype;
  v_applied integer;
  v_dan integer := 0;
  v_may integer := 0;
  v_pack integer := 0;
  v_worker text;
begin
  if v_actor is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_operation_id is null or nullif(pg_catalog.btrim(p_order_id),'') is null or p_work_date is null or p_stage is null or p_quantity is null then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;

  select p.unit_name,p.role in ('quan_ly','quan_ly_2'),p.worker_id
    into v_actor_unit,v_is_manager,v_profile_worker
  from public.khsx_profiles p where p.user_id=v_actor and p.active;
  if not found then raise exception using errcode='42501',message='PROFILE_INACTIVE'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select op.* into v_existing_op
  from public.khsx_stage_operations op
  where op.operation_id=p_operation_id;
  if found then
    if v_existing_op.order_id<>p_order_id
      or v_existing_op.work_date<>p_work_date
      or v_existing_op.stage<>p_stage
      or v_existing_op.requested_quantity<>p_quantity
      or v_existing_op.actor_user_id<>v_actor then
      raise exception using errcode='22023',message='OPERATION_ID_REUSED';
    end if;
    return query select p_operation_id,v_existing_op.applied_quantity,true,false;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id,1));

  select o.plan_qty,coalesce(sup.team_name,own.team_name,a.current_team,a.plan_team),coalesce(l.progress_locked,false)
    into v_plan,v_order_team,v_progress_locked
  from public.khsx_orders o
  left join public.khsx_order_assignments a on a.order_id=o.id
  left join public.khsx_daily_assignments sup on sup.order_id=o.id and sup.work_date=p_work_date and sup.assignment_kind='support'
  left join public.khsx_daily_assignments own on own.order_id=o.id and own.work_date=p_work_date and own.assignment_kind='owner'
  left join public.khsx_day_locks l on l.work_date=p_work_date
  where o.id=p_order_id and o.deleted_at is null;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  -- Trigger v119 cũng chặn đường ghi vòng qua RPC; giữ kiểm tra tại đây cho rõ lỗi.
  if v_progress_locked and not private.khsx_is_full_manager() then raise exception using errcode='42501',message='PROGRESS_LOCKED'; end if;
  if p_quantity<0 or p_quantity>v_plan then raise exception using errcode='22023',message='PLAN_LIMIT_EXCEEDED'; end if;

  v_credit_team := case when v_is_manager and p_kpi_team in ('To 1','To 2','To 3','To 4','To 5') then p_kpi_team else v_order_team end;
  if v_credit_team not in ('To 1','To 2','To 3','To 4','To 5') then raise exception using errcode='22023',message='ORDER_TEAM_REQUIRED'; end if;
  if not v_is_manager and p_stage='dan' and v_actor_unit<>v_order_team then raise exception using errcode='42501',message='ORDER_TEAM_FORBIDDEN'; end if;

  if p_stage in ('may','dong_goi') then
    v_worker := case when v_is_manager then nullif(pg_catalog.btrim(p_worker_id),'') else v_profile_worker end;
    -- Không có worker catalogue vẫn được ghi sản lượng; khi có worker hợp lệ
    -- thì hệ thống tiếp tục ghi nhận KPI cá nhân như trước.
    if v_worker is not null and not exists(select 1 from public.khsx_workers w where w.id=v_worker and w.stage=p_stage and w.active) then
      if v_is_manager then
        -- Sửa 2026-09-05: KHÔNG gán completed_by_worker_id sang Quản lý — Quản lý là
        -- người xác nhận (actor_user_id đã ghi đúng), không phải người sản xuất thật.
        -- Để NULL (chưa xác định), đúng quy ước đã dùng khi Quản lý không có worker_id.
        v_worker := null;
      else
        raise exception using errcode='22023',message='WORKER_REQUIRED';
      end if;
    end if;
  end if;

  select coalesce(sum(quantity) filter(where stage='dan'),0),coalesce(sum(quantity) filter(where stage='may'),0),coalesce(sum(quantity) filter(where stage='dong_goi'),0)
    into v_dan,v_may,v_pack from public.khsx_stage_progress where order_id=p_order_id;
  select coalesce(quantity,0) into v_existing from public.khsx_stage_progress where order_id=p_order_id and work_date=p_work_date and stage=p_stage for update;
  if not found then v_existing:=0; end if;
  v_applied := case when v_is_manager then p_quantity else greatest(v_existing,p_quantity) end;

  if (case p_stage when 'dan' then v_dan when 'may' then v_may else v_pack end)-v_existing+v_applied>v_plan then
    raise exception using errcode='22023',message='PLAN_LIMIT_EXCEEDED';
  end if;
  if p_stage='dan' and (v_dan-v_existing+v_applied)<v_may then
    raise exception using errcode='22023',message='CHAIN_LIMIT_EXCEEDED';
  elsif p_stage='may' and ((v_may-v_existing+v_applied)>v_dan or (v_may-v_existing+v_applied)<v_pack) then
    raise exception using errcode='22023',message='CHAIN_LIMIT_EXCEEDED';
  elsif p_stage='dong_goi' and (v_pack-v_existing+v_applied)>v_may then
    raise exception using errcode='22023',message='CHAIN_LIMIT_EXCEEDED';
  end if;

  insert into public.khsx_stage_operations(operation_id,order_id,work_date,stage,requested_quantity,applied_quantity,kpi_team,actor_user_id,device_id,completed_by_worker_id)
  values(p_operation_id,p_order_id,p_work_date,p_stage,p_quantity,v_applied,v_credit_team,v_actor,left(coalesce(p_device_id,''),160),v_worker);
  insert into public.khsx_stage_progress(order_id,work_date,stage,quantity,kpi_team,entered_by,completed_by_worker_id)
  values(p_order_id,p_work_date,p_stage,v_applied,v_credit_team,v_actor,v_worker)
  on conflict(order_id,work_date,stage) do update set quantity=excluded.quantity,kpi_team=excluded.kpi_team,entered_by=excluded.entered_by,completed_by_worker_id=excluded.completed_by_worker_id,updated_at=now();
  delete from public.khsx_stage_credits where order_id=p_order_id and work_date=p_work_date and stage=p_stage;
  if v_worker is not null and v_applied>0 then
    insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source)
    values(p_order_id,p_work_date,p_stage,v_worker,v_applied,'actual');
  end if;
  return query select p_operation_id,v_applied,false,false;
end;
$$;
revoke all on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) from public,anon,authenticated,service_role;
grant execute on function public.khsx_apply_stage_progress_v2(uuid,text,date,public.khsx_stage,integer,public.khsx_unit,text,text) to authenticated;
