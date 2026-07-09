# Speddy Capabilities — by Role, School Level, and School Type

> **Purpose.** A UX-perspective inventory of what Speddy does, organized so a
> potential user can find themselves in it: what role they hold, what level of
> school they work at, and what kind of school it is. This is the source
> document for redesigning the landing-page audience toggle (today just
> "SpEd Provider" vs "Admin") into a view that covers all audiences.
>
> **Not** marketing copy and **not** a technical reference — for how the system
> works internally, see `docs/ARCHITECTURE.md`. Descriptions here are what the
> user sees and does.
>
> **Last verified:** 2026-07-09, against the live app navigation, the
> IEP-meeting spec (`docs/IEP_MEETING_SCHEDULING_SPEC.md`), and the
> private/charter market research (`docs/research/2026-07-private-charter-school-market.md`,
> PR #677).

**Status legend used throughout:**

| Mark | Meaning |
|---|---|
| ✅ | Available today |
| 🔶 | Available with caveats (noted inline) |
| 🗓️ | In development — partially shipped or on the near-term roadmap |
| — | Not applicable to this audience |

---

## 1. The three axes

### Axis 1 — Role

Three **buying/deciding audiences**, plus two **included portals** for people
who participate but don't run the product:

| Audience | Who that is | Center of gravity |
|---|---|---|
| **District admin** (SpEd director / district office) | Director of Special Education, district program staff | Visibility across every site; user and access management. Deliberately read-oriented — the district admin never has to build a schedule or log a session. |
| **Site admin** | Principal, AP, or site-level SpEd lead | The school's structural data (bell schedules, special activities, yard duty), site-wide oversight, staff accounts, IEP meeting capacity. |
| **Provider** | Resource specialist / case manager, SLP, OT, counselor, school psychologist, intervention specialist | The day-to-day work: caseload, weekly service schedule, sessions, materials, progress, referrals, IEP meeting planning. |
| *Teacher portal (included)* | Gen-ed classroom teacher | Sees which of their students receive services and when; contributes classroom activities so providers schedule around them. Never required to run anything. |
| *SEA portal (included)* | Special Ed Assistant / paraprofessional | Sees the sessions assigned to them, their students, and the daily plan. View-and-deliver, not manage. |

Parents/guardians are a sixth touchpoint with **no account and no login**: the
IEP-meeting flow (in development) reaches them by text/email link to confirm a
meeting time.

### Axis 2 — School level

Speddy classifies each **school** (not each user) as elementary or secondary
(middle/high). An itinerant provider working at both gets each school's
experience at that school, on one login.

- **Elementary** — the full experience. All scheduling tools assume the
  elementary shape of the day: one classroom teacher per student, bell
  schedules by grade, pull-out sessions around specials and recess.
- **Middle / High** — a **caseload-first experience** today. Student and
  caseload management, IEP goals and accommodations, progress monitoring,
  referral tracking, and IEP meeting calendaring all work. The
  elementary-shaped scheduling surfaces (weekly session schedule, bell
  schedules, special activities, lesson-plan calendar) are hidden because they
  don't match a period-based day. Terminology also shifts (e.g. "Resource
  Specialist" becomes "Case Manager", accommodations are surfaced first for
  teachers). Native period-based scheduling is on the roadmap as part of the
  Middle/High School module.

Admin surfaces are level-independent: a site admin manages an elementary or
secondary site with the same tools, and district admins see both.

### Axis 3 — School type

- **Public district school** — the environment Speddy is built in. Everything
  below applies.
- **Charter school** — public schools that run IEPs under IDEA, so the model
  fits nearly as-is; the difference is organizational (a charter buys per
  school or network, without a district gate; CA charters affiliate with
  SELPAs). Many charters are 6-12 or K-12, so the secondary caveats above
  apply more often.
- **Private / independent school** — outside the IEP framework. The federal
  compliance workflow for parentally-placed students (equitable-services
  plans) legally belongs to the local **public district**, not the private
  school. What a private school owns is its **discretionary learning-support
  program**: learning specialists, accommodation/support plans, and the
  support sessions it chooses to deliver. Most of Speddy's mechanics transfer
  to that work; the IEP-specific compliance layer does not. See §5.

---

## 2. Feature groups

The canonical list. Each group is described from the point of view of the
person using it.

| # | Feature group | Primary owner | Status |
|---|---|---|---|
| 1 | Schedule building — provider | Provider | ✅ |
| 2 | Schedule building — site admin (Master Schedule) | Site admin | ✅ |
| 3 | IEP meeting calendaring (Meetings) | Site admin + Provider | 🗓️ rolling out |
| 4 | Referral tracking (CARE) | All roles | ✅ |
| 5 | Student & caseload management | Provider | ✅ |
| 6 | Lesson planning & materials | Provider | 🔶 (AI features flag-gated) |
| 7 | Progress monitoring & assessment | Provider | ✅ |
| 8 | Team coordination & communication | All roles | ✅ |
| 9 | Staff & account administration | Site + District admin | ✅ |
| 10 | Multi-school (itinerant) support | Provider | ✅ |

### 2.1 Schedule building — provider

The provider's weekly service schedule: every session for every student on the
caseload, built visually.

- Drag-and-drop weekly calendar, color-coded by grade; day/week/month views.
- Conflict detection **before you commit**: two providers pulling the same
  student, an SEA who isn't free, a session that collides with recess, lunch,
  PE, or a class activity the teacher flagged.
- Schedules are built **against the school's structural data** (bell schedules
  and special activities) — entered once by the site admin, or by the provider
  themselves if the admin hasn't.
- Group sessions (several students, one slot) and individual sessions in the
  same view.
- Assign a session to an SEA or another specialist; everyone sees who delivers
  what.
- Service-minute tracking per student against what the IEP calls for
  (sessions per week × minutes per session).
- Adjust once when things change — a new student, a teacher request, a
  regrouped session — and the schedule updates around it.
- Print/export to PDF.

**Who uses it:** all provider roles. SEAs see the result (their assigned
sessions), they don't build it. Site admins have their own version (§2.2);
district admins only view.

### 2.2 Schedule building — site admin (Master Schedule)

The whole school's structural schedule in one place — the data every
provider's schedule is built on, plus the site-wide view of it.

- Bell schedule builder: start/end times and restricted blocks by grade.
- Special activities: Music, Library, STEAM, PE, etc., per teacher/grade.
- Yard-duty rotations and zone management.
- Whole-school view with filters by grade, activity type, zone, teacher, or
  provider; conflict visibility across the school.
- School-year handling: build next year alongside this one and roll forward —
  the August setup is done once, not re-typed.
- CSV import for bulk setup.

**Who uses it:** site admins own it. Providers consume it (and can enter
site data themselves at sites without an active admin — the product works
either way, better with the admin). District admins view.

### 2.3 IEP meeting calendaring (Meetings) — 🗓️ rolling out

Scheduling the legally-required IEP team meeting without the reply-all email
chain. The organizer sees everyone's availability without asking anyone.

- **Site setup (shipped):** the site admin sets meeting rules once — allowed
  days/times, room capacity, max meetings per day, blackout windows — and
  teachers answer a one-time availability preference.
- **Bulk planner (in review):** the case manager plans a horizon ("all IEPs
  due through winter break", or the whole year) from each student's IEP/
  triennial due dates. Speddy drafts times that respect the whole team's
  availability and the site's capacity, flags students it can't place, and
  reserves the rest as real calendar holds.
- **Site dashboard:** year-at-a-glance for the admin — every meeting,
  color-coded by status, plus compliance stats (due dates without a meeting,
  at-risk meetings).
- **Family confirmation (planned):** ~4–6 weeks out, the family gets a
  text/email in their home language with a one-tap confirm or pre-validated
  alternative times. No parent account, ever. A phone-call path is
  first-class for families without reliable digital contact.
- **Reschedule flow (planned):** when a meeting moves — and it always does —
  picking a new slot that works for everyone takes seconds, not a week of
  email.
- Works **K-12** — this is deliberately not an elementary-only feature.

**Who uses it:** case managers/providers organize; site admins set rules and
watch the dashboard; teachers just receive accurate calendar invites; parents
confirm by link or phone.

### 2.4 Referral tracking (CARE)

The front door for student concerns, before and around the IEP: a shared
queue instead of sticky notes and hallway conversations.

- Anyone on staff can submit a referral: academic, behavioral, attendance,
  social-emotional, speech, OT, or other.
- Two intake lanes, matching how referrals actually arrive:
  - **Discussion lane** — a teacher or staff concern enters a pending queue,
    the team reviews it, and it becomes an active case (or doesn't).
  - **Compliance lane** — a parent's written request or a private-school
    referral starts the legal clock immediately: the case opens on arrival
    with the assessment-plan due date pre-calculated (15 days, CA Ed. Code).
- Cases carry meeting notes, action items with owners and due dates, current
  disposition, and follow-up dates — the whole SST/CARE-meeting paper trail
  in one place.
- School-scoped: the team sees their school's queue; district admins see
  across schools.

**Who uses it:** providers work the queue; site and district admins oversee
it; teachers submit and follow their referrals.

### 2.5 Student & caseload management

Everything about the students being served, in one place instead of a
spreadsheet, a binder, and someone's memory.

- Student profiles: grade, teacher, service details, sessions-per-week and
  minutes-per-session.
- IEP goals and accommodations per student; IEP and triennial due dates.
- Import: bulk CSV, or directly from a **SEIS export** (CA) — caseloads
  onboard from the file the school already has.
- Assessment records (STAR Reading/Math, WISC-V, BRIEF, WIAT-4, WJ-IV,
  mClass and others) with trend views.
- Teacher-facing view of the same student, scoped to what a gen-ed teacher
  needs: services, schedule, goals, accommodations (accommodations first at
  secondary sites).

**Who uses it:** providers own their caseloads. Site admins see the school's
students; district admins see across schools. SEAs view the students they
serve. Teachers see their own students who receive services.

### 2.6 Lesson planning & materials

Planning what happens inside each session, and generating the materials for
it.

- **Plan** — a lesson-planning calendar tied to the session schedule: what's
  being taught, to whom, on which day. (Elementary sites; hidden at secondary
  today.)
- Curriculum tracking (SPIRE, Reveal Math): record where each student is in
  the sequence, so instruction continues where it left off no matter which
  adult runs the session.
- Session documents: attach PDFs, links, and notes to a session or group.
- **AI-generated materials** 🔶: worksheets, lesson plans, exit tickets, and
  progress checks generated from a student's grade level and IEP goals, with
  a printable student page and a matching teacher plan; a saved-worksheet
  library for reuse; QR-code worksheet submission for scanning completed
  work back in. *Built, currently behind a feature flag pending rollout — the
  landing page should not advertise it until enabled.*

**Who uses it:** providers. SEAs view lessons and the daily plan for their
assigned sessions (deliberately view-only).

### 2.7 Progress monitoring & assessment

Evidence of progress toward goals, collected as a by-product of the work
instead of reconstructed the week before an IEP meeting.

- Exit tickets: short, goal-aligned checks after a session; grade responses
  as correct/incorrect/excluded.
- Progress checks: longer assessments across multiple skills with per-goal,
  per-question results.
- Progress dashboards: per-student trends by subject (reading, math, writing,
  spelling, phonics); improving / stable / needs-support flags.
- Attendance and session completion tracking, tied to the schedule that
  generated each session (elementary sites today).
- Session notes: what was taught, with which students — searchable when a
  parent meeting, re-eval, or caseload handoff needs it.

**Who uses it:** providers. Admins consume the rolled-up picture rather than
entering data.

### 2.8 Team coordination & communication

- SEA assignment: put an SEA on specific sessions; the SEA's dashboard shows
  exactly where to be and with whom. SEAs belong to the school, so any
  provider there can coordinate with them.
- Chat: built-in messaging between staff at the school — the scheduling
  conversation happens next to the schedule.
- Teacher portal: teachers see when their students are pulled and add their
  own class activities (Library day, field trips) that providers'
  conflict-detection respects.

### 2.9 Staff & account administration

Accounts are **created by admins** — there is no open self-signup, which is
part of the FERPA posture.

- Site admins: create teacher and staff accounts, manage the site's provider
  and staff directories, handle password-reset requests, resolve duplicate
  records.
- District admins: the same across every school — add, remove, and re-role
  users as people change buildings or leave; scope site admins to their
  schools.
- Role-based portals: every role listed in §1 lands in a view built for
  them, seeing only what their role needs.

### 2.10 Multi-school (itinerant) support

For providers who serve several buildings — common for SLPs, OTs, psychs, and
in charter networks and private-school learning-support teams.

- One login; switch schools in the header.
- A separate caseload and schedule per school; set which days you're at
  which site.
- The experience adapts per school (an elementary site and a middle school
  give that school's appropriate view, §1 Axis 2).

---

## 3. Matrix — feature group × role

✅ full use · 👁 view/oversight · ✏️ contributes · — not part of the role's view

| Feature group | District admin | Site admin | Provider | Teacher | SEA |
|---|---|---|---|---|---|
| Provider schedule building | 👁 | 👁 | ✅ | 👁 (their students) | 👁 (assigned sessions) |
| Master Schedule (bells, specials, yard duty) | 👁 | ✅ | ✏️ (can enter site data; consumes it) | ✏️ (own class activities) | — |
| IEP meeting calendaring 🗓️ | 👁 (planned) | ✅ rules + dashboard | ✅ planner + reschedule | ✏️ one-time availability; receives invites | — |
| Referral tracking (CARE) | 👁 across schools | ✅ oversight | ✅ works the queue | ✏️ submits + follows | 👁 |
| Student & caseload management | 👁 across schools | 👁 school-wide | ✅ | 👁 (their students) | 👁 (their students) |
| Lesson planning & materials | — | — | ✅ | — | 👁 view-only |
| Progress monitoring & assessment | 👁 | 👁 | ✅ | — | ✏️ (curriculum progress) |
| Team coordination & chat | — | ✅ | ✅ | ✅ | ✅ |
| Staff & account administration | ✅ district-wide | ✅ site | — | — | — |
| Multi-school support | ✅ (scope is the district) | — | ✅ | — | — |

---

## 4. Matrix — feature group × school level

The school's classification drives this, not the user's role. Admin columns
never change with level.

| Feature group | Elementary | Middle | High |
|---|---|---|---|
| Provider schedule building | ✅ | 🗓️ hidden today; period-based scheduling is the Middle/High module roadmap | 🗓️ same as middle |
| Master Schedule (site admin) | ✅ | ✅ | ✅ |
| IEP meeting calendaring | 🗓️ ✅ auto-assembles the team (single classroom teacher) | 🗓️ ✅ case manager picks the gen-ed teacher(s) | 🗓️ same as middle |
| Referral tracking (CARE) | ✅ | ✅ | ✅ |
| Student & caseload management | ✅ full, incl. sessions/minutes and attendance | 🔶 caseload-first: goals, accommodations, assessments; session/attendance fields hidden | 🔶 same as middle |
| Lesson planning & materials | ✅ (Plan calendar + materials) | 🔶 materials are grade-driven and work; the Plan calendar is hidden | 🔶 same as middle |
| Progress monitoring & assessment | ✅ | 🔶 goal-driven tools work; attendance widgets hidden | 🔶 same as middle |
| Team coordination & chat | ✅ | ✅ ("Case Manager" terminology; accommodations-first teacher view) | ✅ same as middle |
| Staff & account administration | ✅ | ✅ | ✅ |
| Multi-school support | ✅ | ✅ (per-school experience) | ✅ |

**Honest summary for the landing page:** elementary is the complete product;
middle/high is a solid caseload-management, meetings, and referral product
today, with period-based scheduling in active development. K-8 and K-12
campuses run the elementary experience.

---

## 5. Matrix — feature group × school type

| Feature group | Public district | Charter | Private / independent |
|---|---|---|---|
| Provider schedule building | ✅ | ✅ as-is | ✅ mechanics transfer directly to learning-support sessions |
| Master Schedule (site admin) | ✅ | ✅ as-is | ✅ as-is (bell schedules and specials exist everywhere) |
| IEP meeting calendaring | 🗓️ | 🗓️ as-is (charters run IEPs) | 🔶 reframed: support-plan / family meetings — same engine, no IDEA clock |
| Referral tracking (CARE) | ✅ both lanes, incl. the private-school referral intake **received by the district** | ✅ both lanes | 🔶 discussion lane fits (internal concern → learning-support review); the statutory compliance lane doesn't apply |
| Student & caseload management | ✅ IEP-organized | ✅ IEP-organized | 🔶 the goal/accommodation/minutes mechanics fit **support plans**; IEP-specific fields (triennials, IDEA categories) don't apply |
| Lesson planning & materials | 🔶 (AI flag) | 🔶 same | 🔶 same — grade-driven, not school-type-driven |
| Progress monitoring & assessment | ✅ | ✅ | ✅ goal-indexed progress works for any plan's goals |
| Team coordination & chat | ✅ | ✅ | ✅ (learning specialists + classroom teachers) |
| Staff & account administration | ✅ district → school hierarchy | 🔶 works; a charter that is its own LEA is modeled as a one-school "district" today (SELPA labeling on the roadmap) | 🗓️ requires the standalone-school org model — today every school must sit under a district |
| Multi-school support | ✅ | ✅ (fits CMO networks well) | ✅ (itinerant learning specialists across campuses) |

**Type-by-type read:**

- **Public district.** The built-for environment. District hierarchy, admin
  oversight, SEIS import, CARE's statutory clocks, and the IEP data model all
  assume it.
- **Charter.** Same product in practice — charters are public schools running
  IEPs — with the *buyer* being the school or network rather than a district
  office. In California, Speddy runs **alongside SEIS** (SEIS writes the IEP
  and handles state reporting; Speddy schedules and manages the providers and
  the day-to-day delivery — and imports the SEIS export to onboard). Two
  honest caveats: many charters are 6-12/K-12, so the §4 secondary caveats
  apply; and a charter that is its own LEA is representable today but slightly
  awkwardly (a one-school district).
- **Private / independent.** Speddy fits the school's **own learning-support
  program**: scheduling the learning specialists, managing support/
  accommodation plans, tracking sessions and progress, and giving teachers
  visibility — the exact mechanics above, minus the IDEA compliance layer
  (which belongs to the local public district, not the private school). Two
  things stand between "conceptually valid" and "onboardable": the org model
  (a private school currently has to be attached to a district record) and
  IEP-centric labels in the UX. Both are bounded adaptations, identified in
  the market research, not rebuilds. Until then, private schools appear in
  Speddy mainly from the **district side** — as a referral source in CARE's
  compliance lane.

---

## 6. Implications for the landing-page toggle

What this document supports deciding (kept as observations, not a design):

1. **Role is the primary toggle.** Three audiences map to three genuinely
   different pitches and screenshots: **District admin** (visibility +
   access control, zero data entry), **Site admin** (structural setup +
   master schedule + meeting rules), **Provider** (the day-to-day
   everything). This extends the current two-way toggle by splitting "Admin"
   into district vs site — which the product itself already does (§1).
2. **School type reads better as a secondary selector or section, not a
   third toggle dimension.** Public and charter share nearly all content
   (charter needs different *buying* language — "no district sign-off
   needed; runs alongside SEIS" — not different features). Private is the
   genuinely different story (learning-support program, no IEP language) and
   is 🗓️ until the org-model work lands — worth a "for independent schools"
   section that sets expectations rather than a full equal toggle today.
3. **School level is content, not a toggle.** The honest line: complete for
   elementary; caseload, referrals, and IEP meetings for middle/high with
   secondary scheduling in development. A toggle option that leads to a
   thinner page would undersell; a note inside each role's view doesn't.
4. **Teachers, SEAs, and parents are supporting cast on every view** — "and
   your teachers/SEAs/families get…" — rather than toggle audiences; none of
   them is the buyer.
5. **Two capabilities need status care in marketing:** AI material
   generation (flag-gated; don't advertise until enabled) and IEP meeting
   calendaring (site setup shipped; planner in review; family confirmation
   planned — "rolling out" is the accurate framing).

---

## Sources

- `docs/ARCHITECTURE.md` — roles, portals, elementary/secondary split, CARE
  model, scheduling model.
- `docs/speddy-feature-overview.md` — provider feature inventory.
- `docs/IEP_MEETING_SCHEDULING_SPEC.md` + PRs #684/#685 (merged), #686 (in
  review) — Meetings status and personas.
- `docs/research/2026-07-private-charter-school-market.md` (PR #677, in
  review) — charter/private fit-gap and structural analysis.
- `app/components/navigation/navbar.tsx` — per-role navigation;
  `app/(dashboard)/dashboard/admin/master-schedule/` — Master Schedule scope
  (bells, specials, yard-duty zones, rotations, year toggle);
  `app/components/landing/clean-landing.tsx`, `how-it-works-page.tsx` — the
  current toggle and persona framing this document feeds.
