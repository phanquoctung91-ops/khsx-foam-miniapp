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
type AccountAction = "approve" | "update" | "revoke" | "restore";

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

async function writeAccountAudit(
  admin: AdminClient,
  values: {
    telegram_user_id: number;
    auth_user_id: string;
    action: AccountAction;
    actor_user_id: string;
    before_state?: unknown;
    after_state?: unknown;
  },
) {
  const result = await admin.from("khsx_account_audit").insert({
    telegram_user_id: values.telegram_user_id,
    auth_user_id: values.auth_user_id,
    action: values.action,
    actor_user_id: values.actor_user_id,
    before_state: values.before_state ?? {},
    after_state: values.after_state ?? {},
  });
  if (result.error) console.error("ACCOUNT_AUDIT_FAILED", result.error.code);
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
    action?: AccountAction;
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

  const action = String(body.action ?? "approve").trim() as AccountAction;
  const telegramId = String(body.telegram_user_id ?? "").trim();
  const role = String(body.role ?? "").trim();
  const unit = role === "nhan_vien" ? normalizeUnit(body.unit_name) : "";
  const requestedDisplayName = String(body.display_name ?? "").trim();
  let displayName = requestedDisplayName || `Telegram ${telegramId}`;
  if (!new Set<AccountAction>(["approve", "update", "revoke", "restore"]).has(action) ||
      !/^\d{4,20}$/.test(telegramId)) {
    return json(req, { error: "INVALID_INPUT" }, 400);
  }
  if (["approve", "update"].includes(action) && !APPROVAL_ROLES.has(role)) {
    return json(req, { error: "INVALID_INPUT" }, 400);
  }
  if (["approve", "update"].includes(action) && role === "nhan_vien" && !APPROVAL_UNITS.has(unit)) {
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
  const callerRole = managerResult.data?.role ?? "";
  if (!managerResult.data?.active || !["quan_ly", "quan_ly_2"].includes(callerRole)) {
    return json(req, { error: "MANAGER_REQUIRED" }, 403);
  }
  // Quản lý 2 chỉ duyệt lần đầu cho Nhân viên và gán tổ/công đoạn đầu vào.
  // Sửa, thu hồi, khôi phục và mọi vai quản lý chỉ dành cho Quản lý full.
  if (callerRole === "quan_ly_2" && (action !== "approve" || role !== "nhan_vien")) {
    return json(req, { error: "MANAGER2_EMPLOYEE_ONLY" }, 403);
  }

  // Một Telegram ID dùng đúng một định danh trong Auth, profile và link.
  const loginCodeKey = `telegram:${telegramId}`;
  const authEmail = `tg_${telegramId}@khsx.internal`;
  const legacyEmail = `telegram_${telegramId}@khsx.internal`;
  const telegramNumber = Number(telegramId);

  const [linkResult, keyedProfileResult] = await Promise.all([
    admin.from("khsx_telegram_links")
      .select("auth_user_id,telegram_username,active,updated_at")
      .eq("telegram_user_id", telegramNumber)
      .maybeSingle(),
    admin.from("khsx_profiles")
      .select("user_id,display_name,role,unit_name,active")
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

  let existingProfile = keyedProfileResult.data;
  if (authUserId) {
    const result = await admin.from("khsx_profiles")
      .select("user_id,display_name,role,unit_name,active")
      .eq("user_id", authUserId)
      .maybeSingle();
    if (result.error) return json(req, { error: "PROFILE_LOOKUP_FAILED", ...publicDbError(result.error) }, 503);
    existingProfile = result.data;
  }
  displayName = requestedDisplayName || existingProfile?.display_name || `Telegram ${telegramId}`;

  // Auth user rời có thể còn lại để giữ khóa ngoại của số liệu sản xuất cũ.
  // Chỉ profile/link mới chứng minh đây là tài khoản đã từng được duyệt.
  const existedBefore = Boolean(linkResult.data || existingProfile);
  if (callerRole === "quan_ly_2" && existedBefore) {
    return json(req, { error: "MANAGER2_NEW_EMPLOYEE_ONLY" }, 403);
  }

  if (["update", "revoke", "restore"].includes(action) && (!authUserId || !existingProfile)) {
    return json(req, { error: "ACCOUNT_NOT_FOUND" }, 404);
  }

  const beforeState = {
    profile: existingProfile ?? null,
    link: linkResult.data ?? null,
  };

  if (action === "revoke") {
    const now = new Date().toISOString();
    const [profileWrite, linkWrite] = await Promise.all([
      admin.from("khsx_profiles").update({ active: false, updated_at: now })
        .eq("user_id", authUserId).select("user_id,display_name,role,unit_name,active").single(),
      admin.from("khsx_telegram_links").update({ active: false, updated_at: now })
        .eq("telegram_user_id", telegramNumber).select("telegram_user_id,auth_user_id,active,updated_at").single(),
    ]);
    if (profileWrite.error || linkWrite.error) {
      return json(req, { error: "ACCOUNT_REVOKE_FAILED", ...publicDbError(profileWrite.error ?? linkWrite.error) }, 500);
    }
    await writeAccountAudit(admin, {
      telegram_user_id: telegramNumber, auth_user_id: authUserId, action,
      actor_user_id: callerAuth.user.id, before_state: beforeState,
      after_state: { profile: profileWrite.data, link: linkWrite.data },
    });
    return json(req, { ok: true, profile: profileWrite.data, link: linkWrite.data });
  }

  if (action === "restore") {
    const now = new Date().toISOString();
    const profileWrite = await admin.from("khsx_profiles").update({ active: true, updated_at: now })
      .eq("user_id", authUserId).select("user_id,display_name,role,unit_name,active,worker_id").single();
    if (profileWrite.error || !profileWrite.data) {
      return json(req, { error: "ACCOUNT_RESTORE_FAILED", ...publicDbError(profileWrite.error) }, 500);
    }
    const linkWrite = await admin.from("khsx_telegram_links").upsert({
      telegram_user_id: telegramNumber,
      auth_user_id: authUserId,
      telegram_username: String(body.telegram_username ?? linkResult.data?.telegram_username ?? "").trim() || null,
      active: true,
      linked_by: callerAuth.user.id,
      linked_at: new Date().toISOString(),
      updated_at: now,
    }, { onConflict: "telegram_user_id" }).select("telegram_user_id,auth_user_id,active,updated_at").single();
    if (linkWrite.error || !linkWrite.data) {
      await admin.from("khsx_profiles").update({ active: false, updated_at: new Date().toISOString() }).eq("user_id", authUserId);
      return json(req, { error: "ACCOUNT_RESTORE_FAILED", ...publicDbError(linkWrite.error) }, 500);
    }
    await admin.from("khsx_telegram_access_requests").delete().eq("telegram_user_id", telegramNumber);
    await writeAccountAudit(admin, {
      telegram_user_id: telegramNumber, auth_user_id: authUserId, action,
      actor_user_id: callerAuth.user.id, before_state: beforeState,
      after_state: { profile: profileWrite.data, link: linkWrite.data },
    });
    return json(req, { ok: true, profile: profileWrite.data, link: linkWrite.data });
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
  } else {
    const updated = await admin.auth.admin.updateUserById(authUserId, {
      email: authEmail,
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: { provider: "telegram-miniapp", telegram_user_id: telegramNumber },
    });
    if (updated.error) return json(req, { error: "AUTH_USER_UPDATE_FAILED", code: updated.error.code }, 500);
  }

  // Duyệt mới luôn kích hoạt. Nút Lưu chỉ đổi vai/tổ và phải giữ nguyên trạng
  // thái thu hồi; chỉ nút Khôi phục mới được kích hoạt lại tài khoản.
  const targetActive = action === "approve"
    ? true
    : existingProfile?.active !== false && linkResult.data?.active !== false;

  const profileResult = await admin.from("khsx_profiles").upsert({
    user_id: authUserId,
    login_code_key: loginCodeKey,
    display_name: displayName,
    role,
    unit_name: role === "nhan_vien" ? unit : null,
    // Telegram ID + vai + tổ là đủ để đăng nhập. Worker catalogue là dữ liệu
    // KPI riêng, không còn là điều kiện chặn đăng ký tài khoản.
    worker_id: null,
    active: targetActive,
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
    active: targetActive,
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

  if (action === "approve") {
    await admin.from("khsx_telegram_access_requests")
      .delete()
      .eq("telegram_user_id", telegramNumber);
  }

  const [verifiedProfile, verifiedLink] = await Promise.all([
    admin.from("khsx_profiles").select("user_id,display_name,role,unit_name,active,worker_id")
      .eq("user_id", authUserId).eq("active", targetActive).maybeSingle(),
    admin.from("khsx_telegram_links").select("telegram_user_id,auth_user_id,active,updated_at")
      .eq("telegram_user_id", telegramNumber).eq("auth_user_id", authUserId).eq("active", targetActive).maybeSingle(),
  ]);
  if (verifiedProfile.error || verifiedLink.error || !verifiedProfile.data || !verifiedLink.data) {
    return json(req, { error: "APPROVAL_VERIFY_FAILED" }, 500);
  }

  await writeAccountAudit(admin, {
    telegram_user_id: telegramNumber, auth_user_id: authUserId, action,
    actor_user_id: callerAuth.user.id, before_state: beforeState,
    after_state: { profile: verifiedProfile.data, link: verifiedLink.data },
  });

  return json(req, { ok: true, profile: verifiedProfile.data, link: verifiedLink.data });
});
