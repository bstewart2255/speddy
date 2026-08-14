# IEP systems outside California — who is actually open to integrating?

> **Market research, 2026-08-14.** Answers the question: *if we sell outside
> California, where SEIS isn't used, are the other IEP data/compliance systems
> more amenable to integrations?*
>
> **Short answer: yes, substantially — and for a structural reason, not a
> technical one.** Three of the four major vendors already run third-party
> integrations in production, one of which is almost exactly what we want. And a
> new open standard (Ed-Fi's Special Education Data Model, May 2026) is the first
> credible path to the one thing no SIS integration can ever carry: **goal text**.
>
> Companion to `docs/integrations/seis.md` (the same question asked about
> California) and `docs/integrations/seis-outreach.md` (how we approach
> CodeStack). Related: the *SIS Integration* project (SPE-392 → SPE-420).
>
> **This is a market scan, not a build plan.** Nothing here has been verified
> against a vendor directly — see *Verification limits* at the bottom before
> relying on any single claim.

## Why the answer is structural

In California the IEP system is run by a **public agency**. CodeStack is a
department of the San Joaquin County Office of Education, it has a near-monopoly
across California SELPAs, and it has no commercial reason to build a partner
program. Public agencies don't chase integration partnerships; they manage
support burden and risk.

Everywhere else the IEP system is a **private vendor competing for district
contracts**, and "we integrate with the other tools you use" is something they
put in sales collateral. That flips the incentive completely: we stop asking a
public agency for a favor and start offering a vendor a selling point.

## The four that matter

| Vendor | Footprint | Openness | The precedent |
|---|---|---|---|
| **Frontline IEP** | Strong in NJ, NY, PA, TX | Documented third-party integrations; SOC 2; sFTP flat files + API over SSL | **CentralReach LiftEd receives an automated nightly send of new-student demographics *and* in-force IEP data**, plus updates and newly issued IEPs through the year — provided at no cost to NJ districts. Also integrates with Genesis Educational Services, Education Solutions Development, Computer Resource Inc., Computer Solutions Inc., and Mindex SchoolTool. |
| **Everway** (Embrace + SpedTrack) | SpedTrack alone across 26 states, strong Midwest/South | Publishes a public integration guide; advertises two-way SIS sync | Consolidating fast, see below |
| **PowerSchool Special Programs** | Very large | Formal **ISV Partner Program** with a three-badge certification process (integration testing, survey, session with a PowerSchool solutions engineer); Special Programs integrates via the PowerSchool SIS REST API | **Stepwell**, a third-party special-education compliance and monitoring platform, integrated with Special Programs |
| **PCG** (EDPlan / EasyIEP) | EDPlan 3,000+ districts; EasyIEP across 30+ states; runs statewide systems | Least approachable directly — statewide contracts, government-consulting sales motion | But they **co-authored the Ed-Fi special education standard** (below), which may matter more |

### The Frontline precedent deserves emphasis

A third-party special-education application **already receives a nightly
automated feed of live IEP data from a major IEP vendor.** That is precisely the
thing we're trying to get out of SEIS, it exists in production for somebody
else, and it was framed as a benefit to districts rather than a favor to a
vendor. When we approach Frontline we are asking for a second instance of an
established pattern, not for a first.

### Everway is consolidating the mid-market

Worth tracking as a single entity now rather than as separate products:

- **March 2024** — Everway formed from the merger of n2y and Texthelp; majority
  backed by Five Arrows (Rothschild & Co).
- **30 January 2025** — Embrace Education joins Everway.
- **8 January 2026** — SpedTrack joins Everway, from Euna Solutions. (Ownership
  chain: Ion Wave Technologies → GTY Technology, renamed Euna Solutions →
  Everway.) SpedTrack was founded 20+ years ago in Springfield, MO. Everway
  stated no immediate changes for SpedTrack customers and that the brand
  continues for the foreseeable future.

Private-equity-backed roll-ups want ecosystem stories and move faster than
either a public agency or a large incumbent. This is likely the easiest group to
actually get on a call.

### Statewide systems are a different game

Some states run one IEP system for everyone — North Carolina's **ECATS** (PCG)
covers all PK-13 public schools; Tennessee's **TN PULSE** is the state system of
record for IEPs and 504 plans, having replaced EasyIEP. These are the *least*
amenable to a small vendor asking directly, because the relationship is a state
procurement, not a district one. The flip side is obvious: win the state and you
win every district in it. That's a much later-stage motion than where we are.

## The bigger finding: Ed-Fi's Special Education Data Model

**Ed-Fi Data Standard v6.1 (released 7 May 2026)** introduced an **early-access
Special Education Data Model (SEDM)** — five new entities covering the IEP
itself (`studentIEP`), **goals**, services/prescriptions, and IDEA compliance
events, with supporting descriptors. It was developed collaboratively by **PCG,
Education Analytics, and the South Carolina Department of Education**. Feedback
runs through Data Standard RFC 28b. The model also appears in CEDS via the
Access 4 Learning community.

Two things make this the most strategically interesting item in this document.

**First, the adoption guidance points directly at companies like us.** To limit
implementation overhead while the model matures, Ed-Fi recommends **initial
adoption by special education vendors rather than SIS vendors.** That is an open
door aimed at exactly our category.

**Second, it is the only path that has ever addressed goals.** The reason the
SEIS problem is hard — and the reason `docs/integrations/aeries-sped-mapping.md`
lists goal text as gap #3 — is that goals are free-text IEP content with no
field in any student information system to land in. Every SIS-mediated path we
have (Aeries today, any other SIS tomorrow) structurally cannot carry them.
SEDM is the first serious attempt to model IEP goals as structured, exchangeable
data. If it takes hold, the hardest part of this problem stops being N private
negotiations and becomes a standard we implement once.

**Caveats, stated plainly:**

- It is **early access**, roughly three months old, and explicitly expected to
  evolve on community feedback. No production implementation turned up.
- **Adopting a standard does not deliver data.** A district still has to
  authorize a feed. SEDM changes the shape of the pipe, not the permission.
- **Ed-Fi adoption is state-by-state.** Ed-Fi's own published case studies name
  Indiana, Michigan, Texas, Arizona, Nebraska and South Carolina; 29 states were
  represented at their 2025 Technical Congress. **California is not among the
  named states** — it runs CALPADS, its own system in its own format. Treat that
  as an absence in Ed-Fi's marketing rather than a confirmed negative, but no
  evidence of statewide California Ed-Fi adoption turned up. Either way, this is
  an advantage we only get by selling outside California.

**A cheap credibility hook:** the CA-NDPA we're already executing is a Student
Data Privacy Consortium instrument, and SDPC sits inside Access 4 Learning — the
same standards community where SEDM lives in CEDS. We're already a participant
in that world, which is worth saying out loud when we engage.

## What does not get easier anywhere

- **Rostering aggregators will not solve this.** Clever, ClassLink and Edlink
  carry demographics, rosters, sections and SSO. They do **not** carry IEP
  content. They solve a different problem and are not a shortcut here.
- **Every path still requires district authorization.** That is FERPA, not
  vendor obstruction, and it is correct. No standard or partner program removes
  it.
- **The per-district sales motion is unchanged.** An integration makes the
  product better; it does not make distribution free.
- **Infinite Campus is gated.** Per third-party integration documentation
  (Edlink), full Campus API access requires a partnership-level commitment, and
  developers without one are limited to OneRoster — which is rostering, so it
  doesn't reach IEP content anyway. No specifics on their special education
  module's API surface turned up; unverified.

## Recommended order of approach

At our stage the right ranking is not "biggest install base." It's **who will
answer an email and has done this before.**

1. **Frontline.** Has the exact precedent, meaningful footprint in NJ/NY/PA/TX,
   and has already decided this is a thing they do. Best first conversation.
2. **Everway (SpedTrack / Embrace).** Smallest and hungriest of the group,
   publishes integration documentation, 26 states. Most likely to actually
   engage a startup.
3. **PowerSchool Special Programs.** Real program, real precedent, but
   large-company slow — and understandably conservative since the December 2024
   breach of its PowerSource support portal (disclosed to customers 7 January
   2025; roughly 60M student and 10M teacher records across ~18,000 districts;
   the largest K-12 education data breach on record). They also own the SIS, so
   they are partly a competitor.
4. **Ed-Fi SEDM.** Not a partner — a standard. Engage now: read the model,
   comment on RFC 28b, join the community conversation. Nearly free, costs
   nothing if it stalls, and positions us early on the only generic path to
   goals. It will not deliver data next quarter.

## Keeping this in proportion

SEIS covers on the order of 1,000–1,500 California LEAs and we have a pilot
there. **This is not an argument to leave California.** It's an argument that
the integration story gets dramatically better the moment we sell outside it —
useful mainly for deciding where we expand *second*, and for knowing that the
manual-upload burden is a California-specific tax rather than a permanent
feature of the category.

## Verification limits

Everything here comes from public sources and **none of it has been confirmed
with a vendor.** Specifically:

- `docs.ed-fi.org` and `spedtrack.com` are **blocked by this environment's
  network egress proxy**, so the Ed-Fi SEDM details and SpedTrack's integration
  posture are grounded in search-result excerpts of those pages rather than a
  direct read. The SEDM entity list and the "special education vendors rather
  than SIS vendors" guidance should be confirmed against the Ed-Fi docs directly
  before we design against them.
- Vendor footprint numbers come from vendor marketing and vary by source.
- The Frontline↔CentralReach integration is described in CentralReach's and
  LiftEd's own documentation. What it carries for *them* is not a commitment of
  what it would carry for us.
- General market-size figures were deliberately excluded; the available sources
  were low-quality SEO market-research aggregators and none of them would change
  a decision.

## Sources

- **Ed-Fi:** [v6.1 release notes](https://docs.ed-fi.org/reference/data-exchange/data-standard/whats-new/whats-new-v61/) ·
  [A4L — SEDM in CEDS](https://files.a4l.org/home/Events/2025_03_17_A4L-Annual-Meeting/Presentations/2025_03_19-3b-SEDM.pdf) ·
  [Ed-Fi state case studies](https://www.ed-fi.org/resources/case-studies/indiana/) ·
  [Data Standard overview](https://docs.ed-fi.org/reference/data-exchange/data-standards/)
- **Frontline:** [CR LiftEd ↔ Frontline IEP automated integration](https://help.theliftedapp.com/en/articles/8181959-the-frontline-iep-automated-integration-with-cr-lifted) ·
  [CentralReach announcement](https://centralreach.com/blog/centralreach-announces-new-integration-with-frontline-iep-software-leader/) ·
  [Frontline Special Ed technical buying guide FAQs](https://www.frontlineeducation.com/wp-content/uploads/2018/11/Frontline_Special_Ed_Interventions_Technical_Buying_Guide_FAQs_.pdf)
- **PowerSchool:** [ISV partner badging](https://www.powerschool.com/news/powerschools-new-partner-badging-system-provides-verification-independent-software-vendor-integration/) ·
  [Special Programs plugin/integration docs](https://sp-programs.powerschool-docs.com/special-programs-sys-admin/latest/special-programs-plugin) ·
  [PowerSchool SIS incident page](https://www.powerschool.com/security/sis-incident/) ·
  [TechCrunch on the breach](https://techcrunch.com/2025/03/10/what-powerschool-isnt-saying-about-its-massive-student-data-breach/)
- **Everway:** [SpedTrack joins Everway](https://www.everway.com/news/spedtrack-joins-everway/) ·
  [Euna's announcement of the same](https://eunasolutions.com/resources/spedtrack-joins-everway-to-expand-support-for-special-education-teams/) ·
  [Embrace joins Everway](https://www.everway.com/press/embrace-education-joins-everway/)
- **PCG / statewide:** [EasyIEP](https://publicconsultinggroup.com/education/education-products/easyiep-web-based-special-education-case-management/) ·
  [EDPlan](https://www.edplan.com/) · [NC ECATS](https://www.dpi.nc.gov/districts-schools/classroom-resources/exceptional-children/every-child-accountability-tracking-system-ecats) ·
  [TN PULSE](https://www.tn.gov/education/families/student-support/special-education/tn-pulse.html)
- **Aggregators:** [Edlink supported providers](https://ed.link/docs/providers) ·
  [Edlink on Infinite Campus API access](https://ed.link/community/what-data-can-the-infinite-campus-api-access/)

**Source of truth:** this file is market research, not a description of our
system — it has no code to track. The Speddy-side facts it leans on live in
`docs/integrations/seis.md` (the manual uploads and why goals are the hard
part), `docs/integrations/aeries-sped-mapping.md` (gap #3, goal text is not in
the SIS), and `docs/ndpa/ca-ndpa-execution-packet.md` (the SDPC/NDPA tie-in).
