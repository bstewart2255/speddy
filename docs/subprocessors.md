# Subprocessors

Source-of-truth list of third-party services that store, process, or can access
data flowing through Speddy. This is the basis for the CA-NDPA subprocessor
exhibit (see SPE-59) and for student-data-privacy disclosures.

> **Keep this file current.** Adding, removing, or changing any service that can
> touch student data is an NDPA change-notification trigger — update this list in
> the same PR, and notify LEAs per the executed agreement.

_Last reviewed: 2026-08-14._

## Data categories

- **Student PII:** initials, grade, school, IEP goals, accommodations, service
  minutes, attendance, assessment/progress results. Full first/last names exist
  in `student_details`.
- **Provider PII:** name, email, role, school/district association, auth
  credentials.

---

## Active subprocessors (student data can reach them)

| Service | Role | Student data? | Where (code) | Data residency |
|---|---|---|---|---|
| **Supabase** | Primary backend: Postgres DB, Auth, Storage, Realtime. System of record for all student + provider data. | **Yes — system of record.** | `lib/supabase/*`; storage uploads across `app/api/**`; project ref `qkcruccytmmdajfavpgb` | Region fixed at project creation (not runtime-configurable) |
| **Vercel** | Production hosting (Next.js app, API routes, cron). All request/response traffic and runtime logs transit Vercel compute. | **Yes — in transit + logs.** | Deploy target; `next.config.js` (Vercel cron monitors, `maxDuration`) | Function region configurable |
| **Sentry** | Error monitoring (exceptions + source-mapped stack traces). Sentry Logs and Session Replay are **disabled**, `sendDefaultPii: false`, and logger `meta`/`context` are no longer forwarded (SPE-167). Emails are scrubbed via `beforeSend`. | **Incidental only** — operational error data, minimized per SPE-167. | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `lib/monitoring/sentry-scrub.ts`, `lib/monitoring/sentry-options.ts`; org `chicken-scratch-backend` / project `speddy`; US ingest | Org region (currently US) |
| **Help Scout** | Support help desk + in-app chat widget (Beacon, `beacon-v2.helpscout.net`), loaded via a `<Script>` tag (not an npm package). | **Provider PII** — pushes the signed-in provider's name, email, and session metadata (role, school district/site, user ID) to Beacon; **no student data by design** (a provider could paste it into a chat message). | `app/layout.tsx`, `app/components/helpscout-beacon-identifier.tsx` | US (Help Scout PBC); DPA v2 incorporated via ToS; EU/UK via DPF + SCCs (SPE-170) |
| **Anthropic (Claude)** | **AI assistant ("Ask AI", SPE-450/452/455)** for service-provider roles: answers questions about the signed-in provider's own caseload/schedule, explains how to use Speddy, offers general special-education guidance (with a verify-with-your-district disclaimer), and drafts text. Model `claude-haiku-4-5`. Enabled by its own `ASSISTANT_ENABLED` flag (the master `AI_FEATURES_ENABLED` also enables it). | **Yes.** App-supplied student data is capped at **initials + IEP goal text + upcoming IEP/triennial meeting dates + grade + session times and session-group names** — student full-name columns and free-text session notes are excluded from the AI-bound queries, pinned by unit tests. Two provider-authored text fields ride along as typed and could carry whatever the provider wrote into them: IEP goal text, and session-group names (auto-named from student initials, but editable). **Provider PII:** the signed-in provider's display name and role are included in the prompt for personalization. **Provider-typed chat messages are also sent verbatim** (and re-sent as the visible transcript), so a provider *could* type student PII into the conversation; the UI nudges toward initials and the assistant is instructed to use them. Initials-based scope approved by the founder 2026-08-11 (recorded on SPE-450); IEP meeting dates + group names added under SPE-455. Conversations are not stored server-side. | `lib/assistant/*`, `app/api/assistant/chat/route.ts` | US (standard tier); DPA via Commercial Terms, copy on file (SPE-163) |

## Planned — disclosed but NOT currently enabled

One AI feature remains built but hard-gated off by `AI_FEATURES_ENABLED`
(default off; see SPE-162): its route returns 404 (before auth or handler
logic) and makes **zero** provider calls unless the env var is set to exactly
the string `'true'`. The assistant above is the one AI feature enabled
independently, via `ASSISTANT_ENABLED` (SPE-452).

The rest of the flag-gated AI suite — lesson generation, exit tickets,
progress checks, worksheet vision (incl. the QR/photo submission path and the
inbound email → worksheet webhook) — was **removed from the codebase in
2026-08 (SPE-497)** without ever being enabled; those data flows no longer
exist in the product.

**DPAs executed and on file (2026-06-12):** Anthropic incorporated via
Commercial Terms + dated copy saved; US-processed on standard tier (SPE-163).
Prompt de-identification landed via SPE-61.

| Service | Role (when enabled) | Student data (when enabled) | Where (code) |
|---|---|---|---|
| **Anthropic (Claude)** | IEP-PDF accommodations import (SPE-489). | The full content of a provider-uploaded **IEP PDF** (one extraction call — Speddy never stores the file, and only the provider-approved accommodations list is saved). | `lib/iep/extract-accommodations.ts` |

## Data sources (NOT downstream processors)

| Source | Role |
|---|---|
| **SEIS** (`www.seis.org`) | California Special Education Information System. The Speddy Chrome extension **reads** student data from SEIS pages and sends it to the Speddy backend (`/api/extension/*`); nothing is pushed back to SEIS. SEIS is the origin of the data, not a recipient. See `speddy-chrome-extension/`. |

## Email (transactional)

- **Supabase Auth** sends auth emails (signup confirmation, password reset).
- **Resend** sends the outbound opt-in daily schedule emails
  (`app/api/cron/daily-schedule-emails`), which use student **initials only**,
  never full names. (The inbound email → worksheet webhook it previously
  existed for — disabled since SPE-128 — was removed with the worksheet
  feature, SPE-497.)

## Removed / not in use (no student data)

| Service | Status |
|---|---|
| **OpenAI** | Removed (SPE-497, 2026-08). Was the planned default lesson-generation provider; never enabled in production (`AI_FEATURES_ENABLED` stayed off), so no student data was ever sent. Code and the `openai` npm package are deleted. The self-serve DPA executed 2026-06-12 remains on file. |
| **PDF.co** | Removed (SPE-164). No **runtime / app-code** references to `api.pdf.co` remain (docs-only mentions — like this file — may reference it). |
| **Stripe** | Payment system removed (`supabase/migrations/20251208_remove_subscription_tables.sql`); env vars cleaned up. |
| **SendGrid** | Not used by app code — `SENDGRID_API_KEY` / `sendgrid` appear only in a **commented-out** SMTP example in `supabase/config.toml`. Removed from `.env.example`. |
| **Replit** | Hosting migrated to Vercel; dormant repo access to be revoked (SPE-166). Source-code access only — **not** a data subprocessor. |
| **nodemailer** | Never imported in code, but **still present in `package.json` / `package-lock.json`** (pending a separate dependency-removal decision). |

## Related tickets

- **SPE-59** — district DPA / NDPA artifact (this list feeds its subprocessor exhibit)
- **SPE-134** — privacy/FERPA page claims vs. implementation
- **SPE-162** — AI kill-switch (done)
- **SPE-163** — execute OpenAI + Anthropic DPAs before enabling AI
- **SPE-165** — maintain this list + `.env.example` reconciliation
- **SPE-166** — revoke dormant Replit access
- **SPE-167** — Sentry data-footprint minimization (done)
