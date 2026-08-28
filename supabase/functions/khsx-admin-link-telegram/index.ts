import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function namedKey(jsonName: string, legacyNames: string[]) {
  try {
    const values = JSON.parse(Deno.env.get(jsonName) ?? "{}") as Record<string, string>;
    if (values.default) return values.default;
  } catch {
    // Tương thích với biến bí mật cũ.
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}

const SERVICE_ROLE_KEY = namedKey("SUPABASE_SECRET_KEYS", ["SUPABASE_SERVICE_ROLE_KEY"]);
const PUBLISHABLE_KEY = namedKey("SUPABASE_PUBLISHABLE_KEYS", ["KHSX_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"]);
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("KHSX_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors(req) });
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "Kx!" + Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

const APPROVAL_ROLES = new Set(["quan_ly", "quan_ly_2", "nhan_vien"]);
function normalizeUnit(value: unknown) {
  const unit = String(value ?? "").trim();
  const map: Record<string, string> = {
    "Tổ 1": "To 1", "Tổ 2": "To 2", "Tổ 3": "To 3", "Tổ 4": "To 4", "Tổ 5": "To 5",
    "Tổ may": "To may", "Tổ đóng gói": "To dong goi",
  };
  return map[unit] ?? unit;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return json(req, { error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PUBLISHABLE_KEY) {
    return json(req, { error: "SERVER_NOT_CONFIGURED" }, 503);
  }

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(req, { error: "AUTH_REQUIRED" }, 401);
  }

  let body: {
    worker_id?: string;
    telegram_user_id?: number | string;
    telegram_username?: string;
    role?: string;
    unit_name?: string;
    display_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "INVALID_REQUEST" }, 400);
  }
  const workerId = String(body.worker_id ?? "").trim().toLowerCase();
  const telegramId = String(body.telegram_user_id ?? "").trim();
  const requestedRole = String(body.role ?? "nhan_vien").trim();
  const requestedUnit = normalizeUnit(body.unit_name);
  const requestedName = String(body.display_name ?? "").trim();
  if (!/^\d{4,20}$/.test(telegramId) || !APPROVAL_ROLES.has(requestedRole)) {
    return json(req, { error: "INVALID_INPUT" }, 400);
  }
  if (requestedRole === "nhan_vien" && !workerId) {
    return json(req, { error: "WORKER_REQUIRED" }, 400);
  }

  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json(req, { error: "AUTH_REQUIRED" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: manager, error: managerError } = await admin.from("khsx_profiles")
    .select("role,active")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (managerError) return json(req, { error: "MANAGER_LOOKUP_FAILED" }, 503);
  if (!manager?.active || !["quan_ly", "quan_ly_2"].includes(manager.role)) {
    return json(req, { error: "MANAGER_REQUIRED" }, 403);
  }

  let worker: { id: string; display_name: string; stage: string; active: boolean } | null = null;
  if (workerId) {
    const result = await admin.from("khsx_workers")
      .select("id,display_name,stage,active")
      .eq("id", workerId)
      .maybeSingle();
    if (result.error) return json(req, { error: "WORKER_LOOKUP_FAILED" }, 503);
    worker = result.data;
    if (!worker?.active) return json(req, { error: "WORKER_NOT_FOUND" }, 404);
  }
  const workerUnit = worker?.stage === "may" ? "To may" : worker?.stage === "dong_goi" ? "To dong goi" : null;
  if (requestedRole === "nhan_vien" && !workerUnit) return json(req, { error: "WORKER_STAGE_UNSUPPORTED" }, 400);
  const unitName = requestedRole === "nhan_vien" ? (requestedUnit || workerUnit) : null;

  // Nếu ID Telegram đã tồn tại thì dùng lại đúng hồ sơ đó (idempotent). Chỉ
  // từ chối khi nó đang trỏ sang hồ sơ khác, thay vì trả lỗi chung chung.
  const existingLinkResult = await admin.from("khsx_telegram_links")
    .select("telegram_user_id,auth_user_id,active")
    .eq("telegram_user_id", Number(telegramId))
    .order("updated_at", { ascending: false })
    .limit(1);
  if (existingLinkResult.error) return json(req, { error: "TELEGRAM_LINK_LOOKUP_FAILED" }, 503);
  const existingLink = existingLinkResult.data?.[0] ?? null;
  let { data: profile, error: profileError } = existingLink
    ? await admin.from("khsx_profiles").select("user_id,display_name,role,unit_name,active,worker_id").eq("user_id", existingLink.auth_user_id).maybeSingle()
    : worker
      ? await admin.from("khsx_profiles").select("user_id,display_name,role,unit_name,active,worker_id").eq("worker_id", worker.id).maybeSingle()
      : { data: null, error: null };
  if (profileError) return json(req, { error: "PROFILE_LOOKUP_FAILED" }, 503);
  if (existingLink && !profile) return json(req, { error: "LINKED_PROFILE_MISSING" }, 409);
  let createdAuthUserId: string | null = null;

  if (!profile) {
    const email = worker ? "worker_" + worker.id + "@khsx.internal" : "telegram_" + telegramId + "@khsx.internal";
    const created = await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { display_name: requestedName || worker?.display_name || ("Telegram " + telegramId), worker_id: worker?.id || null },
    });
    if (created.error || !created.user) {
      return json(req, { error: "PROFILE_CREATE_FAILED" }, 500);
    }
    createdAuthUserId = created.user.id;
    const inserted = await admin.from("khsx_profiles").insert({
      user_id: created.user.id,
      display_name: requestedName || worker?.display_name || ("Telegram " + telegramId),
      role: requestedRole,
      unit_name: unitName,
      worker_id: worker?.id || null,
      active: true,
    }).select("user_id,display_name,role,unit_name,active,worker_id").single();
    if (inserted.error || !inserted.data) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(req, { error: "PROFILE_CREATE_FAILED" }, 500);
    }
    profile = inserted.data;
  }
  if (!profile.active) return json(req, { error: "ACCOUNT_DISABLED" }, 403);

  if (existingLink && String(existingLink.auth_user_id) !== String(profile.user_id)) {
    return json(req, { error: "TELEGRAM_ID_ALREADY_LINKED" }, 409);
  }
  const accountLink = await admin.from("khsx_telegram_links")
    .select("telegram_user_id")
    .eq("auth_user_id", profile.user_id)
    .neq("telegram_user_id", Number(telegramId))
    .limit(1);
  if (accountLink.error) return json(req, { error: "TELEGRAM_LINK_LOOKUP_FAILED" }, 503);
  if (accountLink.data?.length) return json(req, { error: "ACCOUNT_ALREADY_LINKED" }, 409);

  const linked = await admin.from("khsx_telegram_links").upsert({
    telegram_user_id: Number(telegramId),
    auth_user_id: profile.user_id,
    telegram_username: String(body.telegram_username ?? "").trim() || null,
    active: true,
    linked_by: authData.user.id,
    linked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id" });
  if (linked.error) {
    if (createdAuthUserId) {
      await admin.from("khsx_profiles").delete().eq("user_id", createdAuthUserId);
      await admin.auth.admin.deleteUser(createdAuthUserId);
    }
    const duplicate = linked.error.code === "23505" || /duplicate|unique/i.test(linked.error.message || "");
    return json(req, { error: duplicate ? "ACCOUNT_ALREADY_LINKED" : "TELEGRAM_LINK_FAILED" }, 409);
  }
  const updatedProfile = await admin.from("khsx_profiles")
    .update({ role: requestedRole, unit_name: unitName })
    .eq("user_id", profile.user_id)
    .select("user_id,display_name,role,unit_name,active,worker_id")
    .single();
  if (updatedProfile.error || !updatedProfile.data) return json(req, { error: "PROFILE_UPDATE_FAILED" }, 500);
  await admin.from("khsx_telegram_access_requests").delete().eq("telegram_user_id", Number(telegramId));
  return json(req, {
    ok: true,
    profile: {
      user_id: updatedProfile.data.user_id,
      display_name: updatedProfile.data.display_name,
      role: updatedProfile.data.role,
      unit_name: updatedProfile.data.unit_name,
      active: updatedProfile.data.active,
      worker_id: updatedProfile.data.worker_id,
    },
  });
});
