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

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 50; page++) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) return { user: null, error: result.error };
    const user = result.data.users.find((item) => String(item.email ?? "").toLowerCase() === email.toLowerCase());
    if (user) return { user, error: null };
    if (result.data.users.length < 1000) break;
  }
  return { user: null, error: null };
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
    action?: string;
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

  if (body.action === "revoke") {
    const link = await admin.from("khsx_telegram_links").select("telegram_user_id,auth_user_id")
      .eq("telegram_user_id", Number(telegramId)).maybeSingle();
    if (link.error) return json(req, { error: "TELEGRAM_LINK_LOOKUP_FAILED" }, 503);
    if (!link.data) return json(req, { ok: true, revoked: false });
    const [linkUpdate, profileUpdate] = await Promise.all([
      admin.from("khsx_telegram_links").update({ active: false, updated_at: new Date().toISOString() })
        .eq("telegram_user_id", Number(telegramId)),
      admin.from("khsx_profiles").update({ active: false, updated_at: new Date().toISOString() })
        .eq("user_id", link.data.auth_user_id),
    ]);
    if (linkUpdate.error || profileUpdate.error) return json(req, { error: "REVOKE_FAILED" }, 500);
    try { await admin.auth.admin.signOut(link.data.auth_user_id); } catch (e) { console.warn("SESSION_REVOKE_FAILED", e); }
    await admin.from("khsx_telegram_access_requests").delete().eq("telegram_user_id", Number(telegramId));
    return json(req, { ok: true, revoked: true });
  }

  let worker: { id: string; display_name: string; stage: string; active: boolean } | null = null;
  const stageFromUnit = requestedUnit === "To may" ? "may"
    : requestedUnit === "To dong goi" ? "dong_goi"
    : /^To [1-5]$/.test(requestedUnit) ? "dan" : "";
  if (workerId) {
    const result = await admin.from("khsx_workers")
      .select("id,display_name,stage,active")
      .eq("id", workerId)
      .maybeSingle();
    if (result.error) return json(req, { error: "WORKER_LOOKUP_FAILED" }, 503);
    worker = result.data;
    if (result.data && !result.data.active) {
      const reactivated = await admin.from("khsx_workers")
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq("id", workerId)
        .select("id,display_name,stage,active")
        .single();
      if (reactivated.error || !reactivated.data) {
        return json(req, { error: "WORKER_REACTIVATE_FAILED" }, 409);
      }
      worker = reactivated.data;
    }
    if (!worker) {
      if (!stageFromUnit) return json(req, { error: "WORKER_STAGE_REQUIRED" }, 400);
      const created = await admin.from("khsx_workers").insert({
        id: workerId,
        display_name: requestedName || workerId,
        stage: stageFromUnit,
        active: true,
      }).select("id,display_name,stage,active").single();
      if (created.error || !created.data) {
        if (created.error?.code === "23505") {
          const retry = await admin.from("khsx_workers").select("id,display_name,stage,active").eq("id", workerId).maybeSingle();
          if (retry.error || !retry.data) return json(req, { error: "WORKER_LOOKUP_FAILED" }, 503);
          worker = retry.data;
        } else {
          return json(req, { error: "WORKER_CREATE_FAILED", code: created.error?.code }, 500);
        }
      } else worker = created.data;
    }
  }
  const workerUnit = worker?.stage === "may" ? "To may"
    : worker?.stage === "dong_goi" ? "To dong goi"
    : worker?.stage === "dan" ? (requestedUnit || null) : null;
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
  let existingLink = existingLinkResult.data?.[0] ?? null;
  let { data: profile, error: profileError } = existingLink
    ? await admin.from("khsx_profiles").select("user_id,display_name,role,unit_name,active,worker_id").eq("user_id", existingLink.auth_user_id).maybeSingle()
    : worker
      ? await admin.from("khsx_profiles").select("user_id,display_name,role,unit_name,active,worker_id").eq("worker_id", worker.id).maybeSingle()
      : { data: null, error: null };
  if (profileError) return json(req, { error: "PROFILE_LOOKUP_FAILED" }, 503);
  let createdAuthUserId: string | null = null;

  if (!profile) {
    const email = worker ? "worker_" + worker.id + "@khsx.internal" : "telegram_" + telegramId + "@khsx.internal";
    let authUserId = existingLink?.auth_user_id ? String(existingLink.auth_user_id) : "";
    if (authUserId) {
      const linkedAuth = await admin.auth.admin.getUserById(authUserId);
      if (linkedAuth.error || !linkedAuth.data.user) {
        await admin.from("khsx_telegram_links").delete().eq("telegram_user_id", Number(telegramId));
        existingLink = null;
        authUserId = "";
      }
    }
    if (!authUserId) {
      const existingAuth = await findAuthUserByEmail(admin, email);
      if (existingAuth.error) return json(req, { error: "AUTH_USER_LOOKUP_FAILED", code: existingAuth.error.code }, 503);
      authUserId = existingAuth.user?.id ?? "";
    }
    if (!authUserId) {
      const created = await admin.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { display_name: requestedName || worker?.display_name || ("Telegram " + telegramId), worker_id: worker?.id || null },
      });
      if (created.error || !created.user) {
        return json(req, { error: "AUTH_USER_CREATE_FAILED", code: created.error?.code }, 500);
      }
      authUserId = created.user.id;
      createdAuthUserId = created.user.id;
    }
    const inserted = await admin.from("khsx_profiles").upsert({
      user_id: authUserId,
      display_name: requestedName || worker?.display_name || ("Telegram " + telegramId),
      role: requestedRole,
      unit_name: unitName,
      worker_id: worker?.id || null,
      active: true,
    }, { onConflict: "user_id" }).select("user_id,display_name,role,unit_name,active,worker_id").single();
    if (inserted.error || !inserted.data) {
      if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId);
      const duplicateWorker = inserted.error?.code === "23505";
      return json(req, { error: duplicateWorker ? "WORKER_PROFILE_ALREADY_EXISTS" : "PROFILE_UPSERT_FAILED", code: inserted.error?.code }, duplicateWorker ? 409 : 500);
    }
    profile = inserted.data;
  }
  // Quản lý có thể duyệt lại hồ sơ đã bị vô hiệu hóa (ví dụ đổi điện thoại/
  // đổi Telegram ID). Không tạo hồ sơ trùng; chỉ mở lại đúng hồ sơ Worker cũ.

  if (existingLink && String(existingLink.auth_user_id) !== String(profile.user_id)) {
    return json(req, { error: "TELEGRAM_ID_ALREADY_LINKED" }, 409);
  }
  const accountLink = await admin.from("khsx_telegram_links")
    .select("telegram_user_id")
    .eq("auth_user_id", profile.user_id)
    .eq("active", true)
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
    .update({ role: requestedRole, unit_name: unitName, active: true, updated_at: new Date().toISOString() })
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
