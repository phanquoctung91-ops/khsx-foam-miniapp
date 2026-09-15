-- Client (startSupabaseRealtime, index.html) dang ky nhan postgres_changes cho
-- khsx_stage_credits, khsx_profiles, khsx_workers nhung 3 bang nay khong nam
-- trong publication supabase_realtime that - Postgres khong bao gio phat su
-- kien cho chung, doi 3 bang nay (KPI ca nhan, nhan su, danh sach tho) khong
-- bao gio tu day truc tiep, chi cap nhat qua luoi an toan dinh ky (~120s) hoac
-- lam moi tay. Them vao publication cho khop dung danh sach client dang doi.
alter publication supabase_realtime add table public.khsx_stage_credits, public.khsx_profiles, public.khsx_workers;
