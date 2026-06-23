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
3. **Provisioning gate:** the callback checks (service role) whether a
   `profiles` row exists for the signed-in user.
   - **Exists** → the user was provisioned (admin-created, or a prior
     self-signup). Supabase auto-linked the Google identity to that account by
     verified email, so they land on their existing role/school. ✅
   - **Missing** → brand-new Google identity we don't have an account for. The
     callback signs them out, **deletes the orphan auth user**, and returns to
     `/login?error=not_provisioned` with an "ask your admin" message. 🚫

Why the gate is a `profiles` check: there is no trigger on `auth.users`
(`supabase/migrations/20250117_create_profile_on_signup.sql`), so a brand-new
OAuth user has an auth row but **no** profile — making "has a profile" a
reliable "do we have an account for them" signal.

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

4. **(Optional) Single-district lockdown:** set `NEXT_PUBLIC_GOOGLE_HD` to the
   district's Google Workspace domain to pass Google the `hd` hint. Not required
   for security — the provisioning gate already rejects accounts we didn't
   create — but tidy for single-district deployments.

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
