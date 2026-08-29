import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  accountEmail,
  accountPassword,
  adminClient,
  APPROVAL_ROLES,
  APPROVAL_UNITS,
  cors,
  dbCode,
  json,
  normalizeUnit,
  originAllowed,
  publicClient,
  randomPassword,
  runtimeReady,
} from "../_shared/khsx-telegram-v121.ts";

type AccountAction = "approve" | "update" | "revoke" | "restore";
type AuthUser = { id: string; email?: string | null };

async function findAuthUserByEmail(email: string) {
  const admin = adminClient();
  for (let page = 1; page <= 50; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) {
      return { user: null as AuthUser | null, error: result.error };
    }
    const user = result.data.users.find((item) =>
      String(item.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (user) return { user: user as AuthUser, error: null };
    if (result.data.users.length < 1000) break;
  }
  return { user: null as AuthUser | null, error: null };
}

async function audit(
  admin: ReturnType<typeof adminClient>,
  values: Record<string, unknown>,
) {
  const result = await admin.from("khsx_account_audit").insert(values);
  if (result.error) console.error("ACCOUNT_AUDIT_FAILED", result.error.code);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req, true) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "METHOD_NOT_ALLOWED" }, 405, true);
  }
  if (!originAllowed(req)) {
    return json(req, { error: "ORIGIN_NOT_ALLOWED" }, 403, true);
  }
  if (!runtimeReady()) {
    return json(req, { error: "SERVER_NOT_CONFIGURED" }, 503, true);
  }

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(req, { error: "AUTH_REQUIRED" }, 401, true);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "INVALID_REQUEST" }, 400, true);
  }
  const action = String(body.action ?? "approve").trim() as AccountAction;
  const telegramId = String(body.telegram_user_id ?? "").trim();
  const displayName = String(body.display_name ?? "").trim();
  const role = String(body.role ?? "").trim();
  const unit = role === "nhan_vien" ? normalizeUnit(body.unit_name) : "";
  if (
    !new Set<AccountAction>(["approve", "update", "revoke", "restore"]).has(
      action,
    ) || !/^\d{4,20}$/.test(telegramId)
  ) {
    return json(req, { error: "INVALID_INPUT" }, 400, true);
  }
  if (["approve", "update"].includes(action)) {
    if (!displayName) {
      return json(req, { error: "DISPLAY_NAME_REQUIRED" }, 400, true);
    }
    if (!APPROVAL_ROLES.has(role)) {
      return json(req, { error: "ROLE_INVALID" }, 400, true);
    }
    if (role === "nhan_vien" && !APPROVAL_UNITS.has(unit)) {
      return json(
        req,
        { error: unit ? "UNIT_INVALID" : "UNIT_REQUIRED" },
        400,
        true,
      );
    }
  }

  const caller = publicClient(authorization);
  const { data: callerAuth, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerAuth.user) {
    return json(req, { error: "AUTH_REQUIRED" }, 401, true);
  }
  const admin = adminClient();
  const { data: manager, error: managerError } = await admin.from(
    "khsx_profiles",
  )
    .select("role,active")
    .eq("user_id", callerAuth.user.id)
    .maybeSingle();
  if (managerError) {
    return json(
      req,
      { error: "MANAGER_LOOKUP_FAILED", db_code: dbCode(managerError) },
      503,
      true,
    );
  }
  const callerRole = String(manager?.role ?? "");
  if (!manager?.active || !["quan_ly", "quan_ly_2"].includes(callerRole)) {
    return json(req, { error: "MANAGER_REQUIRED" }, 403, true);
  }
  if (
    callerRole === "quan_ly_2" && (action !== "approve" || role !== "nhan_vien")
  ) {
    return json(req, { error: "MANAGER2_EMPLOYEE_ONLY" }, 403, true);
  }

  const telegramNumber = Number(telegramId);
  const { data: existing, error: existingError } = await admin.from(
    "khsx_profiles",
  )
    .select(
      "user_id,display_name,role,unit_name,active,worker_id,approved_by,approved_at,revoked_by,revoked_at",
    )
    .eq("telegram_user_id", telegramNumber)
    .maybeSingle();
  if (existingError) {
    return json(
      req,
      { error: "ACCOUNT_LOOKUP_FAILED", db_code: dbCode(existingError) },
      503,
      true,
    );
  }
  if (callerRole === "quan_ly_2" && existing) {
    return json(req, { error: "MANAGER2_NEW_EMPLOYEE_ONLY" }, 403, true);
  }
  if (action === "approve") {
    if (existing) {
      return json(req, { error: "ACCOUNT_ALREADY_EXISTS" }, 409, true);
    }
    const pending = await admin.from("khsx_telegram_registrations")
      .select("telegram_user_id")
      .eq("telegram_user_id", telegramNumber)
      .maybeSingle();
    if (pending.error) {
      return json(
        req,
        { error: "REGISTRATION_LOOKUP_FAILED", db_code: dbCode(pending.error) },
        503,
        true,
      );
    }
    if (!pending.data) {
      return json(req, { error: "REGISTRATION_REQUIRED" }, 409, true);
    }
  }
  if (["update", "revoke", "restore"].includes(action) && !existing) {
    return json(req, { error: "ACCOUNT_NOT_FOUND" }, 404, true);
  }

  const beforeState = existing ?? null;
  const now = new Date().toISOString();

  if (action === "revoke") {
    const { data: profile, error } = await admin.from("khsx_profiles").update({
      active: false,
      revoked_by: callerAuth.user.id,
      revoked_at: now,
      updated_at: now,
    }).eq("user_id", existing!.user_id)
      .select(
        "user_id,telegram_user_id,display_name,role,unit_name,active,approved_at,revoked_at",
      ).single();
    if (error || !profile) {
      return json(
        req,
        { error: "ACCOUNT_REVOKE_FAILED", db_code: dbCode(error) },
        500,
        true,
      );
    }
    const authUpdate = await admin.auth.admin.updateUserById(
      existing!.user_id,
      { password: randomPassword() },
    );
    await audit(admin, {
      telegram_user_id: telegramNumber,
      auth_user_id: existing!.user_id,
      action,
      actor_user_id: callerAuth.user.id,
      before_state: beforeState,
      after_state: profile,
    });
    return json(req, {
      ok: true,
      profile,
      auth_lock_warning: authUpdate.error?.code ?? null,
    });
  }

  if (action === "restore") {
    const password = await accountPassword(telegramNumber);
    const authUpdate = await admin.auth.admin.updateUserById(
      existing!.user_id,
      {
        email: accountEmail(telegramNumber),
        password,
        email_confirm: true,
        app_metadata: {
          provider: "telegram-miniapp",
          telegram_user_id: telegramNumber,
          auth_version: 121,
        },
      },
    );
    if (authUpdate.error) {
      return json(
        req,
        {
          error: "ACCOUNT_RESTORE_AUTH_FAILED",
          auth_code: authUpdate.error.code,
        },
        500,
        true,
      );
    }
    const { data: profile, error } = await admin.from("khsx_profiles").update({
      active: true,
      revoked_by: null,
      revoked_at: null,
      updated_at: now,
    }).eq("user_id", existing!.user_id)
      .select(
        "user_id,telegram_user_id,display_name,role,unit_name,active,approved_at,revoked_at",
      ).single();
    if (error || !profile) {
      return json(
        req,
        { error: "ACCOUNT_RESTORE_FAILED", db_code: dbCode(error) },
        500,
        true,
      );
    }
    await admin.from("khsx_telegram_registrations").delete().eq(
      "telegram_user_id",
      telegramNumber,
    );
    await audit(admin, {
      telegram_user_id: telegramNumber,
      auth_user_id: existing!.user_id,
      action,
      actor_user_id: callerAuth.user.id,
      before_state: beforeState,
      after_state: profile,
    });
    return json(req, { ok: true, profile });
  }

  let authUserId = String(existing?.user_id ?? "");
  let createdAuthUserId = "";
  const email = accountEmail(telegramNumber);
  const password = await accountPassword(telegramNumber);
  if (!authUserId) {
    const found = await findAuthUserByEmail(email);
    if (found.error) {
      return json(
        req,
        { error: "AUTH_USER_LOOKUP_FAILED", auth_code: found.error.code },
        503,
        true,
      );
    }
    authUserId = found.user?.id ?? "";
  }
  if (!authUserId) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: {
        provider: "telegram-miniapp",
        telegram_user_id: telegramNumber,
        auth_version: 121,
      },
    });
    if (created.error || !created.data.user) {
      return json(
        req,
        {
          error: "AUTH_USER_CREATE_FAILED",
          auth_code: created.error?.code ?? "UNKNOWN",
        },
        500,
        true,
      );
    }
    authUserId = created.data.user.id;
    createdAuthUserId = authUserId;
  } else {
    const updated = await admin.auth.admin.updateUserById(authUserId, {
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
      app_metadata: {
        provider: "telegram-miniapp",
        telegram_user_id: telegramNumber,
        auth_version: 121,
      },
    });
    if (updated.error) {
      return json(
        req,
        { error: "AUTH_USER_UPDATE_FAILED", auth_code: updated.error.code },
        500,
        true,
      );
    }
  }

  const profilePayload = {
    user_id: authUserId,
    login_code_key: `telegram:${telegramId}`,
    telegram_user_id: telegramNumber,
    display_name: displayName,
    role,
    unit_name: role === "nhan_vien" ? unit : null,
    worker_id: null,
    active: action === "approve" ? true : existing!.active,
    approved_by: action === "approve"
      ? callerAuth.user.id
      : existing!.approved_by,
    approved_at: action === "approve" ? now : existing!.approved_at,
    revoked_by: action === "approve" ? null : existing!.revoked_by,
    revoked_at: action === "approve" ? null : existing!.revoked_at,
    updated_at: now,
  };
  const { data: profile, error: profileError } = await admin.from(
    "khsx_profiles",
  )
    .upsert(profilePayload, { onConflict: "user_id" })
    .select(
      "user_id,telegram_user_id,display_name,role,unit_name,active,approved_at,revoked_at",
    )
    .single();
  if (profileError || !profile) {
    if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId);
    return json(
      req,
      { error: "ACCOUNT_WRITE_FAILED", db_code: dbCode(profileError) },
      500,
      true,
    );
  }
  if (action === "approve") {
    await admin.from("khsx_telegram_registrations").delete().eq(
      "telegram_user_id",
      telegramNumber,
    );
  }
  await audit(admin, {
    telegram_user_id: telegramNumber,
    auth_user_id: authUserId,
    action,
    actor_user_id: callerAuth.user.id,
    before_state: beforeState,
    after_state: profile,
  });
  return json(req, { ok: true, profile });
});
