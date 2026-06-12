# Attorney Review Brief — California Student Data Privacy Agreement (CA-NDPA)

**Prepared for counsel reviewing Orchestrate LLC's execution of the CA-NDPA
Standard Version 1.5 via CITE / the California Student Privacy Alliance.**

June 2026 · Prepared by Orchestrate LLC (with AI assistance — verify before
relying) · Contact: help@speddy.xyz

---

## A. Background (read first)

**The company.** Orchestrate LLC is a California LLC, single-member (Blair
Stewart, Owner), principal address 2108 N St Ste N, Sacramento, CA 95816. It
operates **Speddy** (speddy.xyz), a SaaS platform for K-12
special-education service providers: caseload management, IEP goal tracking,
service scheduling, attendance, progress monitoring, worksheet
storage/grading, and special-education referral/eligibility (SST/CARE)
workflows. Customers are California school districts and their staff.

**The data.** Speddy processes student education records protected by FERPA
and California student-privacy law: student names and DOB (optional,
provider-entered; initials are the core identifier), IEP goals and
accommodations, special-education eligibility-process records (testing
dates, outcomes, eligibility categories), schedules, attendance, assessment
results, and scanned images of student work. It does **not** collect
parent/guardian or student contact information, SSNs, demographics
(race/ethnicity/gender), health data beyond special-education status, or
transcripts. A companion Chrome extension reads student data from SEIS (the
state special-education information system) with the provider's
authorization, for discrepancy detection; it caches a small dataset (SEIS
ID, name, grade, school) on the provider's own device with a 7-day TTL.

**The agreement.** The CA-NDPA is a standard-form agreement maintained by
CITE (California IT in Education) and the California Student Privacy
Alliance. Districts expect it as-is; providers fill in exhibits rather than
negotiate clauses. Key structure: Standard Clauses (Version 3.0) + Exhibit A
(services), Exhibit B (Schedule of Data — checkbox disclosure of data
elements), Exhibit C (definitions), Exhibit D (disposition form, unused at
signing), Exhibit E (General Offer of Privacy Terms — lets other districts
adopt the same DPA by signature), Exhibit F (approved cybersecurity
frameworks), Exhibit G (California supplemental terms + AI addendum). Term:
3 years.

**Current AI posture (important).** The codebase contains AI features
(OpenAI/Anthropic) that are **disabled platform-wide** by a server-side
gate; the AI routes return 404 and transmit nothing to AI providers. DPAs
with both AI vendors are executed and on file. The plan is to sign the AI
addendum as "No AI used at this time" with a planned-use disclosure.

**Enclosures to review alongside this brief:**

1. The filled CA-NDPA v1.5 PDF (cover, Exhibits A, B, E, G completed)
2. `ca-ndpa-execution-packet.md` — field-by-field map, draft exhibit text, gaps
3. `data-inventory.md` — element-by-element data inventory (basis of Exhibit B)
4. `subprocessors.md` — subprocessor register and DPA status
5. `speddy-technical-security-overview.md` — district-facing security document
6. `incident-response-plan.md` — written IR plan (required by Art. V §4(3))
7. `security-framework-mapping.md` — NIST CSF 1.1 self-assessment
8. `offboarding-runbook.md` — deletion/return tooling backing Art. IV §6
9. Subprocessor DPA records (OpenAI, Anthropic, Help Scout; Supabase/Sentry/Vercel in progress)

---

## B. Items for review

Each item states the background, our intended position, and the specific
question. Items 1–5 are substantive; 6–12 are confirmations; 13–15 are
adjacent risk areas you should know about even though they are not strictly
NDPA terms.

### 1. Overall acceptability of the Standard Clauses (substantive)

The Standard Clauses are effectively non-negotiable, but Orchestrate should
understand what it is accepting. Provisions worth a careful read:

- **Art. II §1**: Student Data remains LEA property; provider acts as a
  FERPA "School Official" under LEA direction.
- **Art. IV §6**: 60-day disposition (deletion or transfer) on written
  request; destruction on termination.
- **Art. V §2**: annual audit right for each LEA (10 business days' notice,
  confidentiality agreement) plus regulatory-agency cooperation; failure to
  cooperate is a material breach.
- **Art. V §4**: 72-hour breach notification with prescribed content.
- **Art. VII §6**: governed by the law of the LEA's state, exclusive venue
  in the LEA's county — for every subscribing district.
- **Art. VII §7**: 60-day notice of merger/sale; LEA may terminate if it
  disapproves of a successor.

**Question:** any of these you'd flag as unacceptable risk for a
single-member LLC at this scale, or anything you'd want mitigated
operationally (e.g., insurance — see item 13)?

### 2. General Offer of Privacy Terms — Exhibit E (substantive)

We intend to **sign the GOPT**. Effect: any other LEA that signs a service
agreement with us can adopt this DPA's privacy terms by signature, without
renegotiation, until 3 years from our signature. We can withdraw the offer
on a material change in law or services. This multiplies the audit,
venue, and notification obligations in item 1 across every subscriber.

**Question:** confirm signing is sensible (it is the standard CSPA scaling
path), and confirm the withdrawal/expiry mechanics are understood correctly.

### 3. AI Addendum stance — Exhibit G (substantive)

We intend to check **"No AI used at this time"** on the AI Schedule of
Data, and include two free-text disclosures (drafted in the execution
packet, §4) stating: AI features exist in the codebase but are disabled
platform-wide; zero data flows to AI vendors today; vendor DPAs are
executed; and before enabling we will de-identify prompts, obtain
zero-data-retention handling, give LEAs notice per Exhibit G §4.1, and
submit an updated AI Schedule per §4.2.

**Questions:** (a) is "No AI used at this time" the correct representation
given disabled-but-present code paths? (b) Does the planned-use narrative
create any unintended commitment? (c) When we later enable AI, is notice +
updated schedule sufficient, or should we expect to execute an amendment
with each LEA? (Our internal gate-checklist for enablement is Linear
SPE-174.)

### 4. Exhibit B Schedule of Data — four judgment calls (substantive)

The full draft (with the database table behind every checkbox) is in the
execution packet §3. Four framing decisions need sign-off:

a. **"Communications" left unchecked.** The form's element is "online
   communications captured (emails, blog entries)" — students never
   communicate through Speddy. Provider-authored session/meeting notes
   *about* students are disclosed under the "Other" category instead.
b. **"Observation data" (under Assessment) left unchecked**, same
   reasoning — provider notes are disclosed under "Other."
c. **"Student Program Membership" left unchecked** — instructional service
   grouping is disclosed under Schedule; students don't join
   academic/extracurricular programs in Speddy.
d. **"State ID number" checked, with an explanatory note** that the SEIS ID
   (SSID) is read by the Chrome extension and cached only in the provider's
   local browser storage (7-day TTL, cleared on logout/key revocation), and
   is never stored on Speddy's servers. We chose over-disclosure with
   context rather than leaving it unchecked.

**Question:** confirm each, or direct re-categorization. Guiding principle
used: disclose everything, in the closest category, with honest specifics.

### 5. Cybersecurity framework representation — Art. V §3 / Exhibit F (substantive)

Art. V §3 commits the provider to "implement an adequate Cybersecurity
Framework based on one of the nationally recognized standards set forth in
Exhibit F." We have designated **NIST CSF 1.1** and prepared a
self-assessment mapping (`security-framework-mapping.md`) with a candid
gaps table (no formal pen test, no SSO, audit logging in progress, etc.).
There is no certification or third-party audit.

**Questions:** (a) is a documented self-assessment sufficient to make this
representation in good faith? (b) The clauses say framework
exclusions/variances "must be detailed in an attachment to Exhibit H" — but
the v1.5 PDF contains **no Exhibit H page** (we are asking CITE about this,
Linear SPE-172). Should any of our listed gaps be formally documented as
variances, and if so, how, given the missing exhibit?

### 6. Cover-page state-law blank (confirmation)

The preamble has a blank after "applicable state privacy laws and
regulations ___". If the locked PDF doesn't pre-fill it, we believe the
appropriate references are SOPIPA (Cal. Bus. & Prof. Code §§ 22584–22585)
and Cal. Ed. Code § 49073.1 (AB 1584). **Confirm wording.**

### 7. Entity, authority, signature blocks (confirmation)

Blair Stewart, Owner, signs for Orchestrate LLC in three places (DPA p. 3,
Exhibit E, Exhibit G). Art. VII §8 has each party represent authority to
bind all employees/contractors with data access. **Confirm a single-member
LLC owner's signature suffices and the title "Owner" is appropriate.**

### 8. Designated representative (confirmation)

Blair Stewart, Owner, 2108 N St Ste N, Sacramento, CA 95816,
help@speddy.xyz, phone on file. This contact also serves as the Art. V §3
security contact. **Any concern with one person holding both roles?**

### 9. Breach notification & IR plan (confirmation)

Art. V §4 requires 72-hour notification with five content elements and a
written IR plan producible on request. Our plan
(`incident-response-plan.md`) mirrors the clause. **Skim for adequacy —
especially Section 6 Phase 3 (notification) and the records section.**

### 10. Data return & destruction (confirmation)

Deletion tooling (per-student cascade including stored images,
account deletion, district offboarding, extension-cache clearing) is built
and documented. Comprehensive **bulk export is not built**; a district's
"transfer" disposition or data-return request would be fulfilled manually
within the 60-day window (current scale: ~100 students). We've decided to
accept this and not gate signing on an export feature. **Confirm this is a
defensible reading of Art. IV §6 / Exhibit D.**

### 11. Subprocessor flow-down — Art. II §5 (confirmation, one open item)

Status: OpenAI + Anthropic DPAs executed; Help Scout DPA incorporated via
ToS with DPF/SCCs; Supabase DPA being signed via their dashboard; Sentry
DPA being click-accepted. **Open item:** production hosting is currently on
Vercel's **Hobby** plan, whose DPA applies to Pro/Enterprise customers —
we are upgrading to Pro before signing (Linear SPE-173). **Confirm the
resulting set satisfies "no less stringent" flow-down.**

### 12. Public-policy consistency (confirmation)

Preamble ¶3 and Art. VII §3 make the DPA control over our ToS/privacy
policy on conflict. Our privacy policy and FERPA notice (speddy.xyz/privacy,
speddy.xyz/ferpa) were recently reconciled with actual practice. **Spot-check
that nothing in them conflicts with the DPA** (e.g., retention or deletion
language).

### 13. Insurance (adjacent — your advice sought)

The NDPA does not require insurance, but the obligations in items 1 and 2
(breach response across many districts, audit cooperation, venue in any
LEA's county) are exactly what cyber-liability policies cover. Orchestrate
currently has none. **Advise whether cyber/E&O coverage should precede
signing, and at what limits.**

### 14. Chrome extension reading SEIS (adjacent — flag)

The extension reads student data from SEIS pages in the provider's
authenticated browser session and sends it to Speddy. SEIS is operated by
the San Joaquin County Office of Education. We have not reviewed SEIS's
terms of use for automated access/scraping restrictions. This is outside
the NDPA but is a data-flow counsel should be aware of when blessing the
overall posture. **Flag if this needs separate review before broad rollout.**

### 15. COPPA representation (adjacent — confirmation)

The DPA recites COPPA. Speddy has no student-facing accounts and collects
nothing directly from children; all data is entered by school staff (or
read from SEIS by staff-authorized tooling). **Confirm the COPPA recital
creates no obligations beyond this posture.**

---

## C. What we need back

1. Go / no-go (or required changes) on items 1–5
2. Confirmations on items 6–12
3. Advice on items 13–15
4. Any redlines to the draft exhibit text in `ca-ndpa-execution-packet.md`
   §§2–4 before we transcribe it into the fillable PDF

After sign-off we execute (DPA + Exhibit E + Exhibit G), submit through
CITE/CSPA, and calendar the 3-year term.
