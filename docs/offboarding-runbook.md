# District Offboarding & Data-Deletion Runbook

Operational steps for honoring a district's data-return/deletion request, an
individual deletion request, or a full district offboarding. This is the
companion to [`data-inventory.md`](./data-inventory.md) (what data exists and
where) and [`subprocessors.md`](./subprocessors.md) (who it flows to), and the
operational half of the NDPA deletion obligation tracked in **SPE-143**.

> Student data lives in **two** places — the Supabase backend **and** the Chrome
> extension's on-device cache. A deletion request is not fully honored until both
> are addressed. See the "Extension cache" section below.

---

## Tooling built for SPE-143

| Capability | How | Notes |
|---|---|---|
| **Delete a student** (cascade + Storage) | Admin UI → Students → Delete, or `DELETE /api/admin/students/[studentId]?schoolId=<uuid>` | Cascades all FK-linked rows under RLS; removes worksheet images from the `worksheet-submissions` and `worksheets` buckets (service role); surfaces name-matched CARE referrals to confirm. |
| **Delete CARE referral** | `DELETE /api/admin/care-referrals/[referralId]` (or the follow-up prompt after a student delete) | Cascades the case, meeting notes, action items, and status history. CARE is linked to students by **name**, not FK, so it is confirmed separately. |
| **Delete an account** (provider) | `DELETE /api/admin/providers/[providerId]` | Deletes the profile (cascading the provider's students + data) and the Auth user; nulls nullable references; removes provider-owned Storage. Reports hard blockers (CARE/records the provider authored) instead of rewriting authorship. **API only — no UI yet.** |
| **Worksheet-image retention** | `app/api/cron/cleanup-worksheet-images` (cron, `CRON_SECRET`) | Deletes `worksheet_submissions` + their images older than **12 months**. |
| **Bulk export** | **See [SPE-60](https://linear.app/speddy/issue/SPE-60)** | Export is tracked separately and is **not** rebuilt here. |

Student and CARE-referral deletes are gated by `isAdminForSchool` (site/district
admin), and the student row delete runs under the admin's own RLS session.
Account (provider) deletion is allowed for a Speddy super-admin (`is_speddy_admin`)
or an admin over the provider's school. Across all routes, destructive steps use
the service-role client only where RLS + cascade cannot reach (Storage, cross-RLS
cleanup).

---

## A. Single deletion request (one student)

1. Export the student's data first if the district requested return — **SPE-60**.
2. Admin → **Students** → **Delete** for the student (removes all provider records,
   schedule, assessments, progress, worksheet rows **and** worksheet images).
3. If prompted, confirm deletion of **matched CARE referrals** (special-ed
   referral data, matched by name — review before confirming).
4. **Extension cache** (see below) — confirm the providers who served this student
   no longer hold a stale on-device copy.

## B. Offboard a single provider / account

1. Export first if requested — **SPE-60**.
2. `DELETE /api/admin/providers/[providerId]`.
   - If it returns `409` with `blockerReason`, the provider authored CARE
     referrals/notes/status changes or activated a school year (NOT NULL, non-
     cascading). Reassign or delete those first, then retry.
3. **Extension cache**: ensure the provider's device cache is cleared — it clears
   on disconnect or when their API key is revoked. Revoke the provider's
   extension **API key** (`api_keys`) to force a clear-on-logout on next use.

## C. Full district offboarding

1. **Export** the district's data — **SPE-60** (do not skip; deletion is
   irreversible).
2. Enumerate the district's schools (`schools` where `district_id = …`), and for
   each school its students and providers.
3. **Bulk delete** by looping the per-student and per-account steps above
   (the same API routes). Run server-side with the service role / `CRON_SECRET`
   tooling; do **not** hand-run SQL against production.
4. Revoke all district **extension API keys** so on-device caches clear.
5. Confirm Storage is empty for the district's objects (worksheet/document
   buckets) and that no orphaned rows remain.
6. Update [`subprocessors.md`](./subprocessors.md) / notify per the executed NDPA
   if the offboarding changes anything externally disclosed.

---

## Extension cache (second storage location)

The Chrome extension caches student data (SEIS ID, name, grade, school) in
`chrome.storage.local` during passive discrepancy detection. This sits **outside**
the backend, RLS, and the tooling above. Per SPE-143 it is now bounded by:

- **TTL** — cached discrepancies expire after **7 days** (pruned on read and via
  an hourly alarm).
- **Clear-on-logout** — the cache is wiped on manual disconnect, and automatically
  when the API key is invalidated server-side (a `401/403` from the compare
  endpoint drops the key and clears the cache).

**To force-clear a provider's device cache during offboarding:** revoke their
extension API key (`api_keys`). The next passive request returns `401/403`, which
disconnects the extension and clears the local cache. Absent any request, the TTL
removes it within 7 days.

---

## Retention / TTL job

`app/api/cron/cleanup-worksheet-images` deletes worksheet-submission images (and
rows) older than **12 months**. It is gated by `CRON_SECRET` (sent as the
`x-cron-secret` header or `Authorization: Bearer <secret>`), matching the existing
`cleanup-uploads` cron.

**Scheduling is not wired automatically.** Register it with the same scheduler that
runs the other cron routes (an external scheduler that sends `CRON_SECRET`, or a
`vercel.json` `crons` entry). Recommended cadence: daily.

---

## Safety notes

- Deletion is **irreversible** — always complete any requested export (SPE-60) first.
- Never hand-run deletes against production; use the routes/tooling above.
- The schema migration `supabase/migrations/20260612_student_account_deletion_retention.sql`
  (lesson_performance_history → `ON DELETE CASCADE`) must be applied for student
  deletion to be reliable.

_Related: SPE-143 (this tooling), SPE-59 (NDPA), SPE-60 (bulk export)._
