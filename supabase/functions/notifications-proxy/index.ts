/**
 * BFF for notifications when privy-auth cannot mint Supabase JWTs (e.g. missing JWT_SECRET).
 * Validates Privy access token, then uses PostgREST with service key (no supabase-js — smaller cold start, fewer 546 WORKER_LIMIT hits).
 *
 * Edge secrets: SUPABASE_SERVICE_ROLE_KEY or SB_SECRET_KEY (sb_secret_…).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { decodeJwt } from "npm:jose@5.9.6";

const ALLOWED_PRIVY_APP_IDS = [
  "cmjmyu1w503lvil0c7uxpigg4",
  "cmkhjjrfu00xci60cenylo2s5",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-client-info",
};

function validatePrivyToken(
  privyToken: string,
  expectedAppId: string,
): { ok: true } | { ok: false; status: number; msg: string } {
  try {
    const payload = decodeJwt(privyToken);
    if (payload.iss !== "privy.io") {
      return { ok: false, status: 401, msg: "Invalid issuer" };
    }
    const aud = payload.aud;
    const audMatch =
      aud === expectedAppId ||
      (Array.isArray(aud) && aud.includes(expectedAppId));
    if (!audMatch) {
      return { ok: false, status: 401, msg: "Invalid audience" };
    }
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, status: 401, msg: "Token expired" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, msg: "Invalid token" };
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function restHeaders(serviceKey: string, method: string): HeadersInit {
  const h: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  if (method !== "GET") {
    h["Content-Type"] = "application/json";
    h["Prefer"] = "return=minimal";
  }
  return h;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { privy_token, wallet_address, app_id, action } = body as Record<
      string,
      unknown
    >;

    if (!privy_token || !wallet_address || !action) {
      return json({ error: "Missing privy_token, wallet_address, or action" }, 400);
    }

    const addr = String(wallet_address).toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(addr)) {
      return json({ error: "Invalid wallet address" }, 400);
    }

    const privyAppId = (app_id as string) || ALLOWED_PRIVY_APP_IDS[0];
    if (!ALLOWED_PRIVY_APP_IDS.includes(privyAppId)) {
      return json({ error: "Unauthorized application" }, 403);
    }

    const v = validatePrivyToken(String(privy_token), privyAppId);
    if (!v.ok) return json({ error: v.msg }, v.status);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
      Deno.env.get("SB_SECRET_KEY")?.trim() ||
      Deno.env.get("SUPABASE_SECRET_KEY")?.trim();
    if (!supabaseUrl || !serviceKey) {
      console.error(
        "[notifications-proxy] Missing API key: set SUPABASE_SERVICE_ROLE_KEY or SB_SECRET_KEY (sb_secret_…)",
      );
      return json({ error: "Server configuration error" }, 500);
    }

    const base = `${supabaseUrl}/rest/v1/notifications`;

    if (action === "list") {
      const q = new URLSearchParams({
        select: "*",
        recipient_address: `eq.${addr}`,
        type: "neq.dismissed",
        order: "created_at.desc",
        limit: "50",
      });
      const res = await fetch(`${base}?${q}`, {
        method: "GET",
        headers: restHeaders(serviceKey, "GET"),
      });
      if (!res.ok) {
        const t = await res.text();
        console.error("[notifications-proxy] list HTTP", res.status, t);
        return json({ error: t || `Upstream ${res.status}` }, 500);
      }
      const data = await res.json();
      return json({ data: Array.isArray(data) ? data : [] });
    }

    if (action === "mark_read") {
      const notification_id = body.notification_id as string | undefined;
      if (!notification_id) return json({ error: "Missing notification_id" }, 400);
      const q = new URLSearchParams({
        id: `eq.${notification_id}`,
        recipient_address: `eq.${addr}`,
      });
      const res = await fetch(`${base}?${q}`, {
        method: "PATCH",
        headers: restHeaders(serviceKey, "PATCH"),
        body: JSON.stringify({ is_read: true }),
      });
      if (!res.ok) {
        const t = await res.text();
        return json({ error: t || `Upstream ${res.status}` }, 500);
      }
      return json({ ok: true });
    }

    if (action === "dismiss") {
      const notification_id = body.notification_id as string | undefined;
      if (!notification_id) return json({ error: "Missing notification_id" }, 400);
      const q = new URLSearchParams({
        id: `eq.${notification_id}`,
        recipient_address: `eq.${addr}`,
      });
      const res = await fetch(`${base}?${q}`, {
        method: "PATCH",
        headers: restHeaders(serviceKey, "PATCH"),
        body: JSON.stringify({ is_read: true, type: "dismissed" }),
      });
      if (!res.ok) {
        const t = await res.text();
        return json({ error: t || `Upstream ${res.status}` }, 500);
      }
      return json({ ok: true });
    }

    if (action === "mark_all_read") {
      const q = new URLSearchParams({
        recipient_address: `eq.${addr}`,
        is_read: "eq.false",
      });
      const res = await fetch(`${base}?${q}`, {
        method: "PATCH",
        headers: restHeaders(serviceKey, "PATCH"),
        body: JSON.stringify({ is_read: true }),
      });
      if (!res.ok) {
        const t = await res.text();
        return json({ error: t || `Upstream ${res.status}` }, 500);
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[notifications-proxy]", e);
    return json({ error: "Internal error" }, 500);
  }
});
