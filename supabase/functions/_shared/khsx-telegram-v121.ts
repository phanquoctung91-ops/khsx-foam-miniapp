import { createClient } from "npm:@supabase/supabase-js@2.112.3";

function namedKey(jsonName: string, legacyNames: string[]) {
  try {
    const values = JSON.parse(Deno.env.get(jsonName) ?? "{}") as Record<
      string,
      string
    >;
    if (values.default) return values.default;
  } catch {
    // Dự án cũ vẫn có thể dùng secret đơn.
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_ROLE_KEY = namedKey("SUPABASE_SECRET_KEYS", [
  "SUPABASE_SERVICE_ROLE_KEY",
]);
export const PUBLISHABLE_KEY = namedKey("SUPABASE_PUBLISHABLE_KEYS", [
  "KHSX_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
]);
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SESSION_SECRET = Deno.env.get("TELEGRAM_SESSION_SECRET") ?? "";
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("KHSX_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
);

export const APPROVAL_ROLES = new Set(["quan_ly", "quan_ly_2", "nhan_vien"]);
export const APPROVAL_UNITS = new Set([
  "To 1",
  "To 2",
  "To 3",
  "To 4",
  "To 5",
  "To may",
  "To dong goi",
]);

const encoder = new TextEncoder();

export type TelegramUser = { id: number };
export type AdminClient = ReturnType<typeof createClient>;

export function runtimeReady() {
  return Boolean(
    SUPABASE_URL && SERVICE_ROLE_KEY && PUBLISHABLE_KEY && TELEGRAM_BOT_TOKEN &&
      SESSION_SECRET,
  );
}

export function originAllowed(req: Request) {
  return ALLOWED_ORIGINS.has(req.headers.get("origin") ?? "");
}

export function cors(req: Request, withAuthorization = false) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "null",
    "Access-Control-Allow-Headers": withAuthorization
      ? "apikey, authorization, content-type, x-client-info"
      : "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

export function json(
  req: Request,
  body: unknown,
  status = 200,
  withAuthorization = false,
) {
  return Response.json(body, { status, headers: cors(req, withAuthorization) });
}

export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicClient(authorization = "") {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: authorization
      ? { headers: { Authorization: authorization } }
      : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function hmac(keyBytes: Uint8Array, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyTelegramInitData(
  initData: string,
): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  const authDate = Number(params.get("auth_date") ?? 0);
  const now = Math.floor(Date.now() / 1000);
  if (!receivedHash || !authDate || Math.abs(now - authDate) > 86_400) {
    return null;
  }

  params.delete("hash");
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await hmac(
    encoder.encode("WebAppData"),
    TELEGRAM_BOT_TOKEN,
  );
  const expectedHash = hex(await hmac(secretKey, checkString));
  if (!safeEqual(expectedHash, receivedHash.toLowerCase())) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null") as
      | TelegramUser
      | null;
    return user && Number.isSafeInteger(user.id) ? { id: user.id } : null;
  } catch {
    return null;
  }
}

export async function accountPassword(telegramUserId: number) {
  // Giữ đúng credential nội bộ của tài khoản Quản lý full đang hoạt động.
  // Từ v121 password chỉ được đặt khi duyệt/khôi phục, không đổi ở mỗi lần login.
  const signature = await hmac(
    encoder.encode(SESSION_SECRET),
    `telegram:${telegramUserId}`,
  );
  return `Kx!${
    btoa(String.fromCharCode(...signature)).replaceAll("+", "-").replaceAll(
      "/",
      "_",
    ).replaceAll("=", "")
  }`;
}

export function accountEmail(telegramUserId: number) {
  return `tg_${telegramUserId}@khsx.internal`;
}

export function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "Kx!" +
    Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function normalizeUnit(value: unknown) {
  const unit = String(value ?? "").trim();
  const aliases: Record<string, string> = {
    "Tổ 1": "To 1",
    "Tổ 2": "To 2",
    "Tổ 3": "To 3",
    "Tổ 4": "To 4",
    "Tổ 5": "To 5",
    "Tổ may": "To may",
    "Tổ đóng gói": "To dong goi",
  };
  return aliases[unit] ?? unit;
}

export async function readInitData(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 16_384) {
    return { error: "REQUEST_TOO_LARGE", initData: "" };
  }
  try {
    const body = await req.json();
    const initData = String(body?.init_data ?? "");
    if (!initData || initData.length > 10_000) {
      return { error: "INVALID_REQUEST", initData: "" };
    }
    return { error: "", initData };
  } catch {
    return { error: "INVALID_REQUEST", initData: "" };
  }
}

export function dbCode(error: { code?: string } | null | undefined) {
  return error?.code ?? "UNKNOWN";
}
