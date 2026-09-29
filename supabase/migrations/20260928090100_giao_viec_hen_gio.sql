-- Bộ hẹn giờ cho Giao việc (anh Tùng duyệt 28/09/2026, bật khi push):
-- - 17:00 giờ VN (10:00 UTC) mỗi ngày: nhắc việc tới hạn / quá hạn chưa xong, rồi gửi tin.
-- - Mỗi 5 phút: nếu còn tin chờ gửi (lần trước lỗi mạng...) thì gọi hàm gửi tin.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.khsx_goi_gui_tin() returns void
language plpgsql security definer set search_path = '' as $function$
begin
  if exists(select 1 from public.khsx_tin_nhan_cho where gui_luc is null and so_lan < 5) then
    perform net.http_post(
      url := 'https://tydevlvcyvqwghinboif.supabase.co/functions/v1/khsx-gui-tin',
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
end;
$function$;
revoke all on function private.khsx_goi_gui_tin() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('khsx-nhac-viec-tre','khsx-gui-tin-cho');
select cron.schedule('khsx-nhac-viec-tre', '0 10 * * *', $$select private.khsx_nhac_viec_tre(); select private.khsx_goi_gui_tin();$$);
select cron.schedule('khsx-gui-tin-cho', '*/5 * * * *', $$select private.khsx_goi_gui_tin();$$);
