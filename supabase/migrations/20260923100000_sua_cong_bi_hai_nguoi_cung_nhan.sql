-- Sửa 2026-09-23 (anh Tùng duyệt): 9 dòng công May/Đóng gói bị hai người cùng nhận cho cùng
-- một phần việc — tổng công vượt tiến độ 39 tấm (May 2.027 so với tiến độ thật 1.990).
--
-- Luật nghiệp vụ anh Tùng chốt: kế hoạch là nguồn, công đoạn sau chỉ kế thừa công đoạn trước,
-- đơn xong thì Dán = May = Đóng gói. Nên công cá nhân của một dòng tiến độ không bao giờ được
-- vượt số tiến độ của chính dòng đó.
--
-- Hai nguồn gây lỗi:
--   1. Đổi người trên một dòng thì RPC chỉ xoá công của người mới, người cũ vẫn giữ công
--      (4 dòng: LAGO10-2 lô 2 12/09, STD15-8 18/09, SORA15-8 18/09, SORA10-63 lô 2 23/09).
--   2. Đợt trả công 20260922150000 gán theo luật tổ cho dòng tiến độ đã mất tên người, nhưng
--      không kiểm bảng công vẫn còn công của người cũ — thành cộng thêm một phần (5 dòng).
--
-- Anh Tùng chốt sửa theo LUẬT GHI NHẬN MẶC ĐỊNH: May theo tổ (Tổ 1 Thảo Vy, Tổ 2 Bảo Chăm,
-- Tổ 3 và Tổ 4 Loan Anh), Đóng gói luôn Minh Thuận, Tổ 5 không gán. Mỗi dòng bị lỗi: xoá hết
-- công, ghi lại đúng một người theo luật, số công bằng đúng số tiến độ.
--
-- Chỉ chạm dòng có tổng công > tiến độ, nên chạy lại không đổi gì thêm.

create temp table cong_bi_lech on commit drop as
select p.order_id, p.work_date, p.stage, p.kpi_team, p.team_key, p.quantity,
       case when p.stage = 'dong_goi' then 'minh_thuan'
            when p.kpi_team = 'To 1' then 'thao_vy'
            when p.kpi_team = 'To 2' then 'bao_cham'
            else 'loan_anh' end as nguoi_dung
from public.khsx_stage_progress p
join (
  select order_id, work_date, stage, kpi_team, sum(quantity) as tong_cong
  from public.khsx_stage_credits
  where stage in ('may','dong_goi')
  group by order_id, work_date, stage, kpi_team
) c on c.order_id = p.order_id and c.work_date = p.work_date
   and c.stage = p.stage and c.kpi_team = p.kpi_team
where p.stage in ('may','dong_goi')
  and p.work_date >= '2026-09-01'
  and p.kpi_team in ('To 1','To 2','To 3','To 4')
  and c.tong_cong > p.quantity;

delete from public.khsx_stage_credits c
using cong_bi_lech l
where c.order_id = l.order_id and c.work_date = l.work_date
  and c.stage = l.stage and c.kpi_team = l.kpi_team;

update public.khsx_stage_progress p
set completed_by_worker_id = l.nguoi_dung
from cong_bi_lech l
where p.order_id = l.order_id and p.work_date = l.work_date
  and p.stage = l.stage and p.team_key = l.team_key;

insert into public.khsx_stage_credits(order_id, work_date, stage, worker_id, quantity, source, kpi_team)
select order_id, work_date, stage, nguoi_dung, quantity, 'actual', kpi_team
from cong_bi_lech
where quantity > 0;
