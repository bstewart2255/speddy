# District SIS onboarding runbook: approve once per district

The model so the next district is a checklist, not archaeology. Encodes what
JSUSD (Aeries, via OneRoster) taught us. Applies to any district getting a
SIS roster/teacher-link sync connected for the first time.

## 1. Collect up front from the district's tech lead

- OneRoster base URL and token URL.
- Client credentials (client id/secret), or an Aeries certificate if that's
  the district's auth path.
- Whether they IP-allowlist (JSUSD does) — if so, get Speddy's current
  outbound IPs to them before the first connection test, or every request
  fails closed with a generic connection error that looks like a bad
  credential.
- Any certificate quirks.
- Which SIS vendor/version sits behind the OneRoster endpoint — vendors
  implement the spec differently (see dialect verification below).

**Credentials never come through `/internal` at all — that's deliberate**
(`app/api/internal/sis-connections/route.ts`'s own comment: "credentials
never come through /internal at all — the district's own tech admin enters
those"). The split:
- **Speddy staff, via `/internal`:** create the connection shell for the
  district (`POST /api/internal/sis-connections`, lands in `pending_dpa`),
  then record the signed DPA (`dpa_cleared_at`) once it's in hand —
  districts cannot clear this themselves.
- **The district's own tech admin, via their dashboard tech portal:**
  submits the actual OneRoster base/token URLs and client id/secret
  (`POST /api/tech/sis/oneroster`, or the Aeries sibling), gated on their own
  `district_tech` grant. This is also the step blocked until the DPA above is
  cleared — `storeCredential()` refuses it otherwise, enforced twice (app
  code and a DB CHECK constraint).

Both secrets are encrypted app-side (`lib/sis/credential-crypto.ts`; see
`docs/ARCHITECTURE.md`'s "SIS credentials" section) and never echoed back to
either side.

## 2. Dialect verification before any sync

Run the connection test from `/internal` (`POST
/api/internal/sis-connections/[connectionId]/test`) — this runs the
*district's own* test path server-side, so a green result here means their
own button would show green too, not a separate staff-side implementation
that could disagree. It then separately samples roster data
(`probeOneRosterRosterData` in `lib/sis/oneroster-setup.ts`) to catch
permission-denied responses that would otherwise look like a network failure
(this is what JSUSD's `/enrollments` case looked like before the probe
existed). **Be precise about what "aggregate-only" covers when talking to a
district about this:** the probe's *output* — what's returned to staff and
what's logged — is aggregate counts and fixed messages only, never a
record's contents. But getting there means transiently reading real rows
into memory (`client.getStudents(...)`, `getClasses(...)`,
`getEnrollments(...)`, capped at `PROBE_PAGE_LIMIT`) — "no student record is
ever read" overstates it; the right claim is "no student record ever leaves
this probe."

Check, specifically:
- **Identifier wrapping format.** JSUSD's Aeries wraps student ids as
  `{school}_STU_{number}`; the matcher's unwrap rule
  (`lib/sis/student-teacher-link-sync.ts`) is anchored to the `STU` marker
  specifically, not position — a new vendor may wrap differently or not at
  all. Confirm against a real sample before trusting any match.
- **Grade-code dialect.** OneRoster's own vocabulary is `KG`/`01`; Speddy
  displays `K`/`1` everywhere, and the translation
  (`lib/sis/teacher-directory-sync.ts`) only knows the mappings that were
  seen live at the time it was written. A vendor emitting something outside
  that set needs the mapping extended before sync, not after.
- **How teachers-of-record appear in enrollments** — the "teaches-a-class"
  classification the link sync depends on to tell an actual class teacher
  from an unrelated staff enrollment.

## 3. Watched first runs, in order — this is the once-per-district approval

Both syncs are preview-then-apply (`mode: 'dry-run' | 'apply'` on
`app/api/district/teacher-sync/route.ts` and `.../district/link-sync/route.ts`).
Apply always recomputes the plan server-side from a fresh read and refuses
(409) if the recomputed **count** of writable changes doesn't match what the
preview reported (`writableChangeCount(plan) !== body.expectedChanges`). Know
the limit of that check: it's a **count** comparison, not a content one — if
the feed changes between preview and apply in a way that keeps the count
identical (one teacher swapped for a different one, say), apply won't refuse
and won't be applying exactly what was reviewed. In practice this needs the
feed to change *and* land on the same number of writable rows in the gap
between preview and apply, which is narrow, but don't describe the 409 check
as guaranteeing the exact reviewed plan — it guarantees the size didn't move.

1. **Teacher sync preview → apply**, with us and the district admin looking
   at the diff together. This is the one that mints sign-in accounts for new
   teachers, so it's a genuine "does this look like the district's actual
   staff list" check, not a formality.
2. **Link sync preview → apply**, same way, once the teacher directory is
   trustworthy.

## 4. What "flip to automatic" actually means today

**Link sync becomes automatic on its own — there's no separate flag to
enable, AND nothing gates it behind the watched-run step above.**
`resolveOneRosterConnection` (`lib/sis/connections.ts`) — the same
"is this district's OneRoster setup dialable" check used by both the manual
apply button and the unattended paths — only requires a connection row with
a `base_url` and a stored, decryptable credential. It does **not** check
`dpa_cleared_at`, and there is no "a human has watched and approved a first
run" flag anywhere. The instant the district's tech admin submits working
credentials (step 1), `runAutoLinkSync` (`lib/sis/auto-link-sync.ts`) is
eligible to fire on the very next student import or the next nightly cron
tick — possibly **before** anyone has watched a preview.

**This makes the "watched first run" an operational discipline this runbook
has to enforce by timing, not something the system enforces for you.**
Don't have the district submit credentials, or clear a DPA immediately
before, a stretch where staff isn't available to immediately run the watched
teacher-sync and link-sync previews. Once credentials are live, treat the
clock as already running on the first unattended trigger, not as waiting on
your approval.

What *is* true, and does provide real safety once automation fires: it
inherits the same planner the manual apply uses — refuses whole runs against
an empty or partially-updated feed, never overwrites a human-made link,
holds removals for any child whose roster teachers didn't all resolve. So an
early unattended run is more likely to refuse safely than to write something
wrong — but "likely safe" is not the same as "gated on your review," and the
runbook shouldn't imply the latter.

**Teacher sync stays a human click, by deliberate owner decision
(2026-08-18) — this is not a "future automation ticket," it's the intended
end state.** Its apply mints new sign-in accounts, and new-teacher review
is meant to keep a person in that loop. Don't look for a flag to flip here.

## 5. Standing state — what exists today, and what doesn't yet

- **Audit trail is real but partial — a missing row does not mean nothing
  happened.** `runAutoLinkSync` writes to `audit_logs`
  (`sis_link_sync_attempted` for a no-op or refused run, `sis_link_sync_applied`
  for a written one — same table a manual apply writes to) only for the
  `refused`, `nothing-to-do`, and `applied` outcomes. It writes **nothing**
  for `failed` (the SIS itself couldn't be read), `no-connection`, or
  `load-failed` — and audit insertion is explicitly best-effort, so even an
  `applied`/`refused` run can fail to leave a row. The nightly cron
  (`app/api/cron/cleanup-uploads/route.ts`) can also **budget-skip a
  district entirely** (a 240-second wall-clock cap across all districts) —
  a skipped district gets no `runAutoLinkSync` call at all that night, hence
  no audit row, and is picked up by the next import trigger or the following
  night. To confirm the first unattended night actually ran for a specific
  district, `audit_logs` rows are necessary evidence but not sufficient —
  also check the cron's own response/logs for that district in its
  `linkSync` outcome tally (`applied` / `refused` / `nothing-to-do` /
  `debounced` / `no-connection` / `failed` / `budget-skipped` counts).
  Readable today via Supabase or `/internal`; there is **no self-serve
  digest UI for the district admin yet** — don't tell a district admin to
  expect an email or in-app summary, because neither exists.
- **Pause switch: only DPA revoke is actually reachable today, but it's a
  real, complete pause.** `lib/sis/connections.ts` has both a `disconnect()`
  function and a DPA-revoke path, but **no `/internal` route or panel calls
  `disconnect()`** — it's currently only exercised by tests and the
  sim-district script, not by any staff-facing control. The pause a Speddy
  staffer can actually click today is revoking the DPA from `/internal`
  (`setDpaCleared({ cleared: false })`), and it's not a half-measure: the
  same update that clears `dpa_cleared_at` also **nulls the stored
  credential columns and resets status to `pending_dpa`** in one statement —
  so `resolveOneRosterConnection` (the gate both manual and unattended sync
  share) has no decryptable credential to find afterward, and every sync
  path stops. There is **no district-admin self-service pause** at all. If a
  district needs to stop syncing, that request has to come to Speddy staff.

Both gaps above (no digest, no wired-up disconnect control as a separate
staff action) are worth closing before onboarding scales past a
staff-supervised handful of districts — flagging here so the next read of
this doc isn't the first place that's noticed.

## Failure playbook

- **A refused run is not an error** — it's the planner declining to write
  against data it can't trust yet (an empty feed, a half-updated one, an
  unresolved roster teacher). It shows up as `sis_link_sync_attempted` with
  `outcome: 'refused'` in the audit trail and a `log.warn`, not an alert.
  Expected behavior while a feed is mid-fix; investigate if it persists
  across multiple nights.
- **When to pause vs. wait:** a single refused night is normal noise during
  onboarding or after a district-side data change — wait for the next
  attempt. Multiple consecutive refusals (audit trail), or a `'failed'`
  outcome (the SIS itself couldn't be read — check the cron's own logs for
  this one, since it leaves no audit row per §5), means something upstream
  changed — revoke the DPA from `/internal` (the actual pause, §5) and
  investigate before the debounce window lets it keep retrying against the
  same broken feed.
- **Who calls the district:** Speddy staff, using the connection test
  (§2) to show the district a concrete failure rather than "the sync
  broke" — the aggregate-only probe output is safe to share with them
  directly.

## Source of truth

`docs/ARCHITECTURE.md` (SIS credentials section); `lib/sis/connections.ts`;
`lib/sis/auto-link-sync.ts`; `lib/sis/student-teacher-link-sync.ts`;
`lib/sis/teacher-directory-sync.ts`; `lib/sis/oneroster-setup.ts`;
`app/api/internal/sis-connections/`; `app/api/tech/sis/oneroster/route.ts`;
`app/api/tech/sis/aeries/route.ts`; `app/api/district/teacher-sync/route.ts`;
`app/api/district/link-sync/route.ts`; `app/api/cron/cleanup-uploads/route.ts`.
