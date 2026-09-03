import fs from 'node:fs';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Dùng: node tools/build-v123-reconciliation.mjs <live-source.json> <migration.sql>');
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const sqlText = value => `'${String(value).replaceAll("'", "''")}'`;
const jsonb = value => `${sqlText(JSON.stringify(value))}::jsonb`;

const staleIds = [
  'r_25_08_2026_SORA20_4_140_200_20_10_1__lo1',
  'r_25_08_2026_SORA20_4_140_200_20_10_1__lo2',
  'r_28_08_2026_STD10_1_100_120_10_1_1',
  'r_28_08_2026_HYB20_2020_200_200_20_1_1'
];

const teams = new Map(Object.entries({
  'r_28_08_2026_CLS15_2022_220_200_15_5_1': 'To 3',
  'r_28_08_2026_CLS20_6_160_200_20_5_1': 'To 4',
  'r_28_08_2026_HYB20_8_180_200_20_3_1': 'To 4',
  'r_28_08_2026_HYBP27_2022_220_200_27_1_1': 'To 5',
  'r_28_08_2026_LAGO20_6_160_200_20_5_1': 'To 1',
  'r_28_08_2026_PRE10_6_160_200_10_15_1': 'To 1',
  'r_28_08_2026_SORA10_2020_200_200_10_5_1': 'To 3',
  'r_28_08_2026_SORA10_6_160_200_10_30_1__lo1': 'To 1',
  'r_28_08_2026_SORA10_6_160_200_10_30_1__lo2': 'To 3',
  'r_28_08_2026_SORA15_2_120_170_15_1_1': 'To 4',
  'r_28_08_2026_SORA15_4_140_180_15_1_1': 'To 4',
  'r_28_08_2026_SORA20_6_160_200_20_10_1__lo1': 'To 4',
  'r_28_08_2026_SORA20_6_160_200_20_10_1__lo2': 'To 3',
  'r_28_08_2026_STD10_1_80_180_10_1_1': 'To 4',
  'r_28_08_2026_STD15_4_140_200_15_9_1': 'To 1',
  'r_28_08_2026_STD20_2022_220_200_20_1_1': 'To 4',
  'r_28_08_2026_ZONE12_8_188_220_12_1_1': 'To 4',

  'r_29_08_2026_LAGO10_6_160_200_10_15_1': 'To 1',
  'r_29_08_2026_PRE15_6_160_200_15_9_1': 'To 1',
  'r_29_08_2026_LAGO15_8_180_200_15_9_1': 'To 1',
  'r_29_08_2026_SORA15_8_180_200_15_9_1': 'To 1',
  'r_29_08_2026_SORA10_2_120_200_10_15_1': 'To 2',
  'r_29_08_2026_SORA10_6_160_200_10_15_1': 'To 2',
  'r_29_08_2026_SORA15_4_140_200_15_9_1': 'To 2',
  'r_29_08_2026_CLS20_6_160_200_20_5_1': 'To 2',
  'r_29_08_2026_LAGO10_4_140_170_10_1_1': 'To 4',
  'r_29_08_2026_SORA10_6_157_208_10_2_1': 'To 4',
  'r_29_08_2026_CLS15_2022_220_200_15_3_1': 'To 4',
  'r_29_08_2026_ZONE17_6_160_200_17_5_1': 'To 4',
  'r_29_08_2026_SORA20_8_90_200_20_2_1': 'To 4',
  'r_29_08_2026_LAGO20_2_116_201_20_1_1': 'To 4',
  'r_29_08_2026_LAEZ20_2020_200_200_20_1_1': 'To 4',
  'r_29_08_2026_SORA20_2020_200_200_20_2_1': 'To 4',
  'r_29_08_2026_ZONE17_8_180_200_17_5_1': 'To 5'
}));

const quantities = new Map(Object.entries({
  'r_28_08_2026_CLS15_2022_220_200_15_5_1':5,
  'r_28_08_2026_CLS20_6_160_200_20_5_1':5,
  'r_28_08_2026_HYB20_8_180_200_20_3_1':3,
  'r_28_08_2026_HYBP27_2022_220_200_27_1_1':1,
  'r_28_08_2026_LAGO20_6_160_200_20_5_1':5,
  'r_28_08_2026_PRE10_6_160_200_10_15_1':15,
  'r_28_08_2026_SORA10_2020_200_200_10_5_1':5,
  'r_28_08_2026_SORA10_6_160_200_10_30_1__lo1':15,
  'r_28_08_2026_SORA10_6_160_200_10_30_1__lo2':15,
  'r_28_08_2026_SORA15_2_120_170_15_1_1':1,
  'r_28_08_2026_SORA15_4_140_180_15_1_1':1,
  'r_28_08_2026_SORA20_6_160_200_20_10_1__lo1':5,
  'r_28_08_2026_SORA20_6_160_200_20_10_1__lo2':5,
  'r_28_08_2026_STD10_1_80_180_10_1_1':1,
  'r_28_08_2026_STD15_4_140_200_15_9_1':9,
  'r_28_08_2026_STD20_2022_220_200_20_1_1':1,
  'r_28_08_2026_ZONE12_8_188_220_12_1_1':1,
  'r_29_08_2026_LAGO10_6_160_200_10_15_1':15,
  'r_29_08_2026_PRE15_6_160_200_15_9_1':9,
  'r_29_08_2026_LAGO15_8_180_200_15_9_1':9,
  'r_29_08_2026_SORA15_8_180_200_15_9_1':9,
  'r_29_08_2026_SORA10_2_120_200_10_15_1':15,
  'r_29_08_2026_SORA10_6_160_200_10_15_1':15,
  'r_29_08_2026_SORA15_4_140_200_15_9_1':9,
  'r_29_08_2026_CLS20_6_160_200_20_5_1':5,
  'r_29_08_2026_LAGO10_4_140_170_10_1_1':1,
  'r_29_08_2026_SORA10_6_157_208_10_2_1':2,
  'r_29_08_2026_CLS15_2022_220_200_15_3_1':3,
  'r_29_08_2026_ZONE17_6_160_200_17_5_1':5,
  'r_29_08_2026_SORA20_8_90_200_20_2_1':2,
  'r_29_08_2026_LAGO20_2_116_201_20_1_1':1,
  'r_29_08_2026_LAEZ20_2020_200_200_20_1_1':1,
  'r_29_08_2026_SORA20_2020_200_200_20_2_1':2,
  'r_29_08_2026_ZONE17_8_180_200_17_5_1':5
}));

const orderById = new Map(source.orders.map(order => [order.id, order]));
for (const id of teams.keys()) if (!quantities.has(id)) throw new Error(`Thiếu số lượng đã kiểm chứng: ${id}`);

const carry27 = 'r_27_08_2026_LAEZ15_2022_220_200_15_2_1';
const carry28 = 'r_28_08_2026_HYBP27_2022_220_200_27_1_1';
const progress = [];
for (const [id, team] of teams) {
  const workDate = id.startsWith('r_28_') && id !== carry28 ? '2026-08-28' : '2026-08-29';
  for (const stage of ['dan', 'may', 'dong_goi']) {
    let worker = null;
    if (stage === 'dong_goi') worker = 'minh_thuan';
    if (stage === 'may') worker = team === 'To 1' ? 'thao_vy'
      : team === 'To 2' ? 'bao_cham'
        : ['To 3', 'To 4'].includes(team) ? 'loan_anh'
          : team === 'To 5' ? 'thao_vy' : null;
    progress.push({order_id:id,work_date:workDate,stage,quantity:quantities.get(id),kpi_team:team,completed_by_worker_id:worker});
  }
}
progress.push(
  {order_id:carry27,work_date:'2026-08-27',stage:'dong_goi',quantity:1,kpi_team:'To 4',completed_by_worker_id:'minh_thuan'},
  {order_id:carry27,work_date:'2026-08-28',stage:'dong_goi',quantity:1,kpi_team:'To 4',completed_by_worker_id:'minh_thuan'}
);

const credits = progress.filter(row => row.stage !== 'dan').map(row => ({
  order_id:row.order_id,work_date:row.work_date,stage:row.stage,
  worker_id:row.completed_by_worker_id,quantity:row.quantity,source:'legacy_reconciled_v123'
}));
const warranties = source.orders.filter(order => order.is_warranty && ['2026-08-27', '2026-08-28'].includes(order.production_date));
if (warranties.length !== 2 || warranties.reduce((sum, row) => sum + row.plan_qty, 0) !== 52) {
  throw new Error('Nguồn bảo hành 27-28/08 không khớp 52 tấm');
}

const values = (rows, columns, convert = {}) => rows.map(row => `(${columns.map(column => {
  const value = row[column];
  if (value === null || value === undefined) return 'null';
  if (convert[column] === 'jsonb') return jsonb(value);
  if (convert[column] === 'number') return String(Number(value));
  return sqlText(value);
}).join(',')})`).join(',\n');

const migration = `-- Release v123: đối chiếu bản live cũ theo từng ID cho 25-29/08/2026.
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
where id in (${staleIds.map(sqlText).join(',')});

delete from public.khsx_stage_credits where order_id in (${staleIds.map(sqlText).join(',')});
delete from public.khsx_stage_progress where order_id in (${staleIds.map(sqlText).join(',')});
delete from public.khsx_daily_assignments where order_id in (${staleIds.map(sqlText).join(',')});
delete from public.khsx_order_assignments where order_id in (${staleIds.map(sqlText).join(',')});

insert into public.khsx_orders(
  id,production_date,product_code,product_name,width_mm,length_mm,thickness_mm,plan_qty,note,order_group,
  source_order_id,is_manual,is_drop,is_ghost,is_warranty,is_lot,lot_label,source_payload,deleted_at
) values
${values(warranties,['id','production_date','product_code','product_name','width_mm','length_mm','thickness_mm','plan_qty','note','order_group','source_order_id','is_manual','is_drop','is_ghost','is_warranty','is_lot','lot_label','source_payload','deleted_at'],{width_mm:'number',length_mm:'number',thickness_mm:'number',plan_qty:'number',source_payload:'jsonb'})}
on conflict (id) do update set
  production_date=excluded.production_date,product_code=excluded.product_code,product_name=excluded.product_name,
  width_mm=excluded.width_mm,length_mm=excluded.length_mm,thickness_mm=excluded.thickness_mm,
  plan_qty=excluded.plan_qty,note=excluded.note,order_group=excluded.order_group,is_warranty=true,
  source_payload=excluded.source_payload,deleted_at=null,cancel_reason=null,cancelled_by=null,updated_at=now();

insert into public.khsx_order_assignments(order_id,plan_team,current_team,change_note,priority)
values
${values([...teams].map(([order_id,team])=>({order_id,plan_team:team,current_team:team,change_note:'Đối chiếu bản live cũ v83 trong v123',priority:'false'})),['order_id','plan_team','current_team','change_note','priority'])}
on conflict (order_id) do update set plan_team=excluded.plan_team,current_team=excluded.current_team,
  change_note=excluded.change_note,updated_at=now();

insert into public.khsx_daily_assignments(order_id,work_date,team_name,assignment_kind,assigned_by,updated_at)
values (${sqlText(carry28)},date '2026-08-29','To 5','support',null,now())
on conflict (order_id,work_date,assignment_kind) do update set team_name=excluded.team_name,assigned_by=null,updated_at=now();

delete from public.khsx_stage_progress
where (order_id in (${[...teams.keys()].map(sqlText).join(',')}) and work_date between date '2026-08-28' and date '2026-08-29')
   or (order_id=${sqlText(carry27)} and stage='dong_goi' and work_date between date '2026-08-27' and date '2026-08-28');

delete from public.khsx_stage_credits
where (order_id in (${[...teams.keys()].map(sqlText).join(',')}) and work_date between date '2026-08-28' and date '2026-08-29')
   or (order_id=${sqlText(carry27)} and stage='dong_goi' and work_date between date '2026-08-27' and date '2026-08-28');

insert into public.khsx_stage_progress(order_id,work_date,stage,quantity,kpi_team,entered_by,completed_by_worker_id)
values
${values(progress,['order_id','work_date','stage','quantity','kpi_team','entered_by','completed_by_worker_id'],{quantity:'number'})}
on conflict (order_id,work_date,stage) do update set quantity=excluded.quantity,kpi_team=excluded.kpi_team,
  entered_by=null,completed_by_worker_id=excluded.completed_by_worker_id,updated_at=now();

insert into public.khsx_stage_credits(order_id,work_date,stage,worker_id,quantity,source)
values
${values(credits,['order_id','work_date','stage','worker_id','quantity','source'],{quantity:'number'})}
on conflict (order_id,work_date,stage,worker_id) do update set quantity=excluded.quantity,source=excluded.source,updated_at=now();

update public.khsx_orders
set source_payload=jsonb_set(coalesce(source_payload,'{}'::jsonb),'{reconciliation_v123}',
  jsonb_build_object('source','old_live_v83','verified_at',now(),'range','2026-08-25..2026-08-29'),true),updated_at=now()
where id in (${[...teams.keys()].map(sqlText).join(',')});

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

  if exists(select 1 from public.khsx_orders where id in (${staleIds.map(sqlText).join(',')}) and deleted_at is null) then
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
`;

fs.writeFileSync(outputPath, migration, 'utf8');
console.log(JSON.stringify({outputPath,teams:teams.size,progress:progress.length,credits:credits.length,warranties:warranties.map(x=>({id:x.id,qty:x.plan_qty}))},null,2));
