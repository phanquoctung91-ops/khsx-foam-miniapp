-- Phan quyen tai khoan - Dot 4.7 (Nhom B): payroll_view chan that.
-- khsx_stage_progress/khsx_workers/khsx_stage_credits van dung chung cho tinh
-- nang khac (KPI, tien do) nen KHONG doi RLS goc. Trang Luong doi sang goi RPC
-- rieng nay - kiem tra payroll_view (owner bypass san co qua khsx_has_permission)
-- roi moi tra du lieu, thay vi doc thang 3 bang qua client.
create or replace function public.khsx_wage_report(p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.khsx_has_permission('payroll_view', v_actor) then
    raise exception using errcode='42501', message='PAYROLL_VIEW_FORBIDDEN';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception using errcode='22023', message='INVALID_RANGE';
  end if;
  return jsonb_build_object(
    'dan', (select coalesce(jsonb_agg(jsonb_build_object('kpi_team',kpi_team,'work_date',work_date,'quantity',quantity)),'[]'::jsonb)
      from public.khsx_stage_progress where stage='dan' and work_date between p_from and p_to),
    'workers', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'stage',stage)),'[]'::jsonb)
      from public.khsx_workers where active=true),
    'credits', (select coalesce(jsonb_agg(jsonb_build_object('worker_id',worker_id,'work_date',work_date,'quantity',quantity,'stage',stage)),'[]'::jsonb)
      from public.khsx_stage_credits where stage in ('may','dong_goi') and work_date between p_from and p_to)
  );
end;
$$;
revoke all on function public.khsx_wage_report(date,date) from public,anon;
grant execute on function public.khsx_wage_report(date,date) to authenticated;

notify pgrst,'reload schema';
