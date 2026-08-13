-- SPE-478: mainstreaming blocks — a recurring weekly block that places an SDC
-- student INTO a general-ed classroom for part of the day.
--
-- Third member of the recurring-constraint family: bell_schedules key on a
-- grade, special_activities on a teacher's class, mainstreaming_blocks on a
-- STUDENT plus a destination teacher. Template-only like its siblings (no
-- dated instances), deliberately NOT a schedule_sessions kind: sessions carry
-- service-minutes math, completion, delegation, the concurrency cap and the
-- instance horizon, none of which may apply here — a sibling table needs no
-- "except mainstreaming" carve-outs anywhere in that machinery.
--
-- The destination (teacher_id) is recorded from day one by owner decision
-- (2026-08-13): it is what makes a time-in-gen-ed (LRE) tally possible later.
--
-- Hard delete, no deleted_at: SPE-468 is the cautionary tale — soft delete
-- makes every future reader responsible for a filter it can silently forget.
-- bell_schedules hard-deletes and has never needed recovery.

CREATE TABLE public.mainstreaming_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner: the SDC teacher's provider account. CASCADE — blocks are the
  -- owner's planning data with no independent life.
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The mainstreaming student. CASCADE — meaningless without the student.
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- Destination classroom (teacher directory). CASCADE, not SET NULL: a block
  -- without a destination can't answer "where is the student", and directory
  -- deletions are rare admin acts; the owner re-adds against the replacement.
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  -- schools.id is TEXT (state school ids), matching rotation_groups et al.
  school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time time NOT NULL,
  end_time time NOT NULL,
  -- Optional display label ("Math", "PE"); the destination is teacher_id.
  label text,
  -- Computed default per SPE-460 — a literal year here would re-arm the
  -- August landmine that migration removed.
  school_year text NOT NULL DEFAULT public.current_school_year(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mainstreaming_blocks_time_order CHECK (end_time > start_time),
  -- Exact-duplicate guard (double-submit); overlapping-but-different blocks
  -- are legitimate app-level warnings, not constraint violations. Doubles as
  -- the student-lookup index (student_id leads the key).
  CONSTRAINT mainstreaming_blocks_no_exact_dupes
    UNIQUE (student_id, teacher_id, day_of_week, start_time, end_time, school_year)
);

COMMENT ON TABLE public.mainstreaming_blocks IS
  'Recurring weekly blocks placing a student in a gen-ed classroom (SPE-478). Constraint layer like bell_schedules/special_activities, keyed per student with a recorded destination teacher. Written by the owning provider; read school-wide so other providers'' scheduling warns before booking over mainstreaming time.';

-- School fetch is the hot path (schedule page loads a school's blocks for the
-- year); provider and teacher indexes serve owner lists, the sim sweep, and
-- the FKs' delete paths.
CREATE INDEX mainstreaming_blocks_school_year_idx
  ON public.mainstreaming_blocks (school_id, school_year);
CREATE INDEX mainstreaming_blocks_provider_idx
  ON public.mainstreaming_blocks (provider_id);
CREATE INDEX mainstreaming_blocks_teacher_idx
  ON public.mainstreaming_blocks (teacher_id);

-- ---------------------------------------------------------------------------
-- Row-level policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.mainstreaming_blocks ENABLE ROW LEVEL SECURITY;

-- Read: school-wide, mirroring special_activities_select (20260804) — these
-- blocks are exactly the class of constraint every provider at the school
-- must see to schedule around (owner decision 1: mainstreaming time is
-- protected). Branches: own rows; any school in the caller's
-- profile ∪ provider_schools set (get_my_school_ids, SECURITY DEFINER);
-- linked classroom teachers' school (dual-role accounts and gen-ed teacher
-- logins whose class is a destination).
-- No recursion risk (SPE-332): students'/teachers' policies never reference
-- this table.
CREATE POLICY mainstreaming_blocks_select
ON public.mainstreaming_blocks
FOR SELECT
TO authenticated
USING (
  provider_id = (SELECT auth.uid())
  OR school_id IN (SELECT school_id FROM get_my_school_ids())
  OR school_id IN (
    SELECT t.school_id FROM teachers t WHERE t.account_id = (SELECT auth.uid())
  )
);

-- Writes: owner-only, and only for students on the caller's own caseload at
-- a school the caller belongs to. The caseload check is the meaningful guard:
-- you schedule mainstreaming for YOUR students, not any student the SELECT
-- policies let you see.
CREATE POLICY mainstreaming_blocks_insert
ON public.mainstreaming_blocks
FOR INSERT
TO authenticated
WITH CHECK (
  provider_id = (SELECT auth.uid())
  AND school_id IN (SELECT school_id FROM get_my_school_ids())
  AND EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_id
      AND s.provider_id = (SELECT auth.uid())
  )
);

CREATE POLICY mainstreaming_blocks_update
ON public.mainstreaming_blocks
FOR UPDATE
TO authenticated
USING (provider_id = (SELECT auth.uid()))
WITH CHECK (
  provider_id = (SELECT auth.uid())
  AND school_id IN (SELECT school_id FROM get_my_school_ids())
  AND EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_id
      AND s.provider_id = (SELECT auth.uid())
  )
);

CREATE POLICY mainstreaming_blocks_delete
ON public.mainstreaming_blocks
FOR DELETE
TO authenticated
USING (provider_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.mainstreaming_blocks FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mainstreaming_blocks TO authenticated;
