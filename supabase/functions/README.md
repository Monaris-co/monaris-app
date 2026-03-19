# Supabase Edge Functions

## `notifications-proxy` (optional / legacy)

The app **`useNotifications` hook uses the Supabase anon client** directly (queries filter by `recipient_address`). You do **not** need this function for the bell unless you bring back a proxy-based flow.

If you deploy it anyway: validates a Privy token, then calls PostgREST with a service/secret key.

**Edge Function secrets:** `SUPABASE_SERVICE_ROLE_KEY` or **`SB_SECRET_KEY`** (`sb_secret_…`).

- **Deploy:** `supabase functions deploy notifications-proxy`

For **invoices / contacts / other RLS**, still set **`JWT_SECRET`** (CLI) or **`SUPABASE_JWT_SECRET`** (Dashboard) for `privy-auth` (see below).

## `privy-auth`

Exchanges a Privy access token for a Supabase JWT that includes `wallet_address` (used by RLS).

### Required secret (must be set manually)

Supabase **does not** inject the JWT signing secret into Edge Functions. If it is missing, `privy-auth` returns **500** with `code: "missing_jwt_secret"` and notifications/contacts/invoice sync will not work.

**Important:** The new **`sb_secret_…` “secret API key”** is **not** the same as the **JWT signing secret**. The **JWT Key ID** (UUID) is also **not** the signing secret — it only identifies a key in the signing-keys UI.

1. Open **Supabase Dashboard** → **Project Settings** → **JWT Keys** (or **API** → **JWT Settings**)
2. Copy the **legacy JWT secret**, or the **shared secret** for a JWT signing key — the actual secret string used to sign tokens (often long, not starting with `sb_`)
3. Add it as an Edge Function secret named **`SUPABASE_JWT_SECRET`**:

**Dashboard:** **Project Settings** → **Edge Functions** → **Manage secrets** → add `SUPABASE_JWT_SECRET`

**CLI** (after `supabase login`): the CLI **rejects** secret names starting with `SUPABASE_`. Use **`JWT_SECRET`** instead (the function reads it):

```bash
supabase secrets set JWT_SECRET="paste-your-jwt-secret-here" --project-ref YOUR_PROJECT_REF
```

**Dashboard:** you can still name it **`SUPABASE_JWT_SECRET`** if you prefer.

### Optional: `PRIVY_VERIFICATION_KEY`

PEM public key from **Privy Dashboard** → **Configuration** → **App settings** → verification key.  
When set, the function verifies the Privy token signature with ES256. Without it, the function still checks issuer, audience, and expiry via `decodeJwt`.

### Deploy

```bash
supabase functions deploy privy-auth --project-ref YOUR_PROJECT_REF
```

### Still seeing `missing_jwt_secret` after “setting” the secret?

The app calls **hosted** Edge Functions (`*.supabase.co`). **`SUPABASE_JWT_SECRET` in your laptop’s `.env` is not used there** — only **Edge Function secrets** on that Supabase project count.

1. **Confirm the project**  
   Your `VITE_SUPABASE_URL` host is `YOUR_REF.supabase.co` → that **`YOUR_REF`** is the `--project-ref` for every CLI command. If you set secrets on a **different** project, this error will continue.

2. **Confirm the secret exists on Edge Functions** (CLI, after `supabase login`):

   ```bash
   supabase secrets list --project-ref YOUR_PROJECT_REF
   ```

   You should see **`JWT_SECRET`** (CLI) and/or **`SUPABASE_JWT_SECRET`** (Dashboard). If neither is set, the function has no signing secret.

3. **Set it again** (quotes matter if the value has special characters). **CLI must use `JWT_SECRET`** — names starting with `SUPABASE_` are skipped by the CLI:

   ```bash
   supabase secrets set JWT_SECRET='PASTE_EXACT_JWT_SECRET' --project-ref YOUR_PROJECT_REF
   ```

   Or put **only** `JWT_SECRET=...` in `supabase/.env.edge` and run:

   ```bash
   supabase secrets set --env-file ./supabase/.env.edge --project-ref YOUR_PROJECT_REF
   ```

4. **Dashboard path** (names vary slightly): **Project Settings** → **Edge Functions** → **Secrets** (or **Manage secrets**). Add **`SUPABASE_JWT_SECRET`** or **`JWT_SECRET`** (same value).  
   Do **not** confuse this with only copying the JWT secret from **API** / **JWT Keys** — you must **also** add that same string as an **Edge Function** secret.

5. **Redeploy `privy-auth`** after the first time you add the secret (quick rule of thumb):

   ```bash
   supabase functions deploy privy-auth --project-ref YOUR_PROJECT_REF
   ```
