import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function namedKey(jsonName: string, legacyNames: string[]) {
  try {
    const values = JSON.parse(Deno.env.get(jsonName) ?? "{}") as Record<string, string>;
    if (values.default) return values.default;
  } catch {
    // Dự án cũ có thể vẫn dùng biến secret đơn.
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
const APPROVAL_ROLES = new Set(["quan_ly", "quan_ly_2", "nhan_vien"]);
const APPROVAL_UNITS = new Set(["To 1", "To 2", "To 3", "To 4", "To 5", "To may", "To dong goi"]);

type AdminClient = ReturnType<typeof createClient>;
type AuthUser = { id: string; email?: string | null };

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

function normalizeUnit(value: unknown) {
  const unit = String(value ?? "").trim();
  const aliases: Record<string, string> = {
    "Tổ 1": "To 1", "Tổ 2": "To 2", "Tổ 3": "To 3", "Tổ 4": "To 4", "Tổ 5": "To 5",
    "Tổ may": "To may", "Tổ đóng gói": "To dong goi",
  };
  return aliases[unit] ?? unit;
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "Kx!" + Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function publicDbError(error: { code?: string; message?: string } | null | undefined) {
  return { db_code: error?.code ?? "UNKNOWN" };
}

async function findAuthUserByEmails(admin: AdminClient, emails: string[]) {
  const wanted = new Set(emails.map((email) => email.toLowerCase()));
  for (let page = 1; page <= 50; page++) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) return { user: null as AuthUser | null, error: result.error };
    const user = result.data.users.find((item) => wanted.has(String(item.email ?? "").toLowerCase()));
    if (user) return { user: user as AuthUser, error: null };
    if (result.data.users.length < 1000) break;
  }
  return { user: null as AuthUser | null, error: null };
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

  const telegramId = String(body.telegram_user_id ?? "").trim();
  const role = String(body.role ?? "").trim();
  const unit = role === "nhan_vien" ? normalizeUnit(body.unit_name) : "";
  const displayName = String(body.display_name ?? "").trim() || `Telegram ${telegramId}`;
  if (!/^\d{4,20}$/.test(telegramId) || !APPROVAL_ROLES.has(role)) {
    return json(req, { error: "INVALID_INPUT" }, 400);
  }
  if (role === "nhan_vien" && !APPROVAL_UNITS.has(unit)) {
    return json(req, { error: unit ? "UNIT_INVALID" : "UNIT_REQUIRED" }, 400);
  }

  const caller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerAuth, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerAuth.user) return json(req, { error: "AUTH_REQUIRED" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const managerResult = await admin.from("khsx_profiles")
    .select("role,active")
    .eq("user_id", callerAuth.user.id)
    .maybeSingle();
  if (managerResult.error) return json(req, { error: "MANAGER_LOOKUP_FAILED", ...publicDbError(managerResult.error) }, 503);
  if (!managerResult.data?.active || !["quan_ly", "quan_ly_2"].includes(managerResult.data.role)) {
    return json(req, { error: "MANAGER_REQUIRED" }, 403);
  }

  // Một Telegram ID dùng đúng một định danh trong Auth, profile và link.
  const loginCodeKey = `telegram:${telegramId}`;
  const authEmail = `tg_${telegramId}@khsx.internal`;
  const legacyEmail = `telegram_${telegramId}@khsx.internal`;
  const telegramNumber = Number(telegramId);

  const [linkResult, keyedProfileResult] = await Promise.all([
    admin.from("khsx_telegram_links")
      .select("auth_user_id")
      .eq("telegram_user_id", telegramNumber)
      .maybeSingle(),
    admin.from("khsx_profiles")
      .select("user_id")
      .eq("login_code_key", loginCodeKey)
      .maybeSingle(),
  ]);
  if (linkResult.error) return json(req, { error: "TELEGRAM_LINK_LOOKUP_FAILED", ...publicDbError(linkResult.error) }, 503);
  if (keyedProfileResult.error) return json(req, { error: "PROFILE_LOOKUP_FAILED", ...publicDbError(keyedProfileResult.error) }, 503);
  if (linkResult.data?.auth_user_id && keyedProfileResult.data?.user_id &&
      String(linkResult.data.auth_user_id) !== String(keyedProfileResult.data.user_id)) {
    return json(req, { error: "TELEGRAM_ID_ALREADY_LINKED" }, 409);
  }

  let authUserId = String(linkResult.data?.auth_user_id ?? keyedProfileResult.data?.user_id ?? "");
  if (authUserId) {
    const existing = await admin.auth.admin.getUserById(authUserId);
    if (existing.error || !existing.data.user) authUserId = "";
  }
  if (!authUserId) {
    const found = await findAuthUserByEmails(admin, [authEmail, legacyEmail]);
    if (found.error) return json(req, { error: "AUTH_USER_LOOKUP_FAILED", code: found.error.code }, 503);
    authUserId = found.user?.id ?? "";
  }

  let createdAuthUserId = "";
  if (!authUserId) {
    const created = await admin.auth.admin.createUser({
      email: authEmail,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: { provider: "telegram-miniapp", telegram_user_id: telegramNumber },
    });
    if (created.error || !created.data.user) {
      return json(req, { error: "AUTH_USER_CREATE_FAILED", code: created.error?.code ?? "UNKNOWN" }, 500);
    }
    authUserId = created.data.user.id;
    createdAuthUserId = authUserId;
  }

  const stage = role === "nhan_vien"
    ? unit === "To may" ? "may" : unit === "To dong goi" ? "dong_goi" : ""
    : "";
  const workerId = stage ? `tg_${telegramId}` : null;
  if (workerId) {
    const workerResult = await admin.from("khsx_workers").upsert({
      id: workerId,
      display_name: displayName,
      stage,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" }).select("id").single();
    if (workerResult.error || !workerResult.data) {
      if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId);
      return json(req, { error: "WORKER_AUTO_PROVISION_FAILED", ...publicDbError(workerResult.error) }, 500);
    }
  }

  const profileResult = await admin.from("khsx_profiles").upsert({
    user_id: authUserId,
    login_code_key: loginCodeKey,
    display_name: displayName,
    role,
    unit_name: role === "nhan_vien" ? unit : null,
    worker_id: workerId,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" })
    .select("user_id,display_name,role,unit_name,active,worker_id")
    .single();
  if (profileResult.error || !profileResult.data) {
    if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId);
    return json(req, { error: "PROFILE_UPSERT_FAILED", ...publicDbError(profileResult.error) }, 500);
  }

  const linkResultWrite = await admin.from("khsx_telegram_links").upsert({
    telegram_user_id: telegramNumber,
    auth_user_id: authUserId,
    telegram_username: String(body.telegram_username ?? "").trim() || null,
    active: true,
    linked_by: callerAuth.user.id,
    linked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "telegram_user_id" });
  if (linkResultWrite.error) {
    const duplicate = linkResultWrite.error.code === "23505";
    return json(req, {
      error: duplicate ? "TELEGRAM_ID_ALREADY_LINKED" : "TELEGRAM_LINK_FAILED",
      ...publicDbError(linkResultWrite.error),
    }, duplicate ? 409 : 500);
  }

  await admin.from("khsx_telegram_access_requests")
    .delete()
    .eq("telegram_user_id", telegramNumber);

  return json(req, { ok: true, profile: profileResult.data });
});
