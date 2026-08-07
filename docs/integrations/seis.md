# SEIS — can we pull data automatically?

> **Research write-up, 2026-08-07.** Answers the question: is there any mechanism
> to get IEP data out of SEIS without a provider manually downloading reports and
> re-uploading them into Speddy?
>
> **Short answer:** SEIS has no public/partner API and no vendor programme. But
> there are two real automated paths that don't need SEIS's cooperation at all,
> and between them they cover most of what the manual upload carries today.
>
> Companion to `docs/integrations/aeries.md`. Related: SPE-276 (Chrome
> extension, parked), the *SIS Integration* project (SPE-392 → SPE-420).

## What we upload manually today

The unified Import Students flow (SPE-231) accepts four file types
(`lib/import/detect-import-file.ts`). Three are SEIS downloads:

| File | Source | Fills in |
|---|---|---|
| Student & goals report (xlsx/csv) | **SEIS** | students + IEP goals |
| Deliveries (csv) | **SEIS** | service minutes / frequency → schedule requirements |
| IEP Dates (csv) | **SEIS** | annual review & triennial dates |
| Special Ed class list (txt) | Aeries | teacher assignment |

Every one is a human logging into SEIS, running a report, downloading it, and
re-uploading it here. That's the cost we're trying to remove.

## Path 1 — SEIS has no API for us (confirmed)

SEIS is built and run by **CodeStack**, a department of the San Joaquin County
Office of Education, and is used by 115 SELPAs / 1,500+ California LEAs. There is
no developer portal, no OAuth, no REST surface, no partner/vendor programme —
nothing a third party can register for.

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
through the **SIS connection we already ship** — the Aeries REST v5 client
(`lib/integrations/aeries/`), the encrypted per-district credential store
(SPE-395), and the tech-portal connection flow (SPE-396/397).

Why this is the strong path:

- **No SEIS cooperation needed.** It's the district's own configuration, on a
  feature SEIS already sells them. We're just reading the district's SIS, which
  we're already authorised to do.
- **It's nightly and automatic.** No human in the loop.
- **The plumbing exists.** This is a mapping-and-config problem, not a new
  integration.
- **It's the sanctioned route.** Aeries explicitly documents SpEd vendors using
  the API to keep their own systems current, with district-issued read-only
  certificates scoped per API.

What it can carry: student demographics, SpEd flag/eligibility, disability,
special-ed entry/exit dates, case manager, and **IEP dates** — i.e. it should
retire the *IEP Dates* upload and the *class list*, and cover the student half of
the *Student & goals* report.

What it cannot carry: **goal text**. Goals are free-text IEP content that lives in
SEIS and has no SIS field to land in. `docs/integrations/aeries-sped-mapping.md`
already flagged this (gap #3): *"IEP substance isn't in Aeries… Aeries
complements, not replaces, the SEIS upload."* Service minutes/frequency are the
open question — worth checking whether a given district maps them.

**Open question to put to a pilot district (JSUSD) or CodeStack:** which fields
does their SEIS↔SIS integration currently sync, in which direction, and can the
SEIS → SIS direction be extended to the fields we want?

## Path 3 — the Chrome extension we already have (the only path that gets goals)

`speddy-chrome-extension/` is a built, working Manifest V3 extension that reads
SEIS pages **in the provider's own already-authenticated browser session** and
posts to `/api/extension/import` and `/api/extension/compare` under an API key.
It extracts goals, services, accommodations, IEP dates and student info from the
SEIS Goals and Services pages, and has a passive mode that flags SEIS↔Speddy
discrepancies in the background.

It uses no credential we aren't given, and no access the user doesn't already
have — it reads what's on screen for the user who is already looking at it.

**It is parked (SPE-276) and must not ship as-is.** It predates the Import
Students hardening and carries the exact bugs that project fixed:

- matches students on initials + grade and is **school-blind** — the collision
  that caused a real cross-school student mix-up (SPE-266/269)
- **leaks student names into error strings and console logs** (the SPE-220 class
  of leak)
- hand-rolled grade normaliser that can drift from every other path
- not on the shared `withRoute` wrapper; no test coverage on either route

Four API keys were issued and **never used** (`api_keys.last_used_at` all null),
so nothing has been written through it in production.

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

1. **Path 2 first.** Extend the existing SIS work to pull SEIS-originated fields
   out of the district's SIS. Highest leverage, lowest new risk, mostly built.
   Start by asking a pilot district what their SEIS↔SIS integration already
   syncs. Retires the *IEP Dates* and *class list* uploads.
2. **Path 3 second**, if goals-without-manual-upload is worth it. Unpark the
   extension, do the SPE-276 hardening as a block, verify against a real session,
   publish unlisted. It is the *only* mechanism that gets goal text out of SEIS
   automatically. Retires the *Student & goals* and *Deliveries* uploads.

Even with both, keep the file upload. It's the fallback for districts on neither
path, and for SEIS UI changes that break scraping.

## Sources

- [SEIS](https://seis.org/) · [SEIS Integration portal](https://integration.seis.org/) ·
  [CodeStack (SJCOE)](https://www.sjcoe.org/services-and-support/codestack)
- [Aeries — Special Education Overview](https://support.aeries.com/support/solutions/articles/14000071473-special-education-overview) ·
  [Aeries API Security](https://support.aeries.com/support/solutions/articles/14000068197-api-security)
- [CALPADS — Reporting Data for Students with Disabilities](https://www.cde.ca.gov/ds/sp/cl/swdreporting.asp) ·
  [CALPADS SSRV file](https://documentation.calpads.org/OnlineMaintenance/StudentDataMaintenance/StudentDetailsSSRV/) ·
  [CALPADS SELPA Quick Start](https://documentation.calpads.org/SPEDTransition/WelcomeSELPA/)

**Source of truth:** `lib/import/detect-import-file.ts` (current manual file
types); `lib/integrations/aeries/` (SIS client); `speddy-chrome-extension/` +
`app/api/extension/` (extension path); SPE-276 (extension gaps);
`docs/integrations/aeries-sped-mapping.md` (SIS field gaps).
