# Speddy: Technical & Security Overview

**For School District IT Review**

---

## Document Purpose

This document provides technical details about Speddy's architecture, security implementation, data handling practices, and regulatory compliance posture. It is intended for IT leadership evaluating Speddy for deployment within a school district.

---

## 1. Architecture Overview

### Technology Stack

| Component        | Technology                                 |
| ---------------- | ------------------------------------------ |
| Frontend         | Next.js 15, React, TypeScript              |
| Backend          | Next.js API Routes (Node.js)               |
| Database         | PostgreSQL (via Supabase)                  |
| Authentication   | Supabase Auth (JWT-based)                  |
| File Storage     | Supabase Storage                           |
| Hosting          | Replit Deployments (Google Cloud Platform) |
| AI Services      | Anthropic Claude API                       |
| Error Monitoring | Sentry                                     |

### Deployment Model

- **SaaS**: Speddy is a cloud-hosted application
- **Multi-tenant**: Districts share infrastructure with logical data separation
- **Autoscale**: Application runs on Google Cloud Platform via Replit Deployments, scaling automatically with demand
- **Region**: All data hosted in United States

---

## 2. Authentication & Access Control

### Authentication Method

- **Email/Password authentication** via Supabase Auth
- **JWT tokens** for session management
- **Secure cookies** with `httpOnly`, `secure`, and `sameSite=lax` attributes
- **Session validation** on every request via middleware

### Password Requirements

- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)
- At least one special character

### Multi-Factor Authentication

MFA is not currently implemented. Supabase Auth supports TOTP-based MFA, which can be enabled for administrative accounts upon request.

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

All tables containing sensitive data have Row-Level Security policies enabled. Users can only access records they are authorized to view based on:

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

- Application uses parameterized queries (prevents SQL injection)
- Service role credentials stored server-side only
- Client-side uses anonymous key with RLS restrictions

---

## 4. Data Privacy & Handling

### Student Data Collected

Speddy minimizes the collection of personally identifiable information (PII):

| Data Point        | What We Collect             | What We Don't Collect            |
| ----------------- | --------------------------- | -------------------------------- |
| Student Name      | Initials only (e.g., "JS")  | Full names are not required      |
| Grade Level       | Grade number (e.g., 3)      | —                                |
| IEP Goals         | Goal text (scrubbed of PII) | Student identifiers in goal text |
| Assessment Scores | Numerical scores            | —                                |
| Session Records   | Dates, times, attendance    | —                                |

### PII Scrubbing

Before IEP goal text is sent to AI services, an automated PII scrubbing process:

1. Removes student names from goal text (replaced with generic placeholders)
2. Removes specific dates (converted to relative timeframes)
3. Removes district/student ID numbers
4. Preserves educational content and metrics

This scrubbing uses both regex-based pattern matching and optional AI-assisted detection.

### Data Sent to AI Services

When generating lesson materials, the following is sent to Anthropic's Claude API:

- Student grade level
- Student initials (e.g., "JB") for worksheet labeling
- Subject area
- IEP goal text (PII-scrubbed)
- Curriculum context
- Difficulty preferences

**Not sent**: Full student names, dates of birth, student IDs, or other direct identifiers.

### Data Retention

| Data Type          | Retention Policy                           |
| ------------------ | ------------------------------------------ |
| Student records    | User-controlled; deletable via application |
| Generated lessons  | User-controlled; deletable via application |
| Session schedules  | User-controlled; deletable via application |
| Upload rate limits | 7-day rolling window                       |
| Analytics events   | 90-day rolling window                      |

### Data Deletion

Users can delete student records and associated data through the application. Upon account termination, all user data can be deleted upon request.

---

## 5. Third-Party Services & Subprocessors

### Supabase (Database & Authentication)

- **Purpose**: Database hosting, user authentication, file storage
- **Data processed**: All application data
- **Location**: United States
- **Security**: SOC 2 Type II certified
- **Website**: https://supabase.com

### Anthropic (AI Services)

- **Purpose**: AI-powered lesson and worksheet generation
- **Data processed**: PII-scrubbed IEP goals, grade levels, educational content
- **API data retention**: Per Anthropic's API Terms (data not used for model training by default for business accounts)
- **Website**: https://anthropic.com

### Replit / Google Cloud Platform (Hosting)

- **Purpose**: Application hosting and deployment
- **Data processed**: Application traffic, server logs
- **Infrastructure**: Google Cloud Platform (US region)
- **Security**: Google Cloud security infrastructure with encryption in transit and at rest
- **Website**: https://replit.com

### Sentry (Error Monitoring)

- **Purpose**: Error tracking and performance monitoring
- **Data processed**: Error logs, stack traces, user IDs (no PII)
- **Website**: https://sentry.io

---

## 6. Regulatory Compliance

### FERPA (Family Educational Rights and Privacy Act)

Speddy is designed with FERPA compliance in mind:

| FERPA Requirement               | Speddy Implementation                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| Legitimate educational interest | Role-based access ensures only authorized staff access student data       |
| Data minimization               | Student initials used instead of full names; PII scrubbing on AI requests |
| Access controls                 | Database-level RLS and application-level role enforcement                 |
| Audit capability                | Authentication events logged; database maintains timestamps               |
| Third-party agreements          | Data Processing Agreements available for subprocessors                    |

**Note**: Districts should conduct their own FERPA compliance review and may require a Data Processing Agreement (DPA) with Speddy.

### COPPA (Children's Online Privacy Protection Act)

- Speddy does not collect information directly from children
- All data is entered by authorized school personnel
- No direct student interaction with the platform

### State Privacy Laws

Districts should review Speddy's practices against applicable state student privacy laws (e.g., California's SOPIPA, New York's Education Law 2-d).

---

## 7. Security Controls

### Input Validation

- All user input validated server-side
- Email domain restrictions on signup (educational domains only)
- File upload type validation (whitelist-based)
- HTML content sanitized using DOMPurify to prevent XSS attacks

### API Security

- All API routes require authenticated sessions
- Webhook endpoints verify signatures
- Cron endpoints protected by secret tokens
- Rate limiting on file uploads

### Session Management

- JWT tokens with expiration
- Session validated on every request
- Secure cookie attributes enforced
- Sessions invalidated on logout

### Error Handling

- Structured error responses (no sensitive data leaked)
- Server errors logged to Sentry
- Passwords and tokens stripped from logs

---

## 8. Infrastructure Security

### Hosting Security (Replit / Google Cloud Platform)

- Automatic HTTPS with TLS 1.2+
- DDoS protection
- Automatic security patching
- SOC 2 Type II certified

### Database Security (Supabase)

- Encrypted connections required
- Automatic backups
- Point-in-time recovery available
- SOC 2 Type II certified

### Secrets Management

- Environment variables stored encrypted
- Service role keys never exposed to client
- API keys rotatable without code changes

---

## 9. Current Security Posture

### Implemented Controls

- Row-Level Security on all sensitive tables
- PII scrubbing before AI processing
- Input validation and HTML sanitization
- JWT-based authentication with secure cookies
- Role-based access control
- Webhook signature verification
- Session timeout with warning (45-minute inactivity auto-logout)

### Recommended Enhancements (Not Yet Implemented)

| Enhancement                       | Status                          | Priority |
| --------------------------------- | ------------------------------- | -------- |
| Multi-Factor Authentication       | Supabase-supported, not enabled | High     |
| HTTP Security Headers (CSP, HSTS) | Not configured                  | Medium   |
| IP-based rate limiting on login   | Not implemented                 | Medium   |

These enhancements can be prioritized based on district requirements.

---

## 10. Incident Response

### Monitoring

- Real-time error tracking via Sentry
- Health check endpoints for system status
- Database query performance monitoring

### Incident Notification

Districts will be notified of security incidents affecting their data within 72 hours of discovery, including:

- Nature of the incident
- Data potentially affected
- Remediation steps taken
- Contact information for questions

### Data Breach Response

In the event of a confirmed data breach:

1. Immediate containment and investigation
2. District notification within 72 hours
3. Regulatory notification as required
4. Root cause analysis and remediation
5. Post-incident report provided to affected districts

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

| Domain          | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `speddy.xyz`    | Main application                                     |
| `*.supabase.co` | Authentication and database (client-side auth flows) |
| `*.sentry.io`   | Error monitoring (client-side error reporting)       |

### Single Sign-On (SSO)

SSO integration is not currently available. If required, please contact us to discuss implementation options.

### Data Export

Individual progress reports can be exported. Comprehensive bulk data export for district records or migration is available upon request—contact support@speddy.com.

---

## 12. Frequently Asked Questions

**Q: Where is our data stored?**
A: All data is stored in United States data centers via Supabase (database) and Replit/Google Cloud Platform (application).

**Q: Can we get a copy of our data?**
A: Yes. Administrators can export data through the application, or request a full data export by contacting support.

**Q: What happens to our data if we stop using Speddy?**
A: Upon contract termination, all district data can be exported and then permanently deleted upon request.

**Q: Is student data used to train AI models?**
A: No. Data sent to Anthropic's API is not used for model training under their business API terms. Additionally, PII is scrubbed before any data reaches the AI service.

**Q: Do you conduct penetration testing?**
A: We conduct regular security reviews of the codebase. Formal penetration testing can be arranged upon request.

**Q: Can we review your SOC 2 report?**
A: Our infrastructure providers (Supabase, Replit/Google Cloud Platform) maintain SOC 2 Type II certifications. Their reports are available upon request.

**Q: Do you have a Data Processing Agreement (DPA)?**
A: Yes. We can provide a DPA that meets district requirements. Contact us to initiate the agreement process.

---

## 13. Contact Information

**Security Questions**: security@speddy.com
**Technical Support**: support@speddy.com
**Data Processing Agreements**: legal@speddy.com

---

## Document Information

| Item             | Value         |
| ---------------- | ------------- |
| Document Version | 1.0           |
| Last Updated     | December 2025 |
| Review Frequency | Quarterly     |

---

_This document describes Speddy's security and privacy implementation as of the date above. Security practices are continuously improved, and this document will be updated accordingly._
