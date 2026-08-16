-- SPE-513: student service times — where and when a secondary resource
-- provider sees each student, anchored to class PERIODS rather than clock
-- times. Two settings per entry: the student comes to the provider's room
-- ('own_room' — the academic-support/resource period), or the provider pushes
-- into the student's gen-ed class ('push_in', with the destination teacher).
--
-- Fifth member of the recurring-constraint family: bell_schedules key on a
-- grade, special_activities on a teacher's class, mainstreaming_blocks on a
-- student + destination, student_blocked_times on a student alone — this one
-- on a student + provider + setting. Born for secondary resource caseloads,
-- whose service is a weekly minutes bucket (SPE-424) with no session grid:
-- entries carry NO times. Conflict checks resolve period_name against the
-- school's period grid (SPE-491 bell rows) per day at read time, so block
-- schedules (same period, different times per day) stay correct with nothing
-- stored twice.
--
-- The shape carries every hardening its student_blocked_times sibling
-- distilled from PR #856/#864: trigger-maintained child identity on every
-- write, student-school binding in the write policies, updated_at, hard
-- delete (SPE-468 is the soft-delete cautionary tale), exact-dupe guard.

BEGIN;

CREATE TABLE public.student_service_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner: the provider who sees the student. CASCADE — planning data with no
  -- independent life.
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The student seen (the owner's caseload row). CASCADE — meaningless
  -- without the student.
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- Child identity, trigger-maintained from the student row (never
  -- caller-supplied): a co-served child has one caseload row PER provider
  -- (SPE-347), and cross-provider warnings must match the child, not the row.
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE,
  -- schools.id is TEXT (state school ids), matching the sibling tables.
  school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  -- Where the service happens: the provider's own room, or pushed into the
  -- student's class. Only 'push_in' entries warn other providers — a pull-out
  -- during the resource period is normal, one during in-class support defeats
  -- the support.
  setting text NOT NULL CHECK (setting IN ('own_room', 'push_in')),
  -- Which period of the school's grid ("Period 3", "Advisory"). The anchor is
  -- the NAME; times resolve against the school's bell rows per day.
  period_name text NOT NULL CHECK (length(btrim(period_name)) > 0),
  -- Destination classroom (teacher directory) — the class being pushed into.
  -- Required exactly when setting = 'push_in'; an own-room entry has none.
  -- CASCADE, not SET NULL: a push-in entry without its class is meaningless.
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  note text,
  -- Computed default per SPE-460 — a literal year here would re-arm the
  -- August landmine that migration removed.
  school_year text NOT NULL DEFAULT public.current_school_year(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT student_service_times_setting_teacher CHECK (
    (setting = 'push_in' AND teacher_id IS NOT NULL)
    OR (setting = 'own_room' AND teacher_id IS NULL)
  ),
  -- A student is in ONE place during a given period, so the natural key needs
  -- no setting/teacher: a second row for the same provider/student/day/period
  -- is either a double-submit or a contradiction. Doubles as the
  -- student-lookup index (student_id leads the key).
  CONSTRAINT student_service_times_no_exact_dupes
    UNIQUE (student_id, provider_id, day_of_week, period_name, school_year)
);

COMMENT ON TABLE public.student_service_times IS
  'Where/when a provider sees a student at a secondary school, per class period (SPE-513): own_room (the resource/academic-support period) or push_in (provider joins the student''s gen-ed class, teacher_id = destination). Period-anchored — times resolve from the school''s SPE-491 period grid. Written by the owning provider; read school-wide so push-in periods can warn other providers before they schedule a pull-out over in-class support.';

-- School fetch is the hot path (week view + conflict loads); provider and
-- child indexes serve owner lists, cross-provider matching, and the FKs'
-- delete paths.
CREATE INDEX student_service_times_school_year_idx
  ON public.student_service_times (school_id, school_year);
CREATE INDEX student_service_times_provider_idx
  ON public.student_service_times (provider_id);
CREATE INDEX student_service_times_child_idx
  ON public.student_service_times (child_id)
  WHERE child_id IS NOT NULL;
CREATE INDEX student_service_times_teacher_idx
  ON public.student_service_times (teacher_id)
  WHERE teacher_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- child_id: filled from the student row on every write; propagated when the
-- student's child link changes (SPE-478 v2+v4 lessons, applied from day one).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_service_times_fill_child()
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

COMMENT ON FUNCTION public.student_service_times_fill_child() IS
  'SPE-513: keeps student_service_times.child_id equal to the student row''s child_id. SECURITY DEFINER so the fill reads students regardless of the writer''s RLS view; the INSERT policy has already proven caseload ownership. Fires on every write so child_id can never be desynced by an owner update.';

CREATE TRIGGER trg_student_service_times_fill_child
  BEFORE INSERT OR UPDATE ON public.student_service_times
  FOR EACH ROW EXECUTE FUNCTION public.student_service_times_fill_child();

CREATE OR REPLACE FUNCTION public.student_service_times_sync_child_from_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.student_service_times
  SET child_id = NEW.child_id
  WHERE student_id = NEW.id
    AND child_id IS DISTINCT FROM NEW.child_id;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.student_service_times_sync_child_from_student() IS
  'SPE-513: when a student row''s child link changes (SPE-347/348 attach flows), re-point that student''s service times so child-keyed conflict matching stays true.';

CREATE TRIGGER trg_students_sync_service_times_child
  AFTER UPDATE OF child_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.student_service_times_sync_child_from_student();

-- Maintain updated_at like sibling tables.
CREATE TRIGGER student_service_times_updated_at
  BEFORE UPDATE ON public.student_service_times
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row-level policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_service_times ENABLE ROW LEVEL SECURITY;

-- Read: own rows, plus school-wide via the caller's profile ∪ provider_schools
-- set — the breadth is what lets a push-in period warn OTHER providers before
-- they book a pull-out over it. No teacher branch: the destination teacher's
-- portal has no scheduling surface to consume these yet.
-- No recursion risk (SPE-332): students' policies never reference this table.
CREATE POLICY student_service_times_select
ON public.student_service_times
FOR SELECT
TO authenticated
USING (
  provider_id = (SELECT auth.uid())
  OR school_id IN (SELECT school_id FROM get_my_school_ids())
);

-- Writes: owner-only, only for students on the caller's own caseload, bound
-- to the school the student is enrolled at (a multi-school provider cannot
-- record an entry under their other school), and — for push-in — bound to a
-- destination teacher at that same school. The teachers EXISTS runs under the
-- caller's own read policy, which already covers their school's directory.
CREATE POLICY student_service_times_insert
ON public.student_service_times
FOR INSERT
TO authenticated
WITH CHECK (
  provider_id = (SELECT auth.uid())
  AND school_id IN (SELECT school_id FROM get_my_school_ids())
  AND EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_id
      AND s.provider_id = (SELECT auth.uid())
      AND s.school_id = student_service_times.school_id
  )
  AND (
    teacher_id IS NULL
    OR EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id
        AND t.school_id = student_service_times.school_id
    )
  )
);

CREATE POLICY student_service_times_update
ON public.student_service_times
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
      AND s.school_id = student_service_times.school_id
  )
  AND (
    teacher_id IS NULL
    OR EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = teacher_id
        AND t.school_id = student_service_times.school_id
    )
  )
);

CREATE POLICY student_service_times_delete
ON public.student_service_times
FOR DELETE
TO authenticated
USING (provider_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.student_service_times FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_service_times TO authenticated;

COMMIT;
