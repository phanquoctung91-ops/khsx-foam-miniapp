import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// khsx-notify (2026-09-28): bot NghiepVuKho gọi để gửi tin Telegram cho anh Tùng.
// Không đọc/ghi DB, không gọi ERP. Chat nhận cố định trong code, không lấy từ body.
const ALLOWED_CHATS = ["8038092977"];
const SECRET = Deno.env.get("KHSX_NOTIFY_SECRET") ?? "";
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// So sánh thời gian hằng để không lộ secret qua độ trễ.
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET || !sameSecret(req.headers.get("x-notify-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return json({ error: "text_required" }, 400);
  for (const chat_id of ALLOWED_CHATS) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
    });
    const t = await r.json().catch(() => ({}));
    if (!r.ok || !t.ok) return json({ error: "telegram_failed", description: t.description ?? `HTTP ${r.status}` }, 502);
  }
  return json({ ok: true, sent: ALLOWED_CHATS.length });
});
