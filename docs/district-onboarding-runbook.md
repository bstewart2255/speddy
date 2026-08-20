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

Store the credential via `/internal`'s district SIS connection page
(encrypted app-side, `lib/sis/credential-crypto.ts`; see
`docs/ARCHITECTURE.md`'s "SIS credentials" section). A signed DPA is a hard
gate before any credential can be stored — Speddy staff set `dpa_cleared_at`
from the same `/internal` page; districts cannot clear it themselves.

## 2. Dialect verification before any sync

Run the connection test from `/internal` (`POST
/api/internal/sis-connections/[connectionId]/test`) — this runs the
*district's own* test path server-side, so a green result here means their
own button would show green too, not a separate staff-side implementation
that could disagree. It probes read-only, aggregate-only (no student
records), and separately samples roster data to catch permission-denied
responses that would otherwise look like a network failure (this is what
JSUSD's `/enrollments` case looked like before the probe existed).

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
(409) if it's drifted since the reviewed preview — so a stale approval can't
silently apply a different change set than what was looked at.

1. **Teacher sync preview → apply**, with us and the district admin looking
   at the diff together. This is the one that mints sign-in accounts for new
   teachers, so it's a genuine "does this look like the district's actual
   staff list" check, not a formality.
2. **Link sync preview → apply**, same way, once the teacher directory is
   trustworthy.

## 4. What "flip to automatic" actually means today

**Link sync becomes automatic on its own — there's no separate flag to
enable.** Once a district has a cleared DPA and a working OneRoster
connection, `runAutoLinkSync` (`lib/sis/auto-link-sync.ts`) starts running
unattended: right after any provider in the district imports students
(debounced 3 minutes), and nightly as a backstop. It inherits its safety
from the same planner the manual apply uses — refuses whole runs against an
empty or partially-updated feed, never overwrites a human-made link, holds
removals for any child whose roster teachers didn't all resolve.

**Teacher sync stays a human click, by deliberate owner decision
(2026-08-18) — this is not a "future automation ticket," it's the intended
end state.** Its apply mints new sign-in accounts, and new-teacher review
is meant to keep a person in that loop. Don't look for a flag to flip here.

Confirm the first unattended night by reading the audit trail (below), not
by assuming silence means success.

## 5. Standing state — what exists today, and what doesn't yet

- **Audit trail:** every unattended run leaves a row in `audit_logs`
  (`sis_link_sync_attempted` for a no-op or refused run, `sis_link_sync_applied`
  for a written one — same table a manual apply writes to). Readable today via
  Supabase or `/internal`; there is **no self-serve digest UI for the district
  admin yet** — don't tell a district admin to expect an email or in-app
  summary, because neither exists.
- **Pause switch:** also staff-only today, via `/internal` — either
  `disconnect()` the connection or revoke the DPA
  (`lib/sis/connections.ts`). There is **no district-admin self-service
  pause** yet. If a district needs to stop syncing, that request has to come
  to Speddy staff, not a button on their side.

Both gaps above are worth closing before onboarding scales past a
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
  attempt. Multiple consecutive refusals, or a `'failed'` outcome (the SIS
  itself couldn't be read), means something upstream changed — pause via
  `/internal` and investigate before the debounce window lets it keep
  retrying against the same broken feed.
- **Who calls the district:** Speddy staff, using the connection test
  (§2) to show the district a concrete failure rather than "the sync
  broke" — the aggregate-only probe output is safe to share with them
  directly.

## Source of truth

`docs/ARCHITECTURE.md` (SIS credentials section); `lib/sis/connections.ts`;
`lib/sis/auto-link-sync.ts`; `lib/sis/student-teacher-link-sync.ts`;
`lib/sis/teacher-directory-sync.ts`; `lib/sis/oneroster-setup.ts`;
`app/api/internal/sis-connections/`; `app/api/district/teacher-sync/route.ts`;
`app/api/district/link-sync/route.ts`.
