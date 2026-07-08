# IEP Meeting Scheduling — Product & Technical Spec (Draft)

> **Status:** Direction agreed — §13 questions resolved by the product owner;
> not yet scheduled for build.
> **Last updated:** 2026-07-08.
> **Companion reading:** `docs/ARCHITECTURE.md` §1 (roles), §6 (scheduling model),
> §9 (elementary vs secondary). Related tickets: SPE-194 (one-teacher-per-student
> data model), SPE-181 (secondary rostering spike), SPE-169 (audit logging).

---

## 1. Problem

Scheduling an IEP meeting requires assembling a legally-defined team — LEA rep
(site admin), gen-ed teacher(s), case manager, service providers, and the
parents/guardians — and today that coordination happens over reply-all email:
propose a time, wait, someone can't, repeat. Generic tools (Doodle, Calendly)
don't solve it because they don't know who the required team is, don't know the
compliance clock, and aren't FERPA-positioned.

Two field observations shape the design:

1. **Sites want the whole year booked in the fall.** Districts and site admins
   push to reserve every known IEP meeting at the start of the school year so
   slots exist before the calendar fills. This is very hard to do by hand, so it
   rarely happens well.
2. **Some sites hand-maintain a shared "IEP Calendar"** — a standalone calendar
   checked before booking so meetings don't double-book the site's capacity
   (the LEA rep, the conference room). It exists because nothing provides it.

The core value proposition is one sentence: **the organizer can see everyone's
availability without asking anyone.** Any design that requires N people to each
take an action per meeting (availability polls, per-meeting forms) recreates
the email problem in a different UI and will not be adopted.

## 2. What the product is

Not a per-meeting Calendly clone. Three connected capabilities:

1. **Bulk planner** — generate and reserve IEP meetings from the caseload's
   IEP due dates, respecting everyone's availability and the site's capacity
   rules. Parents are not contacted at this stage; these are internal
   reservations delivered as ordinary Google Calendar invites.
   The **planning horizon is a parameter, not a fixed year**: "plan meetings
   due through [date]", with full-year as the default preset (others: through
   winter break, this semester). Meetings place relative to due dates, so
   filtering by "due within horizon" is natural — a spring annual needs no
   fall reservation. The planner is **idempotent and incremental**: re-running
   it never touches existing reservations, only fills gaps (students newly due
   within an extended horizon, mid-year move-ins, new initials). A
   **horizon-expiry nudge** ("N meetings due after [horizon end] aren't
   scheduled — plan the next window?") ensures partial planning never silently
   becomes missed deadlines. This also serves cautious adoption: a skeptical
   site can plan "just through October," see reservations hold, then extend.
2. **Confirmation pass** — ~4–6 weeks before each meeting, bring the family in:
   the parent gets a tokenized link (no account, no login) to confirm the
   reserved time or pick from pre-validated alternatives.
3. **Reschedule flow** — the same availability engine, invoked per meeting.
   Year-ahead plans *will* drift; the pitch is "when something moves, the new
   slot takes thirty seconds, not a week of email." This flow is where the tool
   lives or dies.

Speddy is uniquely positioned because it already holds most of the inputs: the
team (profiles, roles, student↔case-manager/teacher links), provider service
schedules (`schedule_sessions`), bell schedules and special activities, and the upcoming IEP/triennial dates per
student (`student_details.upcoming_iep_date` / `upcoming_triennial_date`,
populated by the SEIS extension import and editable in the student modal),
which give the compliance due windows directly.

## 3. Design principles (load-bearing — do not trade away)

1. **Source-agnostic availability.** A person's busy time is the **union of
   whatever sources exist for them** (see §5). The scheduler must never
   *require* a maintained Speddy session schedule — providers whose real life
   lives in Google Calendar get correct results from Google alone. Speddy
   session data is an optional, per-person enhancement. Over-blocking (union)
   is the safe failure mode.
2. **Attendee auto-assembly is a convenience layer on an editable list.**
   Elementary auto-populates fully (single `teacher_id`, providers via
   services). Secondary cannot (no rostering — SPE-194), so the case manager
   picks the gen-ed teacher(s) from the school's teacher list. The scheduler
   must not be gated on secondary rostering infrastructure; when SPE-194/181
   land, secondary auto-assembly lights up without redesign.
3. **Effort concentrates on the organizer.** Step-count budget per school year:
   teacher — one preferences tap; provider — one OAuth connect; site admin —
   one OAuth + site rules; parent — one tap per meeting; case manager — owns
   it (~30 min in fall, ~1 min per meeting after). Anything that adds
   per-meeting steps for non-organizers is out.
4. **Parents never need an account.** Tokenized, expiring, minimal-data links
   (or a fully offline path — see §7). Admin-only account creation stays.
5. **Delivery is native calendar invites.** Confirmed meetings are real Google
   Calendar events created from the organizer's calendar with the team as
   guests. Reminders come from Google. The gen-ed teacher never has to open
   Speddy for the feature to work for them.
6. **Graceful degradation everywhere.** Every data source in §5 can be absent;
   the flow downgrades (warn, ask, or fall back to manual) instead of breaking.

## 4. Personas / walkthrough (abridged)

- **Site admin** (LEA rep): one-time setup — Google OAuth, site meeting rules
  (allowed days/times, room capacity, max meetings/day, blackout windows),
  point Speddy at an existing shared IEP Calendar if one exists. Gets the
  year-at-a-glance dashboard: every meeting, color-coded by status
  (reserved / confirmed / held / at-risk), plus June compliance stats.
- **Case manager** (organizer): connects Google once. Runs the bulk planner
  over their caseload at a horizon of their choosing (full year, semester,
  etc.): Speddy drafts placements honoring due
  windows and all constraints, flags unplaceable students for manual
  resolution, supports drag-to-adjust with live conflict re-check, then
  "Reserve all." Later: per-meeting confirmation nudges, reschedules.
- **Gen-ed teacher**: answers a one-time, one-screen availability prompt
  (elementary: derived prep block + before/after-school preference; secondary:
  free-entry prep window, e.g. "4th period 10:50–11:40"). Then just receives
  accurate calendar invites. Never opens Speddy.
- **Provider** (e.g. itinerant SLP): connects their own Google account once.
  Speddy unions that with their `schedule_sessions` (if maintained).
- **Parent/guardian**: receives text/email in home language with the reserved
  time → one tap to confirm, or "pick a different time" showing 2–3
  alternatives pre-validated against the whole team (whichever they pick just
  works). Non-responders trigger a "call the family" nudge to the case
  manager with an offline-confirmation log (§7).

## 4.5 Navigation & entry points (UX)

Principle: **one destination per persona who owns something, zero destinations
for personas who just participate.**

| Persona | Destination | Entry points |
|---|---|---|
| Case manager / provider | New **top-level nav item "Meetings"** (`/dashboard/meetings`) | Nav item; student detail modal (meeting section + "Schedule meeting"); provider-dashboard due-date widget ("3 annuals due in 60 days — 1 unscheduled") deep-linking into the planner |
| Site admin | **"Meetings"** in the admin nav (beside Master Schedule) | Year-at-a-glance dashboard; site rules setup lives here as a settings surface within the page (visited ~once/year, not its own nav item) |
| Gen-ed teacher | **None (deliberate)** | One-time dismissible fall card on the teacher dashboard (availability prompt); everything else arrives as Google Calendar invites. A read-only "upcoming meetings for my students" card is a possible later add — not v1 |
| SEA | None | Not a required IEP-team role; attend via invite when added manually |
| Parent | **No dashboard, no login** | Standalone, mobile-first tokenized route (e.g. `/meet/[token]`) outside the auth'd `/dashboard` tree; one job: confirm or pick a time — the "confirm a doctor's appointment by text" pattern |

Why "Meetings" is top-level for providers, not nested in the Schedule dropdown:

1. **Different mental model** — Schedule is the recurring service-delivery week
   (sessions, bell schedules); meetings are dated one-off multi-person events
   with statuses and a compliance clock.
2. **Secondary gating** — the Schedule group is in `SECONDARY_HIDDEN_HREFS`
   (hidden at secondary sites, §9 of ARCHITECTURE.md), but meetings must work
   K-12. Top-level keeps the feature out of that blast radius. Do **not** add
   `/dashboard/meetings` to the hidden set.

Naming: the nav label is **"Meetings"** (future-proof for CARE-lane initials,
504s, SSTs in v2+); "IEP meeting" remains the type label within the feature.

Contextual entry points matter more than the nav item for adoption — case
managers think student-first, so the student modal and the due-date nudges are
expected to be the most-used doors; the nav item is the home, not the main door.
First visit to `/dashboard/meetings` runs the setup checklist (connect Google,
site rules if admin, etc.).

## 5. Availability engine

Busy time per person = union of available sources:

| Source | Applies to | Access path | Required? |
|---|---|---|---|
| Own Google Calendar | Anyone who connects (all providers, admins, organizers) | Per-user OAuth | Primary |
| Colleague free/busy | Staff who share calendars but don't connect (common for admin/SpEd/district; rare for teachers) | Organizer's OAuth token + existing intra-domain sharing (Google free/busy query returns any calendar the authenticated user can see) | Fallback |
| Speddy `schedule_sessions` | Providers who maintain their Speddy schedule | Internal | Optional, per-person toggle |
| Bell schedule / preference window | Teachers | Internal (elementary) / manual entry (secondary) | Elementary derived; secondary manual |
| External "IEP Calendar" | The site | Read via organizer's token, if it exists | Optional input (§6) |
| Site meeting rules | The site | Configured in Speddy | Required (site setup) |

Notes and edge cases:

- **Teachers don't typically share calendars — and it barely matters.** An
  elementary teacher's availability is structural (teaching bell-to-bell; free
  at prep / before / after school), which Speddy models better than their
  mostly-empty Google calendar would. The people whose days genuinely vary
  (admins, SpEd, district staff) are exactly those who already share calendars
  with heavy calendarers.
- **All-day "visual" events are a known trap.** Google defaults all-day events
  to *free* transparency, so the free/busy API does not return them — an
  admin's all-day "District PD" banner is invisible to any free/busy-based
  scheduler. Handling, in layers:
  1. With full read access (self-connected, or full-detail sharing): fetch
     events, not just free/busy, and surface all-day items as a **warning, not
     a block** ("has an all-day item 'District PD' not marked busy — schedule
     anyway?"). A human judges, matching how these events are used.
  2. With free/busy-only visibility: genuinely invisible. Backstop: every
     booking is a real Google invite, so the affected person **declines**;
     Speddy watches RSVP status and flags declines to the organizer as a
     reschedule prompt. Failure degrades to "caught within a day."
  3. Preventively: setup checklist tells connected users to mark all-day
     absences as Busy.
- **Stale-schedule detection (nice-to-have):** when a provider's Google
  calendar contradicts their Speddy sessions, nudge "your Speddy schedule may
  be stale" — the IEP feature becomes a reason to maintain the Speddy
  schedule, never a victim of it.

## 6. The site "IEP Calendar"

The external calendar is an **optional input, never a dependency**. The
constraint it represents — the site can hold only so many meetings (one LEA
rep, one conference room) — is enforced internally by site rules regardless.

- Site has one → read it as an additional busy source (don't fight history).
- Site doesn't → Speddy's own meeting list plays the role from day one.
- Either way, Speddy **publishes a subscribable calendar feed** ("add your
  school's IEP calendar to Google") so the front office keeps the artifact
  they're used to — generated, not hand-maintained. Long-term, Speddy is the
  system of record and the old calendar becomes a view of it.

## 7. Parents

- **Contact info is not currently imported** (not in the SEIS import today).
  Capture manually at first "invite the family": prompt the case manager for
  name, phone and/or email, preferred language, preferred channel; persist in
  `student_parent_contacts` (§11) for reuse — not on `student_details`, to
  avoid duplicating parent PII (annuals recur — collect once, "still current?" nudge
  each fall). This is **new PII entering Speddy** → update
  `docs/data-inventory.md` and the NDPA docs when built. Future enhancement:
  SEIS holds parent contact info; extend the import.
- **Digital contact must not be required.** Offline path is first-class: case
  manager calls, taps "parent confirmed by phone on <date>", meeting proceeds
  with the same paper trail. The tokenized link is the happy path, not the
  only path.
- **Tokenized pages:** signed, expiring, minimal student data (initials-level),
  home-language localized (v1 may be English-only, but scope translation
  early — IDEA parental-participation expectations). Staff-facing calendar
  events use student initials, never full names, in titles.
- Parent responses/logs form the meeting-notice paper trail, but the feature
  deliberately **is not the legal IEP meeting-notice system** (that is a
  compliance document with its own requirements). Revisit later.

## 8. Elementary vs secondary

Works K-12 at v1 — this would be Speddy's first fully-useful secondary feature
(scheduling surfaces are currently hidden on secondary sites; ARCHITECTURE §9).

| Concern | Elementary | Secondary (v1) |
|---|---|---|
| Attendee assembly | Auto (single `teacher_id`, providers via services) | Case manager picks gen-ed teacher(s) from school teacher list (legal minimum: at least one gen-ed teacher of the student, not all of them) |
| Teacher availability | Bell schedule + one-time preference | One-time preference with free-entry prep window (no master schedule modeled) |
| Everything else | identical | identical |

Do **not** block on SPE-194/SPE-181; design so their landing upgrades secondary
from manual-pick to auto-assembly.

## 9. Calendar integration (Google-first)

- **Scope of v1:** Google Workspace only (dominant in CA districts). Outlook /
  M365 explicitly deferred — be upfront with affected sites.
- **OAuth:** per-user connect for organizers, admins, providers. Calendar
  scopes are Google "sensitive" (not "restricted") — app verification is
  paperwork + weeks, not a security-assessment tier. Request minimal scopes:
  free/busy + events read, event create on own calendar.
- **Organizer-centric reads:** free/busy queries through the organizer's token
  cover any colleague whose calendar is already shared with them; detect empty
  results (no sharing) and degrade to asking that person to connect, or manual.
- **Event creation:** confirmed meetings are created from the organizer's
  calendar with team as guests → native invites, RSVP tracking (Speddy watches
  attendee response status for the decline-backstop in §5).
- **District IT:** Workspace admins can block third-party OAuth apps; some
  districts will need to allowlist Speddy — a one-time, per-district
  conversation, same trust surface as the IEP data Speddy already holds.
  Free/busy-read is the easiest scope class to get approved. In a no-sharing
  district, v1's supported path is per-user OAuth connects (each relevant staff
  member connects once). Domain-wide delegation via district admin consent
  (zero per-user steps, more IT friction) is a **possible future fallback,
  explicitly out of v1** (§12) — validate demand before building it.
- **Token security:** encrypted at rest, minimal scopes, revocation handling,
  no tokens in logs. This is a genuinely new security surface in a FERPA app —
  it gets its own review before launch (and is a natural first consumer of
  real audit logging, SPE-169).

## 10. Compliance layer

- Due dates come from `student_details.upcoming_iep_date` and
  `upcoming_triennial_date` — the authoritative deadline fields (SEIS import
  writes `futureIepDate` → `upcoming_iep_date`; also manually editable in the
  student modal). Do **not** derive deadlines from `goals_iep_date` — that is
  the goals-effective date used only for goal-staleness validation; deriving
  "+1yr" from it would ignore manually maintained deadlines. Where an upcoming
  date is missing, `goals_iep_date + 1yr` may serve as a *suggested* fallback,
  clearly flagged for confirmation. Precedent for deadline-driven workflows:
  CARE Lane B's 15-day assessment-plan timeline.
- Dashboard: upcoming due dates without a scheduled meeting ("annual due in 45
  days — start scheduling"), at-risk flags (meeting scheduled after due date,
  parent unresponsive), June rollup (meetings held, % inside window, average
  reschedules). The rollup is also the sales artifact for the next district.

## 11. Data model sketch (names indicative)

- `iep_meetings` — student_id, school_id, organizer_id, meeting_type
  (annual | triennial | amendment | initial), due_date, scheduled_start/end,
  location, status (draft | reserved | confirming | confirmed | held |
  cancelled), google_event_id, created/updated, soft delete.
- `iep_meeting_attendees` — meeting_id, profile_id (nullable for parent rows),
  attendee_role (lea_rep | case_manager | teacher | provider | parent | other),
  required flag, rsvp_status, response source (google | speddy | offline).
- `student_parent_contacts` — student_id, name, relationship, phone, email,
  preferred_language, preferred_channel, verified_at.
- `parent_confirmation_tokens` — meeting_id, contact_id, signed token, expiry,
  responded_at, response (confirmed | requested_change), offline_log
  (free-text "confirmed by phone <date>" entries live on the meeting).
- `calendar_connections` — profile_id, provider (google), encrypted
  tokens, scopes, status.
- `site_meeting_rules` — school_id, allowed windows, max per day, rooms,
  blackout ranges, external IEP-calendar ref (nullable).
- `teacher_availability_prefs` — profile_id, school_year, prep window,
  before/after-school preference.

Deliberately separate from `schedule_sessions` — meetings are not sessions,
and per principle #1 must not be constrained by them.

## 12. Phasing

**V1 (the coherent minimum — smaller cuts recreate the email problem):**
bulk planner with selectable horizon + incremental re-runs; availability
engine with the §5 sources; Google OAuth +
organizer-centric free/busy; native event creation + RSVP watch; site rules +
IEP-calendar read + published feed; confirmation pass with tokenized parent
links + offline path + manual contact capture; reschedule flow; due-date
dashboard basics.

**Explicitly out of v1:** Outlook/M365; two-way sync beyond RSVP; domain-wide
delegation; SEIS parent-contact import; secondary auto-assembly (needs
SPE-194/181); translation beyond the initial language set; legal meeting-notice
generation; per-teacher OAuth; initial-IEP and amendment meetings (v1 is
annuals/triennials only — the CARE Lane B integration for initials is v2+,
per §13.6; the `meeting_type` enum still models them so nothing needs a
migration when they land).

## 13. Resolved questions (decided 2026-07-08, product owner)

Originally open validation questions; all six are now decided and the rest of
this spec is written to match.

1. **Governance — decided:** the **case manager** is responsible for
   scheduling out their caseload's IEPs. The site admin consumes the
   site-wide dashboard; they don't own the plan.
2. **Trust in September bookings — decided:** admins honor IEP holds on
   their calendar. Last-minute conflicts happen (that's what the reschedule
   flow is for), but a reserved slot is treated as real, not a suggestion.
3. **Calendar depth — decided:** the **free/busy model is sufficient**. No
   deeper calendar integration is needed; don't build past it.
4. **District IT — decided:** districts will allowlist Speddy's OAuth app
   provided it is properly vetted (verification, minimal scopes, security
   documentation). There is no meaningful alternative path — any calendar
   read passes the same Workspace app gate — so vetting/allowlisting is the
   plan, with manual slot entry as the degradation for the unapproved gap.
5. **Parent contact — decided:** case managers reliably have at least one
   good family contact, but it lives outside Speddy today. The §7/§11
   capture flow (`student_parent_contacts`) is therefore a **required v1
   piece**, not a nice-to-have — it's what moves that contact from the case
   manager's head into the product.
6. **Amendments/initials — decided:** **v2 or later.** V1 is
   annuals/triennials only; the CARE Lane B integration for initial IEPs is
   deferred.

## 14. Security & FERPA notes

- Parent-facing pages: minimal data, signed expiring tokens, no enumeration.
- Calendar event titles: student initials only ("IEP — M.G., Gr 3, Okafor").
- OAuth tokens: encrypted at rest, least scope, revocation + disconnect UX.
- New PII (parent contacts): data-inventory + NDPA updates ship with the code.
- Meeting/confirmation actions should write audit events — pairs with SPE-169.
