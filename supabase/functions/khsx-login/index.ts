import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PUBLIC_KEY = "sb_publishable_Vy74jABl_0L-VGIKWAP1zw_YN1OZ4C2";
const allowedOrigins = new Set([
  "https://phanquoctung91-ops.github.io",
  "http://127.0.0.1:8877",
  "http://localhost:8877"
]);
function cors(req) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://phanquoctung91-ops.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}
function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b)=>b.toString(16).padStart(2, "0")).join("");
}
async function derivePassword(loginId) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_ROLE_KEY), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("khsx-login:" + loginId));
  const token = btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return "Kx!" + token;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: cors(req)
  });
  if (req.method !== "POST") return json(req, {
    error: "METHOD_NOT_ALLOWED"
  }, 405);
  const origin = req.headers.get("origin") ?? "";
  if (origin && !allowedOrigins.has(origin)) return json(req, {
    error: "ORIGIN_NOT_ALLOWED"
  }, 403);
  let code = "";
  try {
    const body = await req.json();
    code = String(body?.code ?? "").trim();
  } catch  {
    return json(req, {
      error: "INVALID_REQUEST"
    }, 400);
  }
  if (code.length < 4 || code.length > 64) return json(req, {
    error: "INVALID_LOGIN"
  }, 401);
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  const clientKey = await sha256Hex(forwarded + "|" + ua);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const { data: rows, error: verifyError } = await admin.rpc("khsx_verify_login", {
    p_code: code,
    p_client_key: clientKey
  });
  if (verifyError?.message?.includes("TOO_MANY_ATTEMPTS")) {
    return json(req, {
      error: "TOO_MANY_ATTEMPTS"
    }, 429);
  }
  if (verifyError || !Array.isArray(rows) || rows.length !== 1) {
    return json(req, {
      error: "INVALID_LOGIN"
    }, 401);
  }
  const login = rows[0];
  const email = `${login.login_id}@khsx.internal`;
  const password = await derivePassword(login.login_id);
  let userId = login.auth_user_id ?? null;
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: {
        display_name: login.display_name
      },
      app_metadata: {
        provider: "khsx-code"
      }
    });
    if (error) userId = null;
  }
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: login.display_name
      },
      app_metadata: {
        provider: "khsx-code"
      }
    });
    if (error || !data.user) return json(req, {
      error: "AUTH_SETUP_FAILED"
    }, 500);
    userId = data.user.id;
    const { error: linkError } = await admin.rpc("khsx_set_login_auth_user", {
      p_login_id: login.login_id,
      p_auth_user_id: userId
    });
    if (linkError) return json(req, {
      error: "AUTH_SETUP_FAILED"
    }, 500);
  }
  const { error: profileError } = await admin.from("khsx_profiles").upsert({
    user_id: userId,
    login_code_key: login.login_id,
    display_name: login.display_name,
    role: login.role,
    unit_name: login.unit_name,
    active: true,
    updated_at: new Date().toISOString()
  }, {
    onConflict: "user_id"
  });
  if (profileError) return json(req, {
    error: "PROFILE_SETUP_FAILED"
  }, 500);
  const auth = createClient(SUPABASE_URL, PUBLIC_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email,
    password
  });
  if (signInError || !signedIn.session) return json(req, {
    error: "SIGN_IN_FAILED"
  }, 500);
  return json(req, {
    session: signedIn.session,
    profile: {
      display_name: login.display_name,
      role: login.role,
      unit_name: login.unit_name
    }
  });
});
