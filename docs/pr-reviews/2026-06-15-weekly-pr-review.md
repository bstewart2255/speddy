# Weekly PR Quality Review — 2026-06-15

**Period covered:** 2026-06-08 → 2026-06-15  
**PRs reviewed:** 15 merged (#644 – #658)  
**Verdict: Generally HIGH quality, 5 targeted findings logged below.**

---

## Overview

This was a compliance-heavy week driven by the CA-NDPA (CITE/CSPA) pre-signing sprint and a secondary-school feature launch. The security fixes are thorough and well-reasoned; the Middle/High School Module is cleanly abstracted. No shortcuts were taken on the hard problems. The findings below are real but limited in scope — none are regressions or critical bugs, but several need to be tracked before they become one.

---

## What Was Solid

- **AI kill-switch design (#651):** `aiGated: true` on `withRoute` is the right place for this — pre-auth, centralized, per-request env read so a config change takes effect without a deploy in non-Vercel environments. Tests cover all four cases.
- **Fail-closed rate limiting (#646):** Opt-in `failClosed` flag with sensible defaults (cheap endpoints fail open, expensive AI/upload endpoints fail closed) is exactly the right tradeoff. The IP-based rate limiter for unauthenticated worksheet uploads is also corrected.
- **Cron repair (#645):** Caught three silent failures in one PR: wrong column name (`created_at` vs `uploaded_at`), wrong auth method (query-string token leaked to access logs), wrong HTTP status codes (200 on error masked failures from monitoring). All fixed correctly.
- **XSS in PDF print path (#645):** `document.write` paths in `export-week-to-pdf.ts` and `worksheet-generator.ts` were injecting AI-generated + DB content unescaped. The `escapeHtml` helper + consistent application is the right fix.
- **Provider deletion architecture (#655):** The blocker-check → null-nullable-refs → cascade-profile → delete-auth-user → remove-storage sequence is correct. Pre-flight checks prevent FK violations. CARE referrals are surfaced rather than auto-deleted due to name-based (not FK) matching — the right call for ambiguous compliance data.
- **School-level detection (#648):** Explicit authority order (school_type > grade_span fallback > elementary default) with unit tests covering boundary cases is solid. Combined K-8/K-12 sites defaulting to elementary is a documented product decision.
- **Sentry privacy hardening (#650 + #647):** Disabling Logs, Replay, and `meta`/`context` forwarding to Sentry breadcrumbs, plus the `deepRedact` email scrubber, is comprehensive.

---

## Findings

### 1. `worksheet_submissions.image_url` now holds two incompatible formats (PR #644)

**Severity: Medium — silent landmine**

The bucket was made private and new rows now store a storage *path* (e.g. `submissions/abc.jpg`) instead of a public CDN URL. Old rows still hold `https://...public/...` URLs that now 404. The migration adds no normalization step, and the PR comment explicitly acknowledges "nothing currently renders image_url."

That's accurate today, but when a read path is eventually added it will silently produce broken images for all historical submissions without any type-system signal that the field has two formats. The field name `image_url` implies a URL, making this especially easy to miss.

**Recommendation:** Add a Linear item to either (a) run a one-time migration to rewrite old public URLs to paths, or (b) add a helper that detects the format and generates a signed URL either way. Don't wait until the read path is being built.

---

### 2. `tracesSampleRate: 1.0` survives the Sentry privacy hardening (PR #650)

**Severity: Low-medium — inconsistent with stated privacy posture**

All three Sentry configs (`instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) retain `tracesSampleRate: 1`. The PR correctly disabled Logs and Replay, but 100% trace sampling means every API call and page load produces a Sentry span containing the request URL path. URL paths in this app contain resource IDs (e.g. `/dashboard/teacher/my-students/[studentId]`), and at district scale this is a non-trivial data volume sent to Sentry on every interaction.

This is inconsistent with the privacy-minimization theme of the week's work. Logs and Replay were cut specifically because they "can carry student context" — traces carry the same context in URL paths.

**Recommendation:** Drop `tracesSampleRate` to `0.1` (10%) or lower for the district pilot. This is a one-liner change across three files.

---

### 3. Provider deletion leaves a dangling auth record on partial failure (PR #655)

**Severity: Low — operational gap in a compliance-sensitive flow**

The delete sequence is: null refs → delete profile (cascades all data) → delete auth user → remove Storage. If `profiles.delete()` succeeds but `service.auth.admin.deleteUser()` fails, the provider's data is completely gone (profile, students, worksheets) but their Supabase Auth record survives. The user cannot log in usefully (no profile), but the auth record exists in the Supabase dashboard.

The PR returns `{ success: true, warning: '...' }` — which is the correct surface-level response — but there is no follow-up: no retry endpoint, no admin alert, no cleanup job. For an NDPA deletion tool where the district is relying on a paper trail that the user's data was removed, a dangling auth record is a compliance gap.

**Recommendation:** Log the dangling auth user ID in a way that surfaces to Sentry (it's already logged to the console). Add a note in the Linear issue to revisit whether a cleanup API endpoint or Supabase admin-dashboard link in the warning message is needed before GA.

---

### 4. Blocker queries in provider deletion run sequentially (PR #655)

**Severity: Low — performance**

The 4 pre-delete blocker checks (care_referrals, care_meeting_notes, care_case_status_history, activated_school_years) run in a `for...of` loop with sequential `await`, adding ~4× the latency of a single query before any data changes. These are independent count queries and could be `Promise.all()`'d.

```typescript
// Current (sequential)
for (const spec of blockerSpecs) {
  const { count } = await service.from(spec.table)...
}

// Better
const counts = await Promise.all(blockerSpecs.map(spec => service.from(spec.table)...));
```

Not urgent, but this runs before the destructive step in a compliance-sensitive operation.

---

### 5. `deepRedact` mutates Sentry event objects in-place (PR #647)

**Severity: Low — style/correctness**

`sentry-scrub.ts` modifies the event/log object passed to `beforeSend`/`beforeSendLog` in-place before returning it. For arrays and objects, it iterates and reassigns keys on the original reference. This works today because Sentry doesn't process the original object after the hook returns, but it violates the functional contract of a "before send" hook and could interact unexpectedly if the Sentry SDK ever adds post-hook processing.

The depth cap of `8` is also unexplained — it's a reasonable ceiling but should have a comment explaining why (e.g., "Sentry events don't typically nest deeper than ~5 levels; 8 is a conservative guard against pathological/cyclic structures").

**Recommendation:** Either document the mutation as intentional with a comment, or convert to a deep-clone approach (`JSON.parse(JSON.stringify(value))` before recursing, which also handles the cyclic-structure case more cleanly).

---

## Docs-Only PRs (no engineering concerns)

- **#658** — CA-NDPA execution packet, attorney brief, IR plan (SPE-59)
- **#657** — OpenAI + Anthropic DPAs on file, subprocessor update
- **#654** — Data inventory exhibit grounded in live schema
- **#653** — Subprocessor disclosure + FERPA claim accuracy

All four are accurate and well-sourced against the live schema/code. No inconsistencies found.

---

## Items Not Flagged (intentional)

- **`tracesSampleRate`** was not changed as part of the Sentry work (finding #2 above), but the overall privacy hardening direction is correct.
- **`SELF_REGISTERABLE_ROLES` deny-by-default** (#644): New roles added in the future will be blocked by default — this is the correct posture.
- **CARE referral name-match as a two-step flow** (#655): Surfacing for admin confirmation rather than auto-deleting is the right call when the match is by free text, not FK.
- **Per-request env read for `AI_FEATURES_ENABLED`** (#651): Intentional and documented. The comment correctly explains the tradeoff.
