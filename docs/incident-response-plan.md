# Speddy Incident Response Plan

**Orchestrate LLC (Speddy)** — written incident response plan for security
incidents, privacy incidents, and data breaches. This document satisfies the
CA-NDPA requirement for a written incident response plan (Standard Clauses,
Article V, Section 4(3)) and is available to contracting LEAs on request.

| Item | Value |
| --- | --- |
| Version | 1.0 |
| Last updated | June 2026 |
| Owner | Orchestrate LLC principal (Incident Lead) |
| Contact | help@speddy.xyz |
| Review cadence | Annually, and after every incident |

---

## 1. Purpose & Scope

This plan governs how Speddy detects, contains, investigates, and recovers
from incidents affecting the confidentiality, integrity, or availability of
data processed by the Speddy platform — in particular **Student Data** as
defined in the CA-NDPA. It covers the production application (Vercel), the
database/auth/storage backend (Supabase, us-west-1), the Chrome extension,
and all subprocessors listed in `subprocessors.md`.

## 2. Definitions

- **Security incident**: any confirmed or reasonably suspected unauthorized
  access, disclosure, acquisition, destruction, use, or modification of
  Speddy systems or data.
- **Data breach**: an unauthorized release, disclosure, or acquisition of
  Student Data that compromises its security, confidentiality, or integrity
  (CA-NDPA Art. V §4).

## 3. Roles

| Role | Who | Responsibilities |
| --- | --- | --- |
| Incident Lead | Orchestrate LLC principal | Declares/classifies incidents, directs response, owns communications and notifications |
| Counsel | Outside FERPA/privacy counsel (engaged as needed) | Advises on notification obligations and regulatory requirements. The Incident Lead engages counsel immediately upon SEV-1 classification or any suspected Student Data exposure |
| Subprocessor contacts | Supabase, Vercel, Sentry, Help Scout support/security channels | Upstream investigation and containment assistance |

Speddy is operated by a small team; the Incident Lead may perform multiple
roles. All response actions and timestamps are logged (Section 8).

## 4. Detection & Reporting

Incidents may be detected via:

- **Sentry** error monitoring and alerting
- **Supabase** logs and security/performance advisors
- **Vercel** runtime and deployment logs
- **Sign-in anomalies** (`sign_in_logs`: IP address/user-agent review)
- **Reports from users or districts** to help@speddy.xyz
- **Subprocessor notifications** (Supabase/Vercel/Sentry/Help Scout breach notices)

Anyone (staff, provider, district) can report a suspected incident to
**help@speddy.xyz**. Reports are triaged within one business day; suspected
Student Data exposure is triaged immediately.

## 5. Classification

| Severity | Definition | Examples |
| --- | --- | --- |
| **SEV-1** | Confirmed or likely Student Data breach, or full platform compromise | Exposed database credentials; RLS bypass disclosing students across tenants; stolen provider account with caseload access |
| **SEV-2** | Security incident without confirmed Student Data exposure | Vulnerability discovered in an API route; compromised provider password (contained); leaked non-data secret |
| **SEV-3** | Availability/integrity issue or policy violation without data exposure | Outage; misconfigured bucket caught before exposure; provider pasting student data into support chat |

## 6. Response Procedure

### Phase 1 — Contain (immediately)

Actions are chosen per incident from this playbook:

- Rotate Supabase service-role and anon/publishable keys; rotate `CRON_SECRET` and other env secrets in Vercel
- Force password reset / sign-out for affected provider accounts (Supabase Auth)
- Revoke affected Chrome-extension API keys (`api_keys`) — this also force-clears the extension's on-device cache on next use
- Disable affected routes or roll back to a known-good deployment (Vercel instant rollback)
- Verify the AI feature gate remains off (`AI_FEATURES_ENABLED`), and that the inbound email webhook remains disabled
- Engage the relevant subprocessor's security channel if the issue originates upstream

### Phase 2 — Investigate

- Preserve evidence before remediation where practical: export relevant Sentry events, Supabase logs, `sign_in_logs` rows, and deployment history
- Establish what data was affected (which tables/buckets, which students/districts), the time window, and the access vector
- Use Supabase point-in-time recovery/backups to compare state if data integrity is in question
- Determine whether the incident meets the CA-NDPA definition of a data breach (Section 2); document the confirmation time — the 72-hour notification clock starts at confirmation. **Confirmation** is made by the Incident Lead (in consultation with Counsel) when unauthorized access to or acquisition of Student Data is established or cannot reasonably be ruled out; the decision is made without unreasonable delay, targeting within 24 hours of the investigation establishing those facts

### Phase 3 — Notify

**LEA notification — within 72 hours of confirmation** of a breach of that
LEA's Student Data (sooner where feasible), unless law enforcement directs a
delay, per CA-NDPA Art. V §4. Notification content (to the extent known, and
supplemented as it becomes available):

1. Name and contact information of the reporting LEA contact at Speddy
2. List of the types of personal information that were or are reasonably believed to have been the subject of the breach
3. Date, estimated date, or date range of the breach, and the date of the notice
4. Whether notification was delayed due to a law-enforcement investigation
5. A general description of the incident

Additional notifications, coordinated with counsel:

- Other affected LEAs (same content)
- Regulatory or individual notifications where required by applicable law (the LEA notifies affected students/parents per CA-NDPA Art. V §4(4); Speddy supplies the facts the LEA needs)
- Law-enforcement referral where appropriate

All notifications are sent from help@speddy.xyz and logged.

### Phase 4 — Remediate & Recover

- Fix the root cause (patch, configuration, policy, or RLS change) and verify the fix in production
- Restore data from backups if integrity was affected
- Re-enable disabled functionality only after verification

### Phase 5 — Post-Incident Review

Within 10 business days of resolution:

- Root-cause analysis: what happened, why, detection gaps, response timing
- Post-incident report provided to affected districts
- Corrective actions filed as tracked issues (Linear) with owners
- Update this plan, `subprocessors.md`, and the security overview if the incident changes anything externally represented

## 7. Cooperation Commitments

Per the CA-NDPA, Speddy will: cooperate with LEA investigations and audits
(Art. V §2), assist the LEA in securing Student Data when a breach
originates from the LEA's use of the service (Art. V §4(5)), and notify the
LEA in advance of compelled law-enforcement disclosures unless legally
barred (Art. II §4).

## 8. Records

For every incident, the Incident Lead maintains a dated log: detection
source and time, classification, confirmation time, containment and
investigation actions, notification times and recipients, root cause, and
corrective actions. Records are kept in Orchestrate LLC's access-controlled
business records storage (encrypted cloud storage, separate from production
systems, accessible only to the Incident Lead) and retained for at least
three years (the CA-NDPA term).

## 9. Plan Maintenance & Testing

- Reviewed and updated at least annually, and after every SEV-1/SEV-2 incident
- A tabletop walkthrough of one SEV-1 scenario (e.g., leaked service-role key) is performed annually — the first within 90 days of the first executed CA-NDPA — and its outcome is documented in the incident log
- The current version is provided to LEAs on request per CA-NDPA Art. V §4(3)
