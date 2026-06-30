# SPE-122 — Aeries SpEd students → Speddy mapping & gaps

> **Spike write-up.** Maps the Aeries native-API student/program payload onto
> Speddy's `students` table and flags the gaps. Companion to the throwaway
> `scripts/aeries-sped-spike.ts`. Informs the real student-sync design (and the
> schema decisions the teacher import, SPE-123, also needs).
>
> **Note on live verification:** the spike could not call the public demo
> instance from CI — the sandbox network policy blocks `demo.aeries.net`
> (CONNECT 403), independent of the certificate. This is the same class of
> reachability gate as SPE-120 (district instances aren't always publicly
> API-accessible). The mapping below is grounded in the documented Aeries
> student/program fields and the live Speddy `students` schema; run the spike
> from an allowed network (or against a real district cert) to confirm against
> real records.

## Source shapes

**Aeries** — `GET /schools/{code}/students` (demographics) joined to
`GET /schools/{code}/students/0/programs?code=144` (SpEd flag) on `StudentID`.
Relevant fields: `StudentID`, `StudentNumber`, `StateStudentID`, `FirstName`,
`LastName`, `MiddleName`, `Grade`, `Gender`, `Birthdate`, `InactiveStatusCode`;
program `ProgramCode` (`144`/`144x`), `EligibilityEndDate`/`ParticipationEndDate`,
and `ExtendedProperties` (e.g. `DisabilityCode`).

**Speddy** — `students` table (from live schema): `id`, **`initials`** (NOT NULL),
**`grade_level`** (NOT NULL), `provider_id` → profiles, `teacher_id` → teachers,
`teacher_name`, `school_id`/`district_id`/`state_id`, `school_site`/
`school_district`, `sessions_per_week`, `minutes_per_session`, timestamps.

## Field mapping

| Aeries field | Speddy column | Mapping | Confidence |
|---|---|---|---|
| `FirstName` + `LastName` | `initials` | **Derive** `F`+`L` initials; **never store the names** | High |
| `Grade` | `grade_level` | Normalize (`K`/`TK`/`PK`→`K`); cast to text | High |
| `SchoolCode` | `school_id` | Needs a `SchoolCode → Speddy school_id` crosswalk per district | Medium |
| `InactiveStatusCode` | (filter) | Skip inactive enrollments; don't import | High |
| program `144x` | (status — none today) | "Being evaluated, not yet served" — no column to hold it | — |

## Gaps & findings

1. **PII-minimization mismatch (the headline).** Aeries returns full student
   PII; Speddy deliberately stores only `initials`. The import must **reduce at
   the boundary** — derive initials server-side and never persist names/DOB.
   FERPA-positive, but it means **initials collide** (two "JS" in a grade), so
   initials can't be the dedupe key on re-import.

2. **No Aeries identity column → no stable join key.** `students` has nowhere to
   store `StudentID` or `StateStudentID`. Without it we can't (a) dedupe
   reliably across re-imports or (b) support the **Renaissance assessment match**,
   which the project calls out as depending on this student identity. The mapper
   already surfaces `aeriesStudentId`/`stateStudentId` for exactly this.
   → **Recommend** adding `students.aeries_student_id` (and/or
   `state_student_id`), unique per district scope.

3. **IEP substance isn't in Aeries.** `sessions_per_week`, `minutes_per_session`,
   IEP goals, and accommodations have **no Aeries source** — they come from
   SEIS/IEP. Aeries import covers **demographics + SpEd flag + school + (via a
   roster join) teacher**, not the service plan. Aeries complements, not
   replaces, the SEIS upload.

4. **`teacher_id` needs a separate roster join.** The homeroom/case-manager
   teacher isn't on the student record — it comes from class-schedule/roster
   endpoints. Pairs with the SPE-123 teacher import and the secondary
   many-teachers-per-student model (SPE-194).

5. **`provider_id` has no Aeries equivalent.** The owning SpEd provider is a
   Speddy concept; it must be **assigned at import/confirm time**, not mapped.

6. **`144x` evaluation students have no home.** Students being evaluated aren't
   yet receiving services and the `students` table has no status to represent
   that — needs a product decision (separate list? a flag?).

## Recommended next steps

- Add a stable Aeries identity column to `students` (gap #2) — unblocks dedupe
  and the Renaissance join. **Schema decision.**
- Keep the import **reduce-at-the-boundary**: names → initials server-side,
  never stored (gap #1).
- Treat Aeries as the **demographics + SpEd-flag + roster** source; keep SEIS for
  the IEP service plan (gap #3).
- Decide handling for `144x` evaluation students (gap #6) before student sync
  ships.

**Source of truth:** live `students` schema (`src/types/database.ts`);
`lib/integrations/aeries/` (client + mappers); `scripts/aeries-sped-spike.ts`;
Aeries student/program endpoint docs (linked in `docs/integrations/aeries.md`).
