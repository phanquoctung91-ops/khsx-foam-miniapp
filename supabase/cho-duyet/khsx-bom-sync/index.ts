// khsx-bom-sync (BỘ KHUNG 2026-09-25 — CHƯA deploy, chờ anh Tùng duyệt).
// Lấy BOM mặc định đang dùng trên ERP (chỉ tầng 1) cho đúng các mã hàng đã có trong KHSX,
// ghi vào public.khsx_bom_lines. Chạy khi quản lý bấm "Cập nhật BOM" hoặc lịch mỗi ngày.
//
// Cần anh Tùng tự đặt khoá (không để trong code, không để trong app):
//   supabase secrets set ERP_URL=https://<erp> ERP_API_KEY=<key> ERP_API_SECRET=<secret> BOM_CRON_SECRET=<chuoi-ngau-nhien>
// Deploy: chuyển thư mục này vào supabase/functions/ rồi `supabase functions deploy khsx-bom-sync`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ERP_URL = (Deno.env.get("ERP_URL") ?? "").replace(/\/+$/, "");
const ERP_AUTH = `token ${Deno.env.get("ERP_API_KEY") ?? ""}:${Deno.env.get("ERP_API_SECRET") ?? ""}`;
const CRON_SECRET = Deno.env.get("BOM_CRON_SECRET") ?? "";
const allowedOrigins = new Set(["https://phanquoctung91-ops.github.io", "http://localhost:8877", "http://127.0.0.1:8877"]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://phanquoctung91-ops.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bom-cron",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

type DongErp = { name: string; item: string; item_code: string; item_name: string; qty: number; uom: string; idx: number };

async function layBomErp(maHang: string[]): Promise<DongErp[]> {
  const fields = ["name", "item", "`tabBOM Item`.item_code", "`tabBOM Item`.item_name", "`tabBOM Item`.qty", "`tabBOM Item`.uom", "`tabBOM Item`.idx"];
  const filters = [["is_active", "=", 1], ["is_default", "=", 1], ["docstatus", "=", 1], ["item", "in", maHang]];
  const url = `${ERP_URL}/api/resource/BOM?fields=${encodeURIComponent(JSON.stringify(fields))}`
    + `&filters=${encodeURIComponent(JSON.stringify(filters))}&limit_page_length=0`;
  const res = await fetch(url, { headers: { Authorization: ERP_AUTH, Accept: "application/json" } });
  if (!res.ok) throw new Error(`ERP_${res.status}`);
  return (await res.json()).data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (!ERP_URL || ERP_AUTH === "token :") return json(req, { ok: false, error: "ERP_NOT_CONFIGURED" }, 500);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Ai được gọi: lịch chạy (khoá bí mật riêng) hoặc tài khoản có quyền xác nhận BOM.
  const laLich = CRON_SECRET !== "" && req.headers.get("x-bom-cron") === CRON_SECRET;
  if (!laLich) {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json(req, { ok: false, error: "SESSION_REQUIRED" }, 401);
    const { data: p } = await db.from("khsx_profiles").select("role,active").eq("user_id", u.user.id).maybeSingle();
    const { data: q } = await db.from("khsx_account_permissions").select("permission_key")
      .eq("user_id", u.user.id).eq("permission_key", "bom_confirm").maybeSingle();
    if (!(p?.active && (p.role === "quan_ly" || !!q))) return json(req, { ok: false, error: "BOM_PERMISSION_REQUIRED" }, 403);
  }

  // Chỉ lấy BOM của mã hàng đã có trong KHSX (không kéo cả 3.700 BOM của ERP về).
  const { data: don, error: loiDon } = await db.from("khsx_orders").select("product_code").eq("is_warranty", false).is("deleted_at", null);
  if (loiDon) return json(req, { ok: false, error: loiDon.message }, 500);
  const cacMa = [...new Set((don ?? []).map((o) => String(o.product_code ?? "").trim().toUpperCase()).filter(Boolean))];

  let soDong = 0;
  const coBom = new Set<string>();
  for (let i = 0; i < cacMa.length; i += 40) {
    const lo = cacMa.slice(i, i + 40);
    const dong = await layBomErp(lo);
    const ghi = dong.filter((d) => d.item_code && Number(d.qty) >= 0).map((d) => ({
      ma_hang: String(d.item).toUpperCase(), stt: Number(d.idx), bom: d.name, ma_vt: d.item_code,
      ten_vt: d.item_name ?? "", dinh_muc: Number(d.qty), dvt: d.uom ?? "", dong_bo_luc: new Date().toISOString(),
    }));
    ghi.forEach((d) => coBom.add(d.ma_hang));
    // Thay trọn BOM của từng mã: xoá dòng cũ của các mã trong lô này rồi ghi lại.
    // ponytail: xoá rồi ghi không nằm chung giao dịch; lỗi giữa chừng thì lần chạy sau ghi lại đủ.
    const maCoDong = [...new Set(ghi.map((d) => d.ma_hang))];
    if (maCoDong.length) {
      const { error: loiXoa } = await db.from("khsx_bom_lines").delete().in("ma_hang", maCoDong);
      if (loiXoa) return json(req, { ok: false, error: loiXoa.message }, 500);
      const { error: loiGhi } = await db.from("khsx_bom_lines").insert(ghi);
      if (loiGhi) return json(req, { ok: false, error: loiGhi.message }, 500);
      soDong += ghi.length;
    }
  }
  return json(req, { ok: true, so_ma: cacMa.length, co_bom: coBom.size, thieu_bom: cacMa.filter((m) => !coBom.has(m)), so_dong: soDong });
});
