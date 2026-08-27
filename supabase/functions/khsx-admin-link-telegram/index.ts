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

  let body: { worker_id?: string; telegram_user_id?: number | string; telegram_username?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "INVALID_REQUEST" }, 400);
  }
  const workerId = String(body.worker_id ?? "").trim().toLowerCase();
  const telegramId = String(body.telegram_user_id ?? "").trim();
  if (!workerId || !/^\d{4,20}$/.test(telegramId)) {
    return json(req, { error: "INVALID_INPUT" }, 400);
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

  const { data: worker, error: workerError } = await admin.from("khsx_workers")
    .select("id,display_name,stage,active")
    .eq("id", workerId)
    .maybeSingle();
  if (workerError) return json(req, { error: "WORKER_LOOKUP_FAILED" }, 503);
  if (!worker?.active) return json(req, { error: "WORKER_NOT_FOUND" }, 404);
  const unitName = worker.stage === "may" ? "To may" : worker.stage === "dong_goi" ? "To dong goi" : null;
  if (!unitName) return json(req, { error: "WORKER_STAGE_UNSUPPORTED" }, 400);

  let { data: profile, error: profileError } = await admin.from("khsx_profiles")
    .select("user_id,display_name,role,unit_name,active,worker_id")
    .eq("worker_id", worker.id)
    .maybeSingle();
  if (profileError) return json(req, { error: "PROFILE_LOOKUP_FAILED" }, 503);
  let createdAuthUserId: string | null = null;

  if (!profile) {
    const email = "worker_" + worker.id + "@khsx.internal";
    const created = await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { display_name: worker.display_name, worker_id: worker.id },
    });
    if (created.error || !created.user) {
      return json(req, { error: "PROFILE_CREATE_FAILED" }, 500);
    }
    createdAuthUserId = created.user.id;
    const inserted = await admin.from("khsx_profiles").insert({
      user_id: created.user.id,
      display_name: worker.display_name,
      role: "nhan_vien",
      unit_name: unitName,
      worker_id: worker.id,
      active: true,
    }).select("user_id,display_name,role,unit_name,active,worker_id").single();
    if (inserted.error || !inserted.data) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(req, { error: "PROFILE_CREATE_FAILED" }, 500);
    }
    profile = inserted.data;
  }
  if (!profile.active) return json(req, { error: "ACCOUNT_DISABLED" }, 403);

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
    return json(req, { error: "TELEGRAM_LINK_FAILED" }, 409);
  }
  await admin.from("khsx_telegram_access_requests").delete().eq("telegram_user_id", Number(telegramId));
  return json(req, {
    ok: true,
    profile: {
      user_id: profile.user_id,
      display_name: profile.display_name,
      role: profile.role,
      unit_name: profile.unit_name,
      active: profile.active,
      worker_id: profile.worker_id,
    },
  });
});
