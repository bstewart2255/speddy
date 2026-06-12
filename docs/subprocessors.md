# Subprocessors

Source-of-truth list of third-party services that store, process, or can access
data flowing through Speddy. This is the basis for the CA-NDPA subprocessor
exhibit (see SPE-59) and for student-data-privacy disclosures.

> **Keep this file current.** Adding, removing, or changing any service that can
> touch student data is an NDPA change-notification trigger — update this list in
> the same PR, and notify LEAs per the executed agreement.

_Last reviewed: 2026-06-11._

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
| **Sentry** | Error monitoring (exceptions + source-mapped stack traces). Sentry Logs and Session Replay are **disabled**, `sendDefaultPii: false`, and logger `meta`/`context` are no longer forwarded (SPE-167). Emails are scrubbed via `beforeSend`. | **Incidental only** — operational error data, minimized per SPE-167. | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `lib/monitoring/sentry-scrub.ts`; org `chickenscratch` / project `speddy`; US ingest | Org region (currently US) |
| **Crisp** | Support/help chat widget (`client.crisp.chat`), loaded via a `<Script>` tag (not an npm package — missed by the original SDK-based audit). | **Provider PII** — pushes the signed-in provider's name, email, and session metadata to Crisp; **no student data by design** (a provider could paste it into a chat message). | `app/layout.tsx`, `app/components/crisp-user-identifier.tsx` | Vendor-managed |

## Planned — disclosed but NOT currently enabled

Both providers are hard-gated off by `AI_FEATURES_ENABLED` (default off; see
SPE-162): the AI routes return 404 (before auth or handler logic) and make
**zero** provider calls unless the env var is set to exactly the string `'true'`.
**Do not enable until provider DPAs (no-training / zero-retention) are executed —
SPE-163.**

| Service | Role (when enabled) | Student data (when enabled) | Where (code) |
|---|---|---|---|
| **OpenAI** | Default lesson-generation provider (`AI_PROVIDER` defaults to `openai`, model `gpt-5-mini`). | Initials + IEP goals in prompts. | `lib/lessons/providers.ts` |
| **Anthropic (Claude)** | Lessons, exit tickets, progress checks, worksheet vision, document parsing, PII scrubbing. | Initials + IEP goals; raw document text on the upload path. | `lib/exit-tickets/generator.ts`, `app/api/submit-worksheet/route.ts`, `lib/lessons/*`, `lib/progress-checks/*`, `lib/utils/pii-scrubber.ts` |

## Data sources (NOT downstream processors)

| Source | Role |
|---|---|
| **SEIS** (`www.seis.org`) | California Special Education Information System. The Speddy Chrome extension **reads** student data from SEIS pages and sends it to the Speddy backend (`/api/extension/*`); nothing is pushed back to SEIS. SEIS is the origin of the data, not a recipient. See `speddy-chrome-extension/`. |

## Email (transactional)

- **Supabase Auth** sends auth emails (signup confirmation, password reset).
- **Resend** powers the inbound email → worksheet webhook only, which is
  **disabled by default** (returns 404 unless `EMAIL_WEBHOOK_ENABLED === 'true'`).
  Provider signature verification is **not yet implemented** and must be added
  before re-enabling — flipping the flag alone would accept unauthenticated POSTs
  (SPE-128). Uses student **initials** (not full names) when active.

## Removed / not in use (no student data)

| Service | Status |
|---|---|
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
