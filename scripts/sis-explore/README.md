# SIS exploration tooling (SPE-398)

Internal only. No product UI. Read-only against both the SIS and Speddy.

This is the "not blind" half of the concierge decision (SPE-392): the moment a
district's credentials land, we need answers rather than a backlog item.

```bash
npm run sis:explore -- --district=SIM-D001
npm run sis:explore -- --district=SIM-D001 --out=/tmp/report.md
```

`--out` may point anywhere **outside** the repository, or under `sis-reports/`
inside it. Any other in-repo path is refused, up front, before the run touches
the district's SIS — `/sis-reports/` is the only path git ignores, and a report
written beside tracked files is one `git add -A` away from committing student
IDs. The file is written `0600`.

It needs a stored SIS connection with a credential — set one up through the tech
portal first (SPE-396 for Aeries, SPE-397 for OneRoster).

## What it answers, in dependency order

1. **Do our student numbers mean their student numbers?** Every district ID a
   provider typed into Speddy is compared against each candidate identifier the
   SIS exposes — Aeries offers `StudentID`, `StudentNumber` and `StateStudentID`;
   OneRoster offers `identifier` and `sourcedId`. The one that actually overlaps
   is the one the rest of the run uses.

   Three verdicts, and the difference matters: `same-namespace` means believe the
   numbers below; `no-overlap` means we are comparing two different numbers and
   everything downstream is void; `inconclusive` means there was not enough data
   on one side to say — which is *not* the same as "no overlap" and must never be
   reported as if it were.

2. **How much of the caseload can the SIS enrich?** Counted per *child*, not per
   caseload row, so a co-served student counts once. Splits three ways: matched,
   no ID entered, and ID entered but absent from the SIS. It also separates out
   our own backfill gap — IDs sitting on a `students` row that never reached the
   child record — because that is our bug, not the district's missing data.

3. **How many teachers does a secondary student really have?** The empirical
   input SPE-334/342 have been waiting on. Reports the teachers-per-student
   distribution and what share of students today's single-teacher model actually
   describes. "We could not resolve this Speddy teacher to a SIS teacher" is
   counted separately from "the SIS disagrees" — they have different fixes.

4. **Does the district's special-education flag agree with our caseload?**
   Aeries only. OneRoster carries no such flag anywhere in the standard.

## Where the output goes, and why it is split

- **The terminal** gets aggregates only. Safe to paste into Linear or a chat.
- **`sis-reports/`** (git-ignored, mode `0600`) gets the same findings plus
  student-level district IDs.

The realistic way the PII rule breaks is not carelessness — it is someone
copying a terminal transcript into a ticket. So the terminal simply never holds
the identifiers, and a test (`__tests__/unit/scripts/sis-explore/report.test.ts`)
asserts that no ID disclosed in the full report can appear in the summary.

**Never** commit a report, paste one into Linear, or attach one to a ticket.
Persisting anything the SIS tells us into Speddy tables is a separate
stop-and-discuss decision; v1 writes nothing.

## Known gaps

- **Teacher linkage over Aeries is not collected.** Aeries expresses
  student↔teacher through class-schedule endpoints our client does not speak yet
  — that work is SPE-342. The run says so rather than reporting an empty
  distribution as if it were a finding about the district.
- **OneRoster cannot answer report 4.** Property of the standard, not a
  permission a district can grant.
- **No live SIS has answered this code.** `demo.aeries.net` is blocked by the
  build sandbox's egress policy, so the transport was exercised against a local
  mock built from the sim district's real rows. The analysis is unit-tested; the
  first real district is the proof.
