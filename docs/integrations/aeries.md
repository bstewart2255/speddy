# Aeries SIS Integration

> **Status:** Foundation (Phase 1). A server-only API client + field mappers,
> verified against the public Aeries demo instance. No DB schema, UI, or
> persistence yet — those land in follow-up PRs (SPE-122, SPE-123).
>
> **Linear:** project *SIS Integration (Aeries / PowerSchool)*. Discovery:
> SPE-120 (district API access), SPE-121 (read-only cert), SPE-122 (SpEd student
> spike), SPE-123 (teacher-list import).

## What this is

[Aeries](https://www.aeries.com/) is the Student Information System (SIS) used by
many California districts, including ours. Speddy currently re-enters student,
school, and teacher data by hand. This integration connects to the **native
Aeries REST API (v5)** to pull that data in.

`lib/integrations/aeries/` is the shared, server-only foundation both the
teacher-list import (SPE-123) and the SpEd-student sync (SPE-122) build on:

| File | Responsibility |
|---|---|
| `config.ts` | Resolve the per-district base URL + certificate from env; demo fallback. |
| `client.ts` | Server-only REST client: cert auth, pagination, `fields`, typed endpoints. |
| `mappers.ts` | Pure functions mapping raw Aeries records → Speddy-facing shapes. |
| `types.ts` | `Raw*` (Aeries PascalCase) and mapped (camelCase) types. |
| `index.ts` | Public surface — import from here. |

## How Aeries' API works (verified facts)

- **Base URL** includes the version segment:
  `https://<district>.aeries.net/aeries/api/v5`. Per-district — there is no
  single "connect to Aeries", it's "connect to *this district's* Aeries".
- **Auth:** a 32-char, case-sensitive vendor **certificate** passed in the
  `AERIES-CERT` request header. `Accept: application/json` selects JSON.
  Server-to-server only — the cert must never reach the browser.
- **Read-only** is all we need (and the safest scope). The district chooses which
  APIs/fields a certificate can read when it generates it (Security → API
  Security).
- **Pagination:** `?StartingRecord=&EndingRecord=` (1-based, inclusive).
- **Payload trimming:** `?fields=Col1,Col2`.
- **Differential sync:** `?dateLastModified=YYYY-MM-DD` (left to callers).
- **Endpoints we use:**
  - `GET /schools`, `GET /schools/{code}`
  - `GET /schools/{code}/teachers` — every teacher for a site, with `Room`,
    `LowGrade`/`HighGrade`, `EmailAddress`, `TeacherNumber`, `InactiveStatusCode`.
  - `GET /schools/{code}/students`
  - `GET /schools/{code}/students/{studentId}/programs?code=144` — Special
    Education program records. Pass `studentId=0` for all students. `code=144`
    filters to SpEd; a `144x` record marks a student **being evaluated** for, but
    not yet receiving, services.

**Performance etiquette** (Aeries warns against excessive "get all" calls):
run full syncs off-peak, prefer differential sync via `dateLastModified`, and
page large reads. `client.getAllPages()` walks in bounded batches.

### Documentation sources
- [Aeries API Full Documentation](https://support.aeries.com/support/solutions/articles/14000077926-aeries-api-full-documentation)
- [Building a Request](https://support.aeries.com/support/solutions/articles/14000113681-aeries-api-building-a-request)
- [Student Endpoints](https://support.aeries.com/support/solutions/articles/14000113683-aeries-api-student-related-end-points) ·
  [Staff/Teacher Endpoints](https://support.aeries.com/support/solutions/articles/14000113687-aeries-api-staff-related-end-points) ·
  [School Endpoints](https://support.aeries.com/support/solutions/articles/14000113682-aeries-api-school-related-end-points)
- [API Security](https://support.aeries.com/support/solutions/articles/14000068197-api-security) ·
  [Generate a Vendor Certificate](https://support.aeries.com/support/solutions/articles/14000040339-how-to-generate-an-aeries-api-certificate)

## Configuration

Set in the server environment (see `.env.example`):

```
AERIES_BASE_URL=https://yourdistrict.aeries.net/aeries/api/v5
AERIES_CERTIFICATE=your-32-char-vendor-certificate
```

Leave **both unset** to fall back to the public read-only **demo instance**
(`https://demo.aeries.net`), so local/dev work needs no secrets. A non-demo
base URL **requires** a certificate or `getAeriesConfig()` throws.

> Per-district persistence (an encrypted `district_id → base_url + cert` store)
> is intentionally deferred to a later PR — this phase ships a single
> env-configured connection.

## Usage

```ts
import { createAeriesClient, mapTeachers } from '@/lib/integrations/aeries';

// Server-side only.
const aeries = createAeriesClient();
const rawTeachers = await aeries.getSchoolTeachers(1, {
  fields: ['FirstName', 'LastName', 'EmailAddress', 'Room', 'LowGrade', 'HighGrade'],
});
const teachers = mapTeachers(rawTeachers); // active, named teachers only
```

## Speddy data-model gaps (flagged, not yet addressed)

The mappers carry these fields so a later migration can persist them:

- `teachers` has **no column** for grade range (`LowGrade`/`HighGrade`) or for the
  stable Aeries `TeacherNumber` (needed for dedupe / differential sync). Today
  Aeries `Room` → `teachers.classroom_number`.
- `students` has **no Aeries identity column**. `aeriesStudentId` is the intended
  join key for the future **Renaissance** assessment match — persisting it is a
  prerequisite for that work.

## Next steps

1. **SPE-123** — teacher-list import: cert storage + admin review/confirm UI
   (import + review, not silent auto-create); dedupe on email / `TeacherNumber`.
2. **SPE-122** — SpEd-student sync: join `students` against `programs?code=144`,
   map to Speddy's student model, write up remaining field gaps.
3. Per-district certificate persistence + onboarding flow.
