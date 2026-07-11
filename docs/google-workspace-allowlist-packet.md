# Speddy — Google Workspace App Access Request (District IT Packet)

**For the district's Google Workspace administrator.** This packet explains
what Speddy is, exactly what Google account access it requests and why, how
that data is protected, and the one console action needed to allow staff to
use it. Companion documents (available on request or in this repository):
`speddy-technical-security-overview.md`, `data-inventory.md`,
`subprocessors.md`, `incident-response-plan.md`, `offboarding-runbook.md`.

_Prepared 2026-07-11 · Tracked in SPE-204 · Contact: help@speddy.xyz_

---

## 1. The request

Mark Speddy's OAuth application as **Trusted** (or "Allowed") in the
district's Google Workspace admin console so that staff who choose to can
connect their district Google Calendar to Speddy:

**Admin console → Security → Access and data control → API controls →
App access control → Configure new app** → search by the OAuth client ID
below → select **Trusted**.

| App | OAuth client ID | Needed for |
|---|---|---|
| Speddy — Google Calendar integration | `<CALENDAR_OAUTH_CLIENT_ID>.apps.googleusercontent.com` | Staff connecting their calendar for IEP meeting scheduling (this request) |
| Speddy — Sign in with Google | `<SIGN_IN_OAUTH_CLIENT_ID>` *(optional, same app)* | Staff signing in to Speddy with their district Google account instead of a password |

Two important properties of this request:

- **Trusting the app grants no data access by itself.** Speddy uses per-user
  OAuth consent — each staff member individually chooses to connect and sees
  Google's consent screen listing exactly what is shared. There is **no
  service account and no domain-wide delegation**; the district is unblocking
  individual consent, not granting blanket access.
- **Only staff accounts are involved.** Students do not have Speddy accounts
  and no student Google account is ever touched.

## 2. What Speddy is

Speddy (Orchestrate LLC, Sacramento, CA) is a special-education service
management platform for school districts: provider scheduling, IEP compliance
tracking, and team coordination. It is FERPA-positioned, US-hosted
(database and storage in Supabase's us-west-1 / Northern California region),
and offered to California LEAs with the **CA-NDPA Standard v1.5** (CITE /
California Student Privacy Alliance) — execution packet prepared and
available on request.

## 3. What the calendar integration does

Scheduling an IEP meeting means finding a time that works for the site
administrator, the case manager, the general-education teacher, service
providers, and the family. Speddy's calendar integration is rolling out in
phases: **staff calendar connections are live today**, and the meeting
scheduler then uses those connections to read **availability** (free/busy)
and deliver confirmed meetings as **ordinary Google Calendar invitations**
sent from the organizer's own calendar — so reminders, RSVPs, and
reschedules work the way staff already expect. The scopes below are exactly
what a staff member consents to when connecting; district approval is
requested once, ahead of that rollout.

## 4. Exactly what access is requested, and why

Speddy requests the **minimum** Google OAuth scopes for the feature:

| Scope | What it allows | Why Speddy needs it |
|---|---|---|
| `https://www.googleapis.com/auth/calendar.freebusy` | Busy/free times only — no event titles, descriptions, or attendees — for the connecting user's calendars and calendars already visible to them under Google's own sharing rules | Find meeting times that avoid existing commitments without exposing what those commitments are |
| `https://www.googleapis.com/auth/calendar.events.owned` | Google's wording: "See, create, change, and **delete** events" on calendars the user **owns** (not calendars merely shared with them) | Create the IEP meeting invitation from the organizer's calendar, update or delete it on reschedule/cancellation, and read RSVP responses. By design, Speddy modifies or deletes only events it created |
| `openid`, `email` (non-sensitive) | The connected account's email address | Show "Connected as name@district.org" and detect wrong-account connections |

Deliberately **not** requested: `calendar` (full read/write of all calendars),
`calendar.events` (events on all visible calendars), Gmail, Drive, Contacts,
or any other Google service. The scope set is pinned by an automated test in
Speddy's codebase so it cannot drift silently.

## 5. What Speddy will never do with Google data

Speddy's use of Google user data adheres to the **Google API Services User
Data Policy, including the Limited Use requirements**, disclosed publicly in
the privacy policy (https://www.speddy.xyz/privacy, §5):

- No advertising use of any kind
- No sale of Google user data; no transfers except to operate the feature
  (encrypted storage/hosting with Supabase and Vercel), for security, or as
  required by law — no other third parties receive it
- No human access except with explicit permission, for security/abuse
  investigation, legal compliance, or in aggregated anonymized form
- No use of Google user data to train AI/ML models
- Free/busy data is processed **transiently** to compute open meeting times —
  Speddy does not retain a copy of anyone's calendar

## 6. How the credentials are protected

- **OAuth tokens are encrypted at the application layer** (AES-256-GCM) with
  a key held only in server environment configuration — the database stores
  ciphertext only, on top of Supabase's disk-level AES-256 encryption
- Database rows are protected by **owner-only row-level security**: no other
  user, including district administrators within Speddy, can read a staff
  member's connection
- Tokens are **never written to logs**; token requests to Google carry
  short timeouts and sanitized error handling
- Connect and disconnect events are **audit-logged**
- **Disconnect is self-serve**: one click in Speddy deletes the stored tokens
  and makes a best-effort revocation of the grant at Google; staff can also
  revoke at any time from their Google Account permissions page, and the
  district can revoke domain-wide by removing the app's trusted status
- Platform posture (TLS 1.2+, RLS on every table, NIST CSF 1.1
  self-assessment, 72-hour breach notification commitment, written incident
  response plan, deletion/offboarding runbook) is detailed in the
  companion **Technical & Security Overview**

## 7. Google verification status

Speddy's OAuth application is currently in Google's **Testing** mode while
formal app verification is completed with Google's Trust & Safety team
(domain ownership verified; privacy policy updated with the required
disclosures; verification submission in progress). In Testing mode, only
individually registered test users can connect at all — combined with
per-user consent, district exposure during evaluation is limited to the
specific staff members who opt in.

## 8. Offboarding

If the district stops using Speddy: remove the app's trusted status (blocks
all new and existing grants at the Google layer), and Speddy deletes stored
connections on request per the deletion runbook — alongside the standard
NDPA data-destruction obligations.

---

**Questions / requests for any companion document:** help@speddy.xyz
(Blair Stewart, Orchestrate LLC).
