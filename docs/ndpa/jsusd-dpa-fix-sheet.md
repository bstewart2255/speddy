# Fix Sheet — JSUSD Interim CA-NDPA Draft (`SpeddyJSUSD_CANDPA_v1.5_DRAFT.pdf`)

Corrections to the Claude-chat-drafted **CA-NDPA Standard v1.5** fill for
**John Swett Unified School District ↔ Orchestrate LLC** (27-page PDF,
reviewed 2026-07-28). Cross-checked field-by-field against the repo's legal
corpus: `ca-ndpa-execution-packet.md` (the source of truth for every fill),
`data-inventory.md`, `security-framework-mapping.md`,
`attorney-review-brief.md`, and `docs/pilots/john-swett-unified.md`.

> **Internal doc — do not send to the district.** Not legal advice; items
> marked **[ATTORNEY]** go to counsel with the attorney review brief.
>
> **How to apply:** each fix gives the PDF page (matches the printed footer
> numbers), the row label as it appears on the form, and the internal
> AcroForm field name in `code` — usable in any PDF editor, or
> programmatically, or hand this file + the original PDF back to Claude
> chat with the instruction: *"Apply the edits in §§1–6 of this fix sheet
> exactly; change nothing else."*

---

## 1. Exhibit F — replace the security-program paragraph (p. 21, field `Text94`) — **must fix**

The drafted paragraph claims **"multi-factor authentication for
administrative access"** (Speddy offers no MFA — the claim was deliberately
removed from the privacy page during NDPA prep, execution packet Gap 10) and
**"audit logging and monitoring"** (student-data audit logging is not built —
SPE-169 Backlog; `security-framework-mapping.md` lists it as the most
material gap). This field is a contractual representation; it must describe
only real controls (the SPE-134 principle).

**Replace the entire field with:**

> Provider has designated the NIST Cybersecurity Framework (CSF) Version 1.1
> as its Cybersecurity Framework under Article V §3 and maintains a written
> self-assessment mapping its controls to the CSF core functions, available
> to the LEA on request. Implemented safeguards include: administrator-
> provisioned accounts (no self-registration); role-based, least-privilege
> access control enforced by PostgreSQL Row-Level Security on every
> application table; encryption of Student Data in transit (TLS 1.2+) and at
> rest (AES-256); private storage buckets with short-lived signed URLs for
> student work images; revocable hashed API keys for Provider's browser
> extension; automatic inactivity logout; sign-in event logging;
> PII-minimized error monitoring; enforced data-retention limits with
> documented deletion and offboarding procedures; automated backups with
> point-in-time recovery; secure development practices including server-side
> input validation and dependency auditing; written data-processing
> agreements with Subprocessors (register available on request); and a
> documented incident response plan providing 72-hour breach notification to
> the LEA consistent with Article V §4.

**Prerequisite for this paragraph:** the subprocessor-agreements sentence
must be true when the corrected PDF leaves the building. OpenAI, Anthropic,
Help Scout, and Vercel (Pro since 2026-07-28) are in place; the **Supabase
DPA signing and Sentry DPA acceptance (§8 item 2) must be completed before
sending** — they are two self-serve click-throughs, not negotiations.

---

## 2. Exhibit B — Schedule of Data corrections (pp. 11–16) — **must fix**

The draft checks data we don't collect and omits sensitive data we do.
Basis for every line: `data-inventory.md` (verified against the live schema).
All checkboxes below are in the first column ("ALL DPA-COVERED APPS").

### 2a. UNCHECK — elements Speddy does not collect

| Pg | Row (category — element) | Field | Why |
|---|---|---|---|
| 11 | Assessment — Observation data | `Check Box60` | **[ATTORNEY]** Decided framing (brief item 4b): leave unchecked; provider notes are disclosed under "Other" (§2c below). |
| 12 | Demographics — Gender | `Check Box93` | Not collected (no race/ethnicity/gender). |
| 12 | Demographics — Language information | `Check Box95` | Not collected. |
| 13 | Parent/Guardian Contact — Address | `Check Box182` | No parent/guardian contact information collected. |
| 13 | Parent/Guardian Contact — Email | `Check Box189` | Same. |
| 13 | Parent/Guardian Contact — Phone | `Check Box196` | Same. |
| 13 | Special Indicator — English language learner information | `Check Box231` | Not collected. |
| 14 | Student Contact Information — Address | `Check Box280` | No student contact info collected. |
| 14 | Student Identifiers — Local (school district) ID number | `Check Box289` | Not collected. Speddy's UUID is the "Provider/app assigned" row (already checked); the SEIS SSID is the "State ID" row. |

**Keep checked: Parent/Guardian Name (p. 13, `Check Box216`).** The draft
has this one right — confirmed in code during review: Lane B
(parent-written-request) CARE referrals collect the requesting
parent/guardian's **name and relationship**
(`care_referrals.requested_by`, migration
`20260516_care_lane_b_compliance.sql`; entered in
`add-referral-modal.tsx`). The June data-inventory sweep missed this
column — now corrected in `data-inventory.md`. The CARE specify text in
§2b discloses it. (Caught by Codex review on PR #788.)

### 2b. CHECK — elements Speddy does collect that the draft missed

| Pg | Row (category — element) | Field | Specify text (field) |
|---|---|---|---|
| 11 | Application Technology Meta Data — Other | `Check Box8` | In `Text448`: *"Browser user agent, device type, and product-usage event metadata (event type, timestamps, processing time, error codes)."* |
| 11 | Assessment — Standardized test scores | `Check Box28` | — (mClass, STAR, WISC-V, BRIEF etc. in `student_assessments`) |
| 13 | Special Indicator — Other indicator information | `Check Box237` | In `Text476` (top of p. 14): *"Special-education referral and eligibility-process records: referral reason and source; academic/speech/psych/OT testing dates and completion status; eligibility meeting dates and outcomes; SST notes links; and, for parent/guardian-initiated (Lane B) referrals, the requesting parent/guardian's name and relationship."* |
| 15 | Student Work — Student generated content | `Check Box358` | — (scanned worksheet images in Supabase Storage) |
| 15 | Student Work — Other student work data | `Check Box359` | In `Text483`: *"Documents uploaded by providers that may pertain to students (e.g., rosters, IEP-related documents); generated worksheets/lessons associated with students."* |

The CARE/eligibility line (row 3) is the one `data-inventory.md` calls
"among the most sensitive data here" — it must not be omitted.

### 2c. REVISE — existing text fields

**p. 11, `Text455`** (Assessment — Other, currently only IEP-goal progress).
Replace with:

> Curriculum-based and informal assessment results (exit tickets, progress
> checks), IEP-goal progress data (including trial data and percent
> accuracy), and derived performance metrics (accuracy, error patterns,
> performance levels).

**p. 16, `Text504`** (Other data collected — currently IEP-records text that
duplicates rows already checked, and misses what actually belongs here).
Replace with:

> Provider-authored session/progress notes and CARE meeting notes/action
> items (free text about students); student absence reasons; derived AI
> analysis of submitted student work (populated only if AI features are
> enabled — currently disabled platform-wide). Note re "State ID number"
> above: the SEIS ID (SSID) is read by Provider's Chrome extension solely
> for discrepancy detection and cached only in the provider's local browser
> storage (7-day TTL; cleared on logout or API-key revocation); it is never
> stored on Provider's servers.

The final sentence carries the SEIS-cache disclosure the attorney brief
(item 4d) attaches to the checked "State ID number" row (`Check Box290` —
keep checked).

### 2d. Verify / at execution

- "None — no student data collected" (`Check Box435`, p. 16) stays
  **unchecked** (it is in the draft — keep it that way).
- Exhibit A completion checkbox (`Check Box82`, p. 10) is currently
  unchecked — tick at execution after counsel review.

---

## 3. Exhibit A — replace the services description (p. 10, field `Text80`) — **must fix**

The drafted description covers scheduling, IEP goal tracking, session
logging, and SEIS sync only — omitting worksheets/grading (student work
images), assessments and progress checks, curriculum tracking, and the
entire CARE/eligibility module. Article IV §2 scopes authorized data use to
the services described here, so under-description narrows our own
permission. It also says "synchronization … between the Services and …
SEIS," which reads as two-way; the extension is read-only (writes nothing
back to SEIS). **Replace the entire field with the decided text (execution
packet §2):**

> Speddy (speddy.xyz), operated by Orchestrate LLC, is a web-based platform
> for K-12 special-education service providers (resource specialists,
> speech-language pathologists, occupational therapists, counselors, and
> special-education assistants) and school/district administrators. The
> Services include: caseload management for students receiving
> special-education services; IEP goal and accommodation tracking; service
> scheduling (sessions, bell schedules, special activities); session
> attendance and service documentation; progress monitoring (assessments,
> exit tickets, progress checks, IEP-goal progress); curriculum tracking;
> creation, storage, and grading of instructional materials and student
> worksheets (including scanned images of student work); student support /
> CARE-team referral and special-education eligibility-process tracking; and
> school staff/scheduling administration. The Services include a companion
> Chrome browser extension that, with the provider's authorization, reads
> student records from the LEA's SEIS (California Special Education
> Information System) account to detect discrepancies between SEIS and
> Speddy records; the extension sends data to Speddy and writes nothing back
> to SEIS. AI-assisted generation features exist in the codebase but are
> disabled platform-wide as of the Effective Date (see Exhibit G).

Keep `Text81` ("None. All current and future Provider Services are covered
by this DPA.") as is.

---

## 4. Exhibit G free-text fields (p. 23, fields `Text1`, `Text2`) — recommended **[ATTORNEY]**

The drafted answers are accurate but thinner than the decided versions
(execution packet §4; attorney brief item 3 already asks counsel to bless
them). Replace both — and note `Text1`'s parenthetical otherwise repeats
Exhibit A's too-narrow service list.

**`Text1` — "Describe how Student Data is Used":**

> Student Data is used solely to provide the Services described in Exhibit
> A: scheduling and documenting special-education services; tracking IEP
> goals, accommodations, attendance, and student progress; storing and
> grading student work; and supporting the LEA's special-education referral
> and eligibility workflows. Student Data is not used for targeted
> advertising or profiling, is never sold, and is not used to train AI
> models. As of the Effective Date, no Student Data is processed by any
> artificial-intelligence system: Speddy's AI-assisted features are disabled
> platform-wide by a server-side feature gate, and the associated routes are
> inoperative.

**`Text2` — "Any other information related to Provider's use of AI":**

> Speddy has developed, but has not enabled, optional AI-assisted features
> (lesson, exit-ticket, and progress-check generation; worksheet-image
> grading; document parsing) that would use OpenAI and Anthropic as
> subprocessors. These features are disabled by a platform-level kill switch
> and currently transmit zero data to either provider. Data-processing
> agreements with both providers are executed and on file; both prohibit
> training on customer data. Before enabling any AI feature, Provider will
> (a) apply prompt de-identification, (b) request zero-data-retention
> handling from the AI providers, and (c) provide advance notice to the LEA
> pursuant to Exhibit G § 4.1 and submit an updated AI Schedule of Data
> pursuant to § 4.2.

If counsel prefers the shorter drafted `Text2` (less affirmative
commitment), that's a defensible call — but make it consciously, not by
default.

---

## 5. Exhibit H (p. 27) — keep the interim/supersession concept, with two flags **[ATTORNEY]**

The chat-added Exhibit H (interim bilateral DPA, auto-superseded by the
CITE/CSPA execution) is a sound idea and mostly well drafted (survival of
accrued obligations; no data-disposition trigger on supersession; correct
Art. VII §3 precedence). Two things for counsel:

**(a) General Offer continuity.** Exhibit E binds Provider to Subscribing
LEAs "for the term of the DPA between the [Originating LEA] and the
Provider" — and Exhibit H deliberately cuts that term short at supersession.
Proposed addition to Exhibit H §2 (counsel to approve or redraft):

> (c) any Subscribing LEA that has accepted Provider's General Offer of
> Privacy Terms (Exhibit "E") under this DPA shall, from the date of
> supersession, have the benefit of the Successor Agreement's privacy terms
> (or, at the Subscribing LEA's option, may execute the Successor
> Agreement's General Offer), so that no Subscribing LEA's protections lapse
> by reason of the supersession.

**(b) The variance slot.** Article V §3 says cybersecurity-framework
exclusions/variances "must be detailed in an attachment to Exhibit H" — the
official v1.5 form has no Exhibit H page (open CITE question, SPE-172), and
this draft now occupies the slot with interim terms while Exhibit F (§1
above) previously papered over the gaps. If counsel prefers disclosure over
silence (attorney brief item 5), attach:

> **Attachment 1 to Exhibit H — Cybersecurity Framework variances (Article V
> §3).** Provider's designated framework is NIST CSF 1.1. Current variances,
> tracked to remediation: (1) application-level audit logging of individual
> student-record access/modification is in development (authentication,
> row-level security, and sign-in event logging are in place today); (2) no
> formal third-party penetration test has been performed (infrastructure
> subprocessors maintain SOC 2 Type II attestations); (3) SSO/MFA is not
> currently offered for LEA user accounts; accounts are
> administrator-provisioned with password-complexity and inactivity-timeout
> controls.

---

## 6. Small items

- **Signer title** appears as "Owner/Managing Member" (pp. 3, 20, 23, 27).
  Our records use "Owner" (packet decision 2); "Owner/Managing Member" is
  also accurate for a single-member LLC. Standardize on one everywhere —
  counsel confirms with brief item 7. Cosmetic.
- **Phone number** (510) 256-9748 is baked into p. 3. Still-open decision
  (packet decision 3): a dedicated business line before signing — this
  number goes to every subscribing district for 3 years.
- **Cover-page state-law blank** (p. 2, after "applicable state privacy laws
  and regulations ___") is unfilled. Counsel supplies if the form allows —
  expected: SOPIPA (Cal. B&P Code §§ 22584–22585) and Cal. Ed. Code
  § 49073.1 (brief item 6). Exhibit H already recites § 49073.1.
- **Exhibit E date** (p. 20, "which is dated ___") — fill at execution.

## 7. Correct as drafted — change nothing

Parties, addresses, and JSUSD details; the Standard Clauses (v3.0,
unmodified); cover-page boxes (Exhibit G incorporation `Check Box76`,
Exhibit E signed `Check Box77` — both match decided positions); GOPT inbox
help@speddy.xyz; the AI Addendum (all type/purpose/data tables unchecked,
"No AI used at this time" marked, final confirmation checked — Decision 5
exactly); NIST CSF designation; 3-year term; and these correctly checked
Exhibit B rows: IP addresses/cookies, application-use statistics, class
attendance (not daily), conduct/behavioral (limited), date of birth,
school enrollment, grade level, curriculum programs, scheduled courses,
teacher names, disability information, IEP/504 services, provider-assigned
ID, State ID (with §2c note), student name, parent/guardian name (limited —
Lane B CARE requester, see §2a note), in-app performance, "Other data
collected."

## 8. Pre-signing checklist (state as of 2026-07-28)

1. ✅ **Vercel Hobby → Pro — upgraded 2026-07-28** (owner-confirmed). The
   Vercel DPA (incorporated via ToS for Pro) now applies. Remaining
   housekeeping (SPE-173): save a copy of vercel.com/legal/dpa to the
   records file; sanity-check the two daily crons on Pro.
2. ☐ Sign the Supabase DPA (dashboard → Organization → Legal Documents);
   accept the Sentry DPA (Settings → Legal & Compliance). ~15 min total.
   **Prerequisite for the Exhibit F representation in §1 — do before the
   corrected PDF is sent anywhere.**
3. ☐ Apply §§1–6 above to the PDF, then send to counsel with
   `attorney-review-brief.md` (its enclosure list) + this fix sheet.
4. ☐ SPE-172 — CITE Exhibit H question; now more relevant since this draft
   defines an Exhibit H.
5. ☐ Business-phone-line decision (§6).
6. ☐ Verify Vercel env `CRON_SECRET` + `CLEANUP_ANALYTICS=true` and first
   cron runs (packet Gap 12) — the retention TTLs we represent depend on it.
7. At execution: signatures + dates, Exhibit A completion box
   (`Check Box82`), Exhibit E date.

_Related: SPE-59 (NDPA master), SPE-169 (audit logging), SPE-172 (Exhibit
H), SPE-173 (Vercel Pro), SPE-174 (AI-enablement obligations)._
