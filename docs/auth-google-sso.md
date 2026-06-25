# Google SSO ("Continue with Google")

Lets existing Speddy users sign in with their school Google account. It is
**additive** — email/password login is unchanged — and it is **sign-in only**:
a Google sign-in can attach to an account we already created, but it can never
create a new account.

## How it works

1. The login page shows a **Continue with Google** button
   (`app/(auth)/login/login-form.tsx`) that calls
   `supabase.auth.signInWithOAuth({ provider: 'google', ... })`.
2. Google → Supabase → redirects back to **`/auth/callback`**
   (`app/auth/callback/route.ts`), which exchanges the code for a session.
3. **Provisioning gate:** the callback checks (service role,
   `auth.admin.getUserById`) whether the signed-in user has a **non-Google
   identity**.
   - **Has one** (`email` ± `google`) → the account existed before this Google
     login (admin-created, or a prior self-signup), and Supabase auto-linked the
     Google identity to it by verified email. They land on their existing
     role/school. ✅
   - **Lookup failure** → the callback fails closed to `/login?error=oauth_failed`
     (without deleting anything).
   - **Google-only** → first-time Google identity we don't have an account for.
     The callback *attempts* to sign them out, then **deletes the orphan auth
     user and its trigger-created profile** — the `profiles.id → auth.users.id`
     FK is `NO ACTION`, so the profile is deleted explicitly first — and returns
     to `/login?error=not_provisioned` with an "ask your admin" message. If
     cleanup fails it falls back to `/login?error=oauth_failed`. 🚫

Why the gate checks **identities, not a `profiles` row:** an
`on_auth_user_created` trigger (`handle_new_user()`) auto-creates a `profiles`
row — defaulting role to `'resource'` — for *every* new auth user, including a
first-time Google sign-in. So "has a profile" is always true and is **not** a
valid provisioning signal. A genuinely provisioned account, by contrast, always
has an `email` (password) identity; a brand-new Google account has only the
`google` identity. (The `20250117_create_profile_on_signup.sql` migration says
"no trigger," but production drifted — the trigger exists; see the follow-up
ticket.)

## Enablement steps (manual — not done by the code)

These touch Google Cloud and the Supabase dashboard and must be done by a
project owner. The provider stays off until step 2 is saved, so deploy the code
first, then enable.

1. **Google Cloud Console → APIs & Services → Credentials**
   - Create an **OAuth 2.0 Client ID** (type: Web application).
   - Authorized redirect URI: `https://qkcruccytmmdajfavpgb.supabase.co/auth/v1/callback`
     (the Supabase project's callback, *not* the app's `/auth/callback`).
   - Consent screen / Audience: **External**, **Published / In production**. Scopes
     are just `email`/`profile`/`openid`, which need **no Google verification**.
   - Note the **Client ID** and **Client secret**.

2. **Supabase Dashboard → Authentication → Providers → Google**
   - Enable Google, paste the Client ID + secret, save.
   - Leave **Skip nonce checks** and **Allow users without an email** OFF.

3. **Supabase Dashboard → Authentication → URL Configuration**
   - **Site URL:** `https://www.speddy.xyz` (bare origin — no path; used as the
     fallback redirect and as the base for auth email links).
   - **Redirect URLs** (allowlist) — must include:
     - `https://www.speddy.xyz/**` (production)
     - `https://speddy.xyz/**` (apex, optional)
     - `http://localhost:3000/**` (local dev/testing)
     - the existing `*.vercel.app` previews stay.

4. **App env (Vercel) → `NEXT_PUBLIC_SITE_URL`:** set to the canonical public
   origin (`https://www.speddy.xyz`) so the callback builds redirect URLs on the
   real domain. The callback does **not** trust the `x-forwarded-host` header.

5. **(Optional) Account-chooser hint:** set `NEXT_PUBLIC_GOOGLE_HD` to the
   district's Google Workspace domain to pass Google the `hd` param. This only
   pre-selects the account chooser toward that domain — it is **not** a security
   boundary (the provisioning gate is). Tidy for single-district deployments.

## Notes / known edges

- **Account model unchanged.** Admins still create accounts (which creates the
  `auth.users` row with a confirmed email). Google just adds a second way for
  those users to sign in.
- **`must_change_password`.** Defaults to `FALSE`, so the common path is
  unaffected. If an account currently has a *pending* password reset
  (`must_change_password = TRUE`) and the user signs in with Google, middleware
  will still route them to `/change-password`. Acceptable for v1; revisit if it
  becomes a support issue.
- **Hardening (future).** The gate currently creates-then-deletes the orphan
  auth user on rejection, because Supabase creates the user before our callback
  runs. A `before-user-created` Auth Hook would reject *atomically* (no orphan
  ever created). Tracked under the SSO backbone work (SPE-178).
- **Not SAML.** This is native Google OAuth (auto-links by email). Clever /
  ClassLink go through Supabase SAML, which is **excluded** from auto-linking
  and needs explicit reconciliation — tracked separately (SPE-180).
