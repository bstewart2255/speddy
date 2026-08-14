# SEIS — how to approach CodeStack

> **Outreach plan, 2026-08-14.** Answers the question: *if we ask SEIS (or the
> team that runs it) about building an integration, what do we actually say?*
>
> This is the follow-through on the open recommendation in
> [`seis.md`](./seis.md): *"Asking CodeStack directly is the only way to close
> this… a single email could make the rest of this document moot."* That doc
> establishes **what** we want and why no public API turned up. This one covers
> **who to ask, how to frame it, and what to send.**
>
> **Status:** not yet sent. Companion to
> [**SEIS — can we pull data automatically?**](./seis.md) and
> [**IEP systems outside California**](./iep-vendor-landscape.md) (the same
> question asked about every other state). Related: SPE-276 (Chrome extension,
> parked), the *SIS Integration* project (SPE-392 → SPE-420).

## The core reframe

Don't approach them as a software vendor asking for an API. Approach as **the
tool a district they already serve has chosen**, asking a small, answerable
question.

That matters because of who "the team that runs SEIS" is. **CodeStack is a
department of the San Joaquin County Office of Education** — a public agency,
not a private software company. It serves all 58 California county offices of
education, 106 of the 120 SELPAs, and 1,100+ districts, and also builds EDJOIN,
the California School Dashboard, SARC and others.

The implications are the whole strategy:

- They are **not defending market share** the way a private vendor would. The
  competitive-threat framing that would worry a commercial IEP vendor is less
  of a factor here.
- They **have no budget or appetite for one-off vendor projects.** A request
  that reads as "please build something for us" costs them money they don't
  have and support burden they don't want.
- They **answer to their member agencies.** A SELPA or district asking for
  something carries far more weight than a startup asking.

So the strongest version of this ask has **John Swett Unified on the call with
you.** It converts the request from *"a vendor wants access to your data"* into
*"our customer wants their own data to reach a tool they bought."*

> **Figures vary by source.** `docs/integrations/seis.md` cites 115 SELPAs and
> 1,500+ LEAs; CodeStack's own page cites 106 of 120 SELPAs and 1,100+
> districts. The discrepancy is unresolved and doesn't change the argument —
> either way SEIS is the dominant California system. Don't quote a precise
> number at them; they know their own footprint.

## Three things that make or break it

**1. Say what you're not, immediately.** The default assumption on their side
will be *"this company wants to be an IEP system."* We don't. IEPs get written
in SEIS and compliance lives in SEIS; Speddy is the scheduling and caseload
layer downstream of that. Stating this in the first paragraph turns us from a
threat into something that arguably makes SEIS **stickier**, not less needed.

**2. Ask small.** Not *"please build us an API."* Ask whether a **sanctioned
path exists** for a district to authorize a third party to read a slice of its
own SEIS data — read-only, district-scoped, revocable. That is a question a
busy person can answer in one reply. "Build us an API" is a project proposal
and gets no reply at all.

**3. Point at their own product as the precedent.** They already run **SEIS
Integration** — a nightly sync between a district's SIS and SEIS, in either
direction, covering student-record fields. The machinery for moving data under
district control exists and they operate it. We're asking whether it (or
something like it) can have a district-authorized third-party endpoint — not
whether such a thing can be invented.

## The draft

Adjust the bracketed items before sending (see *Check before sending* below).

> **Subject:** Question about district-authorized data access from SEIS
>
> Hi —
>
> I'm the founder of Speddy (Orchestrate LLC, Sacramento). We're a scheduling
> and caseload-management tool for special education providers, currently in a
> pilot with John Swett Unified and [working through / operating under] a
> California NDPA with them.
>
> First, so it's clear where we sit: **we are not an IEP system and have no
> plans to become one.** IEPs get written in SEIS, and compliance lives in
> SEIS. What we handle is the week after that — building provider schedules,
> tracking sessions and service delivery, keeping caseloads organized.
>
> The problem I'm trying to solve is narrow. Today our providers export three
> reports out of SEIS — the student & goals report, deliveries, and IEP dates —
> and re-upload them to us by hand every time something changes. It's duplicate
> entry, and duplicate entry means the schedule gets built on stale data.
>
> My question: **is there a sanctioned path for a district to authorize a third
> party to read a limited slice of its own SEIS data on its behalf?** Read-only,
> scoped to that district, revocable by them at any time. I'm not asking you to
> build a public API — just whether a path exists, and if so what the process,
> requirements, and cost look like.
>
> I ask because you already run SEIS Integration for district SIS syncs, so the
> mechanics of moving data under district control clearly exist. And it's the
> standard pattern on the SIS side — Aeries districts issue read-only vendor
> certificates scoped per API, which is the shape I have in mind.
>
> If the answer is no, that's genuinely useful and I'll stop asking. If it's
> worth a conversation, I'd be glad to set one up with our pilot district on the
> line, so you're hearing the need from a member agency rather than just from me.
>
> Thanks for your time,
> Blair Stewart
> Owner, Orchestrate LLC (Speddy) · help@speddy.xyz

## Where to send it

| Channel | Notes |
|---|---|
| **Via the pilot district's SELPA** ← *preferred* | Ask John Swett who their SELPA's SEIS contact is. SELPAs have standing working relationships with CodeStack; a warm intro lands somewhere a support ticket never will. |
| [SEIS help center](https://seis.org/helpcenter) | Routes to end-user support. Likely to die there — support staff have no mandate to answer partnership questions. |
| 866-468-2891 / (209) 468-5914 | Same problem, but a phone call can at least ask *who* the right person is. Useful as a router, not as the ask. |
| [CodeStack via SJCOE](https://www.sjcoe.org/services-and-support/codestack) | The department itself, one level up from SEIS user support. |

## The Chrome extension question

`speddy-chrome-extension/` reads SEIS pages inside the provider's own
authenticated session. It is parked (SPE-276), compare-only, and cannot write
student data today. Whether reading SEIS pages this way is acceptable under a
district's SEIS terms is a real question, and `docs/integrations/seis.md`
already flags that it should be **asked, not assumed**.

**Recommended: hold it for the first live conversation, not the first email.**
The opening contact is about establishing what we are. Leading with "we built
something that reads your pages" frames us as a scraper before they know we're
not a competitor. But raise it in the first real conversation — well before we
build anything further on that path.

The alternative (disclose in the first email) buys maximum candor and means it
can never be characterized as something we hid. It costs the framing of the
first impression. Either way the rule holds: **nothing ships on that path until
we've asked.**

## What to realistically expect

1. **Most likely — "no third-party API; talk to your district about SEIS↔SIS
   sync."** Not a failure. That confirms Path 2 in `docs/integrations/seis.md`,
   which is already the recommended plan, and it comes with their authority
   behind it.
2. **Upside — "here's our process and what it costs."** Then it becomes a
   scoping question, and the pilot district matters more than ever.
3. **Silence.** The most likely outcome of a cold support ticket, and the whole
   reason the SELPA route is worth the extra step.

## Check before sending

- **NDPA status.** As of the 2026-07-28 review (re-verified 2026-08-04) the
  JSUSD CA-NDPA v1.5 was a **draft under review, not executed**
  (`docs/ndpa/jsusd-dpa-fix-sheet.md`). The draft email hedges this — replace
  the bracket with whatever is true on the day it's sent. Do not claim a signed
  agreement that isn't signed.
- **Pilot still active.** The draft says we're "currently in a pilot with John
  Swett Unified." Confirm that's still true on the day it's sent — a stale pilot
  claim is worse than no pilot claim, and it's the sentence the whole
  member-agency framing rests on.
- **District consent to be named.** Confirm John Swett is comfortable being
  referenced by name and approves the exact wording, before sending and before
  offering them for a call.
- **Re-read `docs/integrations/seis.md`** for the current state of the three
  manual uploads — the specific reports named in the email should still match
  what `lib/import/detect-import-file.ts` recognises.

## Sources

- [CodeStack (SJCOE)](https://www.sjcoe.org/services-and-support/codestack) ·
  [SEIS](https://seis.org/) · [SEIS help center](https://seis.org/helpcenter) ·
  [SEIS Integration portal](https://integration.seis.org/)
- [Aeries API Security](https://support.aeries.com/support/solutions/articles/14000068197-api-security)
  (the read-only district-issued certificate model cited in the email)

> **Verification limit.** `seis.org` and `integration.seis.org` are blocked by
> this environment's network egress proxy, so SEIS-side claims here come from
> search-result excerpts of SEIS's own pages rather than a direct read — the
> same limit recorded in `docs/integrations/seis.md`.

**Source of truth:** `docs/integrations/seis.md` (what we want and why);
`lib/import/detect-import-file.ts` (the three manual uploads named in the
email); `docs/ndpa/jsusd-dpa-fix-sheet.md` (pilot + NDPA status);
`docs/ndpa/ca-ndpa-execution-packet.md` (legal entity, address, contact);
`speddy-chrome-extension/` + SPE-276 (extension status).
