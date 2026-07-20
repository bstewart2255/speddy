# Speddy: Technical & Security Overview

**For School District IT Review**

---

## Document Purpose

This document provides technical details about Speddy's architecture, security implementation, data handling practices, and regulatory compliance posture. It is intended for IT leadership evaluating Speddy for deployment within a school district. It is the companion to the data inventory (`data-inventory.md`), subprocessor list (`subprocessors.md`), offboarding/deletion runbook (`offboarding-runbook.md`), and incident response plan (`incident-response-plan.md`).

---

## 1. Architecture Overview

### Technology Stack

| Component        | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Frontend         | Next.js 15, React, TypeScript                       |
| Backend          | Next.js API Routes (Node.js)                        |
| Database         | PostgreSQL (via Supabase)                           |
| Authentication   | Supabase Auth (JWT-based)                           |
| File Storage     | Supabase Storage (private buckets)                  |
| Hosting          | Vercel                                              |
| Error Monitoring | Sentry (minimized configuration — see Section 6)    |
| Support / Chat   | Help Scout (Beacon widget)                          |
| AI Services      | **None active.** OpenAI/Anthropic integrations exist in the codebase but are disabled platform-wide (see Section 5) |

### Deployment Model

- **SaaS**: Speddy is a cloud-hosted application
- **Multi-tenant**: Districts share infrastructure with logical data separation enforced by database row-level security
- **Region**: Database, file storage, and authentication run in Supabase's **us-west-1 (Northern California)** region; all student data at rest is stored in the United States

### Chrome Extension

Speddy offers a companion Chrome extension that, with the provider's authorization, **reads** student records from the LEA's SEIS (California Special Education Information System) account to detect discrepancies between SEIS and Speddy records. It writes nothing back to SEIS. The extension authenticates to Speddy with a per-provider API key (stored server-side only as a hash) and caches discrepancy data (SEIS ID, student name, grade, school) in the provider's local browser storage with a **7-day TTL**; the cache is cleared on logout and whenever the provider's API key is revoked server-side.

---

## 2. Authentication & Access Control

### Authentication Method

- **Email/password authentication** via Supabase Auth
- **Administrator-provisioned accounts** — the public self-registration flow has been removed; district and site administrators create staff accounts, and Google SSO can sign in an existing user but never creates a new account
- **JWT tokens** for session management
- **Secure cookies** with `httpOnly`, `secure`, and `sameSite` attributes
- **Session validation** on every request via middleware
- **Inactivity timeout**: sessions are automatically signed out after 45 minutes of inactivity, with a warning prompt before logout

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)
- At least one special character

### Role-Based Access Control

| Role                              | Access Level                                          |
| --------------------------------- | ----------------------------------------------------- |
| Resource Specialist               | Full caseload management for assigned students        |
| Speech/OT/Counselor               | Full caseload management for assigned students        |
| Special Education Assistant (SEA) | View-only access to assigned sessions                 |
| Teacher                           | View-only access to their students receiving services |
| Site Administrator                | Staff management within their school                  |
| District Administrator            | Staff management across the district                  |

Access is enforced at multiple levels:

1. **Application middleware** validates session and role
2. **Database Row-Level Security (RLS)** restricts data access at the query level
3. **API route validation** checks user permissions

---

## 3. Database Security

### Row-Level Security (RLS)

RLS is enabled on **every table** in the application schema. Users can only access records they are authorized to view based on:

- **Provider ownership**: Specialists access only their assigned students
- **School affiliation**: Users access data within their school context
- **Role permissions**: Administrators have broader access within their scope

RLS is enforced at the PostgreSQL level, providing defense-in-depth independent of application code.

### Data Encryption

| State      | Method                                |
| ---------- | ------------------------------------- |
| In Transit | TLS 1.2+ (HTTPS enforced)             |
| At Rest    | AES-256 encryption (Supabase managed) |

### Database Access

- Application uses the Supabase client with parameterized queries (prevents SQL injection)
- Service role credentials stored server-side only
- Client-side uses the anonymous key, constrained by RLS
- File storage uses private buckets served via short-lived signed URLs

---

## 4. Data Privacy & Handling

### Student Data Collected

The authoritative element-by-element inventory is maintained in `data-inventory.md` and disclosed to districts in the CA-NDPA Schedule of Data (Exhibit B). In summary:

| Data Point | Notes |
| --- | --- |
| Student identifiers | Initials are the core identifier used throughout the app; **full first/last names and date of birth are optional, provider-entered fields** |
| IEP data | Goals, accommodations, IEP/triennial dates, service minutes |
| Special-education eligibility process | Referral reasons, academic/speech/psych/OT testing dates and outcomes, eligibility category (CARE/SST module) |
| Schedules & attendance | Session day/time, service type, group assignment, session attendance and absence reasons |
| Assessment & progress | Assessment scores (e.g., mClass, STAR), exit-ticket and progress-check results, IEP-goal progress, derived performance metrics |
| Student work | Scanned worksheet images and provider-uploaded documents, stored in private buckets |
| Not collected | Parent/guardian contact information, student contact information, SSN, race/ethnicity/gender, health data beyond special-education status, transcripts/course grades |

Provider (adult staff) account data — name, school email, role, school/district — and operational metadata (sign-in IP address, user agent, product usage events) are also processed; see `data-inventory.md`.

### Data Retention

| Data Type                  | Retention Policy                                        |
| -------------------------- | ------------------------------------------------------- |
| Student records            | District/user-controlled; deletable via application     |
| Worksheet-submission images | Deleted automatically after **12 months** (scheduled job) |
| Upload rate-limit records  | 7-day rolling window (scheduled job)                    |
| Analytics events           | 90-day rolling window (scheduled job)                   |

### Data Deletion & Return

Speddy maintains operational tooling for honoring deletion and offboarding requests (see `offboarding-runbook.md`):

- **Per-student deletion** that cascades through all related records and removes stored worksheet images
- **Provider/account deletion** including authentication records
- **District offboarding** procedures covering all schools, students, providers, storage objects, and extension API keys
- **Extension cache controls**: 7-day TTL plus forced clearing via API-key revocation

Disposition of student data upon district request is completed within the contractual window of the executed data privacy agreement (60 days under the CA-NDPA).

---

## 5. AI Features (Currently Disabled)

Speddy's codebase includes optional AI-assisted features (lesson, exit-ticket, and progress-check generation; worksheet-image grading; document parsing) that would use OpenAI and Anthropic as subprocessors. As of this document's date:

- These features are **disabled platform-wide** by a server-side feature gate; the AI routes return 404 and make **zero** calls to AI providers
- Data-processing agreements with both AI providers are executed and on file; both prohibit training on customer data
- Before any AI feature is enabled, Speddy will apply prompt de-identification, request zero-data-retention handling from the AI providers, and provide advance notice to districts as required by the executed CA-NDPA (Exhibit G)

---

## 6. Third-Party Services & Subprocessors

The authoritative list is maintained in `subprocessors.md`. Districts are notified of subprocessor changes per the executed data privacy agreement.

### Supabase (Database, Authentication & Storage)

- **Purpose**: Database hosting, user authentication, file storage — system of record
- **Data processed**: All application data
- **Location**: United States (us-west-1, Northern California)
- **Security**: SOC 2 Type II certified
- **Website**: https://supabase.com

### Vercel (Hosting)

- **Purpose**: Application hosting and deployment; request/response traffic and runtime logs transit Vercel compute
- **Data processed**: Application traffic; request-scoped data may appear in runtime logs
- **Security**: SOC 2 Type II certified
- **Website**: https://vercel.com

### Sentry (Error Monitoring)

- **Purpose**: Error tracking (exceptions and stack traces)
- **Minimized configuration**: Session Replay and Sentry Logs are disabled; `sendDefaultPii` is off; email addresses are scrubbed before events are sent; logger metadata is not forwarded
- **Data processed**: Operational error data only (US ingest)
- **Website**: https://sentry.io

### Help Scout (Support)

- **Purpose**: Help desk and in-app chat widget (Beacon)
- **Data processed**: Signed-in **provider's** name, email, role, school district/site, and user ID. No student data by design; users are instructed not to paste student information into chat
- **Location**: United States
- **Website**: https://www.helpscout.com

### OpenAI / Anthropic (AI — planned, not enabled)

Disclosed as planned subprocessors; they receive **no data today** (see Section 5).

### SEIS (data source, not a subprocessor)

The Chrome extension reads from the LEA's SEIS account; SEIS is the origin of data, not a recipient.

---

## 7. Regulatory Compliance

### FERPA (Family Educational Rights and Privacy Act)

| FERPA Requirement               | Speddy Implementation                                                      |
| ------------------------------- | -------------------------------------------------------------------------- |
| Legitimate educational interest | Role-based access ensures only authorized staff access student data        |
| School Official designation     | Formalized through the executed CA-NDPA (CITE/CSPA)                        |
| Data minimization               | No parent/guardian or student contact info, SSN, or demographic profiles collected |
| Access controls                 | Database-level RLS and application-level role enforcement                   |
| Data return & destruction       | Deletion and offboarding tooling backing the NDPA's 60-day disposition duty |
| Third-party agreements          | Data-processing agreements with subprocessors (see `subprocessors.md`)      |

### COPPA (Children's Online Privacy Protection Act)

- Speddy does not collect information directly from children
- All data is entered by authorized school personnel
- No direct student interaction with the platform

### California Student Privacy Laws

Speddy executes the **California Student Data Privacy Agreement (CA-NDPA)** via CITE / the California Student Privacy Alliance, which incorporates California's supplemental state terms (SOPIPA, Ed. Code § 49073.1) and an AI addendum. Subscribing districts may accept Speddy's General Offer of Privacy Terms where offered.

---

## 8. Security Controls

### Input Validation

- All user input validated server-side
- Accounts are administrator-provisioned (the self-registration flow has been removed)
- File upload type validation and upload rate limiting
- HTML content sanitized using DOMPurify to prevent XSS attacks

### API Security

- All API routes require authenticated sessions
- Scheduled (cron) endpoints protected by a server-held secret
- Extension endpoints authenticate via per-provider API keys (stored as hashes; revocable)
- Inbound email webhook is disabled by default

### Session Management

- JWT tokens with expiration
- Session validated on every request
- Secure cookie attributes enforced
- Sessions invalidated on logout; 45-minute inactivity auto-logout

### Error Handling

- Structured error responses (no sensitive data leaked)
- Server errors logged to Sentry with PII scrubbing (see Section 6)

---

## 9. Current Security Posture

### Implemented Controls

- Row-Level Security on every application table
- Role-based access control with admin scoping
- JWT-based authentication with secure cookies and inactivity timeout
- Input validation and HTML sanitization
- Private storage buckets with signed URLs
- Automated data-retention jobs (Section 4)
- Deletion/offboarding tooling (Section 4)
- Minimized error-monitoring footprint (Section 6)
- AI feature gate (Section 5)

### Known Limitations / Roadmap

| Item                              | Status          |
| --------------------------------- | --------------- |
| HTTP Security Headers (CSP, HSTS beyond platform defaults) | Not configured |
| IP-based rate limiting on login   | Not implemented |
| Single Sign-On (SSO)              | Not available   |

These can be prioritized based on district requirements.

---

## 10. Incident Response

Speddy maintains a written incident response plan (`incident-response-plan.md`), available to districts on request, covering detection, containment, investigation, notification, and post-incident review.

### Incident Notification

Districts will be notified of security incidents affecting their data within **72 hours of confirmation**, including:

- Nature of the incident and a general description
- Types of data potentially affected
- Date or estimated date range of the incident
- Whether notification was delayed by a law-enforcement investigation
- Remediation steps taken and contact information for questions

This matches the breach-notification commitments in the executed CA-NDPA (Article V, Section 4).

---

## 11. District IT Requirements

### Network Requirements

| Requirement     | Details                                           |
| --------------- | ------------------------------------------------- |
| Outbound HTTPS  | Port 443 (see Domain Allowlist below)             |
| Browser Support | Chrome, Firefox, Safari, Edge (latest 2 versions) |
| JavaScript      | Required                                          |
| Cookies         | Required (first-party only)                       |

### Domain Allowlist

If your district uses web filtering, allow the following domains:

| Domain                      | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `speddy.xyz`                | Main application                                     |
| `*.supabase.co`             | Authentication and database (client-side auth flows) |
| `*.sentry.io`               | Error monitoring (client-side error reporting)       |
| `beacon-v2.helpscout.net`   | Support chat widget                                  |

### Data Export

Individual progress reports can be exported from the application. Comprehensive bulk data export for district records or offboarding is available upon request — contact help@speddy.xyz.

---

## 12. Frequently Asked Questions

**Q: Where is our data stored?**
A: Student and provider data is stored at rest in the United States (Supabase, us-west-1 / Northern California). The application is served by Vercel.

**Q: Can we get a copy of our data?**
A: Yes. Individual reports can be exported in the application, and a full district export can be requested at help@speddy.xyz.

**Q: What happens to our data if we stop using Speddy?**
A: Upon contract termination, district data is returned on request and then permanently deleted using Speddy's offboarding tooling, within the disposition window of the executed data privacy agreement.

**Q: Is student data used to train AI models?**
A: No. AI features are currently disabled platform-wide and no student data reaches any AI provider. If AI features are enabled in the future, Speddy's agreements with its AI providers prohibit training on customer data, and districts will be notified in advance per the CA-NDPA AI addendum.

**Q: Can we review your SOC 2 report?**
A: Our infrastructure providers (Supabase, Vercel) maintain SOC 2 Type II certifications; their reports are available through their compliance programs.

**Q: Do you have a Data Privacy Agreement (DPA)?**
A: Yes. Speddy executes the CA-NDPA (Standard Version 1.5) via CITE / the California Student Privacy Alliance. Contact help@speddy.xyz to initiate.

---

## 13. Contact Information

**All inquiries (security, support, privacy/DPA)**: help@speddy.xyz

---

## Document Information

| Item             | Value         |
| ---------------- | ------------- |
| Document Version | 2.1           |
| Last Updated     | July 2026     |
| Review Frequency | Quarterly     |

---

_This document describes Speddy's security and privacy implementation as of the date above. Security practices are continuously improved, and this document will be updated accordingly._
