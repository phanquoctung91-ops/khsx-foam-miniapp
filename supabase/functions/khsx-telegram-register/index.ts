import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  adminClient,
  cors,
  dbCode,
  json,
  originAllowed,
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
    .select("user_id,active")
    .eq("telegram_user_id", telegramUser.id)
    .maybeSingle();
  if (profileError) {
    return json(req, {
      error: "ACCOUNT_LOOKUP_FAILED",
      db_code: dbCode(profileError),
    }, 503);
  }
  if (profile?.active) {
    return json(req, {
      ok: true,
      status: "active",
      telegram_user_id: telegramUser.id,
    });
  }
  if (profile && !profile.active) {
    return json(req, {
      ok: true,
      status: "revoked",
      telegram_user_id: telegramUser.id,
    });
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("khsx_telegram_registrations").upsert({
    telegram_user_id: telegramUser.id,
    last_seen_at: now,
  }, { onConflict: "telegram_user_id" });
  if (error) {
    return json(req, {
      error: "REGISTRATION_WRITE_FAILED",
      db_code: dbCode(error),
    }, 503);
  }
  return json(req, {
    ok: true,
    status: "pending",
    telegram_user_id: telegramUser.id,
  });
});
