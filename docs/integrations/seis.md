# SEIS — can we pull data automatically?

> **Research write-up, 2026-08-07.** Answers the question: is there any mechanism
> to get IEP data out of SEIS without a provider manually downloading reports and
> re-uploading them into Speddy?
>
> **Short answer:** no public or partner SEIS API turned up in anything we can
> reach. But there are two real automated paths that need **no new Speddy↔SEIS
> integration**, and between them they cover most of what the manual upload
> carries today. (Path 2 still needs the *district* to configure SEIS↔SIS with
> CodeStack — that's SEIS cooperation, just not with us.)
>
> Companion to `docs/integrations/aeries.md`. Related: SPE-276 (Chrome
> extension, parked), the *SIS Integration* project (SPE-392 → SPE-420).
>
> **Follow-ups to this document:**
> `docs/integrations/seis-outreach.md` — how we actually approach CodeStack
> (framing, draft email, channels), the follow-through on the "ask them
> directly" recommendation in Path 1 below.
> `docs/integrations/iep-vendor-landscape.md` — the same question asked of every
> IEP system *outside* California, where the answer is markedly more positive.

## What we upload manually today

The unified Import Students flow (SPE-231) recognises four vendor **export
categories**, three of them SEIS downloads (`lib/import/detect-import-file.ts` —
which also classifies our own roster template, not listed here since it isn't a
vendor export):

| File | Source | Fills in |
|---|---|---|
| Student & goals report (xls/xlsx/csv) | **SEIS** | students + IEP goals |
| Deliveries (csv) | **SEIS** | service minutes / frequency → schedule requirements |
| IEP Dates (csv) | **SEIS** | annual review & triennial dates |
| Special Ed class list (txt) | Aeries | teacher assignment |

Every one is a human logging into SEIS, running a report, downloading it, and
re-uploading it here. That's the cost we're trying to remove.

## Path 1 — no public SEIS API found in the available sources

SEIS is built and run by **CodeStack**, a department of the San Joaquin County
Office of Education, and is used by 115 SELPAs / 1,500+ California LEAs. Across
everything publicly reachable we found **no developer portal, no documented OAuth
or REST surface, and no partner/vendor programme** — nothing a third party can
register for.

State that as what it is: an absence of public evidence, not proof that no
interface exists. CodeStack builds proprietary software for education agencies
and manages integrations internally, so a private or negotiated interface can't
be ruled out from the outside. **Asking CodeStack directly is the only way to
close this**, and it's worth doing before concluding Path 1 is dead — a single
email could make the rest of this document moot.
**See `docs/integrations/seis-outreach.md`** for how to make that ask: who to
contact, the framing that makes a public agency say yes, and a draft to send.

The one thing SEIS calls "integration" is **SEIS Integration**: an automated
**nightly sync between a district's SIS and SEIS**, arranged directly between the
district and CodeStack via `integration.seis.org`. Per SEIS's own description it
runs **in either direction** (SIS → SEIS, SEIS → SIS, or both), and **"any field
from the Student Record can be included."**

That is a district↔SEIS pipe. Speddy cannot be an endpoint on it. But it is the
foundation of Path 2.

> **Verification limit:** `seis.org`, `integration.seis.org`, and the SELPA PDFs
> hosting SEIS training decks are all blocked by this environment's network egress
> proxy, so the above is grounded in search-result excerpts of SEIS's own pages
> rather than a direct read. The field-level specifics in Path 2 need confirming
> with a district or with CodeStack before we design against them.

## Path 2 — SEIS → district SIS → Speddy (recommended, mostly already built)

If a district enables the **SEIS → SIS** direction of that nightly sync, SEIS
writes its student-record fields into the district's SIS. Speddy then reads them
out of that SIS.

Why this is the strong path:

- **No new Speddy↔SEIS integration needed.** We never talk to SEIS. We read the
  district's SIS, which we're already authorised to do. Note the district *does*
  still have to arrange the SEIS→SIS direction with CodeStack — this isn't a
  self-serve toggle, and it's a dependency on someone else's queue. The point is
  that it's a service SEIS already sells them, requested by the customer, not a
  partnership we have to negotiate.
- **It's nightly and automatic.** No human in the loop.
- **It's the sanctioned route.** Aeries explicitly documents SpEd vendors using
  the API to keep their own systems current, with district-issued read-only
  certificates scoped per API.

### What's built vs. what isn't

Be honest about the gap here — the connection is built, the **sync is not**.

**Built and in production:** the Aeries REST v5 client
(`lib/integrations/aeries/`), the encrypted per-district credential store
(SPE-395), the tech-portal guided setup and credential intake (SPE-396/397), and
`runAeriesConnectionTest` (`lib/sis/aeries-setup.ts`), which probes each API area
and returns aggregate counts.

**Not built:** everything that moves a record. There is no scheduled fetch (no
SIS entry in `vercel.json` crons), no mapping of SIS records into `students`, no
reconciliation against data already in Speddy, and no write path for students,
IEP dates, or teacher links. The only code that fetches and maps full SpEd
students today lives in throwaway scripts (`scripts/aeries-sped-spike.ts`,
`scripts/sis-explore/`), not in any production route.

So Path 2 is *"we can already authenticate to the district and prove the data is
reachable"* — not *"we can already pull it in."* The credential and trust
problem is solved; the pipeline is a real build. Treat SPE-412 (what happens to
existing Speddy data when SIS data starts flowing) as the design question that
gates it.

What it can carry, *if* the district maps the fields: student demographics, SpEd
flag/eligibility, disability, special-ed entry/exit dates, case manager, and
**IEP dates** — putting the *IEP Dates* upload and the *class list* in scope to
retire, and covering the student half of the *Student & goals* report.

Treat that as a target, not a result. The class list carries teacher assignment
and district student ID (`lib/parsers/class-list-parser.ts`); retire it only once
a pilot shows the SIS path delivers both. Same for *IEP Dates*, which carries the
annual-review and triennial dates (`lib/parsers/iep-dates-parser.ts`).

What it cannot carry: **goal text**. Goals are free-text IEP content that lives in
SEIS and has no SIS field to land in. `docs/integrations/aeries-sped-mapping.md`
already flagged this (gap #3): *"IEP substance isn't in Aeries… Aeries
complements, not replaces, the SEIS upload."* Service minutes/frequency are the
open question — worth checking whether a given district maps them.

**Open question to put to a pilot district (JSUSD) or CodeStack:** which fields
does their SEIS↔SIS integration currently sync, in which direction, and can the
SEIS → SIS direction be extended to the fields we want?

## Path 3 — the Chrome extension we already have (the only path that gets goals)

`speddy-chrome-extension/` is a Manifest V3 extension that reads SEIS pages **in
the provider's own already-authenticated browser session**. It extracts goals,
services, accommodations, IEP dates and student info from the SEIS Goals and
Services pages, and runs a passive mode that flags SEIS↔Speddy discrepancies in
the background.

It uses no credential we aren't given, and no access the user doesn't already
have — it reads what's on screen for the user who is already looking at it.

### It reads; it does not yet write

The shipped extension is **discrepancy detection only**. Its single network call
is to `/api/extension/compare` (`service-worker.js:95`); nothing in the popup,
the service worker, or the content script ever calls `/api/extension/import`. The
import route exists server-side with no caller.

The extension's own `README.md` still describes an "Extract & Import to Speddy"
button and a `POST /api/extension/import` flow — that documentation is **stale**,
left over from before the v3 pivot to the "SEIS Discrepancy Detector" named in
`manifest.json`. Worth fixing whenever the extension is next touched.

So Path 3 needs an import workflow **built and validated**, on top of the SPE-276
hardening below — not just the hardening. Today it can tell a provider that SEIS
and Speddy disagree; it cannot pull the goals across.

**It is parked (SPE-276) and must not ship as-is.** It predates the Import
Students hardening and carries the exact bugs that project fixed:

- matches students on initials + grade and is **school-blind** — the collision
  that caused a real cross-school student mix-up (SPE-266/269)
- **leaks student names into error strings and console logs** (the SPE-220 class
  of leak)
- hand-rolled grade normaliser that can drift from every other path
- not on the shared `withRoute` wrapper; no test coverage on either route

Four API keys were issued and show **no recorded use** (`api_keys.last_used_at`
all null as of 2026-07-17). Don't read that as proof they were never called:
`/api/extension/compare` — the only endpoint the extension actually hits — never
touches `last_used_at` at all, and `/api/extension/import` updates it without
checking the result. A null timestamp is silence, not evidence.

The stronger statement holds for a different reason: no student data can have
been written through this path, because `compare` computes discrepancies and
returns them without writing, and `import` — the only route that writes — has no
caller. That's an argument from the code, not from the timestamp.

The fixes are known and bounded: reuse `matchStudents`
(`lib/utils/student-matcher.ts`) and `normalizeGradeLevel`, route logging through
the shared `log` abstraction, move onto `withRoute`, add tests. Plus, before real
users touch it: Chrome Web Store publication (unlisted), and a check that reading
SEIS pages this way is acceptable under the district's SEIS terms — worth asking
CodeStack directly rather than assuming.

## Path 4 — CALPADS (ruled out)

SEIS transmits special-education data to the state's CALPADS via API, including
the **SSRV** file, which carries service type, minutes and frequency. Tempting,
because that's the *Deliveries* data.

Ruled out anyway:

- CALPADS access is issued to **named individuals** at the LEA or a contracted
  vendor, under an active compliant contract — not a service credential.
- CALPADS explicitly **prohibits automated scraping by vendors**, with revocation
  and legal liability named as consequences.
- The SEDS→CALPADS API is for certified special-education *data systems* filing
  state reports. Speddy isn't one and shouldn't become one for this.
- Still no goals.

## Recommendation

The two viable paths are complementary, not competing — take both, in order.
Neither is small: each has a working front half and an unbuilt back half.

1. **Path 2 first.** Build the sync on top of the connection that already works —
   scheduled fetch, mapping, reconciliation, write path — to pull SEIS-originated
   fields out of the district's SIS. Highest leverage and the least *new* risk,
   because the credential and trust layer is already solved and proven against a
   real district. Puts the *IEP Dates* and *class list* uploads in scope to
   retire — once a pilot confirms the SIS side actually delivers teacher
   assignment, district student ID, and both compliance dates.
   **Cheap first step, before committing to any of it:** ask a pilot district
   (JSUSD) what their SEIS↔SIS integration already syncs and in which direction.
   That answer sets how much this path is even worth.
2. **Path 3 second**, if goals-without-manual-upload is worth it. Build the
   import workflow, do the SPE-276 hardening in the same block, verify against a
   real signed-in session, publish unlisted. It is the *only* mechanism that gets
   goal text out of SEIS automatically. Puts the *Student & goals* and
   *Deliveries* uploads in scope to retire — once real-session testing shows it
   covers goals, services, accommodations, IEP dates, and student matching.

**Retire nothing on a plan.** Each upload comes out only when a pilot has shown
the replacement carries every field that upload carries today; until then the
automated path runs alongside it, not instead of it. And keep the file upload
permanently regardless — it's the fallback for districts on neither path, and for
SEIS UI changes that break scraping.

## Sources

- [SEIS](https://seis.org/) · [SEIS Integration portal](https://integration.seis.org/) ·
  [CodeStack (SJCOE)](https://www.sjcoe.org/services-and-support/codestack)
- [Aeries — Special Education Overview](https://support.aeries.com/support/solutions/articles/14000071473-special-education-overview) ·
  [Aeries API Security](https://support.aeries.com/support/solutions/articles/14000068197-api-security)
- [CALPADS — Reporting Data for Students with Disabilities](https://www.cde.ca.gov/ds/sp/cl/swdreporting.asp) ·
  [CALPADS SSRV file](https://documentation.calpads.org/OnlineMaintenance/StudentDataMaintenance/StudentDetailsSSRV/) ·
  [CALPADS SELPA Quick Start](https://documentation.calpads.org/SPEDTransition/WelcomeSELPA/)

**Source of truth:** `lib/import/detect-import-file.ts` (current manual file
types); `lib/integrations/aeries/` + `lib/sis/aeries-setup.ts` (SIS client and
connection test — the extent of what's built); `vercel.json` (no SIS cron);
`speddy-chrome-extension/service-worker.js` + `app/api/extension/` (extension
path, compare-only); SPE-276 (extension gaps); SPE-412 (reconciliation design);
`docs/integrations/aeries-sped-mapping.md` (SIS field gaps).
