// khsx-gui-tin: gửi các tin Telegram đang chờ trong khsx_tin_nhan_cho (Giao việc, 28/09/2026).
// Ai gọi cũng được (app gọi ngay sau khi giao / xong việc; bộ hẹn giờ gọi mỗi 5 phút và 17:00):
// hàm chỉ gửi tin đã xếp sẵn trong hàng chờ, không nhận nội dung từ người gọi.
// Deploy: supabase functions deploy khsx-gui-tin --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/khsx-telegram-v121.ts";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = "https://phanquoctung91-ops.github.io/khsx-foam-miniapp/index.html?source=supabase";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Tin = { id: number; task_id: string | null; loai: string; chat_id: number; noi_dung: string; so_lan: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!TOKEN || !SERVICE_ROLE_KEY) return json({ ok: false, error: "NOT_CONFIGURED" }, 500);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("khsx_tin_nhan_cho").select("id,task_id,loai,chat_id,noi_dung,so_lan")
    .is("gui_luc", null).lt("so_lan", 5).order("id").limit(30);
  if (error) return json({ ok: false, error: error.message }, 500);
  let gui = 0, loi = 0;
  for (const t of (data ?? []) as Tin[]) {
    // Giữ chỗ trước khi gửi để hai lần gọi cùng lúc không gửi trùng một tin.
    const { data: giu } = await db.from("khsx_tin_nhan_cho").update({ so_lan: t.so_lan + 1 })
      .eq("id", t.id).eq("so_lan", t.so_lan).is("gui_luc", null).select("id");
    if (!giu?.length) continue;
    let ok = false, moTa = "";
    try {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: t.chat_id,
          text: t.noi_dung,
          // Tin báo xong / báo trễ gửi người giao: mở thẳng trang Giao việc.
          reply_markup: { inline_keyboard: [[{ text: "📝 Mở app", web_app: { url: t.loai === "xong" || t.loai === "bao_tre" ? `${APP_URL}&mo=viec` : APP_URL } }]] },
        }),
      });
      const kq = await res.json().catch(() => ({}));
      ok = !!kq.ok;
      // 403: người nhận chưa bấm Start với bot (hoặc đã chặn bot) — thử lại vô ích, chờ người giao bấm "Gửi lại".
      if (!ok) moTa = res.status === 403 ? "Người này chưa bấm Start với bot" : (kq.description || `Lỗi ${res.status}`);
      if (!ok && (res.status === 403 || res.status === 400)) {
        await db.from("khsx_tin_nhan_cho").update({ so_lan: 5 }).eq("id", t.id);
      }
    } catch (e) {
      moTa = `Lỗi mạng: ${e instanceof Error ? e.message : String(e)}`;
    }
    const luc = new Date().toISOString();
    if (ok) {
      gui++;
      await db.from("khsx_tin_nhan_cho").update({ gui_luc: luc, loi: null }).eq("id", t.id);
      if (t.loai === "giao" && t.task_id) await db.from("khsx_tasks").update({ tin_giao_gui_luc: luc, tin_giao_loi: null }).eq("id", t.task_id);
    } else {
      loi++;
      await db.from("khsx_tin_nhan_cho").update({ loi: moTa }).eq("id", t.id);
      if (t.loai === "giao" && t.task_id) await db.from("khsx_tasks").update({ tin_giao_loi: moTa }).eq("id", t.task_id);
    }
  }
  return json({ ok: true, gui, loi });
});
