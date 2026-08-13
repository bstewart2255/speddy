# Subprocessors

Source-of-truth list of third-party services that store, process, or can access
data flowing through Speddy. This is the basis for the CA-NDPA subprocessor
exhibit (see SPE-59) and for student-data-privacy disclosures.

> **Keep this file current.** Adding, removing, or changing any service that can
> touch student data is an NDPA change-notification trigger — update this list in
> the same PR, and notify LEAs per the executed agreement.

_Last reviewed: 2026-07-16._

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

The remaining AI features (lessons, exit tickets, progress checks, worksheet
vision) stay hard-gated off by `AI_FEATURES_ENABLED` (default off; see
SPE-162): those routes return 404 (before auth or handler logic) and make
**zero** provider calls unless the env var is set to exactly the string
`'true'`. The assistant above is the one AI feature enabled independently, via
`ASSISTANT_ENABLED` (SPE-452).

**DPAs executed and on file (2026-06-12):** OpenAI signed (self-serve), Anthropic
incorporated via Commercial Terms + dated copy saved; both US-processed on standard
tiers. The enable-gate preconditions have since been met: the DPA/ZDR work closed
via SPE-163 (2026-07-18) and prompt de-identification landed via SPE-61.

| Service | Role (when enabled) | Student data (when enabled) | Where (code) |
|---|---|---|---|
| **OpenAI** | Default lesson-generation provider (`AI_PROVIDER` defaults to `openai`, model `gpt-5-mini`). | Initials + IEP goals in prompts. | `lib/lessons/providers.ts` |
| **Anthropic (Claude)** | Lessons, exit tickets, progress checks, worksheet vision, IEP-PDF accommodations import (SPE-489). | Initials + IEP goals; plus the completed-worksheet image (the student's written work) and its questions/answers on the worksheet-submission path (`submit-worksheet` sends the photo to Claude Vision); plus the full content of a provider-uploaded **IEP PDF** on the accommodations-import path (one extraction call — Speddy never stores the file, and only the provider-approved accommodations list is saved). | `lib/exit-tickets/generator.ts`, `app/api/submit-worksheet/route.ts`, `lib/lessons/*`, `lib/progress-checks/*`, `lib/iep/extract-accommodations.ts` |

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
