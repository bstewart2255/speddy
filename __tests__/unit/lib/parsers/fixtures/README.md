# Parser golden fixtures (SPE-239)

Fictional data mirroring the *shape* of the three verified real exports (SEIS
Student Goals Report, SEIS Deliveries, Aeries Class List) plus a roster
template and encoding/messy-value edge cases.

**No real student data lives here.** Every name, SEIS ID, birthdate, school,
and goal is invented. Real exports contain student PII (names, birthdates, SEIS
IDs) and must never enter the repo, tests, or tickets.

## Contents

| File | Feeds | Purpose |
| --- | --- | --- |
| `deliveries.csv` | `parseDeliveriesCSV` | 11-column deliveries layout; all frequency shapes; 330/415/450/510/900 codes; most-recent-start dedup; two-word / hyphenated names |
| `class-list.txt` | `parseClassListTXT` | Two-page Aeries export; banners; every teacher-header format; co-teacher; quoted comma-names; cross-page dedup |
| `roster-template.csv` | `parseCSVReport` (generic) | The current Students template; pins that it fails detection today (SPE-225 target) |
| `messy-values.csv` | `parseCSVReport` (generic) | Spelled-out / zero-padded / out-of-range grades; leading-space name |
| `builders.ts` | all | Byte-precise fixtures generated in code: the 59-column SEIS Goals CSV (+ BOM and column-shifted variants), the Windows-1252 buffer, and the SEIS XLSX workbooks |

## Principle

These fixtures **codify current behavior — including bugs** — so the SPE-225,
SPE-230, SPE-240, and SPE-241 changes surface as explicit snapshot diffs rather
than silent regressions. Each of those tickets can point to the exact snapshots
its change is allowed to alter.
