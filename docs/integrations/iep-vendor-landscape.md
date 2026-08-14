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
> Companion to [**SEIS — can we pull data automatically?**](./seis.md) (the same
> question asked about California) and
> [**SEIS — how to approach CodeStack**](./seis-outreach.md) (how we make that
> ask). Related: the *SIS Integration* project (SPE-392 → SPE-420).
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
| **Frontline IEP** (formerly IEP Direct) | Strong in NJ, NY, PA, TX | Documented third-party integrations; SOC 2; sFTP flat files + API over SSL | **CentralReach LiftEd receives an automated nightly feed carrying student demographics *and IEP goals and objectives*** — delivered as two files (a Student File and an IEP File), updated nightly as new IEPs are issued, at no cost to NJ districts. Also integrates with Genesis Educational Services, Education Solutions Development, Computer Resource Inc., Computer Solutions Inc., and Mindex SchoolTool. |
| **Everway** (Embrace + SpedTrack) | SpedTrack alone across 26 states, strong Midwest/South | Publishes a public integration guide; advertises two-way SIS sync | Consolidating fast, see below |
| **PowerSchool Special Programs** | Very large | Formal **ISV Partner Program** with a three-badge certification process (integration testing, survey, session with a PowerSchool solutions engineer); Special Programs integrates via the PowerSchool SIS REST API | **Stepwell**, a third-party special-education compliance and monitoring platform, integrated with Special Programs |
| **PCG** (EDPlan / EasyIEP) | EDPlan 3,000+ districts; EasyIEP across 30+ states; runs statewide systems | Least approachable directly — statewide contracts, government-consulting sales motion | But they **co-authored the Ed-Fi special education standard** (below), which may matter more |

### The Frontline precedent deserves emphasis

A third-party special-education application **already receives a nightly
automated feed of live IEP data — including goals and objectives — from a major
IEP vendor.** Per CentralReach's own documentation the sync produces a *Student
File* with demographics and an *IEP File* containing goals and objectives,
delivered nightly to a secure site.

That matters more than a generic "they do integrations." **Goal text is the hard
part** — it's the one thing no SIS-mediated path we've examined can carry (see
`docs/integrations/aeries-sped-mapping.md`, gap #3), and it's the reason the
SEIS problem stays manual. Frontline is proof that a commercial IEP vendor will
move goal data to a third party when a district wants it. When we approach them
we're asking for a second instance of an established pattern, not a first.

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

**Second, it is the first *vendor-neutral* standard for goals we've found.**
Goal text is the part that stays stuck: it's free-text IEP content, and none of
the SIS-mediated paths we've actually examined expose it —
`docs/integrations/aeries-sped-mapping.md` lists it as gap #3 for **Aeries**,
which is the only SIS API we've inspected in depth.

Scope that honestly: it's a finding about the paths we've reviewed, not a law
about every SIS. Another vendor's special-education module, a custom field
mapping, or a different API may well expose goals, and we haven't checked —
Infinite Campus's special-education surface (below) is explicitly unverified.
Don't discard a non-Aeries district's SIS path on this basis without inspecting
that SIS first.

What's distinctive about SEDM is that it isn't vendor-specific. Frontline
already moves goals to a third party (above), but on Frontline's terms, for
Frontline customers. SEDM is the first serious attempt to model IEP goals as
structured, exchangeable data in a standard anyone can implement. If it takes
hold, the hardest part of this problem stops being N private negotiations and
becomes one implementation.

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

**A possible credibility hook — but not yet.** The CA-NDPA we're working through
is a Student Data Privacy Consortium instrument, and SDPC sits inside Access 4
Learning, the same standards community where SEDM lives in CEDS. That's a real
connection *once it's real*: as of this writing the DPA is unsigned and
**CITE/CSPA registration is still outstanding**
(`docs/ndpa/ca-ndpa-execution-packet.md` §8, item 17). **Do not describe Speddy
as a participant in that community during outreach until registration is
complete** — describe the draft-agreement work instead. Overstating affiliation
to a standards body is precisely the kind of claim that costs credibility the
moment someone checks it (the SPE-134 claim-accuracy principle).

## What does not get easier anywhere

- **Rostering aggregators will not solve this.** Clever, ClassLink and Edlink
  carry demographics, rosters, sections and SSO. They do **not** carry IEP
  content. They solve a different problem and are not a shortcut here.
- **Every path still needs district approval and a FERPA-compliant data-sharing
  basis.** That's a feature, not vendor obstruction. No standard or partner
  program removes it.
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
   breach of its PowerSource support portal, disclosed to customers on 7 January
   2025 and affecting a very large number of students across many thousands of
   schools. (Reported record counts and "largest ever" framings vary by outlet;
   we haven't verified any specific figure against a primary source, and none of
   them change the conclusion — the posture is what matters.) They also own the
   SIS, so they are partly a competitor.
4. **Ed-Fi SEDM.** Not a partner — a standard. Engage now: read the model,
   comment on RFC 28b, join the community conversation. Nearly free, costs
   nothing if it stalls, and positions us early on the only generic path to
   goals. It will not deliver data next quarter.

## Keeping this in proportion

SEIS covers 1,500+ California LEAs (`docs/integrations/seis.md`; CodeStack's own
page cites 1,100+ districts — the discrepancy is recorded in
`docs/integrations/seis-outreach.md` and doesn't change the argument), and we
have a pilot there. **This is not an argument to leave California.** It's an argument that
the integration story gets dramatically better the moment we sell outside it —
useful mainly for deciding where we expand *second*, and as a reason to suspect
the manual-upload burden may be specific to the California SEIS workflow rather
than a permanent feature of the category. That's a hypothesis this scan
motivates, not one it proves — a single automated feed at one vendor doesn't
establish that districts elsewhere avoid manual uploads.

## Verification limits

Every **vendor-side** claim here comes from public sources, and **none of it has
been confirmed with a vendor.** (The Speddy-side facts — our pilot district, our
NDPA status, what our importer accepts — are internal and cited to repo docs in
*Source of truth* below.) Specifically:

- `docs.ed-fi.org`, `spedtrack.com` and `help.theliftedapp.com` are **blocked by
  this environment's network egress proxy**, so the Ed-Fi SEDM details,
  SpedTrack's integration posture, and the LiftEd field list are grounded in
  search-result excerpts and secondary pages rather than a direct read. The SEDM
  entity list and the "special education vendors rather than SIS vendors"
  guidance should be confirmed against the Ed-Fi docs directly before we design
  against them.
- **The Frontline→LiftEd goals claim is the load-bearing one in this document**
  and rests on two **separate but both CentralReach-authored** sources (their
  blog and their release notes) rather than a direct read of the LiftEd help
  article. Two documents from the same company are not independent
  corroboration.
  Confirm it before we build a strategy on it. And note: what that feed carries
  for *them* is not a commitment of what it would carry for us.
- **The Stepwell↔PowerSchool integration is unverified** — it surfaced in a
  search summary of PowerSchool's partner material, and we have no primary
  source for its scope. Treat it as "a third-party SpEd tool appears to have
  integrated," not as a known-good precedent.
- **Everway's integration posture is inferred**, not documented to us. The
  acquisition facts are sourced (below); the claim that they'd be easiest to
  engage is a judgement call about company size and incentives.
- Vendor footprint numbers come from vendor marketing and vary by source.
- General market-size figures were deliberately excluded; the available sources
  were low-quality SEO market-research aggregators and none of them would change
  a decision.

## Sources

- **Ed-Fi:** [v6.1 release notes](https://docs.ed-fi.org/reference/data-exchange/data-standard/whats-new/whats-new-v61/) ·
  [A4L — SEDM in CEDS](https://files.a4l.org/home/Events/2025_03_17_A4L-Annual-Meeting/Presentations/2025_03_19-3b-SEDM.pdf) ·
  [Ed-Fi state case studies](https://www.ed-fi.org/resources/case-studies/indiana/) ·
  [Data Standard overview](https://docs.ed-fi.org/reference/data-exchange/data-standards/)
- **Frontline:** [Frontline + CR LiftEd — integrating data collection with IEP management](https://centralreach.com/blog/frontline-and-cr-lifted-integrating-data-collection-with-iep-management/)
  and [LiftEd 4.7.0 release notes](https://centralreach.my.site.com/s/article/lifted-4-7-0-frontline-iep-integration-platform-stability-and-bug-fixes)
  (the two sources for the *Student File + IEP File containing goals and
  objectives* claim) ·
  [CR LiftEd ↔ Frontline IEP automated integration](https://help.theliftedapp.com/en/articles/8181959-the-frontline-iep-automated-integration-with-cr-lifted)
  (egress-blocked here) ·
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
