import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function namedKey(jsonName: string, legacyNames: string[]) {
  try {
    const values = JSON.parse(Deno.env.get(jsonName) ?? "{}") as Record<string, string>;
    if (values.default) return values.default;
  } catch {
    // Dự án cũ chưa có biến JSON; dùng khóa tương thích bên dưới.
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}

const SERVICE_ROLE_KEY = namedKey("SUPABASE_SECRET_KEYS", ["SUPABASE_SERVICE_ROLE_KEY"]);
const PUBLISHABLE_KEY = namedKey("SUPABASE_PUBLISHABLE_KEYS", ["KHSX_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"]);
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SESSION_SECRET = Deno.env.get("TELEGRAM_SESSION_SECRET")!;
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("KHSX_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
);

const encoder = new TextEncoder();

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors(req) });
}

async function hmac(keyBytes: Uint8Array, value: string) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };

async function verifyTelegramInitData(initData: string): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  const authDate = Number(params.get("auth_date") ?? 0);
  const now = Math.floor(Date.now() / 1000);
  if (!receivedHash || !authDate || Math.abs(now - authDate) > 300) return null;

  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await hmac(encoder.encode("WebAppData"), TELEGRAM_BOT_TOKEN);
  const expectedHash = hex(await hmac(secretKey, checkString));
  if (!safeEqual(expectedHash, receivedHash.toLowerCase())) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null") as TelegramUser | null;
    return user && Number.isSafeInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

async function derivePassword(telegramUserId: number) {
  const signature = await hmac(encoder.encode(SESSION_SECRET), `telegram:${telegramUserId}`);
  return `Kx!${btoa(String.fromCharCode(...signature)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return json(req, { error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PUBLISHABLE_KEY || !TELEGRAM_BOT_TOKEN || !SESSION_SECRET) {
    return json(req, { error: "SERVER_NOT_CONFIGURED" }, 503);
  }
  if (Number(req.headers.get("content-length") ?? 0) > 16_384) {
    return json(req, { error: "REQUEST_TOO_LARGE" }, 413);
  }

  let initData = "";
  try {
    initData = String((await req.json())?.init_data ?? "");
  } catch {
    return json(req, { error: "INVALID_REQUEST" }, 400);
  }
  if (!initData || initData.length > 10_000) return json(req, { error: "INVALID_REQUEST" }, 400);

  const telegramUser = await verifyTelegramInitData(initData);
  if (!telegramUser) return json(req, { error: "INVALID_TELEGRAM_DATA" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ");

  const { data: link, error: linkError } = await admin.from("khsx_telegram_links")
    .select("auth_user_id,active")
    .eq("telegram_user_id", telegramUser.id)
    .maybeSingle();
  if (linkError) return json(req, { error: "AUTH_LOOKUP_FAILED" }, 503);

  if (!link?.active) {
    const { error: requestError } = await admin.from("khsx_telegram_access_requests").upsert({
      telegram_user_id: telegramUser.id,
      telegram_username: telegramUser.username ?? null,
      telegram_display_name: displayName,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "telegram_user_id" });
    if (requestError) return json(req, { error: "ACCESS_REQUEST_FAILED" }, 503);
    return json(req, { error: "ACCESS_NOT_PROVISIONED", telegram_user_id: telegramUser.id }, 403);
  }

  const { data: profile, error: profileError } = await admin.from("khsx_profiles")
    .select("display_name,role,unit_name,active")
    .eq("user_id", link.auth_user_id)
    .maybeSingle();
  if (profileError) return json(req, { error: "PROFILE_LOOKUP_FAILED" }, 503);
  if (!profile?.active) return json(req, { error: "ACCOUNT_DISABLED" }, 403);

  const email = `tg_${telegramUser.id}@khsx.internal`;
  const password = await derivePassword(telegramUser.id);
  const { error: updateError } = await admin.auth.admin.updateUserById(link.auth_user_id, {
    email, password, email_confirm: true,
    user_metadata: { display_name: profile.display_name },
    app_metadata: { provider: "telegram-miniapp", telegram_user_id: telegramUser.id },
  });
  if (updateError) return json(req, { error: "AUTH_SETUP_FAILED" }, 500);

  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return json(req, { error: "SIGN_IN_FAILED" }, 500);

  return json(req, {
    session: data.session,
    profile: {
      display_name: profile.display_name,
      role: profile.role,
      unit_name: profile.unit_name,
    },
  });
});
