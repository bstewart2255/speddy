-- SPE-492: student blocked times — a recurring weekly time a student must not
-- be pulled for services ("don't pull during PE"), entered by a provider.
--
-- Fourth member of the recurring-constraint family: bell_schedules key on a
-- grade, special_activities on a teacher's class, mainstreaming_blocks on a
-- student WITH a destination classroom, student_blocked_times on a student
-- alone. Born for secondary sites (JSUSD, 2026-08-13: providers need to know
-- a student has PE period 4 so they aren't pulled then) but valid at any
-- school level. The SIS class-roster sync (SPE-493) will later pre-fill these
-- from the student's actual class schedule; until then providers hand-enter
-- them.
--
-- Deliberately a SIBLING of mainstreaming_blocks, not a reuse of it: a
-- protected time has no destination classroom, and forcing teacher_id NULLs
-- through that table would make its "where is the student" semantics lie.
-- The shape below carries over every hardening its sibling earned across
-- PR #856's review rounds (child identity, school binding, updated_at,
-- write-time triggers on every write).
--
-- Hard delete, no deleted_at: SPE-468 is the cautionary tale — soft delete
-- makes every future reader responsible for a filter it can silently forget.

BEGIN;

CREATE TABLE public.student_blocked_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner: the provider who recorded the protected time. CASCADE — it is the
  -- owner's planning data with no independent life.
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The protected student (the owner's caseload row). CASCADE — meaningless
  -- without the student.
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- Child identity, trigger-maintained from the student row (never
  -- caller-supplied): a co-served child has one caseload row PER provider
  -- (SPE-347), and cross-provider protection must match the child, not the
  -- row. Nullable — pre-SPE-347 rows without a child link fall back to
  -- caseload-row matching, which can only under-warn for legacy rows.
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE,
  -- schools.id is TEXT (state school ids), matching the sibling tables.
  school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time time NOT NULL,
  end_time time NOT NULL,
  -- What the student is doing ("PE", "Band"). Required: unlike mainstreaming
  -- (where the destination teacher gives the block meaning), the label IS the
  -- only human-readable meaning a warning can show another provider.
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  -- Computed default per SPE-460 — a literal year here would re-arm the
  -- August landmine that migration removed.
  school_year text NOT NULL DEFAULT public.current_school_year(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT student_blocked_times_time_order CHECK (end_time > start_time),
  -- Exact-duplicate guard (double-submit); overlapping-but-different blocks
  -- are legitimate app-level warnings, not constraint violations. Doubles as
  -- the student-lookup index (student_id leads the key).
  CONSTRAINT student_blocked_times_no_exact_dupes
    UNIQUE (student_id, day_of_week, start_time, end_time, school_year)
);

COMMENT ON TABLE public.student_blocked_times IS
  'Recurring weekly protected times for a student ("don''t pull during PE", SPE-492). Constraint layer like bell_schedules/special_activities/mainstreaming_blocks, keyed per student. Written by the owning provider; read school-wide so every provider''s scheduling warns before booking over protected time. SPE-493 will pre-fill these from SIS class rosters.';

-- School fetch is the hot path (schedule page loads a school's blocks for the
-- year); provider and child indexes serve owner lists, conflict checks, and
-- the FKs' delete paths.
CREATE INDEX student_blocked_times_school_year_idx
  ON public.student_blocked_times (school_id, school_year);
CREATE INDEX student_blocked_times_provider_idx
  ON public.student_blocked_times (provider_id);
CREATE INDEX student_blocked_times_child_idx
  ON public.student_blocked_times (child_id)
  WHERE child_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- child_id: filled from the student row on every write; propagated when the
-- student's child link changes (SPE-478 v2+v4 lessons, applied from day one).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_blocked_times_fill_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Always derived from the student row; a caller-supplied value is ignored.
  SELECT s.child_id INTO NEW.child_id
  FROM public.students s
  WHERE s.id = NEW.student_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.student_blocked_times_fill_child() IS
  'SPE-492: keeps student_blocked_times.child_id equal to the student row''s child_id. SECURITY DEFINER so the fill reads students regardless of the writer''s RLS view; the INSERT policy has already proven caseload ownership. Fires on every write so child_id can never be desynced by an owner update.';

CREATE TRIGGER trg_student_blocked_times_fill_child
  BEFORE INSERT OR UPDATE ON public.student_blocked_times
  FOR EACH ROW EXECUTE FUNCTION public.student_blocked_times_fill_child();

CREATE OR REPLACE FUNCTION public.student_blocked_times_sync_child_from_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.student_blocked_times
  SET child_id = NEW.child_id
  WHERE student_id = NEW.id
    AND child_id IS DISTINCT FROM NEW.child_id;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.student_blocked_times_sync_child_from_student() IS
  'SPE-492: when a student row''s child link changes (SPE-347/348 attach flows), re-point that student''s blocked times so child-keyed conflict matching stays true.';

CREATE TRIGGER trg_students_sync_blocked_times_child
  AFTER UPDATE OF child_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.student_blocked_times_sync_child_from_student();

-- Maintain updated_at like sibling tables.
CREATE TRIGGER student_blocked_times_updated_at
  BEFORE UPDATE ON public.student_blocked_times
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row-level policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_blocked_times ENABLE ROW LEVEL SECURITY;

-- Read: own rows, plus school-wide via the caller's profile ∪ provider_schools
-- set — that breadth is what makes cross-provider protection work (provider B
-- must be warned about provider A's block). No teacher branch: unlike
-- mainstreaming there is no destination classroom for a gen-ed teacher to
-- need. No recursion risk (SPE-332): students' policies never reference this
-- table.
CREATE POLICY student_blocked_times_select
ON public.student_blocked_times
FOR SELECT
TO authenticated
USING (
  provider_id = (SELECT auth.uid())
  OR school_id IN (SELECT school_id FROM get_my_school_ids())
);

-- Writes: owner-only, only for students on the caller's own caseload, and
-- bound to the school the student is enrolled at (a multi-school provider
-- cannot record a block under their other school).
CREATE POLICY student_blocked_times_insert
ON public.student_blocked_times
FOR INSERT
TO authenticated
WITH CHECK (
  provider_id = (SELECT auth.uid())
  AND school_id IN (SELECT school_id FROM get_my_school_ids())
  AND EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_id
      AND s.provider_id = (SELECT auth.uid())
      AND s.school_id = student_blocked_times.school_id
  )
);

CREATE POLICY student_blocked_times_update
ON public.student_blocked_times
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
      AND s.school_id = student_blocked_times.school_id
  )
);

CREATE POLICY student_blocked_times_delete
ON public.student_blocked_times
FOR DELETE
TO authenticated
USING (provider_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.student_blocked_times FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_blocked_times TO authenticated;

COMMIT;
