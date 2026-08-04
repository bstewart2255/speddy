# Supabase custom domain (`auth.speddy.xyz`)

Moves the Supabase API/Auth endpoint from `qkcruccytmmdajfavpgb.supabase.co` to a
domain we own, so **Google's sign-in screen says `auth.speddy.xyz`** instead of
the project ref.

## Why this and not Google brand verification

Google shows the root domain of the OAuth **callback** it is about to send the
user to. Ours is `https://qkcruccytmmdajfavpgb.supabase.co/auth/v1/callback`, so
that string is what users see. Filling in the Branding form in Google Cloud does
not change it — Google only substitutes the app name after its **verification
review**, and that review asks you to prove ownership of every authorized
domain, one of which is `supabase.co`. We don't own it. People do get through by
listing only `speddy.xyz` and explaining the third-party redirect, but reported
turnaround is 2 days to 2 weeks with inconsistent results.

Owning the callback domain removes the dependency on that review entirely.

## Before you start

| | |
|---|---|
| Plan | Org must be on a paid plan — **we're on Pro** ✅ |
| Cost | Custom Domain add-on, **$10/month** per project, billed hourly while active |
| Access | Supabase **Owner or Admin** on the `Speddy` project |
| DNS | Ability to add CNAME + TXT records for `speddy.xyz` |
| Host | Must be a **subdomain** — apex `speddy.xyz` is not supported, and only CNAME records work |

We use `auth.speddy.xyz`. It fronts the whole project API (auth, REST, storage,
realtime, edge functions), not just auth — the name just reflects why we bought it.

## Steps

Run these in order. Nothing user-visible changes until step 6.

### 1. Buy the add-on

Supabase Dashboard → **Project Settings → Add-ons → Custom Domain**.

### 2. Register the domain and get the verification record

Dashboard → **Project Settings → General → Custom Domains**, enter
`auth.speddy.xyz`. It returns a TXT verification value.

CLI equivalent, if you prefer:

```bash
supabase domains create --project-ref qkcruccytmmdajfavpgb --custom-hostname auth.speddy.xyz
```

### 3. Add the DNS records

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `auth` | `qkcruccytmmdajfavpgb.supabase.co` | low (300s) |
| TXT | `_acme-challenge.auth` | *(value from step 2)* | low (300s) |

Three gotchas:

- **Use the short names** (`auth`, `_acme-challenge.auth`), not the full
  hostnames. Most registrars append the domain themselves, so entering
  `auth.speddy.xyz` creates `auth.speddy.xyz.speddy.xyz`.
- Some registrars want a trailing dot on the CNAME value
  (`qkcruccytmmdajfavpgb.supabase.co.`) and some reject it. Follow whatever the
  registrar's existing records do.
- Trim any surrounding whitespace from the TXT value.

Keep the TTL low until this is done, so a mistake is quick to undo.

### 4. Verify

Work through the verification step in the same Custom Domains panel, or:

```bash
supabase domains reverify --project-ref qkcruccytmmdajfavpgb
```

DNS takes time to propagate, so this may need a few attempts. Supabase then
issues the SSL certificate, which can take up to 30 minutes.

### 5. Add the new callback to Google — do this BEFORE activating

Google Cloud Console → **Google Auth Platform → Clients** → the Supabase sign-in
client → Authorized redirect URIs. **Add** (do not replace):

```
https://auth.speddy.xyz/auth/v1/callback
```

The existing `https://qkcruccytmmdajfavpgb.supabase.co/auth/v1/callback` stays.
Both must be present so sign-in works before, during, and after the switch.

The **Google Calendar** OAuth client is a different client whose redirect is
already on our own domain (`<origin>/api/calendar/google/callback`). It is
unaffected — leave it alone.

### 6. Activate

Activate from the same Custom Domains panel, or:

```bash
supabase domains activate --project-ref qkcruccytmmdajfavpgb
```

Auth starts advertising `auth.speddy.xyz` as its callback immediately, which is
what fixes the Google screen. The old `*.supabase.co` domain keeps working —
both address the same project — so there is no rush on step 8.

### 7. Verify it worked

- Sign out, click **Continue with Google** on the login page — the Google screen
  should now say `auth.speddy.xyz`.
- Complete the sign-in and confirm you land in the dashboard (this exercises the
  provisioning gate in `app/auth/callback/route.ts`, not just the redirect).
- Sign in with email/password too, to confirm nothing else regressed.

### 8. Optional, later: point the app at the new domain

Not required for the Google fix, and worth doing as its own change so any
fallout is isolated:

1. Vercel → `NEXT_PUBLIC_SUPABASE_URL` → `https://auth.speddy.xyz`, then redeploy.
2. Set `SUPABASE_CUSTOM_HOST = 'auth.speddy.xyz'` in
   `scripts/sim-district/manifest.ts` so the sim-district preflight accepts the
   new host (it pins the project by hostname and will otherwise refuse to run).

Everything the app builds off that URL follows it, including **signed storage
URLs**. `app/(dashboard)/dashboard/tools/components/saved-worksheets.tsx`
validates download URLs against the configured project origin for exactly this
reason — it used to hardcode `supabase.co`, which would have rejected every
worksheet download the moment the env var changed.

After this step, smoke-test a worksheet download and a document upload/download
alongside sign-in.

Nothing else in the codebase pins the Supabase host: there are no CSP or image
host allowlists, and the Chrome extension only ever talks to `speddy.xyz`.

## Rollback

```bash
supabase domains delete --project-ref qkcruccytmmdajfavpgb
```

If step 8 was done, revert `NEXT_PUBLIC_SUPABASE_URL` to
`https://qkcruccytmmdajfavpgb.supabase.co` **first** and redeploy — otherwise the
app points at a domain that no longer resolves. Leave the extra Google redirect
URI in place; a stale entry is harmless.

## Alternative considered

**Vanity subdomains** (Supabase, experimental) would give `speddy.supabase.co`
instead of the random ref. Cheaper-looking, but the screen would still read
`…supabase.co`, which is the part district IT reviewers actually question — so
it doesn't solve the problem we bought this for.

## Source of truth

- `docs/auth-google-sso.md` — the Google sign-in flow and its enablement steps
- `scripts/sim-district/manifest.ts`, `scripts/sim-district/lib.ts` — project pin / preflight
- `app/(dashboard)/dashboard/tools/components/saved-worksheets.tsx` — signed-URL origin check
- `.env.example` — `NEXT_PUBLIC_SUPABASE_URL`
