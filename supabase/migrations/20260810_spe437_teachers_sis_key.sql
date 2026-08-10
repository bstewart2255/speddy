-- SPE-437: SIS identity on `teachers` — the generalized (source, id) pair.
--
-- The teacher-directory sync (SPE-414 Part 1) needs re-syncs to be KEYED, not
-- fuzzy: a teacher created from OneRoster today must be findable tomorrow by
-- the same stable key, or every re-sync re-matches by name/email and the
-- failure mode is duplicates — exactly what auto-create exists to prevent.
--
-- One generalized pair rather than per-source columns (`oneroster_sourced_id`,
-- `aeries_teacher_number`, …), decided once for SPE-437 and SPE-123 jointly
-- (see SPE-414 "decide ONCE"): the same two columns serve OneRoster's
-- `sourcedId` now and Aeries' `TeacherNumber` later, and adding a third SIS
-- never needs a migration again.
--
-- NULL means "human-entered, no SIS identity" — every existing row. The sync's
-- ladder (SPE-437) treats NULL rows as human-owned: it may ADOPT one by
-- stamping these columns when the email matches, but never edits its other
-- fields without a human confirming.

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS sis_source text,
  ADD COLUMN IF NOT EXISTS sis_id text;

-- The pair travels together: a source without an id identifies nothing, and an
-- id without a source is unkeyable the moment a second SIS exists.
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_sis_pair_chk CHECK ((sis_source IS NULL) = (sis_id IS NULL));

-- One row per SIS identity per school. Partial: the NULL (human-entered) rows
-- stay unconstrained — a school can hand-enter as many teachers as it likes.
-- Per school rather than global because a multi-school teacher is one row per
-- school (teachers.school_id is single-valued), each carrying the same SIS key.
CREATE UNIQUE INDEX IF NOT EXISTS teachers_school_sis_key
  ON public.teachers (school_id, sis_source, sis_id)
  WHERE sis_id IS NOT NULL;

-- No grant or RLS changes: `teachers` keeps its table-level grants, and the new
-- columns carry no secrets — a staff id is directory data the district already
-- shows in the SIS-fed Directories view (SPE-436). Row-level policies are
-- unchanged; the sync writes through the service role on a staff-gated route.
