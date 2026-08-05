# Supabase custom domain (`auth.speddy.xyz`)

> **Status: done — live since 2026-08-04.** The steps below have been executed;
> keep them as the record of how it was set up and as the rollback procedure.
> Confirmed by asking Supabase what it advertises to Google:
> `/auth/v1/authorize?provider=google` now redirects with
> `redirect_uri=https://auth.speddy.xyz/auth/v1/callback`.
>
> One correction learned during the switch: **the old subdomain's `/auth/v1/*`
> API endpoints keep answering after activation**, so they are *not* a test of
> whether activation happened. The `redirect_uri` above is the reliable check.

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

Owning the callback domain settles **which domain users see**, without waiting on
Google. It is not a substitute for brand verification: displaying our app *name
and logo* on the consent screen still needs that, so the branding work already
done in Google Cloud stays worth finishing. Full app verification is a separate
bar we don't hit — our scopes are only `email`/`profile`/`openid`, which Google
treats as non-sensitive.

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

Run these in order. Steps 1–5 are safe to do any time and change nothing for
users. **Steps 6–7 are a single maintenance window with a sign-in outage in the
middle** — read them both before starting either.

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

```text
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

> ⚠️ **Activation causes a short sign-in outage. Schedule it.**
>
> The guides page says the project's `*.supabase.co` domain "continues to work",
> but that is only true of the REST/storage API. The CLI is explicit:
> *"After the custom hostname is activated, your project's auth services will no
> longer function on the Supabase-provisioned subdomain."*
>
> Our login form, middleware and auth callback all build their Supabase client
> from `NEXT_PUBLIC_SUPABASE_URL`. So from the moment you activate until the
> redeploy in step 7 finishes, **nobody can sign in and existing sessions stop
> refreshing.** Do this outside school hours, and have step 7 queued up first.

### 7. Point the app at the new domain — immediately after activating

1. Vercel → `NEXT_PUBLIC_SUPABASE_URL` → `https://auth.speddy.xyz`, then redeploy.
   This is the step that ends the outage, so do it right away, not later.
2. Set `SUPABASE_CUSTOM_HOST = 'auth.speddy.xyz'` in
   `scripts/sim-district/manifest.ts` so the sim-district preflight accepts the
   new host (it pins the project by hostname and will otherwise refuse to run).

To shrink the outage to seconds instead of a build: in Vercel, set the env var
and build the deployment *before* activating, then **promote** it to production
the moment activation completes. `NEXT_PUBLIC_*` values are baked in at build
time, so a pre-built deployment is ready to swap in instantly. Don't promote it
early — before activation, `auth.speddy.xyz` isn't serving yet.

Everything the app builds off that URL follows it, including **signed storage
URLs**. `app/(dashboard)/dashboard/tools/components/saved-worksheets.tsx`
validates download URLs against the configured project origin for exactly this
reason — it used to hardcode `supabase.co`, which would have rejected every
worksheet download the moment the env var changed.

Nothing else in the codebase pins the Supabase host: there are no CSP or image
host allowlists, and the Chrome extension only ever talks to `speddy.xyz`.

### 8. Verify

- Sign out, click **Continue with Google** on the login page — the Google screen
  should now say `auth.speddy.xyz`.
- Complete the sign-in and confirm you land in the dashboard (this exercises the
  provisioning gate in `app/auth/callback/route.ts`, not just the redirect).
- Sign in with email/password too, to confirm nothing else regressed.
- Download a saved worksheet and upload/download a document, to confirm signed
  storage URLs still pass the origin check.

## Rollback

Order matters here for the same reason activation does.

1. **Revert `NEXT_PUBLIC_SUPABASE_URL`** to
   `https://qkcruccytmmdajfavpgb.supabase.co` and redeploy. REST and storage
   resume immediately; auth stays down because it is still bound to the custom
   domain.
2. **Then release the domain**, which returns auth to the project subdomain:

   ```bash
   supabase domains delete --project-ref qkcruccytmmdajfavpgb
   ```

Doing it in the other order points the app at a host that has stopped serving,
which takes down everything rather than just auth. Leave the extra Google
redirect URI in place; a stale entry is harmless.

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
