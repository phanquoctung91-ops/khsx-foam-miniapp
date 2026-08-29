import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  accountEmail,
  accountPassword,
  adminClient,
  cors,
  dbCode,
  json,
  originAllowed,
  publicClient,
  readInitData,
  runtimeReady,
  verifyTelegramInitData,
} from "../_shared/khsx-telegram-v121.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (!originAllowed(req)) {
    return json(req, { error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  if (!runtimeReady()) {
    return json(req, { error: "SERVER_NOT_CONFIGURED" }, 503);
  }

  const parsed = await readInitData(req);
  if (parsed.error) {
    return json(
      req,
      { error: parsed.error },
      parsed.error === "REQUEST_TOO_LARGE" ? 413 : 400,
    );
  }
  const telegramUser = await verifyTelegramInitData(parsed.initData);
  if (!telegramUser) return json(req, { error: "INVALID_TELEGRAM_DATA" }, 401);

  const admin = adminClient();
  const { data: profile, error: profileError } = await admin.from(
    "khsx_profiles",
  )
    .select("user_id,display_name,role,unit_name,active,worker_id")
    .eq("telegram_user_id", telegramUser.id)
    .maybeSingle();
  if (profileError) {
    return json(req, {
      error: "ACCOUNT_LOOKUP_FAILED",
      db_code: dbCode(profileError),
    }, 503);
  }
  if (!profile) {
    const { data: pending, error: pendingError } = await admin.from(
      "khsx_telegram_registrations",
    )
      .select("telegram_user_id")
      .eq("telegram_user_id", telegramUser.id)
      .maybeSingle();
    if (pendingError) {
      return json(req, {
        error: "REGISTRATION_LOOKUP_FAILED",
        db_code: dbCode(pendingError),
      }, 503);
    }
    return json(req, {
      error: pending ? "REGISTRATION_PENDING" : "NOT_REGISTERED",
      telegram_user_id: telegramUser.id,
    }, 403);
  }
  if (!profile.active) {
    return json(req, {
      error: "ACCOUNT_REVOKED",
      telegram_user_id: telegramUser.id,
    }, 403);
  }

  const email = accountEmail(telegramUser.id);
  const password = await accountPassword(telegramUser.id);
  const client = publicClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    return json(req, {
      error: "AUTH_SIGN_IN_FAILED",
      auth_code: error?.code ?? "NO_SESSION",
    }, 500);
  }

  return json(req, {
    ok: true,
    session: data.session,
    profile: {
      display_name: profile.display_name,
      role: profile.role,
      unit_name: profile.unit_name,
      worker_id: profile.worker_id,
    },
  });
});
