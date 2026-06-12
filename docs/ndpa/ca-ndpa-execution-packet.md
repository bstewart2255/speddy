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
| Provider name + address | **Orchestrate LLC**, a California limited liability company, **2108 N St Ste N, Sacramento, CA 95816 US** (confirmed 2026-06-12) | `app/privacy/page.tsx` §1, §14; owner-confirmed |
| Blank after "applicable state privacy laws and regulations ___ and" | Likely pre-printed in the locked CA form; if fillable, counsel supplies (e.g., SOPIPA — Cal. B&P Code §§ 22584–22585; Cal. Ed. Code § 49073.1 / AB 1584) **[ATTORNEY]** | NDPA cover; confirm in the live PDF |
| ☑ Exhibit G (Supplemental State Terms) | Checked — mandatory for the CA version (appears pre-checked in the locked form) | NDPA p. 2 §2 |
| ☐/☑ Exhibit E (General Offer of Privacy Terms) | **Decision 4** — recommend checking (the CSPA model: one signature, other LEAs subscribe) | NDPA p. 2 §2 |

### Designated representatives + signatures (p. 3)

| Field | What goes there | Source |
|---|---|---|
| LEA designated rep | District fills | — |
| Provider designated rep: name, title, address, phone, email | **Blair Stewart, Owner, 2108 N St Ste N, Sacramento, CA 95816 US; help@speddy.xyz; phone on file** (kept out of this public repo — enter directly in the PDF; business-line decision pending). This contact doubles as the **data-security contact** the LEA may use (Art. V §3) | Confirmed 2026-06-12 |
| Provider signature block (By / Date / Printed Name / Title) | **Blair Stewart, Owner** (confirmed 2026-06-12); same signer on Exhibit E and Exhibit G | Confirmed |

### Standard Clauses — commitments we are signing up to (no blanks, but verify)

| Clause | Commitment | Our position | Source |
|---|---|---|---|
| Art. II §2 (+ Ex. G ¶2) | Parent access/correction via the LEA within **45 days** | Supported operationally — requests routed through the district; deletion tooling exists | `offboarding-runbook.md` §A |
| Art. II §5 | **Written agreements with all subprocessors**, no less stringent | OpenAI, Anthropic, Help Scout DPAs on file. Researched 2026-06-12: **Supabase** DPA requires a signing step (dashboard → Legal Documents); **Vercel** DPA is incorporated into the ToS (deemed signed — Pro/Enterprise plans; confirm plan tier + download copy); **Sentry** DPA is self-serve click-accept (Settings → Legal & Compliance, Owner/Billing role). See Gap 8 | `subprocessors.md`; supabase.com/legal/dpa, vercel.com/legal/dpa, sentry.io/legal/dpa |
| Art. IV §6 / Art. VII §2 | Dispose of Student Data within **60 days** of written request; destroy on termination | Supported: per-student cascade delete + Storage cleanup, provider/account deletion, district offboarding runbook, extension-cache TTL/clear | `offboarding-runbook.md` (SPE-143, PR #655) |
| Art. V §1 | US data storage where required; list of storage locations on request | Supabase project region **us-west-1 (N. California)** — verified 2026-06-12; Vercel function region configurable; Sentry US ingest | `subprocessors.md`; live project settings |
| Art. V §2 | Annual LEA audit right (10 business days' notice + NDA) | Acceptable; no tooling needed | — |
| Art. V §3 | Implement a Cybersecurity Framework from Exhibit F; variances detailed in an attachment to Exhibit H | **NIST CSF 1.1 designated (2026-06-12)** — self-assessment at `docs/security-framework-mapping.md`; Exhibit H variance mechanics pending CITE answer (SPE-172) | `security-framework-mapping.md` |
| Art. V §4 | Breach notice to LEA within **72 hours** of confirmation; **written incident-response plan** available on request | 72h matches our stated commitment; written IR plan exists: `docs/incident-response-plan.md` (v1.0, June 2026) | `incident-response-plan.md`; `speddy-technical-security-overview.md` §10 |
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
| Email where Subscribing LEAs send signed Exhibit E | **help@speddy.xyz** (decided 2026-06-12) | — |
| PROVIDER / BY / Printed Name / Title / Date | Orchestrate LLC — **Blair Stewart, Owner** | Confirmed 2026-06-12 |
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
| Supabase | Database, auth, file storage — system of record | Yes — all categories in Exhibit B | US (us-west-1, N. California) | DPA available; **sign via dashboard → Legal Documents [ACTION]** |
| Vercel | Application hosting; traffic + runtime logs | Yes — in transit and incidentally in logs | US-configurable | DPA incorporated into ToS (Pro/Enterprise); **confirm plan tier + save copy [ACTION]** |
| Sentry | Error monitoring, minimized (no logs/replay, PII scrubbed, `sendDefaultPii: false`) | Incidental only | US ingest | DPA self-serve; **accept in Settings → Legal & Compliance [ACTION]** |
| Help Scout | Support help desk + chat widget | No by design (provider PII only) | US | DPA v2 via ToS; DPF + SCCs (SPE-170, on file) |
| OpenAI — **planned, NOT enabled** | AI lesson generation (when enabled) | None today (hard-gated off); initials + IEP goal text when enabled | US | DPA executed 2026-06-12 (SPE-163) |
| Anthropic — **planned, NOT enabled** | AI generation/grading/parsing (when enabled) | None today (hard-gated off) | US | DPA via Commercial Terms, copy on file 2026-06-12 (SPE-163) |

Not subprocessors: **SEIS** (data source the extension reads from, not a
recipient); **Resend** (inbound-email webhook disabled by default; initials
only when active); Supabase Auth transactional email.

---

## 6. Gaps & decisions (need your input — don't sign without resolving)

1. ~~Legal entity details~~ **Resolved 2026-06-12** — Orchestrate LLC,
   California LLC, 2108 N St Ste N, Sacramento, CA 95816 US.
2. ~~Authorized signatory~~ **Resolved 2026-06-12** — Blair Stewart, Owner
   (DPA, Exhibit E, Exhibit G).
3. ~~Designated representative / security contact~~ **Resolved 2026-06-12**
   — Blair Stewart, Owner; help@speddy.xyz; phone on file (kept off this
   public repo). Open sub-decision: dedicated business phone line before
   signing (the number is distributed to every subscribing LEA for 3 years).
4. ~~GOPT (Exhibit E)~~ **Decided 2026-06-12: YES, sign** — inbox
   help@speddy.xyz. Attorney to confirm (brief item 2). Exhibit E expires 3
   years after signature.
5. ~~AI Addendum stance~~ **Decided 2026-06-12: "No AI used at this time"**
   + the §4 planned-use narrative. Attorney to confirm (brief item 3).
   Enablement obligations captured in **SPE-174**.
6. ~~Cybersecurity framework~~ **Decided 2026-06-12: NIST CSF 1.1** —
   self-assessment mapping written at `docs/security-framework-mapping.md`
   (with honest gaps table). Attorney to confirm sufficiency (brief item 5).
7. ~~Exhibit H question~~ **Tracked as SPE-172** — email CITE/CSPA; question
   text is in the ticket. Also raised in attorney brief item 5(b).
8. **Subprocessor DPAs (Art. II §5)** — researched 2026-06-12. Three quick
   self-serve actions remain (~15 min total):
   - **Supabase**: DPA must be signed — Supabase dashboard → Organization →
     Legal Documents (PandaDoc flow). Save the executed copy.
   - **Vercel**: DPA is incorporated by reference into the Terms of Service
     (deemed signed) for **Pro/Enterprise** customers. **Confirmed
     2026-06-12: currently on HOBBY plan → upgrade to Pro required before
     signing** (Hobby is non-commercial and outside the DPA's scope) —
     tracked as **SPE-173** (blocks SPE-59). After upgrading, save a copy of
     vercel.com/legal/dpa for the records file.
   - **Sentry**: self-serve click-accept — Sentry → Settings → Legal &
     Compliance (requires Owner/Billing role); DocuSign option if a signed
     copy is preferred. Save the acceptance record.
9. ~~Stale security overview~~ **Resolved 2026-06-12** — rewritten (v2.0):
   Vercel hosting, us-west-1 data residency, accurate data inventory (full
   names/DOB disclosed), AI-disabled posture, Help Scout + Chrome extension
   covered, `help@speddy.xyz` contacts, no MFA references.
10. ~~Privacy-page MFA claim~~ **Resolved 2026-06-12** — MFA bullet removed
    from `app/privacy/page.tsx`; page date bumped.
11. ~~Written incident-response plan~~ **Resolved 2026-06-12** — created at
    `docs/incident-response-plan.md` (v1.0): detection, severity levels,
    containment playbook, 72-hour LEA notification with the Art. V §4
    content items, post-incident review, annual tabletop. **[DPO review
    still recommended before distribution.]**
12. ~~Retention cron not scheduled~~ **Resolved 2026-06-12** — `vercel.json`
    created with daily crons for `cleanup-worksheet-images` (12-month image
    TTL) and `cleanup-uploads` (7-day rate-limit rows, 90-day analytics).
    **Verify in the Vercel project env: `CRON_SECRET` is set** (Vercel Cron
    sends it as `Authorization: Bearer` automatically; the routes 401
    without it) **and `CLEANUP_ANALYTICS=true`** — the analytics step of
    `cleanup-uploads` is opt-in (`app/api/cron/cleanup-uploads/route.ts`,
    default false), so the 90-day analytics TTL is not enforced until that
    flag is set (flagged by Codex review, PR #658). Confirm first runs in
    the Vercel dashboard after deploy.
13. ~~Bulk export decision~~ **Decided 2026-06-12: option (a)** — sign now;
    a district data-return/transfer request will be fulfilled manually
    within the 60-day Art. IV §6 window (current scale ~100 students).
    SPE-60 stays in the backlog. Attorney to confirm (brief item 10).
14. **Exhibit B judgment calls** — Communications unchecked (notes disclosed
    under Other), Observation data unchecked, Program Membership unchecked,
    State ID checked with the extension-cache note. Confirm framings.
    **[ATTORNEY]**
15. **Cover-page state-law blank** — confirm whether the locked PDF
    pre-fills the California statute references; if not, counsel supplies.
    **[ATTORNEY]**

## 7. Pre-execution checklist (ordered)

1. ☑ Entity confirmed: Orchestrate LLC / CA / 2108 N St Ste N, Sacramento, CA 95816 US (done 2026-06-12)
2. ☑ Signatory: Blair Stewart, Owner (done 2026-06-12)
3. ☑ Designated rep/security contact: Blair Stewart, Owner, help@speddy.xyz (done 2026-06-12; ☐ optional: dedicated business phone line before signing)
4. ☑ GOPT: YES — inbox help@speddy.xyz (decided 2026-06-12; attorney confirms, brief item 2)
5. ☑ AI stance: "No AI used at this time" (decided 2026-06-12; attorney confirms, brief item 3; enablement runbook = SPE-174)
6. ☑ Framework: NIST CSF 1.1 + mapping memo `docs/security-framework-mapping.md` (done 2026-06-12; attorney confirms, brief item 5)
7. ☐ Email CITE about Exhibit H (tracked: **SPE-172**)
8. ☐ Sign Supabase DPA (dashboard) · accept Sentry DPA (Settings → Legal & Compliance) · **upgrade Vercel Hobby → Pro (SPE-173)** + save DPA copy; collate with OpenAI/Anthropic/Help Scout records (Gap 8)
9. ☑ Security overview rewritten to current reality, v2.0 (Gap 9 — done 2026-06-12)
10. ☑ MFA references removed from privacy page (Gap 10 — done 2026-06-12)
11. ☑ Incident-response plan written: `docs/incident-response-plan.md` (Gap 11 — done 2026-06-12; **[DPO]** review recommended)
12. ☑ Retention crons scheduled via `vercel.json` (Gap 12 — done 2026-06-12; ☐ verify `CRON_SECRET` **and `CLEANUP_ANALYTICS=true`** env in Vercel + first-run success)
13. ☑ Bulk export: option (a) — manual fulfillment within 60 days; SPE-60 stays backlog (decided 2026-06-12; attorney confirms, brief item 10)
14. ☐ Counsel review of Exhibit B checkbox set + notes (Gap 14) **[ATTORNEY]**
15. ☐ Verify locked-PDF prefills (state-law blank, Exhibit G checkbox) (Gap 15)
16. ☐ Full FERPA/COPPA counsel review — forward `docs/ndpa/attorney-review-brief.md` + enclosures listed in its §A **[ATTORNEY]**
17. ☐ Sign (DPA + Exhibit E + Exhibit G), register via CITE/CSPA, send to the originating LEA
18. ☐ Post-signing: calendar 3-year DPA/Exhibit E expiry; stand up the subscribing-LEA intake inbox; wire subprocessor-change notifications (`subprocessors.md` header) into the release process

_Related: SPE-59 (this DPA), SPE-143 (deletion/retention — Done), SPE-134
(claim accuracy), SPE-165 (subprocessor list), SPE-170 (Help Scout DPA —
Done), SPE-163 (OpenAI/Anthropic DPAs signed; ZDR still open before AI
enablement), SPE-60 (bulk export — open), SPE-61 (prompt de-identification —
open)._
