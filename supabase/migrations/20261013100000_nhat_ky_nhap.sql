-- Nhật ký nhập liệu (anh Tùng duyệt 13/10/2026): màn Tiến độ hiện lịch sử nhập của 3 công đoạn Dán / May / Đóng gói.
-- CHỈ ĐỌC. Không sửa bảng, trigger hay đường ghi tiến độ. Mọi tài khoản đăng nhập đang hoạt động đều gọi được
-- (bảng nhật ký gốc chỉ quản lý đọc được nên cần hàm riêng). Khách chưa đăng nhập thì không.
-- Trả: các dòng nhật ký của một ngày sản xuất + tổng đối soát (tổng theo nhật ký so với tổng tiến độ KPI).
create or replace function public.khsx_nhat_ky_nhap_v1(p_ngay date) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare v_actor uuid := (select auth.uid()); v_dong jsonb; v_doi jsonb; v_tong integer;
begin
  if v_actor is null or not (select private.khsx_is_active()) then
    raise exception using errcode='42501', message='NHAT_KY_FORBIDDEN';
  end if;
  if p_ngay is null then
    raise exception using errcode='22023', message='NHAT_KY_DATE_INVALID';
  end if;
  select count(*) into v_tong from public.khsx_stage_progress_audit a where a.work_date = p_ngay;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.stage_ord, r.kpi_team, r.changed_at, r.id), '[]'::jsonb) into v_dong
  from (
    select a.id, a.changed_at, a.order_id, a.stage::text as stage,
           case a.stage::text when 'dan' then 1 when 'may' then 2 else 3 end as stage_ord,
           a.kpi_team::text as kpi_team, a.old_quantity as cu, a.new_quantity as moi, a.operation as op,
           coalesce(p.display_name, '(hệ thống)') as nguoi,
           o.product_code as ma, o.product_name as ten, o.width_mm as rong, o.length_mm as dai,
           case when a.stage::text in ('may','dong_goi') then w.display_name end as hoan_thanh
    from public.khsx_stage_progress_audit a
    left join public.khsx_orders o on o.id = a.order_id
    left join public.khsx_profiles p on p.user_id = a.changed_by
    left join public.khsx_stage_progress sp on sp.order_id = a.order_id and sp.work_date = a.work_date and sp.stage = a.stage
    left join public.khsx_workers w on w.id = sp.completed_by_worker_id
    where a.work_date = p_ngay
    order by a.changed_at desc, a.id desc
    limit 500
  ) r;
  select jsonb_object_agg(s.stage, jsonb_build_object('nhat_ky', coalesce(n.q, 0), 'kpi', coalesce(k.q, 0))) into v_doi
  from (values ('dan'), ('may'), ('dong_goi')) as s(stage)
  left join (
    select l.stage as st, sum(l.new_quantity) as q
    from (select distinct on (a.order_id, a.stage) a.order_id, a.stage::text as stage, a.new_quantity, a.operation
          from public.khsx_stage_progress_audit a where a.work_date = p_ngay
          order by a.order_id, a.stage, a.changed_at desc, a.id desc) l
    where l.operation <> 'delete' group by l.stage
  ) n on n.st = s.stage
  left join (
    select sp.stage::text as st, sum(sp.quantity) as q from public.khsx_stage_progress sp where sp.work_date = p_ngay group by sp.stage
  ) k on k.st = s.stage;
  return jsonb_build_object('ngay', p_ngay, 'dong', v_dong, 'doi_soat', v_doi, 'tong_dong', v_tong, 'bi_cat', v_tong > 500);
end;
$function$;

revoke all on function public.khsx_nhat_ky_nhap_v1(date) from public, anon;
grant execute on function public.khsx_nhat_ky_nhap_v1(date) to authenticated;
create index if not exists khsx_progress_audit_work_date_idx on public.khsx_stage_progress_audit (work_date);
