-- Xác nhận BOM (2026-09-25, anh Tùng duyệt "push đi" sau khi xem bản xem thử).
--
-- Luật anh Tùng chốt:
--   - BOM lấy từ ERP, chỉ tầng 1 (áo nệm tính 1 món, không bung ra vải/tem).
--   - Lô nào đóng gói ĐỦ cả lô mới hiện cho quản lý xác nhận, xác nhận lúc nào tiện.
--   - Đơn kế hoạch, phát sinh, rớt đều xác nhận; bảo hành thì không.
--   - Đúng BOM -> bấm xác nhận; có thay đổi -> sửa số thực dùng, gõ tay mã vật tư thay thế, ghi lý do.
--   - File xuất theo NGÀY ĐÓNG GÓI, số tấm từng ngày phải khớp báo cáo đóng gói (app tự chia).
--
-- BOM là "cuốn sổ riêng": KHÔNG đưa vào lượt đọc lại chung (realtime/tải cả sổ). App chỉ đọc
-- BOM của đúng các mã đang cần khi mở màn Xác nhận BOM.

create table if not exists public.khsx_bom_lines(
  ma_hang text not null,
  stt integer not null,
  bom text not null,
  ma_vt text not null,
  ten_vt text not null default '',
  dinh_muc numeric not null check (dinh_muc >= 0),
  dvt text not null default '',
  dong_bo_luc timestamptz not null default now(),
  primary key (ma_hang, stt)
);
alter table public.khsx_bom_lines enable row level security;
revoke all on public.khsx_bom_lines from anon, authenticated;
grant select on public.khsx_bom_lines to authenticated;
drop policy if exists khsx_bom_lines_select on public.khsx_bom_lines;
create policy khsx_bom_lines_select on public.khsx_bom_lines for select to authenticated
  using ((select private.khsx_is_active()));
-- Chỉ hàm đồng bộ (edge function khsx-bom-sync, dùng service role) được ghi bảng này.

create table if not exists public.khsx_bom_confirmations(
  order_id text primary key references public.khsx_orders(id),
  ma_hang text not null,
  so_tam integer not null check (so_tam > 0),
  trang_thai text not null check (trang_thai in ('dung_bom','co_thay_doi')),
  -- Mọi dòng vật tư của lô sau khi xác nhận (kể cả vật tư gõ thêm):
  -- [{ma_vt, ten_vt, dvt, dinh_muc, theo_bom, thuc_dung}]
  dong jsonb not null default '[]'::jsonb check (jsonb_typeof(dong)='array'),
  ly_do text not null default '',
  xac_nhan_boi uuid not null references auth.users(id),
  xac_nhan_ten text not null default '',
  xac_nhan_luc timestamptz not null default now()
);
alter table public.khsx_bom_confirmations enable row level security;
revoke all on public.khsx_bom_confirmations from anon, authenticated;
grant select on public.khsx_bom_confirmations to authenticated;
drop policy if exists khsx_bom_confirmations_select on public.khsx_bom_confirmations;
create policy khsx_bom_confirmations_select on public.khsx_bom_confirmations for select to authenticated
  using ((select private.khsx_is_active()));

insert into public.khsx_permissions(permission_key, display_name, group_name, description, sort_order)
values ('bom_confirm', 'Xác nhận BOM', 'BOM',
        'Xem lô đóng gói đủ, xác nhận vật tư theo BOM hoặc sửa số thực dùng, xuất file BOM', 41)
on conflict (permission_key) do nothing;

-- Xác nhận BOM một lô. Chỉ nhận khi lô đã đóng gói đủ; mỗi lô xác nhận một lần (mở lại
-- bằng khsx_reopen_bom_v1).
create or replace function public.khsx_confirm_bom_v1(
  p_order_id text, p_trang_thai text, p_dong jsonb, p_ly_do text default ''
) returns jsonb
language plpgsql security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '10s'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_order public.khsx_orders%rowtype;
  v_dong_goi integer;
  v_line jsonb;
begin
  if v_actor is null or not (select private.khsx_has_permission('bom_confirm', v_actor)) then
    raise exception using errcode='42501', message='BOM_PERMISSION_REQUIRED';
  end if;
  if p_trang_thai not in ('dung_bom','co_thay_doi') or p_dong is null
    or pg_catalog.jsonb_typeof(p_dong)<>'array' or pg_catalog.jsonb_array_length(p_dong) not between 1 and 60 then
    raise exception using errcode='22023', message='INVALID_BOM_CONFIRMATION';
  end if;
  if p_trang_thai='co_thay_doi' and coalesce(pg_catalog.btrim(p_ly_do),'')='' then
    raise exception using errcode='22023', message='BOM_REASON_REQUIRED';
  end if;
  for v_line in select x.e from pg_catalog.jsonb_array_elements(p_dong) x(e) loop
    if coalesce(pg_catalog.btrim(v_line->>'ma_vt'),'')=''
      or pg_catalog.jsonb_typeof(v_line->'thuc_dung')<>'number' or (v_line->>'thuc_dung')::numeric<0 then
      raise exception using errcode='22023', message='INVALID_BOM_LINE';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id,1));
  select * into v_order from public.khsx_orders o where o.id=p_order_id and o.deleted_at is null;
  if v_order.id is null or v_order.is_warranty or v_order.is_ghost then
    raise exception using errcode='P0002', message='ORDER_NOT_FOUND';
  end if;
  select coalesce(sum(p.quantity),0) into v_dong_goi
  from public.khsx_stage_progress p where p.order_id=p_order_id and p.stage='dong_goi';
  if v_order.plan_qty<=0 or v_dong_goi<v_order.plan_qty then
    raise exception using errcode='22023', message='LOT_NOT_COMPLETE', detail=v_dong_goi::text||'/'||v_order.plan_qty::text;
  end if;
  if exists(select 1 from public.khsx_bom_confirmations c where c.order_id=p_order_id) then
    raise exception using errcode='23505', message='BOM_ALREADY_CONFIRMED';
  end if;

  insert into public.khsx_bom_confirmations(order_id, ma_hang, so_tam, trang_thai, dong, ly_do, xac_nhan_boi, xac_nhan_ten)
  values (p_order_id, pg_catalog.upper(pg_catalog.btrim(v_order.product_code)), v_order.plan_qty,
          p_trang_thai, p_dong, coalesce(pg_catalog.btrim(p_ly_do),''), v_actor,
          coalesce((select p.display_name from public.khsx_profiles p where p.user_id=v_actor),''));
  return pg_catalog.jsonb_build_object('ok',true);
end;
$function$;
revoke all on function public.khsx_confirm_bom_v1(text,text,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.khsx_confirm_bom_v1(text,text,jsonb,text) to authenticated;

-- Mở lại lô đã xác nhận: chỉ quản lý chính.
-- ponytail: xoá thẳng dòng xác nhận, không giữ lịch sử mở lại; cần truy vết thì thêm bảng nhật ký.
create or replace function public.khsx_reopen_bom_v1(p_order_id text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not exists(select 1 from public.khsx_profiles p
      where p.user_id=(select auth.uid()) and p.active and p.role='quan_ly') then
    raise exception using errcode='42501', message='FULL_MANAGER_REQUIRED';
  end if;
  delete from public.khsx_bom_confirmations where order_id=p_order_id;
  return pg_catalog.jsonb_build_object('ok',true);
end;
$function$;
revoke all on function public.khsx_reopen_bom_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.khsx_reopen_bom_v1(text) to authenticated;
