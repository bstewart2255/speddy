# Speddy — NIST CSF 1.1 Control Mapping

**Orchestrate LLC** internal memo supporting the CA-NDPA Article V §3
commitment to "implement an adequate Cybersecurity Framework based on one of
the nationally recognized standards set forth in Exhibit F."

**Designated framework: NIST Cybersecurity Framework, Version 1.1** (listed
in Exhibit F). This memo maps Speddy's implemented controls to the five CSF
core functions and records known gaps. It is the honest basis for the Art. V
§3 representation; material gaps that a district would consider exclusions
or variances would be documented per the NDPA (Exhibit H mechanism — see
SPE-172).

| Item | Value |
| --- | --- |
| Version | 1.0 |
| Last updated | June 2026 |
| Owner | Orchestrate LLC principal |
| Review | Annually, with the security overview |

Companion docs: `speddy-technical-security-overview.md` (district-facing
detail), `data-inventory.md`, `subprocessors.md`, `offboarding-runbook.md`,
`incident-response-plan.md`.

---

## IDENTIFY

| CSF category | Speddy implementation |
| --- | --- |
| Asset Management (ID.AM) | Single production system of record (Supabase project, us-west-1); data inventory maintained element-by-element in `data-inventory.md`, verified against the live schema; client-side storage (Chrome-extension cache) inventoried |
| Business Environment / Governance (ID.BE, ID.GV) | CA-NDPA contractual framework; privacy policy and FERPA notice published; subprocessor register with change-notification trigger (`subprocessors.md`) |
| Risk Assessment (ID.RA) | Security/compliance review tracked in Linear (SPE-13x/16x series); Supabase security advisors; dependency audit via `npm audit` in CI sessions |
| Supply Chain (ID.SC) | Subprocessor list with DPA status; data-processing agreements executed/required for all subprocessors (SPE-163, SPE-170, SPE-173) |

## PROTECT

| CSF category | Speddy implementation |
| --- | --- |
| Identity & Access Control (PR.AC) | Supabase Auth (JWT); educational-domain-restricted self-signup; role-based access control with admin scoping; PostgreSQL Row-Level Security on every application table; per-provider hashed API keys for the extension (revocable); 45-minute inactivity logout; password complexity rules |
| Data Security (PR.DS) | TLS 1.2+ in transit; AES-256 at rest (Supabase-managed); private storage buckets with short-lived signed URLs; service-role credentials server-side only; data minimization (no parent/student contact info, no SSN, no demographics) |
| Information Protection (PR.IP) | Retention TTLs enforced by scheduled jobs (12-month worksheet images, 7-day rate-limit rows, 90-day analytics); deletion/offboarding tooling (`offboarding-runbook.md`); environment-variable secrets management (Vercel); AI feature gate default-off |
| Protective Technology (PR.PT) | Server-side input validation; DOMPurify HTML sanitization; upload type validation and rate limiting; cron endpoints secret-gated; inbound email webhook disabled by default |

## DETECT

| CSF category | Speddy implementation |
| --- | --- |
| Anomalies & Events (DE.AE) | Sentry error monitoring (PII-minimized); Supabase logs and advisors; Vercel runtime/deploy logs |
| Continuous Monitoring (DE.CM) | Sign-in event logging with IP/user-agent (`sign_in_logs`); Sentry cron monitors |

## RESPOND

| CSF category | Speddy implementation |
| --- | --- |
| Response Planning / Communications (RS.RP, RS.CO) | Written incident response plan (`incident-response-plan.md`) with severity levels, containment playbook, and 72-hour LEA breach notification matching CA-NDPA Art. V §4 |
| Analysis / Mitigation (RS.AN, RS.MI) | Evidence-preservation steps; key-rotation/rollback/feature-disable playbook; subprocessor escalation channels |

## RECOVER

| CSF category | Speddy implementation |
| --- | --- |
| Recovery Planning (RC.RP) | Supabase automated backups + point-in-time recovery; Vercel instant deployment rollback |
| Improvements / Communications (RC.IM, RC.CO) | Post-incident review with RCA, corrective actions tracked in Linear, post-incident report to affected districts |

---

## Known gaps (tracked)

| Gap | CSF area | Status |
| --- | --- | --- |
| HTTP security headers (CSP/HSTS beyond platform defaults) | PR.PT | Not configured — roadmap |
| IP-based rate limiting on login | PR.AC | Not implemented — roadmap |
| SSO integration | PR.AC | Not available |
| Formal third-party penetration test | ID.RA / DE | Not performed; infrastructure providers (Supabase, Vercel) maintain SOC 2 Type II |
| Audit logging of student-data access/modification | DE.CM / PR.PT | Table scaffolding exists (`audit_logs`); application wiring tracked in SPE-169 |
| Annual IR tabletop exercise | RS.RP | Committed in `incident-response-plan.md` §9; first exercise to be scheduled |

This is a self-assessment of alignment, not a certification or third-party
audit. Counsel/DPO should confirm this satisfies the Art. V §3
representation before the NDPA is signed (see
`docs/ndpa/attorney-review-brief.md`).
