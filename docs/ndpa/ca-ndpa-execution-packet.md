# CA-NDPA (CITE / CSPA) Execution Packet — Speddy

Working packet for executing the **California Student Data Privacy Agreement,
CA-NDPA Standard, Version 1.5 (01.28.25)** via CITE / the California Student
Privacy Alliance. Companion to `data-inventory.md`, `subprocessors.md`,
`offboarding-runbook.md`, and `speddy-technical-security-overview.md`.
Tracked in SPE-59.

> **Not legal advice.** Everything here is drafted from the repo docs and the
> live database schema (project `qkcruccytmmdajfavpgb`, verified 2026-06-12).
> The full packet must be reviewed by FERPA/COPPA counsel before signature —
> items needing attorney/DPO review are marked **[ATTORNEY]** / **[DPO]**.
> Open inputs are marked **[NEEDED]**.

The fillable PDF is 23 pages: cover + preamble (pp. 1–3), Standard Clauses
v3.0 (pp. 4–9), Exhibit A (p. 10), Exhibit B (pp. 11–13), Exhibit C (pp.
14–15), Exhibit D (p. 16), Exhibit E (p. 17), Exhibit F (p. 18), Exhibit G +
AI Addendum (pp. 19–23). There is **no Exhibit H page** in this version even
though the Standard Clauses reference one (Art. V §3, Art. VII §3) — see Gap 7.

---

## 1. Field-by-field map

### Cover page / preamble (p. 2)

| Field | What goes there | Source |
|---|---|---|
| LEA name + address | Filled by the district | — |
| Provider name + address | **Orchestrate LLC** + registered business address **[NEEDED]** | `app/privacy/page.tsx` §1, §14 ("Orchestrate LLC"); address not in repo |
| Blank after "applicable state privacy laws and regulations ___ and" | Likely pre-printed in the locked CA form; if fillable, counsel supplies (e.g., SOPIPA — Cal. B&P Code §§ 22584–22585; Cal. Ed. Code § 49073.1 / AB 1584) **[ATTORNEY]** | NDPA cover; confirm in the live PDF |
| ☑ Exhibit G (Supplemental State Terms) | Checked — mandatory for the CA version (appears pre-checked in the locked form) | NDPA p. 2 §2 |
| ☐/☑ Exhibit E (General Offer of Privacy Terms) | **Decision 4** — recommend checking (the CSPA model: one signature, other LEAs subscribe) | NDPA p. 2 §2 |

### Designated representatives + signatures (p. 3)

| Field | What goes there | Source |
|---|---|---|
| LEA designated rep | District fills | — |
| Provider designated rep: name, title, address, phone, email | **[NEEDED]** — note this contact doubles as the **data-security contact** the LEA may use (Art. V §3) | Decision 3; resolve the `@speddy.xyz` vs `@speddy.com` email discrepancy (privacy page vs `speddy-technical-security-overview.md` §13) |
| Provider signature block (By / Date / Printed Name / Title) | Authorized signer of Orchestrate LLC **[NEEDED]** | Decision 2 |

### Standard Clauses — commitments we are signing up to (no blanks, but verify)

| Clause | Commitment | Our position | Source |
|---|---|---|---|
| Art. II §2 (+ Ex. G ¶2) | Parent access/correction via the LEA within **45 days** | Supported operationally — requests routed through the district; deletion tooling exists | `offboarding-runbook.md` §A |
| Art. II §5 | **Written agreements with all subprocessors**, no less stringent | OpenAI, Anthropic, Help Scout DPAs on file; **Supabase / Vercel / Sentry DPA copies not yet documented** — Gap 5 | `subprocessors.md` |
| Art. IV §6 / Art. VII §2 | Dispose of Student Data within **60 days** of written request; destroy on termination | Supported: per-student cascade delete + Storage cleanup, provider/account deletion, district offboarding runbook, extension-cache TTL/clear | `offboarding-runbook.md` (SPE-143, PR #655) |
| Art. V §1 | US data storage where required; list of storage locations on request | Supabase project region **us-west-1 (N. California)** — verified 2026-06-12; Vercel function region configurable; Sentry US ingest | `subprocessors.md`; live project settings |
| Art. V §2 | Annual LEA audit right (10 business days' notice + NDA) | Acceptable; no tooling needed | — |
| Art. V §3 | Implement a Cybersecurity Framework from Exhibit F; variances detailed in an attachment to Exhibit H | **No framework formally designated today** — Decision 6 / Gap 7 | `speddy-technical-security-overview.md` §7–9 |
| Art. V §4 | Breach notice to LEA within **72 hours** of confirmation; **written incident-response plan** available on request | 72h matches our stated commitment; standalone written IR plan **not confirmed to exist** — Gap 6 | `speddy-technical-security-overview.md` §10 |
| Art. IV §7 / Ex. G ¶4 | No targeted advertising, no profiling, no sale, no AI training on Student Data | True today; AI hard-gated off; provider DPAs prohibit training | `subprocessors.md` (SPE-162, SPE-163) |
| §4 of preamble | DPA term: **3 years**; Exhibit E expires 3 years from signature | Calendar it | NDPA p. 2 §4 |

### Exhibit A — Description of Services (p. 10)

Fields: services description, excluded-services box, completion checkbox.
Draft text in §2 below. Recommend **no exclusions** (the form covers all
current and future services by default, including the Chrome extension).

### Exhibit B — Schedule of Data (pp. 11–13)

Full element-by-element draft in §3 below. Sources: `data-inventory.md`
(verified against live schema 2026-06-12).

### Exhibit C — Definitions (pp. 14–15)

No input required. Note the broad Student Data definition explicitly includes
special education data and metadata.

### Exhibit D — Disposition of Data (p. 16)

**Do not fill at execution** — the form itself says so. Used later when an
LEA issues a disposition directive. Our tooling supports both "destruction"
and (pending SPE-60) "transfer" dispositions — `offboarding-runbook.md`.

### Exhibit E — General Offer of Privacy Terms (p. 17)

| Field | What goes there | Source |
|---|---|---|
| Originating LEA name + DPA date | The first district that signs; filled at execution | — |
| Email where Subscribing LEAs send signed Exhibit E | Stable role address **[NEEDED]** (Decision 4; e.g. `legal@…` or `help@speddy.xyz`) | — |
| PROVIDER / BY / Printed Name / Title / Date | Orchestrate LLC + signatory | Decision 2 |
| Subscribing LEA section | Leave blank (future LEAs fill) | — |

### Exhibit F — Data Security Requirements (p. 18)

A list of acceptable frameworks (NIST CSF 1.1, NIST 800-53/800-171, ISO
27000-series, SCF, CIS Controls, CMMC). No blanks, but Art. V §3 makes
"implement an adequate Cybersecurity Framework based on one of" them a
contractual promise → Decision 6.

### Exhibit G — CA Supplemental Terms + AI Addendum (pp. 19–23)

| Field | What goes there | Source |
|---|---|---|
| LEA / Provider names + addresses | Same as cover page | — |
| "Describe how Student Data is Used" | Draft in §4 below | `data-inventory.md`, `subprocessors.md` |
| "Any other information related to Provider's use of AI" | Draft in §4 below (planned/not-enabled disclosure) | `subprocessors.md` (SPE-162/163) |
| Exhibit G signature blocks | Same signatory as cover | — |
| AI Addendum: Type of AI / Purpose / Student Data tables | Leave all unchecked; check **"No AI used at this time"** (Decision 5) | AI hard-gated off — `subprocessors.md` |
| Final "All requested AI Elements…" checkbox | Check after review | — |

Exhibit G obligations to remember when AI is eventually enabled: notice to
LEAs (¶4.1), updated AI Schedule of Data (¶4.2), hallucination-rate
monitoring (¶4.1), bias-audit summaries on request (¶8 amendment), AI
content in student-generated-content ownership (¶2).

---

## 2. Draft — Exhibit A: Description of Services

> Speddy (speddy.xyz), operated by Orchestrate LLC, is a web-based platform
> for K–12 special-education service providers (resource specialists,
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

Excluded services: **none**.

## 3. Draft — Exhibit B: Schedule of Data

Check exactly these; leave everything else unchecked.

| Category | Element | Check? | Basis (live schema verified 2026-06-12) |
|---|---|---|---|
| Application Technology Meta Data | IP Addresses of users, Use of cookies, etc. | ☑ | `sign_in_logs.ip_address`, `analytics_events`; first-party auth cookies — `data-inventory.md` §C |
| Application Technology Meta Data | Other—specify | ☑ "Browser user agent, device type, and product-usage event metadata (event type, timestamps, processing time, error codes)" | `data-inventory.md` §C |
| Application Use Statistics | Meta data on user interaction | ☑ | `analytics_events` |
| Assessment | Standardized test scores | ☑ | `student_assessments` (mClass, STAR, WISC-V, BRIEF…) — `data-inventory.md` §A |
| Assessment | Observation data | ☐ (provider notes disclosed under "Other" below) **[ATTORNEY]** | `data-inventory.md` §A Communications row |
| Assessment | Other—specify | ☑ "Curriculum-based and informal assessment results (exit tickets, progress checks), IEP-goal progress data, and derived performance metrics (accuracy, error patterns, performance levels)" | `exit_ticket_results`, `progress_check_results`, `iep_goal_progress`, `manual_goal_progress`, `student_performance_metrics` |
| Attendance | Student class attendance data | ☑ (session attendance only — not daily school attendance) | `attendance`, `schedule_sessions` |
| Communications | Online communications captured | ☐ — no student communications are captured **[ATTORNEY]** | `data-inventory.md` §A |
| Conduct | Conduct or behavioral data | ☑ (limited: behavior-area IEP goals; CARE referral reasons) | `student_details.iep_goals`, `care_referrals.referral_reason` |
| Demographics | Date of Birth | ☑ | `student_details.date_of_birth` |
| Demographics | Place of birth / Gender / Ethnicity / Language / Other | ☐ — not collected | `data-inventory.md` §A |
| Enrollment | Student school enrollment | ☑ | `students.school_id/district_id`, `schools`, `districts` |
| Enrollment | Student grade level | ☑ | `students.grade_level` |
| Enrollment | Specific curriculum programs | ☑ (SPIRE / Reveal Math curriculum tracking) | `curriculum_tracking` |
| Enrollment | Homeroom / Guidance counselor / Year of graduation / Other | ☐ | — |
| Parent/Guardian Contact, ID, Name | all | ☐ — not collected | `data-inventory.md` §A |
| Schedule | Student scheduled courses | ☑ (special-education service sessions: day/time, service type, group) | `schedule_sessions`, `bell_schedules`, `special_activities` |
| Schedule | Teacher names | ☑ | `students.teacher_name`, `teachers` |
| Special Indicator | Student disability information | ☑ | `care_cases.eligibility_category/outcome`, `student_details` |
| Special Indicator | Specialized education services (IEP or 504) | ☑ | `student_details.iep_goals/accommodations`, IEP/triennial dates, service minutes |
| Special Indicator | Other—specify | ☑ "Special-education referral and eligibility-process records: referral reason/source, academic/speech/psych/OT testing dates and completion status, eligibility meeting dates and outcomes, SST notes links" | `care_referrals`, `care_cases` — `data-inventory.md` §A note 2 |
| Special Indicator | ELL / low income / medical-health / living situations | ☐ — not collected | `data-inventory.md` §A |
| Student Contact Information | all | ☐ — not collected | `data-inventory.md` §A |
| Student Identifiers | Provider/App assigned student ID | ☑ (internal UUID) | `students.id` |
| Student Identifiers | State ID number | ☑ with note: "SEIS ID (SSID) is read by the Speddy Chrome extension for discrepancy detection and cached only in the provider's local browser storage (7-day TTL; cleared on logout or API-key revocation). It is never stored on Speddy servers." **[ATTORNEY]** | `data-inventory.md` §A + "Client-side storage"; `offboarding-runbook.md` |
| Student Identifiers | Local district ID / app username / app passwords | ☐ — students have no app accounts | `data-inventory.md` §A |
| Student Name | First and/or Last | ☑ (full names optional, provider-entered; initials are the core identifier; CARE referrals carry full names) | `student_details.first_name/last_name`, `students.initials`, `care_referrals.student_name` |
| Student In App Performance | Program/application performance | ☑ | `worksheet_submissions` (accuracy %, skills assessed) |
| Student Program Membership | activities | ☐ (instructional service grouping is covered under Schedule) **[ATTORNEY]** | — |
| Student Survey Responses | — | ☐ | `data-inventory.md` §A |
| Student work | Student generated content | ☑ | `worksheet_submissions.image_url` (scanned worksheet images), `worksheets`, `saved_worksheets` |
| Student work | Other—specify | ☑ "Documents uploaded by providers that may pertain to students (e.g., rosters, IEP-related documents); generated worksheets/lessons associated with students" | `documents` |
| Transcript | all | ☐ — grade level only; no course grades/GPA | `data-inventory.md` §A |
| Transportation | all | ☐ | — |
| Other | Please list | ☑ "Provider-authored session/progress notes and CARE meeting notes/action items (free text about students); student absence reasons; derived AI analysis of submitted student work (populated only if AI features are enabled — currently disabled)" | `schedule_sessions.session_notes`, `care_meeting_notes`, `care_action_items`, `attendance.absence_reason`, `worksheet_submissions.ai_analysis` |
| None | — | ☐ | — |
| Final review checkbox | — | ☑ after counsel sign-off | — |

Context the form has no row for (include in the cover note to districts, not
Exhibit B): Speddy also processes **educator/provider PII** (name, email,
role, school; teacher phone/classroom; provider sign-in IP/user agent) —
`data-inventory.md` §B. Exhibit B is student data only.

## 4. Draft — Exhibit G free-text fields

**Describe how Student Data is Used:**

> Student Data is used solely to provide the Services described in Exhibit A:
> scheduling and documenting special-education services; tracking IEP goals,
> accommodations, attendance, and student progress; storing and grading
> student work; and supporting the LEA's special-education referral and
> eligibility workflows. Student Data is not used for targeted advertising or
> profiling, is never sold, and is not used to train AI models. As of the
> Effective Date, no Student Data is processed by any artificial-intelligence
> system: Speddy's AI-assisted features are disabled platform-wide by a
> server-side feature gate, and the associated routes are inoperative.

**Any other information related to Provider's use of AI:**

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

**AI Addendum tables:** check only **"No AI used at this time"** (with its
built-in commitment to notify the LEA immediately if that changes), then the
final confirmation checkbox. (Decision 5.)

## 5. Draft — Subprocessor disclosure (attachment / on-request)

The CA-NDPA v1.5 has **no subprocessor exhibit**, but Art. II §5 obligates
written agreements with all of them and districts routinely request the list.
Source: `subprocessors.md` (last reviewed 2026-06-11).

| Subprocessor | Function | Student data | Location | Agreement |
|---|---|---|---|---|
| Supabase | Database, auth, file storage — system of record | Yes — all categories in Exhibit B | US (us-west-1, N. California) | DPA **[NEEDED — confirm on file]** |
| Vercel | Application hosting; traffic + runtime logs | Yes — in transit and incidentally in logs | US-configurable | DPA **[NEEDED — confirm on file]** |
| Sentry | Error monitoring, minimized (no logs/replay, PII scrubbed, `sendDefaultPii: false`) | Incidental only | US ingest | DPA **[NEEDED — confirm on file]** |
| Help Scout | Support help desk + chat widget | No by design (provider PII only) | US | DPA v2 via ToS; DPF + SCCs (SPE-170, on file) |
| OpenAI — **planned, NOT enabled** | AI lesson generation (when enabled) | None today (hard-gated off); initials + IEP goal text when enabled | US | DPA executed 2026-06-12 (SPE-163) |
| Anthropic — **planned, NOT enabled** | AI generation/grading/parsing (when enabled) | None today (hard-gated off) | US | DPA via Commercial Terms, copy on file 2026-06-12 (SPE-163) |

Not subprocessors: **SEIS** (data source the extension reads from, not a
recipient); **Resend** (inbound-email webhook disabled by default; initials
only when active); Supabase Auth transactional email.

---

## 6. Gaps & decisions (need your input — don't sign without resolving)

1. **[NEEDED] Legal entity details** — exact registered name ("Orchestrate
   LLC"?), state of formation, principal business address. Cover page,
   Exhibit E, Exhibit G.
2. **[NEEDED] Authorized signatory** — name + title for three signature
   blocks (DPA, Exhibit E, Exhibit G).
3. **[NEEDED] Designated representative / security contact** — name, title,
   address, phone, email (doubles as the Art. V §3 security contact).
   **Email-domain conflict:** the privacy page uses `help@speddy.xyz`; the
   security overview §13 lists `security@/support@/legal@speddy.com`. Pick
   real, monitored addresses and fix the stale doc.
4. **GOPT (Exhibit E)** — sign or not, and which inbox receives subscribing
   LEAs' signed Exhibit E. Recommend signing: it's the CSPA scaling
   mechanism. Note Exhibit E expires 3 years after signature. **[ATTORNEY]**
5. **AI Addendum stance** — recommend "No AI used at this time" + the §4
   planned-use narrative (accurate today; obligates notice + updated AI
   schedule before enabling). Alternative (pre-disclosing AI use now)
   misstates current processing. **[ATTORNEY]**
6. **Cybersecurity framework (Exhibit F / Art. V §3)** — no framework is
   formally adopted today; the security overview describes controls but
   names none. Designate one (NIST CSF 1.1 or CIS Controls fit a team this
   size), write a short internal control mapping, and document variances.
   **[DPO/ATTORNEY]**
7. **Exhibit H doesn't exist in this PDF** — yet Art. V §3 says framework
   variances go in "an attachment to Exhibit H," and Art. VII §3 gives
   Exhibit H top priority. Ask CITE/CSPA how providers attach Exhibit H
   material (or confirm it's intentionally omitted). **[ATTORNEY]**
8. **Subprocessor DPAs incomplete (Art. II §5)** — only OpenAI, Anthropic,
   and Help Scout DPAs are documented as on file. Execute/download and file
   the **Supabase, Vercel, and Sentry** DPAs.
9. **Stale security overview** — `speddy-technical-security-overview.md`
   (Dec 2025) contradicts current reality: Replit/GCP hosting (now Vercel),
   "initials only, full names not collected" (false — `student_details`),
   AI services active (now gated off), `@speddy.com` contacts, no mention of
   Help Scout or the Chrome extension. **Must be rewritten before it backs
   any NDPA representation or goes to a district.**
10. **Privacy-page MFA claim** — `app/privacy/page.tsx` §5 claims
    "multi-factor authentication options" while MFA is not implemented
    (security overview §2). Fix the page or ship MFA (SPE-134 territory).
11. **Written incident-response plan (Art. V §4(3))** — required in writing
    and producible on request. The security overview sketches a process; a
    standalone IR plan document needs to exist. **[DPO]**
12. **Retention cron not scheduled** — `cleanup-worksheet-images` exists but
    no `vercel.json` crons entry / external scheduler is wired (verified
    2026-06-12). Schedule it before relying on the 12-month TTL.
13. **Bulk export (SPE-60) still open** — Art. IV §6 allows disposition by
    *transfer* and districts may request data return. Per-student deletion
    is built; comprehensive export is not. Decide whether to accept the gap
    or prioritize SPE-60 pre-signing.
14. **Exhibit B judgment calls** — Communications unchecked (notes disclosed
    under Other), Observation data unchecked, Program Membership unchecked,
    State ID checked with the extension-cache note. Confirm framings.
    **[ATTORNEY]**
15. **Cover-page state-law blank** — confirm whether the locked PDF
    pre-fills the California statute references; if not, counsel supplies.
    **[ATTORNEY]**

## 7. Pre-execution checklist (ordered)

1. ☐ Confirm legal entity name, formation state, business address (Gap 1)
2. ☐ Designate authorized signatory (Gap 2)
3. ☐ Designate rep + security contact; fix email-domain inconsistency (Gap 3)
4. ☐ Decide GOPT yes/no + subscribing-LEA inbox (Gap 4) **[ATTORNEY]**
5. ☐ Confirm "No AI used at this time" stance (Gap 5) **[ATTORNEY]**
6. ☐ Designate cybersecurity framework + internal mapping memo (Gap 6) **[DPO/ATTORNEY]**
7. ☐ Ask CITE about Exhibit H handling (Gap 7) **[ATTORNEY]**
8. ☐ Execute/file Supabase, Vercel, Sentry DPAs; collate with OpenAI/Anthropic/Help Scout records (Gap 8)
9. ☐ Rewrite `speddy-technical-security-overview.md` to current reality (Gap 9)
10. ☐ Fix privacy-page MFA claim or implement MFA (Gap 10)
11. ☐ Write/adopt formal incident-response plan (Gap 11) **[DPO]**
12. ☐ Schedule the worksheet-image retention cron (Gap 12 — eng, small)
13. ☐ Decide SPE-60 (bulk export) timing vs. data-return obligation (Gap 13)
14. ☐ Counsel review of Exhibit B checkbox set + notes (Gap 14) **[ATTORNEY]**
15. ☐ Verify locked-PDF prefills (state-law blank, Exhibit G checkbox) (Gap 15)
16. ☐ Full FERPA/COPPA counsel review of the assembled packet **[ATTORNEY]**
17. ☐ Sign (DPA + Exhibit E + Exhibit G), register via CITE/CSPA, send to the originating LEA
18. ☐ Post-signing: calendar 3-year DPA/Exhibit E expiry; stand up the subscribing-LEA intake inbox; wire subprocessor-change notifications (`subprocessors.md` header) into the release process

_Related: SPE-59 (this DPA), SPE-143 (deletion/retention — Done), SPE-134
(claim accuracy), SPE-165 (subprocessor list), SPE-170 (Help Scout DPA —
Done), SPE-163 (OpenAI/Anthropic DPAs signed; ZDR still open before AI
enablement), SPE-60 (bulk export — open), SPE-61 (prompt de-identification —
open)._
