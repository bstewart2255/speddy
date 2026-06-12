# Data Inventory

The categories and elements of data Speddy collects. This is the basis for the
**Schedule of Data (Exhibit B)** of the CA NDPA executed via CITE / the
California Student Privacy Alliance (see SPE-59), and the companion to
[`subprocessors.md`](./subprocessors.md) (which covers *who* the data flows to).

> Grounded in the live database schema (project `qkcruccytmmdajfavpgb`), verified
> 2026-06-12. Keep current as the schema changes.

---

## A. Student data

| NDPA category | Collected? | Speddy elements | Source table(s) |
|---|---|---|---|
| **Student Name** | **Yes** | First name, last name; initials; CARE referral student name | `student_details.first_name/last_name`, `students.initials`, `care_referrals.student_name` |
| **Demographics** | **Yes** | Date of birth | `student_details.date_of_birth` |
| **Disability / Special Indicator** | **Yes (core)** | IEP goals, accommodations, IEP / triennial / goals dates; special-ed **eligibility process** — academic/speech/psych/OT testing dates & completion, eligibility outcome & category, SST notes link | `student_details`, `care_cases` |
| **Enrollment** | **Yes** | Grade level, school/district association, service minutes (sessions/week, minutes/session) | `students`, `profiles` |
| **Schedule** | **Yes** | Session day/time, service type, group assignment | `schedule_sessions`, `bell_schedules`, `special_activities` |
| **Attendance** | **Yes** | Present/absent, absence reason, session date | `attendance`, `schedule_sessions` |
| **Assessment** | **Yes** | Assessment type/date + scores; performance level, accuracy trend, error patterns, confidence; exit-ticket & progress-check results; IEP-goal progress/scores | `student_assessments`, `student_performance_metrics`, `exit_ticket_results`, `progress_check_results`, `iep_goal_progress`, `manual_goal_progress` |
| **Student In-App Performance** | **Yes** | Worksheet responses, accuracy %, skills assessed, AI analysis | `worksheet_submissions` |
| **Student Work** | **Yes** | Scanned worksheet **images**, generated worksheets/lessons, uploaded documents (rosters / IEP docs) | `worksheet_submissions.image_url`, `documents`, `worksheets`, `saved_worksheets` |
| **Conduct / Behavior** | Limited | Behavior-area IEP goals; CARE referral reason | `student_details.iep_goals`, `care_referrals.referral_reason` |
| **Communications** | Limited | Provider session/progress notes (free text) | `schedule_sessions.session_notes`, `manual_goal_progress.notes`, `care_meeting_notes` |
| **Student Identifiers (local/state)** | Internal only | Speddy student UUID. **SSID / SEIS ID is read by the Chrome extension for matching but is NOT persisted.** | `students.id` |
| **Parent/Guardian Contact** | **No** | — | — |
| **Student Contact Info** | **No** | No student email / phone / address | — |
| **Student Survey Responses** | **No** | — | — |
| **Transcript / official grades** | **No** | Grade level only; no transcript/GPA | — |
| **Health / Medical** | **No** | Beyond special-ed status above | — |
| **Race / Ethnicity / Gender** | **No** | — | — |
| **SSN** | **No** | — | — |

## B. Educator / provider / staff data (PII processed; not "student" data)

| Element | Source |
|---|---|
| Provider name, email, role, school/district | `profiles` |
| Provider auth credentials (password hash, sessions) | Supabase Auth (`auth.users`) |
| Provider sign-in events: email, name, **IP address**, user agent | `sign_in_logs` |
| Teacher name, email, **phone number**, classroom, grade | `teachers` |
| Staff name, role, program, room | `staff` |
| Extension API key (bcrypt **hash** only) | `api_keys` |
| Marketing sign-up email | `landing_signups` |

## C. Technical / usage metadata

| Element | Source |
|---|---|
| IP address, user agent, device type | `analytics_events`, `sign_in_logs`, `upload_rate_limits` |
| Product usage events (event type, method, processing time, upload source, error codes) | `analytics_events` |

---

## Where each element flows (see [`subprocessors.md`](./subprocessors.md))

- **Supabase** — system of record for everything above; **Storage** holds worksheet images and uploaded documents (private buckets).
- **Vercel** — all of it, in transit + runtime logs.
- **Sentry** — incidental error context only, minimized (no logs/replay; SPE-167).
- **OpenAI / Anthropic** — *only when AI is enabled* (currently gated off, SPE-162): student **initials + IEP goal text** (lessons / exit-tickets / progress-checks), worksheet **images** (vision grading), and uploaded-document text. De-identification tracked in SPE-61.
- **Crisp** — provider **name + email** only (support chat). No student data by design.

## Notable points (for the NDPA / due diligence)

1. **Full student names and date of birth _are_ collected** (`student_details`). This corrects the earlier SPE-59 draft inventory, which said "initials, not full names." Names + DOB must be disclosed on the Schedule of Data.
2. **The CARE module holds special-education evaluation data** — full student names, referral reasons, and psych/speech/OT testing + eligibility outcomes. This is among the most sensitive data here (special-ed records under FERPA/IDEA) and should be called out explicitly.
3. **Student work images** are stored (Supabase Storage, private buckets, served via short-lived signed URLs).
4. **Minimization wins worth stating:** no SSID/SEIS ID persisted, no parent/guardian or student contact info, no SSN, no race/ethnicity/gender, no health data beyond special-ed status.
5. **Provider IP addresses** are logged (`sign_in_logs`, `analytics_events`) — provider PII, not student.

_Related: SPE-59 (CITE NDPA), SPE-165 (subprocessor list), SPE-143 (deletion/retention — required to honor NDPA data-return/deletion obligations for the elements above)._
