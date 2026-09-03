-- Release v123: đối chiếu bản live cũ theo từng ID cho 25-29/08/2026.
-- Migration chạy trong một transaction và tự hủy toàn bộ nếu bất kỳ tổng kiểm tra nào lệch.
begin;

insert into public.khsx_app_settings(key,value,updated_by,updated_at)
select 'backup_v123_aug_25_29_before_reconcile', jsonb_build_object(
  'captured_at',now(),
  'orders',(select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) from public.khsx_orders o where o.production_date between date '2026-08-25' and date '2026-08-29'),
  'assignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.khsx_order_assignments a join public.khsx_orders o on o.id=a.order_id where o.production_date between date '2026-08-25' and date '2026-08-29'),
  'daily_assignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.khsx_daily_assignments a join public.khsx_orders o on o.id=a.order_id where o.production_date between date '2026-08-25' and date '2026-08-29'),
  'progress',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.khsx_stage_progress p where p.work_date between date '2026-08-25' and date '2026-08-29'),
  'credits',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.khsx_stage_credits c where c.work_date between date '2026-08-25' and date '2026-08-29')
),null,now()
on conflict (key) do nothing;

update public.khsx_orders
set deleted_at=coalesce(deleted_at,now()),cancel_reason='Đối chiếu bản live cũ v83 trong v123',cancelled_by=null,updated_at=now()
where id in ('r_25_08_2026_SORA20_4_140_200_20_10_1__lo1','r_25_08_2026_SORA20_4_140_200_20_10_1__lo2','r_28_08_2026_STD10_1_100_120_10_1_1','r_28_08_2026_HYB20_2020_200_200_20_1_1');

delete from public.khsx_stage_credits where order_id in ('r_25_08_2026_SORA20_4_140_200_20_10_1__lo1','r_25_08_2026_SORA20_4_140_200_20_10_1__lo2','r_28_08_2026_STD10_1_100_120_10_1_1','r_28_08_2026_HYB20_2020_200_200_20_1_1');
delete from public.khsx_stage_progress where order_id in ('r_25_08_2026_SORA20_4_140_200_20_10_1__lo1','r_25_08_2026_SORA20_4_140_200_20_10_1__lo2','r_28_08_2026_STD10_1_100_120_10_1_1','r_28_08_2026_HYB20_2020_200_200_20_1_1');
delete from public.khsx_daily_assignments where order_id in ('r_25_08_2026_SORA20_4_140_200_20_10_1__lo1','r_25_08_2026_SORA20_4_140_200_20_10_1__lo2','r_28_08_2026_STD10_1_100_120_10_1_1','r_28_08_2026_HYB20_2020_200_200_20_1_1');
delete from public.khsx_order_assignments where order_id in ('r_25_08_2026_SORA20_4_140_200_20_10_1__lo1','r_25_08_2026_SORA20_4_140_200_20_10_1__lo2','r_28_08_2026_STD10_1_100_120_10_1_1','r_28_08_2026_HYB20_2020_200_200_20_1_1');

insert into public.khsx_orders(
  id,production_date,product_code,product_name,width_mm,length_mm,thickness_mm,plan_qty,note,order_group,
  source_order_id,is_manual,is_drop,is_ghost,is_warranty,is_lot,lot_label,source_payload,deleted_at
) values
('bh_27-08-2026','2026-08-27','','Bảo hành',null,200,null,29,'','Bảo hành',null,'false','false','false','true','false','','{"clone_run":"20260903014247","live_row":{"id":"bh_27-08-2026","date":"27/08/2026","ma":"","dong":"Bảo hành","ngang":"","dai":"","day":"","so_luong":29,"ghi_chu":"","is_warranty":true,"bh_theo_to":{"Tổ 4":6,"Tổ 1":23},"bh_chi_tiet":[{"ten":"Latex Gold","kich_thuoc":"160x15","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Premium","kich_thuoc":"180x15","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Gold","kich_thuoc":"180x20","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"160x15","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"140x15","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"180x15","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"180x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"220x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Enzo","kich_thuoc":"180x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"180x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"160x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Gold","kich_thuoc":"180x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Gold","kich_thuoc":"160x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách D Viền","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Classic","kich_thuoc":"180x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Gãy"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Hủy"},{"ten":"Latex Gold","kich_thuoc":"140x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách mặt nệm","Rách D Viền","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền, dán mặt D mói"},{"ten":"3-Zone","kich_thuoc":"220x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"120x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Gold","kich_thuoc":"140x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách D Viền"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Classic","kich_thuoc":"120x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách D Viền","Bung viền D"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Sora","kich_thuoc":"120x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Standard","kich_thuoc":"200x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Gãy"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Hủy"},{"ten":"Sora","kich_thuoc":"160x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Gold","kich_thuoc":"140x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Gold","kich_thuoc":"160x297x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Lỗi khác"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Dán thêm keo"},{"ten":"Latex Gold","kich_thuoc":"180x10","to":"Tổ 1","so_luong":2,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"180x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Classic","kich_thuoc":"180x15","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Latex Gold","kich_thuoc":"180x10","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"}]},"live_assignment":{}}'::jsonb,null),
('bh_28-08-2026','2026-08-28','','Bảo hành',null,200,null,23,'','Bảo hành',null,'false','false','false','true','false','','{"clone_run":"20260903014247","live_row":{"id":"bh_28-08-2026","date":"28/08/2026","ma":"","dong":"Bảo hành","ngang":"","dai":"","day":"","so_luong":23,"ghi_chu":"","is_warranty":true,"bh_theo_to":{"Tổ 1":2,"Tổ 3":2,"Tổ 2":17,"Tổ 4":2},"bh_chi_tiet":[{"ten":"Standard","kich_thuoc":"120x20","to":"Tổ 1","so_luong":1,"loi":["May tay","Mềm","Lỗi khác"],"nguyen_nhan":"Lão hóa do sử dụng","huong_xu_ly":"Hủy"},{"ten":"3-Zone","kich_thuoc":"160x17","to":"Tổ 1","so_luong":1,"loi":["May tay","Bẩn áo","Rách D Viền","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Standard","kich_thuoc":"140x15","to":"Tổ 3","so_luong":1,"loi":["May tay","Rách mặt nệm","Rách D Viền","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D, dán mặt D mới"},{"ten":"Standard","kich_thuoc":"140x10","to":"Tổ 3","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Standard","kich_thuoc":"120x20","to":"Tổ 2","so_luong":1,"loi":["May tay","Mềm","Lỗi khác"],"nguyen_nhan":"Lão hóa do sử dụng","huong_xu_ly":"Hủy"},{"ten":"3-Zone","kich_thuoc":"160x17","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Standard","kich_thuoc":"180x10","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"3-Zone","kich_thuoc":"180x17","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"1Hybrib","kich_thuoc":"200x27","to":"Tổ 4","so_luong":1,"loi":["May tay","Bẩn áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"160x10","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo"},{"ten":"Sora","kich_thuoc":"160x10","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Rách D Viền","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Luna","kich_thuoc":"180x15","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Rách mặt nệm","Rách D Viền","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D, dán mặt D mới"},{"ten":"Sora","kich_thuoc":"180x20","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Rách D Viền","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Sora","kich_thuoc":"220x20","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Rách mặt nệm","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D, dán mặt D 220 mới"},{"ten":"Classic","kich_thuoc":"180x15","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Latex Gold","kich_thuoc":"180x15","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Sora","kich_thuoc":"160x20","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Sora","kich_thuoc":"100x10","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Classic","kich_thuoc":"140x15","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Classic","kich_thuoc":"180x15","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách áo","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Classic","kich_thuoc":"220x10","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Latex Enzo","kich_thuoc":"180x15","to":"Tổ 2","so_luong":1,"loi":["May tay","Bẩn áo","Bung viền D","Rách bao bì"],"nguyen_nhan":"Lưu kho, vận chuyển chưa đúng cách.","huong_xu_ly":"Thay áo, thay bao keo, dán lại viền D"},{"ten":"Sora","kich_thuoc":"180x10","to":"Tổ 2","so_luong":1,"loi":["May tay","Lỗi khác"],"nguyen_nhan":"QC sót đầu ra","huong_xu_ly":"Lấy mút vụn ra, mặc áo lại, đóng gói mới"}]},"live_assignment":{}}'::jsonb,null)
on conflict (id) do update set
  production_date=excluded.production_date,product_code=excluded.product_code,product_name=excluded.product_name,
  width_mm=excluded.width_mm,length_mm=excluded.length_mm,thickness_mm=excluded.thickness_mm,
  plan_qty=excluded.plan_qty,note=excluded.note,order_group=excluded.order_group,is_warranty=true,
  source_payload=excluded.source_payload,deleted_at=null,cancel_reason=null,cancelled_by=null,updated_at=now();

insert into public.khsx_order_assignments(order_id,plan_team,current_team,change_note,priority)
values
('r_28_08_2026_CLS15_2022_220_200_15_5_1','To 3','To 3','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_CLS20_6_160_200_20_5_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_HYB20_8_180_200_20_3_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_HYBP27_2022_220_200_27_1_1','To 5','To 5','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_LAGO20_6_160_200_20_5_1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_PRE10_6_160_200_10_15_1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_SORA10_2020_200_200_10_5_1','To 3','To 3','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','To 3','To 3','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_SORA15_2_120_170_15_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_SORA15_4_140_180_15_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','To 3','To 3','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_STD10_1_80_180_10_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_STD15_4_140_200_15_9_1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_STD20_2022_220_200_20_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_28_08_2026_ZONE12_8_188_220_12_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_LAGO10_6_160_200_10_15_1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_PRE15_6_160_200_15_9_1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_LAGO15_8_180_200_15_9_1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_SORA15_8_180_200_15_9_1','To 1','To 1','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_SORA10_2_120_200_10_15_1','To 2','To 2','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_SORA10_6_160_200_10_15_1','To 2','To 2','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_SORA15_4_140_200_15_9_1','To 2','To 2','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_CLS20_6_160_200_20_5_1','To 2','To 2','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_LAGO10_4_140_170_10_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_SORA10_6_157_208_10_2_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_CLS15_2022_220_200_15_3_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_ZONE17_6_160_200_17_5_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_SORA20_8_90_200_20_2_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_LAGO20_2_116_201_20_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_LAEZ20_2020_200_200_20_1_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_SORA20_2020_200_200_20_2_1','To 4','To 4','Đối chiếu bản live cũ v83 trong v123','false'),
('r_29_08_2026_ZONE17_8_180_200_17_5_1','To 5','To 5','Đối chiếu bản live cũ v83 trong v123','false')
on conflict (order_id) do update set plan_team=excluded.plan_team,current_team=excluded.current_team,
  change_note=excluded.change_note,updated_at=now();

insert into public.khsx_daily_assignments(order_id,work_date,team_name,assignment_kind,assigned_by,updated_at)
values ('r_28_08_2026_HYBP27_2022_220_200_27_1_1',date '2026-08-29','To 5','support',null,now())
on conflict (order_id,work_date,assignment_kind) do update set team_name=excluded.team_name,assigned_by=null,updated_at=now();

delete from public.khsx_stage_progress
where (order_id in ('r_28_08_2026_CLS15_2022_220_200_15_5_1','r_28_08_2026_CLS20_6_160_200_20_5_1','r_28_08_2026_HYB20_8_180_200_20_3_1','r_28_08_2026_HYBP27_2022_220_200_27_1_1','r_28_08_2026_LAGO20_6_160_200_20_5_1','r_28_08_2026_PRE10_6_160_200_10_15_1','r_28_08_2026_SORA10_2020_200_200_10_5_1','r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','r_28_08_2026_SORA15_2_120_170_15_1_1','r_28_08_2026_SORA15_4_140_180_15_1_1','r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','r_28_08_2026_STD10_1_80_180_10_1_1','r_28_08_2026_STD15_4_140_200_15_9_1','r_28_08_2026_STD20_2022_220_200_20_1_1','r_28_08_2026_ZONE12_8_188_220_12_1_1','r_29_08_2026_LAGO10_6_160_200_10_15_1','r_29_08_2026_PRE15_6_160_200_15_9_1','r_29_08_2026_LAGO15_8_180_200_15_9_1','r_29_08_2026_SORA15_8_180_200_15_9_1','r_29_08_2026_SORA10_2_120_200_10_15_1','r_29_08_2026_SORA10_6_160_200_10_15_1','r_29_08_2026_SORA15_4_140_200_15_9_1','r_29_08_2026_CLS20_6_160_200_20_5_1','r_29_08_2026_LAGO10_4_140_170_10_1_1','r_29_08_2026_SORA10_6_157_208_10_2_1','r_29_08_2026_CLS15_2022_220_200_15_3_1','r_29_08_2026_ZONE17_6_160_200_17_5_1','r_29_08_2026_SORA20_8_90_200_20_2_1','r_29_08_2026_LAGO20_2_116_201_20_1_1','r_29_08_2026_LAEZ20_2020_200_200_20_1_1','r_29_08_2026_SORA20_2020_200_200_20_2_1','r_29_08_2026_ZONE17_8_180_200_17_5_1') and work_date between date '2026-08-28' and date '2026-08-29')
   or (order_id='r_27_08_2026_LAEZ15_2022_220_200_15_2_1' and stage='dong_goi' and work_date between date '2026-08-27' and date '2026-08-28');

delete from public.khsx_stage_credits
where (order_id in ('r_28_08_2026_CLS15_2022_220_200_15_5_1','r_28_08_2026_CLS20_6_160_200_20_5_1','r_28_08_2026_HYB20_8_180_200_20_3_1','r_28_08_2026_HYBP27_2022_220_200_27_1_1','r_28_08_2026_LAGO20_6_160_200_20_5_1','r_28_08_2026_PRE10_6_160_200_10_15_1','r_28_08_2026_SORA10_2020_200_200_10_5_1','r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','r_28_08_2026_SORA15_2_120_170_15_1_1','r_28_08_2026_SORA15_4_140_180_15_1_1','r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','r_28_08_2026_STD10_1_80_180_10_1_1','r_28_08_2026_STD15_4_140_200_15_9_1','r_28_08_2026_STD20_2022_220_200_20_1_1','r_28_08_2026_ZONE12_8_188_220_12_1_1','r_29_08_2026_LAGO10_6_160_200_10_15_1','r_29_08_2026_PRE15_6_160_200_15_9_1','r_29_08_2026_LAGO15_8_180_200_15_9_1','r_29_08_2026_SORA15_8_180_200_15_9_1','r_29_08_2026_SORA10_2_120_200_10_15_1','r_29_08_2026_SORA10_6_160_200_10_15_1','r_29_08_2026_SORA15_4_140_200_15_9_1','r_29_08_2026_CLS20_6_160_200_20_5_1','r_29_08_2026_LAGO10_4_140_170_10_1_1','r_29_08_2026_SORA10_6_157_208_10_2_1','r_29_08_2026_CLS15_2022_220_200_15_3_1','r_29_08_2026_ZONE17_6_160_200_17_5_1','r_29_08_2026_SORA20_8_90_200_20_2_1','r_29_08_2026_LAGO20_2_116_201_20_1_1','r_29_08_2026_LAEZ20_2020_200_200_20_1_1','r_29_08_2026_SORA20_2020_200_200_20_2_1','r_29_08_2026_ZONE17_8_180_200_17_5_1') and work_date between date '2026-08-28' and date '2026-08-29')
   or (order_id='r_27_08_2026_LAEZ15_2022_220_200_15_2_1' and stage='dong_goi' and work_date between date '2026-08-27' and date '2026-08-28');

insert into public.khsx_stage_progress(order_id,work_date,stage,quantity,kpi_team,entered_by,completed_by_worker_id)
values
('r_28_08_2026_CLS15_2022_220_200_15_5_1','2026-08-28','dan',5,'To 3',null,null),
('r_28_08_2026_CLS15_2022_220_200_15_5_1','2026-08-28','may',5,'To 3',null,'loan_anh'),
('r_28_08_2026_CLS15_2022_220_200_15_5_1','2026-08-28','dong_goi',5,'To 3',null,'minh_thuan'),
('r_28_08_2026_CLS20_6_160_200_20_5_1','2026-08-28','dan',5,'To 4',null,null),
('r_28_08_2026_CLS20_6_160_200_20_5_1','2026-08-28','may',5,'To 4',null,'loan_anh'),
('r_28_08_2026_CLS20_6_160_200_20_5_1','2026-08-28','dong_goi',5,'To 4',null,'minh_thuan'),
('r_28_08_2026_HYB20_8_180_200_20_3_1','2026-08-28','dan',3,'To 4',null,null),
('r_28_08_2026_HYB20_8_180_200_20_3_1','2026-08-28','may',3,'To 4',null,'loan_anh'),
('r_28_08_2026_HYB20_8_180_200_20_3_1','2026-08-28','dong_goi',3,'To 4',null,'minh_thuan'),
('r_28_08_2026_HYBP27_2022_220_200_27_1_1','2026-08-29','dan',1,'To 5',null,null),
('r_28_08_2026_HYBP27_2022_220_200_27_1_1','2026-08-29','may',1,'To 5',null,'thao_vy'),
('r_28_08_2026_HYBP27_2022_220_200_27_1_1','2026-08-29','dong_goi',1,'To 5',null,'minh_thuan'),
('r_28_08_2026_LAGO20_6_160_200_20_5_1','2026-08-28','dan',5,'To 1',null,null),
('r_28_08_2026_LAGO20_6_160_200_20_5_1','2026-08-28','may',5,'To 1',null,'thao_vy'),
('r_28_08_2026_LAGO20_6_160_200_20_5_1','2026-08-28','dong_goi',5,'To 1',null,'minh_thuan'),
('r_28_08_2026_PRE10_6_160_200_10_15_1','2026-08-28','dan',15,'To 1',null,null),
('r_28_08_2026_PRE10_6_160_200_10_15_1','2026-08-28','may',15,'To 1',null,'thao_vy'),
('r_28_08_2026_PRE10_6_160_200_10_15_1','2026-08-28','dong_goi',15,'To 1',null,'minh_thuan'),
('r_28_08_2026_SORA10_2020_200_200_10_5_1','2026-08-28','dan',5,'To 3',null,null),
('r_28_08_2026_SORA10_2020_200_200_10_5_1','2026-08-28','may',5,'To 3',null,'loan_anh'),
('r_28_08_2026_SORA10_2020_200_200_10_5_1','2026-08-28','dong_goi',5,'To 3',null,'minh_thuan'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','2026-08-28','dan',15,'To 1',null,null),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','2026-08-28','may',15,'To 1',null,'thao_vy'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','2026-08-28','dong_goi',15,'To 1',null,'minh_thuan'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','2026-08-28','dan',15,'To 3',null,null),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','2026-08-28','may',15,'To 3',null,'loan_anh'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','2026-08-28','dong_goi',15,'To 3',null,'minh_thuan'),
('r_28_08_2026_SORA15_2_120_170_15_1_1','2026-08-28','dan',1,'To 4',null,null),
('r_28_08_2026_SORA15_2_120_170_15_1_1','2026-08-28','may',1,'To 4',null,'loan_anh'),
('r_28_08_2026_SORA15_2_120_170_15_1_1','2026-08-28','dong_goi',1,'To 4',null,'minh_thuan'),
('r_28_08_2026_SORA15_4_140_180_15_1_1','2026-08-28','dan',1,'To 4',null,null),
('r_28_08_2026_SORA15_4_140_180_15_1_1','2026-08-28','may',1,'To 4',null,'loan_anh'),
('r_28_08_2026_SORA15_4_140_180_15_1_1','2026-08-28','dong_goi',1,'To 4',null,'minh_thuan'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','2026-08-28','dan',5,'To 4',null,null),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','2026-08-28','may',5,'To 4',null,'loan_anh'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','2026-08-28','dong_goi',5,'To 4',null,'minh_thuan'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','2026-08-28','dan',5,'To 3',null,null),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','2026-08-28','may',5,'To 3',null,'loan_anh'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','2026-08-28','dong_goi',5,'To 3',null,'minh_thuan'),
('r_28_08_2026_STD10_1_80_180_10_1_1','2026-08-28','dan',1,'To 4',null,null),
('r_28_08_2026_STD10_1_80_180_10_1_1','2026-08-28','may',1,'To 4',null,'loan_anh'),
('r_28_08_2026_STD10_1_80_180_10_1_1','2026-08-28','dong_goi',1,'To 4',null,'minh_thuan'),
('r_28_08_2026_STD15_4_140_200_15_9_1','2026-08-28','dan',9,'To 1',null,null),
('r_28_08_2026_STD15_4_140_200_15_9_1','2026-08-28','may',9,'To 1',null,'thao_vy'),
('r_28_08_2026_STD15_4_140_200_15_9_1','2026-08-28','dong_goi',9,'To 1',null,'minh_thuan'),
('r_28_08_2026_STD20_2022_220_200_20_1_1','2026-08-28','dan',1,'To 4',null,null),
('r_28_08_2026_STD20_2022_220_200_20_1_1','2026-08-28','may',1,'To 4',null,'loan_anh'),
('r_28_08_2026_STD20_2022_220_200_20_1_1','2026-08-28','dong_goi',1,'To 4',null,'minh_thuan'),
('r_28_08_2026_ZONE12_8_188_220_12_1_1','2026-08-28','dan',1,'To 4',null,null),
('r_28_08_2026_ZONE12_8_188_220_12_1_1','2026-08-28','may',1,'To 4',null,'loan_anh'),
('r_28_08_2026_ZONE12_8_188_220_12_1_1','2026-08-28','dong_goi',1,'To 4',null,'minh_thuan'),
('r_29_08_2026_LAGO10_6_160_200_10_15_1','2026-08-29','dan',15,'To 1',null,null),
('r_29_08_2026_LAGO10_6_160_200_10_15_1','2026-08-29','may',15,'To 1',null,'thao_vy'),
('r_29_08_2026_LAGO10_6_160_200_10_15_1','2026-08-29','dong_goi',15,'To 1',null,'minh_thuan'),
('r_29_08_2026_PRE15_6_160_200_15_9_1','2026-08-29','dan',9,'To 1',null,null),
('r_29_08_2026_PRE15_6_160_200_15_9_1','2026-08-29','may',9,'To 1',null,'thao_vy'),
('r_29_08_2026_PRE15_6_160_200_15_9_1','2026-08-29','dong_goi',9,'To 1',null,'minh_thuan'),
('r_29_08_2026_LAGO15_8_180_200_15_9_1','2026-08-29','dan',9,'To 1',null,null),
('r_29_08_2026_LAGO15_8_180_200_15_9_1','2026-08-29','may',9,'To 1',null,'thao_vy'),
('r_29_08_2026_LAGO15_8_180_200_15_9_1','2026-08-29','dong_goi',9,'To 1',null,'minh_thuan'),
('r_29_08_2026_SORA15_8_180_200_15_9_1','2026-08-29','dan',9,'To 1',null,null),
('r_29_08_2026_SORA15_8_180_200_15_9_1','2026-08-29','may',9,'To 1',null,'thao_vy'),
('r_29_08_2026_SORA15_8_180_200_15_9_1','2026-08-29','dong_goi',9,'To 1',null,'minh_thuan'),
('r_29_08_2026_SORA10_2_120_200_10_15_1','2026-08-29','dan',15,'To 2',null,null),
('r_29_08_2026_SORA10_2_120_200_10_15_1','2026-08-29','may',15,'To 2',null,'bao_cham'),
('r_29_08_2026_SORA10_2_120_200_10_15_1','2026-08-29','dong_goi',15,'To 2',null,'minh_thuan'),
('r_29_08_2026_SORA10_6_160_200_10_15_1','2026-08-29','dan',15,'To 2',null,null),
('r_29_08_2026_SORA10_6_160_200_10_15_1','2026-08-29','may',15,'To 2',null,'bao_cham'),
('r_29_08_2026_SORA10_6_160_200_10_15_1','2026-08-29','dong_goi',15,'To 2',null,'minh_thuan'),
('r_29_08_2026_SORA15_4_140_200_15_9_1','2026-08-29','dan',9,'To 2',null,null),
('r_29_08_2026_SORA15_4_140_200_15_9_1','2026-08-29','may',9,'To 2',null,'bao_cham'),
('r_29_08_2026_SORA15_4_140_200_15_9_1','2026-08-29','dong_goi',9,'To 2',null,'minh_thuan'),
('r_29_08_2026_CLS20_6_160_200_20_5_1','2026-08-29','dan',5,'To 2',null,null),
('r_29_08_2026_CLS20_6_160_200_20_5_1','2026-08-29','may',5,'To 2',null,'bao_cham'),
('r_29_08_2026_CLS20_6_160_200_20_5_1','2026-08-29','dong_goi',5,'To 2',null,'minh_thuan'),
('r_29_08_2026_LAGO10_4_140_170_10_1_1','2026-08-29','dan',1,'To 4',null,null),
('r_29_08_2026_LAGO10_4_140_170_10_1_1','2026-08-29','may',1,'To 4',null,'loan_anh'),
('r_29_08_2026_LAGO10_4_140_170_10_1_1','2026-08-29','dong_goi',1,'To 4',null,'minh_thuan'),
('r_29_08_2026_SORA10_6_157_208_10_2_1','2026-08-29','dan',2,'To 4',null,null),
('r_29_08_2026_SORA10_6_157_208_10_2_1','2026-08-29','may',2,'To 4',null,'loan_anh'),
('r_29_08_2026_SORA10_6_157_208_10_2_1','2026-08-29','dong_goi',2,'To 4',null,'minh_thuan'),
('r_29_08_2026_CLS15_2022_220_200_15_3_1','2026-08-29','dan',3,'To 4',null,null),
('r_29_08_2026_CLS15_2022_220_200_15_3_1','2026-08-29','may',3,'To 4',null,'loan_anh'),
('r_29_08_2026_CLS15_2022_220_200_15_3_1','2026-08-29','dong_goi',3,'To 4',null,'minh_thuan'),
('r_29_08_2026_ZONE17_6_160_200_17_5_1','2026-08-29','dan',5,'To 4',null,null),
('r_29_08_2026_ZONE17_6_160_200_17_5_1','2026-08-29','may',5,'To 4',null,'loan_anh'),
('r_29_08_2026_ZONE17_6_160_200_17_5_1','2026-08-29','dong_goi',5,'To 4',null,'minh_thuan'),
('r_29_08_2026_SORA20_8_90_200_20_2_1','2026-08-29','dan',2,'To 4',null,null),
('r_29_08_2026_SORA20_8_90_200_20_2_1','2026-08-29','may',2,'To 4',null,'loan_anh'),
('r_29_08_2026_SORA20_8_90_200_20_2_1','2026-08-29','dong_goi',2,'To 4',null,'minh_thuan'),
('r_29_08_2026_LAGO20_2_116_201_20_1_1','2026-08-29','dan',1,'To 4',null,null),
('r_29_08_2026_LAGO20_2_116_201_20_1_1','2026-08-29','may',1,'To 4',null,'loan_anh'),
('r_29_08_2026_LAGO20_2_116_201_20_1_1','2026-08-29','dong_goi',1,'To 4',null,'minh_thuan'),
('r_29_08_2026_LAEZ20_2020_200_200_20_1_1','2026-08-29','dan',1,'To 4',null,null),
('r_29_08_2026_LAEZ20_2020_200_200_20_1_1','2026-08-29','may',1,'To 4',null,'loan_anh'),
('r_29_08_2026_LAEZ20_2020_200_200_20_1_1','2026-08-29','dong_goi',1,'To 4',null,'minh_thuan'),
('r_29_08_2026_SORA20_2020_200_200_20_2_1','2026-08-29','dan',2,'To 4',null,null),
('r_29_08_2026_SORA20_2020_200_200_20_2_1','2026-08-29','may',2,'To 4',null,'loan_anh'),
('r_29_08_2026_SORA20_2020_200_200_20_2_1','2026-08-29','dong_goi',2,'To 4',null,'minh_thuan'),
('r_29_08_2026_ZONE17_8_180_200_17_5_1','2026-08-29','dan',5,'To 5',null,null),
('r_29_08_2026_ZONE17_8_180_200_17_5_1','2026-08-29','may',5,'To 5',null,'thao_vy'),
('r_29_08_2026_ZONE17_8_180_200_17_5_1','2026-08-29','dong_goi',5,'To 5',null,'minh_thuan'),
('r_27_08_2026_LAEZ15_2022_220_200_15_2_1','2026-08-27','dong_goi',1,'To 4',null,'minh_thuan'),
('r_27_08_2026_LAEZ15_2022_220_200_15_2_1','2026-08-28','dong_goi',1,'To 4',null,'minh_thuan')
on conflict (order_id,work_date,stage) do update set quantity=excluded.quantity,kpi_team=excluded.kpi_team,
  entered_by=null,completed_by_worker_id=excluded.completed_by_worker_id,updated_at=now();

insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source)
values
('r_28_08_2026_CLS15_2022_220_200_15_5_1','2026-08-28','may','loan_anh',5,'legacy_reconciled_v123'),
('r_28_08_2026_CLS15_2022_220_200_15_5_1','2026-08-28','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_28_08_2026_CLS20_6_160_200_20_5_1','2026-08-28','may','loan_anh',5,'legacy_reconciled_v123'),
('r_28_08_2026_CLS20_6_160_200_20_5_1','2026-08-28','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_28_08_2026_HYB20_8_180_200_20_3_1','2026-08-28','may','loan_anh',3,'legacy_reconciled_v123'),
('r_28_08_2026_HYB20_8_180_200_20_3_1','2026-08-28','dong_goi','minh_thuan',3,'legacy_reconciled_v123'),
('r_28_08_2026_HYBP27_2022_220_200_27_1_1','2026-08-29','may','thao_vy',1,'legacy_reconciled_v123'),
('r_28_08_2026_HYBP27_2022_220_200_27_1_1','2026-08-29','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_28_08_2026_LAGO20_6_160_200_20_5_1','2026-08-28','may','thao_vy',5,'legacy_reconciled_v123'),
('r_28_08_2026_LAGO20_6_160_200_20_5_1','2026-08-28','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_28_08_2026_PRE10_6_160_200_10_15_1','2026-08-28','may','thao_vy',15,'legacy_reconciled_v123'),
('r_28_08_2026_PRE10_6_160_200_10_15_1','2026-08-28','dong_goi','minh_thuan',15,'legacy_reconciled_v123'),
('r_28_08_2026_SORA10_2020_200_200_10_5_1','2026-08-28','may','loan_anh',5,'legacy_reconciled_v123'),
('r_28_08_2026_SORA10_2020_200_200_10_5_1','2026-08-28','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','2026-08-28','may','thao_vy',15,'legacy_reconciled_v123'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','2026-08-28','dong_goi','minh_thuan',15,'legacy_reconciled_v123'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','2026-08-28','may','loan_anh',15,'legacy_reconciled_v123'),
('r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','2026-08-28','dong_goi','minh_thuan',15,'legacy_reconciled_v123'),
('r_28_08_2026_SORA15_2_120_170_15_1_1','2026-08-28','may','loan_anh',1,'legacy_reconciled_v123'),
('r_28_08_2026_SORA15_2_120_170_15_1_1','2026-08-28','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_28_08_2026_SORA15_4_140_180_15_1_1','2026-08-28','may','loan_anh',1,'legacy_reconciled_v123'),
('r_28_08_2026_SORA15_4_140_180_15_1_1','2026-08-28','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','2026-08-28','may','loan_anh',5,'legacy_reconciled_v123'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','2026-08-28','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','2026-08-28','may','loan_anh',5,'legacy_reconciled_v123'),
('r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','2026-08-28','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_28_08_2026_STD10_1_80_180_10_1_1','2026-08-28','may','loan_anh',1,'legacy_reconciled_v123'),
('r_28_08_2026_STD10_1_80_180_10_1_1','2026-08-28','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_28_08_2026_STD15_4_140_200_15_9_1','2026-08-28','may','thao_vy',9,'legacy_reconciled_v123'),
('r_28_08_2026_STD15_4_140_200_15_9_1','2026-08-28','dong_goi','minh_thuan',9,'legacy_reconciled_v123'),
('r_28_08_2026_STD20_2022_220_200_20_1_1','2026-08-28','may','loan_anh',1,'legacy_reconciled_v123'),
('r_28_08_2026_STD20_2022_220_200_20_1_1','2026-08-28','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_28_08_2026_ZONE12_8_188_220_12_1_1','2026-08-28','may','loan_anh',1,'legacy_reconciled_v123'),
('r_28_08_2026_ZONE12_8_188_220_12_1_1','2026-08-28','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO10_6_160_200_10_15_1','2026-08-29','may','thao_vy',15,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO10_6_160_200_10_15_1','2026-08-29','dong_goi','minh_thuan',15,'legacy_reconciled_v123'),
('r_29_08_2026_PRE15_6_160_200_15_9_1','2026-08-29','may','thao_vy',9,'legacy_reconciled_v123'),
('r_29_08_2026_PRE15_6_160_200_15_9_1','2026-08-29','dong_goi','minh_thuan',9,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO15_8_180_200_15_9_1','2026-08-29','may','thao_vy',9,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO15_8_180_200_15_9_1','2026-08-29','dong_goi','minh_thuan',9,'legacy_reconciled_v123'),
('r_29_08_2026_SORA15_8_180_200_15_9_1','2026-08-29','may','thao_vy',9,'legacy_reconciled_v123'),
('r_29_08_2026_SORA15_8_180_200_15_9_1','2026-08-29','dong_goi','minh_thuan',9,'legacy_reconciled_v123'),
('r_29_08_2026_SORA10_2_120_200_10_15_1','2026-08-29','may','bao_cham',15,'legacy_reconciled_v123'),
('r_29_08_2026_SORA10_2_120_200_10_15_1','2026-08-29','dong_goi','minh_thuan',15,'legacy_reconciled_v123'),
('r_29_08_2026_SORA10_6_160_200_10_15_1','2026-08-29','may','bao_cham',15,'legacy_reconciled_v123'),
('r_29_08_2026_SORA10_6_160_200_10_15_1','2026-08-29','dong_goi','minh_thuan',15,'legacy_reconciled_v123'),
('r_29_08_2026_SORA15_4_140_200_15_9_1','2026-08-29','may','bao_cham',9,'legacy_reconciled_v123'),
('r_29_08_2026_SORA15_4_140_200_15_9_1','2026-08-29','dong_goi','minh_thuan',9,'legacy_reconciled_v123'),
('r_29_08_2026_CLS20_6_160_200_20_5_1','2026-08-29','may','bao_cham',5,'legacy_reconciled_v123'),
('r_29_08_2026_CLS20_6_160_200_20_5_1','2026-08-29','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO10_4_140_170_10_1_1','2026-08-29','may','loan_anh',1,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO10_4_140_170_10_1_1','2026-08-29','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_29_08_2026_SORA10_6_157_208_10_2_1','2026-08-29','may','loan_anh',2,'legacy_reconciled_v123'),
('r_29_08_2026_SORA10_6_157_208_10_2_1','2026-08-29','dong_goi','minh_thuan',2,'legacy_reconciled_v123'),
('r_29_08_2026_CLS15_2022_220_200_15_3_1','2026-08-29','may','loan_anh',3,'legacy_reconciled_v123'),
('r_29_08_2026_CLS15_2022_220_200_15_3_1','2026-08-29','dong_goi','minh_thuan',3,'legacy_reconciled_v123'),
('r_29_08_2026_ZONE17_6_160_200_17_5_1','2026-08-29','may','loan_anh',5,'legacy_reconciled_v123'),
('r_29_08_2026_ZONE17_6_160_200_17_5_1','2026-08-29','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_29_08_2026_SORA20_8_90_200_20_2_1','2026-08-29','may','loan_anh',2,'legacy_reconciled_v123'),
('r_29_08_2026_SORA20_8_90_200_20_2_1','2026-08-29','dong_goi','minh_thuan',2,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO20_2_116_201_20_1_1','2026-08-29','may','loan_anh',1,'legacy_reconciled_v123'),
('r_29_08_2026_LAGO20_2_116_201_20_1_1','2026-08-29','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_29_08_2026_LAEZ20_2020_200_200_20_1_1','2026-08-29','may','loan_anh',1,'legacy_reconciled_v123'),
('r_29_08_2026_LAEZ20_2020_200_200_20_1_1','2026-08-29','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_29_08_2026_SORA20_2020_200_200_20_2_1','2026-08-29','may','loan_anh',2,'legacy_reconciled_v123'),
('r_29_08_2026_SORA20_2020_200_200_20_2_1','2026-08-29','dong_goi','minh_thuan',2,'legacy_reconciled_v123'),
('r_29_08_2026_ZONE17_8_180_200_17_5_1','2026-08-29','may','thao_vy',5,'legacy_reconciled_v123'),
('r_29_08_2026_ZONE17_8_180_200_17_5_1','2026-08-29','dong_goi','minh_thuan',5,'legacy_reconciled_v123'),
('r_27_08_2026_LAEZ15_2022_220_200_15_2_1','2026-08-27','dong_goi','minh_thuan',1,'legacy_reconciled_v123'),
('r_27_08_2026_LAEZ15_2022_220_200_15_2_1','2026-08-28','dong_goi','minh_thuan',1,'legacy_reconciled_v123')
on conflict (order_id,work_date,stage,worker_id) do update set quantity=excluded.quantity,source=excluded.source,updated_at=now();

update public.khsx_orders
set source_payload=jsonb_set(coalesce(source_payload,'{}'::jsonb),'{reconciliation_v123}',
  jsonb_build_object('source','old_live_v83','verified_at',now(),'range','2026-08-25..2026-08-29'),true),updated_at=now()
where id in ('r_28_08_2026_CLS15_2022_220_200_15_5_1','r_28_08_2026_CLS20_6_160_200_20_5_1','r_28_08_2026_HYB20_8_180_200_20_3_1','r_28_08_2026_HYBP27_2022_220_200_27_1_1','r_28_08_2026_LAGO20_6_160_200_20_5_1','r_28_08_2026_PRE10_6_160_200_10_15_1','r_28_08_2026_SORA10_2020_200_200_10_5_1','r_28_08_2026_SORA10_6_160_200_10_30_1__lo1','r_28_08_2026_SORA10_6_160_200_10_30_1__lo2','r_28_08_2026_SORA15_2_120_170_15_1_1','r_28_08_2026_SORA15_4_140_180_15_1_1','r_28_08_2026_SORA20_6_160_200_20_10_1__lo1','r_28_08_2026_SORA20_6_160_200_20_10_1__lo2','r_28_08_2026_STD10_1_80_180_10_1_1','r_28_08_2026_STD15_4_140_200_15_9_1','r_28_08_2026_STD20_2022_220_200_20_1_1','r_28_08_2026_ZONE12_8_188_220_12_1_1','r_29_08_2026_LAGO10_6_160_200_10_15_1','r_29_08_2026_PRE15_6_160_200_15_9_1','r_29_08_2026_LAGO15_8_180_200_15_9_1','r_29_08_2026_SORA15_8_180_200_15_9_1','r_29_08_2026_SORA10_2_120_200_10_15_1','r_29_08_2026_SORA10_6_160_200_10_15_1','r_29_08_2026_SORA15_4_140_200_15_9_1','r_29_08_2026_CLS20_6_160_200_20_5_1','r_29_08_2026_LAGO10_4_140_170_10_1_1','r_29_08_2026_SORA10_6_157_208_10_2_1','r_29_08_2026_CLS15_2022_220_200_15_3_1','r_29_08_2026_ZONE17_6_160_200_17_5_1','r_29_08_2026_SORA20_8_90_200_20_2_1','r_29_08_2026_LAGO20_2_116_201_20_1_1','r_29_08_2026_LAEZ20_2020_200_200_20_1_1','r_29_08_2026_SORA20_2020_200_200_20_2_1','r_29_08_2026_ZONE17_8_180_200_17_5_1');

do $$
declare bad text;
begin
  with expected(work_date,stage,qty) as (values
    (date '2026-08-25','dan'::public.khsx_stage,151),(date '2026-08-25','may'::public.khsx_stage,156),(date '2026-08-25','dong_goi'::public.khsx_stage,164),
    (date '2026-08-26','dan'::public.khsx_stage,184),(date '2026-08-26','may'::public.khsx_stage,189),(date '2026-08-26','dong_goi'::public.khsx_stage,189),
    (date '2026-08-27','dan'::public.khsx_stage,102),(date '2026-08-27','may'::public.khsx_stage,102),(date '2026-08-27','dong_goi'::public.khsx_stage,103),
    (date '2026-08-28','dan'::public.khsx_stage,92),(date '2026-08-28','may'::public.khsx_stage,92),(date '2026-08-28','dong_goi'::public.khsx_stage,93),
    (date '2026-08-29','dan'::public.khsx_stage,109),(date '2026-08-29','may'::public.khsx_stage,109),(date '2026-08-29','dong_goi'::public.khsx_stage,109)
  ), actual as (
    select work_date,stage,sum(quantity)::int qty from public.khsx_stage_progress
    where work_date between date '2026-08-25' and date '2026-08-29' group by work_date,stage
  )
  select string_agg(e.work_date||'/'||e.stage||': '||coalesce(a.qty,0)||' != '||e.qty,', ')
  into bad from expected e left join actual a using(work_date,stage) where coalesce(a.qty,0)<>e.qty;
  if bad is not null then raise exception 'Sai tổng công đoạn v123: %',bad; end if;

  with expected(production_date,qty) as (values
    (date '2026-08-25',163),(date '2026-08-26',169),(date '2026-08-27',102),(date '2026-08-28',93),(date '2026-08-29',108)
  ), actual as (
    select production_date,sum(plan_qty)::int qty from public.khsx_orders
    where deleted_at is null and not is_manual and not is_drop and not is_ghost and not is_warranty
      and production_date between date '2026-08-25' and date '2026-08-29' group by production_date
  )
  select string_agg(e.production_date||': '||coalesce(a.qty,0)||' != '||e.qty,', ')
  into bad from expected e left join actual a using(production_date) where coalesce(a.qty,0)<>e.qty;
  if bad is not null then raise exception 'Sai KHSX v123: %',bad; end if;

  if (select coalesce(sum(plan_qty),0) from public.khsx_orders where deleted_at is null and is_warranty
      and production_date between date '2026-08-01' and date '2026-08-31') <> 122 then
    raise exception 'Bảo hành tháng 8 chưa đạt 122 tấm';
  end if;

  if exists(select 1 from public.khsx_orders where id in ('r_25_08_2026_SORA20_4_140_200_20_10_1__lo1','r_25_08_2026_SORA20_4_140_200_20_10_1__lo2','r_28_08_2026_STD10_1_100_120_10_1_1','r_28_08_2026_HYB20_2020_200_200_20_1_1') and deleted_at is null) then
    raise exception 'Còn bản ghi trùng/đã xóa bị hoạt động';
  end if;

  if exists(
    select 1 from public.khsx_orders o left join public.khsx_order_assignments a on a.order_id=o.id
    where o.deleted_at is null and not o.is_manual and not o.is_drop and not o.is_ghost and not o.is_warranty
      and o.production_date between date '2026-08-28' and date '2026-08-29'
      and (a.current_team is null or a.plan_team is null)
  ) then raise exception 'Còn đơn 28-29/08 chưa có tổ'; end if;

  if exists(
    select 1 from public.khsx_orders o join (
      select order_id,sum(quantity) filter(where stage='dan') dan,sum(quantity) filter(where stage='may') may,
             sum(quantity) filter(where stage='dong_goi') dong_goi from public.khsx_stage_progress group by order_id
    ) p on p.order_id=o.id
    where o.production_date between date '2026-08-25' and date '2026-08-29'
      and (coalesce(p.may,0)>coalesce(p.dan,0) or coalesce(p.dong_goi,0)>coalesce(p.may,0)
       or greatest(coalesce(p.dan,0),coalesce(p.may,0),coalesce(p.dong_goi,0))>o.plan_qty)
  ) then raise exception 'Chuỗi công đoạn vượt kế hoạch'; end if;
end $$;

commit;
