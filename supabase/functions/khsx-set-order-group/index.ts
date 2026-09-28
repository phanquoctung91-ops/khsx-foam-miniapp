// khsx-set-order-group (2026-09-28, anh Tùng duyệt): bot NghiepVuKho gắn "nhóm đơn hàng" = Công ty
// từ sheet Hàng Đặt vào đơn KHSX, và với đơn KHSX gộp thì thêm tag "📦 Đặt: …" vào ghi chú.
// Chỉ sửa 2 cột order_group / note của khsx_orders chưa xoá. Không đọc/ghi gì khác, không gọi ERP.
// Xác thực: header x-notify-secret = secret KHSX_NOTIFY_SECRET (dùng chung với khsx-notify).
const SECRET = Deno.env.get("KHSX_NOTIFY_SECRET") ?? "";
const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GROUPS = ["THÀNH CÔNG", "DIGITAL", "GLOBAL"];
const TAG = "📦 Đặt:";
const MAX_ITEMS = 100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Bỏ tag cũ (nếu có) rồi nối tag mới vào cuối ghi chú gốc → chạy lại bao nhiêu lần cũng không nhân đôi.
export function withTag(note: string, tag: string | null) {
  const base = (note ?? "").split(TAG)[0].trim().replace(/[·\s]+$/, "");
  return tag ? (base ? `${base} · ${tag}` : tag) : base;
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SECRET || !sameSecret(req.headers.get("x-notify-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || !items.length || items.length > MAX_ITEMS) return json({ error: "items_required_max_100" }, 400);
  for (const it of items) {
    if (typeof it?.order_id !== "string" || !it.order_id) return json({ error: "bad_order_id" }, 400);
    if (it.order_group != null && !GROUPS.includes(it.order_group)) return json({ error: "bad_order_group", value: it.order_group }, 400);
    if (it.note_tag != null && (typeof it.note_tag !== "string" || !it.note_tag.startsWith(TAG) || it.note_tag.length > 200))
      return json({ error: "bad_note_tag" }, 400);
  }
  const ids = items.map((it: { order_id: string }) => `"${it.order_id.replaceAll('"', "")}"`).join(",");
  const r = await rest(`khsx_orders?select=id,order_group,note&deleted_at=is.null&id=in.(${encodeURIComponent(ids)})`);
  if (!r.ok) return json({ error: "read_failed", status: r.status }, 502);
  const current = new Map((await r.json()).map((o: { id: string }) => [o.id, o]));
  const results = [];
  for (const it of items) {
    const o = current.get(it.order_id) as { id: string; order_group: string; note: string } | undefined;
    if (!o) { results.push({ order_id: it.order_id, error: "not_found_or_deleted" }); continue; }
    const patch: Record<string, string> = {};
    if (it.order_group != null && o.order_group !== it.order_group) patch.order_group = it.order_group;
    if (it.note_tag !== undefined) {
      const note = withTag(o.note, it.note_tag);
      if (note !== (o.note ?? "")) patch.note = note;
    }
    if (!Object.keys(patch).length) { results.push({ order_id: o.id, changed: false }); continue; }
    const u = await rest(`khsx_orders?id=eq.${encodeURIComponent(o.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    results.push({ order_id: o.id, changed: u.ok, old_group: o.order_group, ...patch, ...(u.ok ? {} : { error: `HTTP ${u.status}` }) });
  }
  return json({ ok: true, results });
});
