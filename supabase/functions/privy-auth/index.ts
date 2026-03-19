/**
 * Exchanges a Privy access token for a short-lived Supabase JWT (wallet_address claim for RLS).
 *
 * Required Edge Function secret (NOT auto-injected by Supabase):
 *   SUPABASE_JWT_SECRET — same value as Dashboard → Project Settings → API → JWT Secret
 *
 * Optional:
 *   PRIVY_VERIFICATION_KEY — PEM public key from Privy Dashboard for full ES256 signature verify
 *
 * Set via CLI (linked project): use JWT_SECRET — CLI rejects names starting with SUPABASE_.
 *   supabase secrets set JWT_SECRET="<paste-jwt-secret-from-dashboard>" --project-ref <ref>
 * Or set SUPABASE_JWT_SECRET in Dashboard → Edge Functions → Secrets.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { importSPKI, jwtVerify, decodeJwt, SignJWT } from "npm:jose@5.9.6";

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

let verificationKeyCache: CryptoKey | null = null;

async function getVerificationKey(): Promise<CryptoKey | null> {
  if (verificationKeyCache) return verificationKeyCache;
  const pem = Deno.env.get("PRIVY_VERIFICATION_KEY");
  if (!pem) return null;
  try {
    verificationKeyCache = await importSPKI(pem, "ES256");
    return verificationKeyCache;
  } catch (e) {
    console.error("Failed to import PRIVY_VERIFICATION_KEY:", e);
    return null;
  }
}

/** Supabase does not inject JWT secret into Edge Functions — must be set manually. */
function getJwtSigningSecret(): string | null {
  const s =
    Deno.env.get("SUPABASE_JWT_SECRET")?.trim() ||
    Deno.env.get("JWT_SECRET")?.trim();
  return s && s.length > 0 ? s : null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { privy_token, wallet_address, app_id } = body;

    if (!privy_token || !wallet_address) {
      return jsonResponse(
        { error: "Missing privy_token or wallet_address" },
        400,
      );
    }

    if (
      typeof wallet_address !== "string" ||
      !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)
    ) {
      return jsonResponse({ error: "Invalid wallet address format" }, 400);
    }

    const privyAppId = app_id || ALLOWED_PRIVY_APP_IDS[0];
    if (!ALLOWED_PRIVY_APP_IDS.includes(privyAppId)) {
      return jsonResponse({ error: "Unauthorized application" }, 403);
    }

    let privyUserId: string;

    const verificationKey = await getVerificationKey();

    if (verificationKey) {
      const { payload } = await jwtVerify(privy_token, verificationKey, {
        issuer: "privy.io",
        audience: privyAppId,
      });
      privyUserId = payload.sub!;
      if (!privyUserId) throw new Error("Token missing subject");
    } else {
      console.warn(
        "[privy-auth] PRIVY_VERIFICATION_KEY not set — claim-based validation only",
      );
      const payload = decodeJwt(privy_token);

      if (payload.iss !== "privy.io") {
        return jsonResponse({ error: "Invalid issuer" }, 401);
      }

      const aud = payload.aud;
      const audMatch =
        aud === privyAppId ||
        (Array.isArray(aud) && aud.includes(privyAppId));
      if (!audMatch) {
        return jsonResponse({ error: "Invalid audience" }, 401);
      }

      if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
        return jsonResponse({ error: "Token expired" }, 401);
      }

      if (!payload.sub) {
        return jsonResponse({ error: "Missing subject" }, 401);
      }

      privyUserId = payload.sub;
    }

    const jwtSecret = getJwtSigningSecret();
    if (!jwtSecret) {
      console.error(
        "[privy-auth] Missing SUPABASE_JWT_SECRET (or JWT_SECRET) — set Edge Function secret",
      );
      return jsonResponse(
        {
          error: "Server configuration error",
          code: "missing_jwt_secret",
          hint:
            "Set Edge secret to your project JWT Secret: Dashboard → Edge Functions → Secrets → SUPABASE_JWT_SECRET. CLI cannot use SUPABASE_* names — use: supabase secrets set JWT_SECRET=\"<secret>\" --project-ref <ref>",
        },
        500,
      );
    }

    const normalizedAddress = wallet_address.toLowerCase();
    const secret = new TextEncoder().encode(jwtSecret);

    const supabaseJwt = await new SignJWT({
      sub: normalizedAddress,
      wallet_address: normalizedAddress,
      privy_did: privyUserId,
      role: "authenticated",
      iss: "supabase",
      aud: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    console.log(
      `[privy-auth] Issued token for ${normalizedAddress.slice(0, 10)}...`,
    );

    return jsonResponse({ token: supabaseJwt, expires_in: 3600 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[privy-auth] Auth exchange failed:", msg);
    return jsonResponse({ error: "Authentication failed" }, 401);
  }
});
