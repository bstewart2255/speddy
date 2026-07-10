# Weekly PR Quality Review — 2026-06-27

**Period covered:** May 22 – June 1, 2026  
**PRs reviewed:** #624–#643 (20 PRs)

---

## Overall Assessment

The period covers two distinct work streams: a large mechanical refactor batch (SPE-75 withRoute migration, PRs #624–#634) and a focused security hardening sprint (PRs #636–#643). Quality is uneven across these streams.

The security work is generally well-researched — migrations are guarded and idempotent, and the post-mortem on the regression is candid. However, it produced the most damaging incident in the period: a production security fix that broke unauthenticated reads and required a hotfix because verification checked the wrong thing. The withRoute batch shows the clearest evidence of process breakdown under velocity pressure: 11 PRs in a single day, all with unchecked test plan items, none with meaningful smoke testing.

---

## Concerns (Ranked by Severity)

### CRITICAL — Production regression from incomplete verification (PR #640 / #643)

SPE-10 revoked `anon` EXECUTE on SECURITY DEFINER functions but verified only at the grant/advisor level — not by querying as the `anon` role. The actual failure: policies declared `TO public` calling functions anon can no longer execute produced `permission denied` errors instead of `0 rows`.

A single `SELECT` query run as the `anon` role before merging would have caught this. The root cause per the post-mortem: *"I checked which functions were used in RLS but not the policies' roles, and I verified at the grant/advisor level rather than by querying as anon."*

**Process gap:** No documented verification checklist for database permission changes. Security migrations should require explicit role-scoped query verification before merge.

---

### HIGH — 11 PRs merged same day, all with unchecked CI/smoke-test items (PRs #624–#634)

Each PR was created and merged in under 20 minutes. All 11 had unchecked test plan checkboxes (`CI green`, `Smoke-check`) at merge time. This is not a documentation gap — it means the review process did not happen.

The withRoute abstraction is sound, and the individual changes are mostly mechanical. But 11 PRs merged in one day across 59+ route files with no manual verification creates latent bugs that CI won't catch (no integration tests for these routes). Notable edge case: `submit-worksheet` (#628) was wrapped with `auth: false` but still manually calls `supabase.auth.getUser()` inside the handler, making the withRoute wrapper cosmetic for this route — a misleading contract.

---

### HIGH — Production migration applied before code was merged/deployed (PR #637)

The PR description states: *"The migration has already been applied to the production database. Merging/deploying this branch promptly closes the window where the currently-deployed code still references the dropped columns."*

The correct sequence is: merge code → deploy → apply migration. What happened created a window where deployed production code referenced schema columns that no longer existed. The urgency framing treats this backward sequence as valid rather than as a process failure that needs correction.

---

### MEDIUM — Same verification gap exists in SPE-114 (PR #642)

PR #642 revoked `authenticated` EXECUTE on 8 functions classified as unused. The audit used grep-based code search — the same approach that missed the policy `TO public` binding in PR #640. If any of these functions are called indirectly, the failure mode is identical.

Additionally: the 8 unused functions were revoked but not dropped. If they are genuinely unused dead code, they should be deleted. Revoking access while leaving them in the schema is a half-measure — the complexity remains and the revocation has to be maintained indefinitely.

---

### MEDIUM — SPE-92 XSS fix was narrowly scoped; similar `document.write` patterns remain

PR #636 fixed `document.write` in `manual-lesson-view-modal.tsx` with DOMPurify. At least two other sites remain unaddressed:

- `worksheet-button.tsx:62` — writes `printableHtml` directly  
- `lesson-preview-modal.tsx:479` — writes server-fetched HTML from `/api/lessons/[id]/render` directly; that endpoint has a `TODO: revisit whether this should require auth + explicit ownership check` comment that has been unresolved since the #628 batch

Security remediations that fix one instance while leaving similar patterns open are incomplete.

---

### MEDIUM — SPE-91 PII logging fix was narrowly scoped; 26+ console statements remain in calendar-week-view alone

PR #636 removed 6 `console.log` calls from two files. The codebase has 586 console statement calls total. `calendar-week-view.tsx` has 26 including `[DEBUG]`-tagged statements logging user IDs and school context objects. `lessons/generate/route.ts` has a conditional `[DEBUG] Full metadata capture is ENABLED` path with PII capture.

A proper remediation would inventory all console output, gate debug logs behind an environment check, and route necessary server-side logging through the structured logger at `lib/monitoring/logger.ts`. That work was not done.

---

### MEDIUM — 12 auth tests skipped under SPE-111, with no SPE-111 work since (PR #638)

CI gating was added (genuine improvement), but achieving green required skipping 12 tests covering login flow, session maintenance, and error handling. The `it.skip` annotations with SPE-111 pointers are better than silent skips, but these have now been sitting skipped for 4+ weeks with no SPE-111 activity in the log.

---

### LOW — Dead code not removed when identified

- 8 functions in PR #642 confirmed as unused were revoked but not dropped
- Commented-out code block in `app/api/auth/login/route.ts` (lines 202–232) was left as a draft artifact in a security-sensitive file
- `(supabase.rpc as any)(...)` casts in `useOtherProviderSessions.ts` and `student-details.ts` were identified in PR #642's audit but not fixed (root fix: regenerate or extend Supabase TypeScript types)

---

### LOW — withRoute migration is incomplete with no completion plan

After 11 PRs, ~15 routes remain on the old pattern including `auth/signup`, `auth/login`, `auth/forgot-password`, `email-webhook`, `extension/compare`, and `extension/import`. The codebase is in a permanent mixed state with no documented plan for the remaining routes or a rationale for excluding them.

---

## Positive Patterns Worth Calling Out

- **withRoute abstraction quality** — The wrapper itself is clean, typed correctly, Zod validation at the boundary layer, rate limiting integrated, consistent error shape. Good design.
- **Migration quality and idempotency** — All security migrations use `to_regprocedure()` / `IF EXISTS` guards, include reversibility instructions, and have clear explanatory headers. Professional.
- **SPE-643 post-mortem** — Honest, accurate description of what went wrong and why. This is the right culture.
- **SPE-9 (pg_graphql)** — Correctly verified: checked for GraphQL imports in codebase, then dropped the extension. Complete and clean.
- **Rate limiting on AI routes** — All 4 AI generation endpoints have per-user rate limits through withRoute. Real security value, not just structural cleanup.

---

## Recommended Process Improvements

1. **Require role-scoped query verification for all DB permission changes.** Before merging any migration touching RLS policies or EXECUTE grants, run a representative query as each affected role and record the output in the PR.

2. **No production migrations before code is deployed.** Apply migrations only after deploying the code that handles the new schema, or document a compatibility window explicitly.

3. **Set a hard daily limit on batch refactor merges.** 11 PRs in one day is indistinguishable from having no review process. Spread batch merges or group into larger reviewable units with CI verification between batches.

4. **Treat `it.skip` as time-bounded deferral.** Any `it.skip` without its ticket resolved within 30 days should be deleted, not maintained. Tests for removed behavior should be deleted, not skipped.

5. **Security remediations require full pattern audits, not point fixes.** Each security ticket should include an explicit "are there other instances of this pattern?" step before closing.

6. **Drop confirmed dead code — don't just revoke it.** If a function is safe to stop executing, it is safe to drop from the schema.

7. **Complete or explicitly descope the withRoute migration.** Document which routes are intentionally excluded and why; don't leave the codebase in permanent mixed state.
