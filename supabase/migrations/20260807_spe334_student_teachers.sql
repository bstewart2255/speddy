-- SPE-334: multi-teacher foundation — the `student_teachers` join table.
--
-- Phase 1 of the multi-teacher-per-student plan. Goal: the data model can hold
-- N teachers per student, with ZERO VISIBLE BEHAVIOR CHANGE. Every surface
-- keeps showing exactly what it shows today; the follow-up tickets (SPE-336
-- reads, SPE-337 editing UI) are what make the extra teachers visible.
--
-- ---------------------------------------------------------------------------
-- Why the link anchors on the CHILD, not the caseload row
-- ---------------------------------------------------------------------------
-- Amended 2026-07-29 (approved), after SPE-347 landed `children`. A child served
-- by an RSP and an SLP has two `students` rows; "who teaches this kid" is a fact
-- about the KID, not about either service row. Anchoring on `children.id` means
-- one link per real teacher instead of one per caseload copy, and it is the
-- shape SPE-342 / SPE-414 will write into from the SIS (which knows children and
-- class schedules, not Speddy caseloads).
--
-- Behaviour-identical on today's data, verified against prod 2026-08-07:
--   * 284 students carry a teacher_id, over 282 distinct (child, teacher) pairs
--     — the 2-row difference is the one real shared child whose two caseload
--     copies name the SAME teacher, which now yields ONE link.
--   * ZERO children have caseload copies naming DIFFERENT teachers, so every
--     `get_teacher_student_ids` read set below is byte-identical to today's.
--     Where copies ever do disagree (sim-only today) the link set is their
--     union — the correct semantics under a child-anchored model.
--
-- ---------------------------------------------------------------------------
-- Recursion posture (SPE-332 doctrine + the students⋈teachers history)
-- ---------------------------------------------------------------------------
-- `students_select` / `children_select` / `student_details` all grow a teacher
-- branch that has to read `student_teachers`. Reading it inline would put
-- `student_teachers`' own policies — which read `students` — inside `students`'
-- policy, i.e. exactly the cycle that `20251112_fix_students_rls_infinite_
-- recursion.sql` and `20251122_220000` were written to undo.
--
-- So every policy goes through ONE seam: `get_teacher_student_ids()`, already
-- SECURITY DEFINER, already the designated seam for `schedule_sessions_select`.
-- Inside it RLS does not apply, so the cycle is cut at the same place it has
-- always been cut. No new policy helper is introduced and no new function is
-- exposed to `authenticated`.
--
-- ---------------------------------------------------------------------------
-- Order of operations (matters)
-- ---------------------------------------------------------------------------
--   1. table + indexes + school-consistency trigger  (so the backfill is
--      validated by the same rule that will govern every later write)
--   2. RLS + policies
--   3. backfill
--   4. policy / function rewrites onto the junction
--   5. dual-write triggers — created LAST, on purpose: the backfill must not be
--      able to rewrite a single existing `students` row. Nothing in this
--      migration UPDATEs `students` or `student_details`.
--   6. grants + post-wiring assertions

-- ===========================================================================
-- 1. The table
-- ===========================================================================
--
-- No primary/secondary flag: co-teachers share duties as equals (product
-- decision 2026-07-26), so the teacher set is unordered. `subject` / `period`
-- are DISPLAY LABELS ONLY — secondary has no session scheduling in Speddy
-- (SPE-149/193 posture), and nothing may read them as scheduling semantics.

CREATE TABLE IF NOT EXISTS public.student_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject text,
  period text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_teachers_child_teacher_unique UNIQUE (child_id, teacher_id)
);

COMMENT ON TABLE public.student_teachers IS
  'SPE-334: the teachers of a child. Anchored on children.id, not students.id — a child served by two providers has two caseload rows but ONE teacher set. Unordered: co-teachers are equals, no primary/secondary. Written by the dual-write triggers today, by hand in SPE-337, and from the SIS in SPE-342/SPE-414.';
COMMENT ON COLUMN public.student_teachers.subject IS
  'SPE-334: display label only (e.g. "Algebra I"). Carries no scheduling meaning.';
COMMENT ON COLUMN public.student_teachers.period IS
  'SPE-334: display label only (e.g. "3"). Carries no scheduling meaning — Speddy does not schedule at secondary.';

CREATE INDEX IF NOT EXISTS idx_student_teachers_child_id
  ON public.student_teachers (child_id);
CREATE INDEX IF NOT EXISTS idx_student_teachers_teacher_id
  ON public.student_teachers (teacher_id);

CREATE TRIGGER trg_student_teachers_updated_at
  BEFORE UPDATE ON public.student_teachers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- School consistency (precedent: 20260408_staff_teacher_assignments.sql)
-- ---------------------------------------------------------------------------
--
-- A child may only be linked to a teacher at the child's own school.
--
-- ONE deliberate tolerance: a teacher row with NO school passes. 20 such rows
-- exist in production — all created by pre-2025-10 import paths, all with a
-- last name only and NO account_id, so none of them can sign in and none can
-- gain a read through the teacher branch of any policy. One of them
-- ("Davis/Winbery", itself a hand-typed co-teacher pair) is named by a live
-- caseload row, so enforcing NOT NULL here would make the backfill silently
-- drop a real teacher link. There is nothing to compare against, so the check
-- abstains rather than inventing a verdict. Every current write path sets
-- school_id, so this tolerance covers legacy rows only.
CREATE OR REPLACE FUNCTION public.verify_student_teacher_school_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_child_school text;
  v_teacher_school text;
BEGIN
  SELECT c.school_id::text INTO v_child_school
  FROM public.children c WHERE c.id = NEW.child_id;

  SELECT t.school_id::text INTO v_teacher_school
  FROM public.teachers t WHERE t.id = NEW.teacher_id;

  IF v_child_school IS NOT NULL
     AND v_teacher_school IS NOT NULL
     AND v_child_school <> v_teacher_school THEN
    RAISE EXCEPTION 'Teacher % is not at this child''s school (child school %, teacher school %)',
      NEW.teacher_id, v_child_school, v_teacher_school
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.verify_student_teacher_school_consistency() IS
  'SPE-334: BEFORE INSERT OR UPDATE on student_teachers. Refuses a link across schools. Abstains when either side has no school — 20 legacy accountless teacher rows have none.';

CREATE TRIGGER trg_student_teachers_school_consistency
  BEFORE INSERT OR UPDATE ON public.student_teachers
  FOR EACH ROW EXECUTE FUNCTION public.verify_student_teacher_school_consistency();

-- ===========================================================================
-- 2. RLS
-- ===========================================================================
--
-- SELECT mirrors `children_select` exactly — anybody who can see the child can
-- see who teaches them — with the teacher branch routed through the definer
-- seam (see the recursion note at the top).
--
-- Writes are deliberately coarse, matching SPE-347's `children_update` posture:
-- any provider with a caseload row for the child, plus site admins at the
-- child's school. Field-level narrowing (case-manager-only) is SPE-201, not
-- this ticket. The dual-write triggers below are SECURITY DEFINER and do not
-- depend on these policies.
--
-- No policy here reads `children`; the site-admin branch keys off
-- `students.school_id`, the same column `children_select` uses, which keeps the
-- evaluated table set to `students` + `admin_permissions`.

ALTER TABLE public.student_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_teachers_select ON public.student_teachers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = student_teachers.child_id
        AND (
          -- Provider owns a caseload row for this child
          s.provider_id = (SELECT auth.uid())
          OR
          -- Teacher of this child (definer seam — never read the junction here)
          s.id IN (SELECT public.get_teacher_student_ids((SELECT auth.uid())))
          OR
          -- Specialist assigned to one of the child's sessions
          EXISTS (
            SELECT 1 FROM public.schedule_sessions ss
            WHERE ss.student_id = s.id
              AND ss.assigned_to_specialist_id = (SELECT auth.uid())
          )
          OR
          -- SEA delivering one of the child's sessions (SPE-384 narrowing)
          EXISTS (
            SELECT 1 FROM public.schedule_sessions ss
            WHERE ss.student_id = s.id
              AND ss.assigned_to_sea_id = (SELECT auth.uid())
              AND ss.delivered_by = 'sea'
          )
          OR
          -- Site admin at the child's school
          EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid())
              AND ap.role = 'site_admin'
              AND ap.school_id::text = s.school_id::text
          )
        )
    )
  );

CREATE POLICY student_teachers_insert ON public.student_teachers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = student_teachers.child_id
        AND (
          s.provider_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid())
              AND ap.role = 'site_admin'
              AND ap.school_id::text = s.school_id::text
          )
        )
    )
  );

CREATE POLICY student_teachers_update ON public.student_teachers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = student_teachers.child_id
        AND (
          s.provider_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid())
              AND ap.role = 'site_admin'
              AND ap.school_id::text = s.school_id::text
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = student_teachers.child_id
        AND (
          s.provider_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid())
              AND ap.role = 'site_admin'
              AND ap.school_id::text = s.school_id::text
          )
        )
    )
  );

CREATE POLICY student_teachers_delete ON public.student_teachers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = student_teachers.child_id
        AND (
          s.provider_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid())
              AND ap.role = 'site_admin'
              AND ap.school_id::text = s.school_id::text
          )
        )
    )
  );

-- ===========================================================================
-- 3. Backfill
-- ===========================================================================
--
-- Walk `students.teacher_id` THROUGH `students.child_id`. ON CONFLICT DO
-- NOTHING collapses the shared child whose two caseload copies name the same
-- teacher into the one link it always was.
--
-- Runs BEFORE the dual-write triggers exist, so it cannot write back into
-- `students`. Nothing in this migration modifies an existing row of any
-- pre-existing table.

INSERT INTO public.student_teachers (child_id, teacher_id)
SELECT DISTINCT s.child_id, s.teacher_id
FROM public.students s
WHERE s.teacher_id IS NOT NULL
  AND s.child_id IS NOT NULL
ON CONFLICT (child_id, teacher_id) DO NOTHING;

DO $spe334_backfill$
DECLARE
  v_expected bigint;
  v_actual bigint;
  v_orphaned bigint;
BEGIN
  SELECT count(*) INTO v_expected
  FROM (SELECT DISTINCT child_id, teacher_id FROM public.students
        WHERE teacher_id IS NOT NULL AND child_id IS NOT NULL) p;

  SELECT count(*) INTO v_actual FROM public.student_teachers;

  IF v_actual <> v_expected THEN
    RAISE EXCEPTION 'SPE-334 backfill: expected % links, found %', v_expected, v_actual;
  END IF;

  -- Every caseload row that names a teacher must be reachable through the
  -- junction. This is the invariant the read rewrites below depend on.
  SELECT count(*) INTO v_orphaned
  FROM public.students s
  WHERE s.teacher_id IS NOT NULL
    AND s.child_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.student_teachers st
      WHERE st.child_id = s.child_id AND st.teacher_id = s.teacher_id
    );

  IF v_orphaned > 0 THEN
    RAISE EXCEPTION 'SPE-334 backfill: % caseload rows have no matching link', v_orphaned;
  END IF;

  RAISE LOG 'SPE-334 backfill: % links created from % teacher-bearing caseload rows',
    v_actual, (SELECT count(*) FROM public.students WHERE teacher_id IS NOT NULL);
END;
$spe334_backfill$;

-- ===========================================================================
-- 4. Rewrite the read paths onto the junction (behaviour-identical)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 4a. The seam. Everything else routes through this.
-- ---------------------------------------------------------------------------
-- Was: students ⋈ teachers ON students.teacher_id.
-- Now: teachers -> student_teachers -> every caseload row of the linked child.
-- Same rows today (no child has divergent copies); the union is the point.
CREATE OR REPLACE FUNCTION public.get_teacher_student_ids(user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT s.id
  FROM public.students s
  INNER JOIN public.student_teachers st ON st.child_id = s.child_id
  INNER JOIN public.teachers t ON t.id = st.teacher_id
  WHERE t.account_id = user_id;
$$;

COMMENT ON FUNCTION public.get_teacher_student_ids(uuid) IS
  'SPE-334: the caseload rows a teacher account may see, resolved through student_teachers (child-anchored). SECURITY DEFINER is load-bearing: it is the seam that keeps students/schedule_sessions/student_details policies from recursing into student_teachers.';

-- ---------------------------------------------------------------------------
-- 4b. students_select — teacher branch only; every other branch verbatim
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "students_select" ON public.students;

CREATE POLICY "students_select" ON public.students
  FOR SELECT TO authenticated
  USING (
    -- Provider owns the student
    provider_id = (SELECT auth.uid())
    OR
    -- Teachers can view their students (SPE-334: via the link set)
    id IN (SELECT public.get_teacher_student_ids((SELECT auth.uid())))
    OR
    -- Specialists can view students from assigned sessions
    EXISTS (SELECT 1 FROM public.schedule_sessions WHERE schedule_sessions.student_id = students.id AND schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid()))
    OR
    -- SEAs can view students from sessions they deliver
    EXISTS (SELECT 1 FROM public.schedule_sessions WHERE schedule_sessions.student_id = students.id AND schedule_sessions.assigned_to_sea_id = (SELECT auth.uid()) AND schedule_sessions.delivered_by = 'sea')
    OR
    -- Site admins can view students at their school
    EXISTS (SELECT 1 FROM public.admin_permissions WHERE admin_permissions.admin_id = (SELECT auth.uid()) AND admin_permissions.role = 'site_admin' AND admin_permissions.school_id::text = students.school_id::text)
  );

-- ---------------------------------------------------------------------------
-- 4c. children_select — teacher branch only; every other branch verbatim
-- ---------------------------------------------------------------------------
-- Left stale, a teacher linked through the junction could read the caseload row
-- but not the child record behind it.
DROP POLICY IF EXISTS children_select ON public.children;

CREATE POLICY children_select ON public.children
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = children.id
        AND (
          s.provider_id = (SELECT auth.uid())
          OR s.id IN (SELECT public.get_teacher_student_ids((SELECT auth.uid())))
          OR EXISTS (
            SELECT 1 FROM public.schedule_sessions ss
            WHERE ss.student_id = s.id AND ss.assigned_to_specialist_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.schedule_sessions ss
            WHERE ss.student_id = s.id AND ss.assigned_to_sea_id = (SELECT auth.uid())
              AND ss.delivered_by = 'sea'
          )
          OR EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid()) AND ap.role = 'site_admin'
              AND ap.school_id::text = s.school_id::text
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4d. student_details SELECT — teacher branch only; provider + SEA verbatim
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view accessible student details" ON public.student_details;

CREATE POLICY "Users can view accessible student details" ON public.student_details
    FOR SELECT USING (
        student_id IN (  -- Providers can view their own students' details
            SELECT id FROM public.students WHERE provider_id = (SELECT auth.uid())
        )
        OR student_id IN (  -- SEAs can view details for assigned students
            SELECT student_id FROM public.schedule_sessions
            WHERE assigned_to_sea_id = (SELECT auth.uid())
        )
        OR student_id IN (  -- Teachers can view IEP goals for their students (SPE-334: via the link set)
            SELECT public.get_teacher_student_ids((SELECT auth.uid()))
        )
    );

-- ---------------------------------------------------------------------------
-- 4e. Chat membership (docs/CHAT_MODULE_DESIGN.md:167-171 anticipated this)
-- ---------------------------------------------------------------------------
-- All three are already SECURITY DEFINER, so they read the junction directly
-- rather than through the seam. Every non-teacher branch is verbatim.
CREATE OR REPLACE FUNCTION public.chat_is_student_participant(p_student_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.provider_id = p_uid
    UNION ALL
    SELECT 1 FROM public.students s
      JOIN public.student_teachers st ON st.child_id = s.child_id
      JOIN public.teachers t ON t.id = st.teacher_id
      WHERE s.id = p_student_id AND t.account_id = p_uid
    UNION ALL
    SELECT 1 FROM public.schedule_sessions ss
      WHERE ss.student_id = p_student_id AND ss.is_template = TRUE AND ss.deleted_at IS NULL
        AND ss.provider_id = p_uid
    UNION ALL
    SELECT 1 FROM public.students s JOIN public.admin_permissions ap ON ap.school_id = s.school_id
      WHERE s.id = p_student_id AND ap.admin_id = p_uid AND ap.role = 'site_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_student_chat_participants(p_student_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT uid FROM (
    SELECT s.provider_id AS uid FROM public.students s WHERE s.id = p_student_id AND s.provider_id IS NOT NULL
    UNION
    SELECT t.account_id FROM public.students s
      JOIN public.student_teachers st ON st.child_id = s.child_id
      JOIN public.teachers t ON t.id = st.teacher_id
      WHERE s.id = p_student_id AND t.account_id IS NOT NULL
    UNION
    SELECT ss.provider_id FROM public.schedule_sessions ss
      WHERE ss.student_id = p_student_id AND ss.is_template = TRUE AND ss.deleted_at IS NULL AND ss.provider_id IS NOT NULL
    UNION
    SELECT ap.admin_id FROM public.students s JOIN public.admin_permissions ap ON ap.school_id = s.school_id
      WHERE s.id = p_student_id AND ap.role = 'site_admin'
  ) u
  WHERE public.is_chat_eligible(u.uid)
    AND public.chat_is_student_participant(p_student_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_my_chat_students(p_school_id character varying DEFAULT NULL::character varying)
RETURNS TABLE(id uuid, initials text, grade_level text, school_id character varying)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH participant_ids AS (
    SELECT s.id FROM public.students s WHERE s.provider_id = auth.uid()
    UNION
    SELECT s.id FROM public.students s
      JOIN public.student_teachers st ON st.child_id = s.child_id
      JOIN public.teachers t ON t.id = st.teacher_id
      WHERE t.account_id = auth.uid()
    UNION
    SELECT ss.student_id FROM public.schedule_sessions ss
      WHERE ss.student_id IS NOT NULL AND ss.is_template = TRUE AND ss.deleted_at IS NULL
        AND ss.provider_id = auth.uid()
    UNION
    SELECT s.id FROM public.students s JOIN public.admin_permissions ap ON ap.school_id = s.school_id
      WHERE ap.admin_id = auth.uid() AND ap.role = 'site_admin'
  )
  SELECT s.id, s.initials, s.grade_level, s.school_id
  FROM public.students s
  JOIN participant_ids pi ON pi.id = s.id
  WHERE public.is_chat_eligible(auth.uid())
    AND (p_school_id IS NULL OR s.school_id = p_school_id)
  ORDER BY s.initials;
$$;

-- ---------------------------------------------------------------------------
-- 4f. Cross-provider matching — "same teacher" becomes link-set overlap
-- ---------------------------------------------------------------------------
-- Only the fallback path's teacher test changes (20260721_prefer_full_name_
-- cross_provider_matching.sql). The name-authoritative path and the free-text
-- `teacher_name` fallback — which is what carries rows that have no link at all
-- — are verbatim.
--
-- Identical on today's data: with one teacher per child, "the two children
-- share a link" and "the two rows carry the same teacher_id" are the same test.
CREATE OR REPLACE FUNCTION public.matching_provider_student_ids(p_student_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  -- Security: only the student's owner may resolve matches.
  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND provider_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id
  FROM students s
  JOIN students source ON source.id = p_student_id
  LEFT JOIN student_details src_d ON src_d.student_id = source.id
  LEFT JOIN student_details cand_d ON cand_d.student_id = s.id
  WHERE s.id <> p_student_id
    AND s.provider_id <> source.provider_id
    AND s.school_id IS NOT NULL
    AND s.school_id = source.school_id
    AND (
      -- Name-authoritative path: both sides named -> names (+ grade) must agree.
      (
        norm_student_name(src_d.first_name, src_d.last_name) IS NOT NULL
        AND norm_student_name(cand_d.first_name, cand_d.last_name) IS NOT NULL
        AND norm_student_name(src_d.first_name, src_d.last_name)
            = norm_student_name(cand_d.first_name, cand_d.last_name)
        AND s.grade_level = source.grade_level
      )
      OR
      -- Fallback path: a name is missing on at least one side -> initials + grade + teacher.
      (
        (
          norm_student_name(src_d.first_name, src_d.last_name) IS NULL
          OR norm_student_name(cand_d.first_name, cand_d.last_name) IS NULL
        )
        AND LOWER(s.initials) = LOWER(source.initials)
        AND s.grade_level = source.grade_level
        AND (
          -- SPE-334: the two children share at least one teacher.
          EXISTS (
            SELECT 1
            FROM student_teachers a
            JOIN student_teachers b ON b.teacher_id = a.teacher_id
            WHERE a.child_id = s.child_id
              AND b.child_id = source.child_id
          )
          OR (
            -- Neither side has a link -> fall back to the free-text name.
            NOT EXISTS (SELECT 1 FROM student_teachers a WHERE a.child_id = s.child_id)
            AND NOT EXISTS (SELECT 1 FROM student_teachers b WHERE b.child_id = source.child_id)
            AND LOWER(COALESCE(s.teacher_name, '')) = LOWER(COALESCE(source.teacher_name, ''))
            AND COALESCE(s.teacher_name, '') <> ''
          )
        )
      )
    );
END;
$$;

-- ===========================================================================
-- 5. Dual-write (compatibility plumbing only — no product meaning)
-- ===========================================================================
--
-- Retiring `students.teacher_id` / `students.teacher_name` is SPE-341, a
-- separate contract ticket. Until then the two representations must not drift,
-- in either direction.
--
-- Created AFTER the backfill so this migration provably rewrites nothing.

-- ---------------------------------------------------------------------------
-- 5a. students.teacher_id  ->  the link set
-- ---------------------------------------------------------------------------
-- INSERT / UPDATE mirror the column onto the child's link set. On UPDATE the
-- OLD teacher's link is withdrawn too, but ONLY when no remaining caseload row
-- of that child still names them — otherwise one provider's edit would revoke a
-- teacher another provider still asserts.
--
-- DELETE deliberately does NOT withdraw links. A link has no provenance column,
-- so "was this link contributed by the row being deleted, or added by hand /
-- by the SIS?" is unanswerable — and once SPE-337 and SPE-342 write links
-- directly, guessing wrong would silently destroy them. Losing one caseload row
-- also does not stop a child from having teachers.
CREATE OR REPLACE FUNCTION public.students_mirror_teacher_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.teacher_id IS NOT NULL
     AND OLD.child_id IS NOT NULL
     AND (OLD.teacher_id IS DISTINCT FROM NEW.teacher_id
          OR OLD.child_id IS DISTINCT FROM NEW.child_id) THEN
    DELETE FROM public.student_teachers st
    WHERE st.child_id = OLD.child_id
      AND st.teacher_id = OLD.teacher_id
      AND NOT EXISTS (
        SELECT 1 FROM public.students s2
        WHERE s2.child_id = OLD.child_id
          AND s2.teacher_id = OLD.teacher_id
          AND s2.id <> NEW.id
      );
  END IF;

  IF NEW.teacher_id IS NOT NULL AND NEW.child_id IS NOT NULL THEN
    INSERT INTO public.student_teachers (child_id, teacher_id)
    VALUES (NEW.child_id, NEW.teacher_id)
    ON CONFLICT (child_id, teacher_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.students_mirror_teacher_link() IS
  'SPE-334 dual-write: mirrors the legacy students.teacher_id column into student_teachers. Adds on insert/update; withdraws the previous teacher only when no other caseload row of the same child still names them. Never withdraws on DELETE (links carry no provenance).';

CREATE TRIGGER trg_students_mirror_teacher_link
  AFTER INSERT OR UPDATE OF teacher_id, child_id ON public.students
  FOR EACH ROW
  WHEN (NEW.child_id IS NOT NULL)
  EXECUTE FUNCTION public.students_mirror_teacher_link();

-- ---------------------------------------------------------------------------
-- 5b. the link set  ->  students.teacher_id / teacher_name
-- ---------------------------------------------------------------------------
-- The legacy pair mirrors the FIRST listed link (oldest, id as tiebreak) — but
-- only on caseload rows whose current teacher_id is not, or is no longer, one
-- of the child's teachers. A row already naming a valid link is left exactly as
-- it is, so this can never fight the edit that triggered it, and no-op writes
-- are excluded so the two triggers cannot ping-pong.
--
-- One row is never touched: a caseload row carrying a hand-typed teacher_name
-- with no teacher_id at all (1 such row in production). That free text is the
-- only teacher the provider ever recorded, and no link exists to replace it
-- with; SPE-341 is where it gets resolved, not here.
CREATE OR REPLACE FUNCTION public.student_teachers_mirror_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_child_ids uuid[];
  v_child_id uuid;
  v_teacher_id uuid;
  v_teacher_name text;
BEGIN
  -- NEW is unset on DELETE and OLD is unset on INSERT, so neither may be read
  -- unconditionally. A link that moves between children (service/SIS only) has
  -- to remirror both sides.
  IF TG_OP = 'INSERT' THEN
    v_child_ids := ARRAY[NEW.child_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_child_ids := ARRAY[OLD.child_id];
  ELSIF NEW.child_id IS DISTINCT FROM OLD.child_id THEN
    v_child_ids := ARRAY[OLD.child_id, NEW.child_id];
  ELSE
    v_child_ids := ARRAY[NEW.child_id];
  END IF;

  FOREACH v_child_id IN ARRAY v_child_ids LOOP
    v_teacher_id := NULL;
    v_teacher_name := NULL;

    SELECT st.teacher_id INTO v_teacher_id
    FROM public.student_teachers st
    WHERE st.child_id = v_child_id
    ORDER BY st.created_at, st.id
    LIMIT 1;

    IF v_teacher_id IS NOT NULL THEN
      SELECT NULLIF(btrim(concat_ws(' ', t.first_name, t.last_name)), '')
      INTO v_teacher_name
      FROM public.teachers t
      WHERE t.id = v_teacher_id;
    END IF;

    UPDATE public.students s
       SET teacher_id = v_teacher_id,
           teacher_name = v_teacher_name
     WHERE s.child_id = v_child_id
       AND NOT EXISTS (
         SELECT 1 FROM public.student_teachers st
         WHERE st.child_id = v_child_id AND st.teacher_id = s.teacher_id
       )
       AND NOT (s.teacher_id IS NULL AND COALESCE(btrim(s.teacher_name), '') <> '')
       AND (s.teacher_id IS DISTINCT FROM v_teacher_id
            OR s.teacher_name IS DISTINCT FROM v_teacher_name);
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.student_teachers_mirror_legacy() IS
  'SPE-334 dual-write: points the legacy students.teacher_id/teacher_name pair at the child''s first listed link, on caseload rows whose current teacher is not one of the child''s teachers. Compatibility plumbing only — no product meaning. Retirement is SPE-341.';

CREATE TRIGGER trg_student_teachers_mirror_legacy
  AFTER INSERT OR UPDATE OR DELETE ON public.student_teachers
  FOR EACH ROW EXECUTE FUNCTION public.student_teachers_mirror_legacy();

-- ===========================================================================
-- 6. Grants
-- ===========================================================================
--
-- The three functions added here are trigger functions: nothing should reach
-- them over /rest/v1/rpc. Postgres checks EXECUTE at CREATE TRIGGER time, not
-- when the trigger fires, so the triggers above keep working (SPE-10 Tier 1+2
-- treatment, same as SPE-347's).
REVOKE ALL ON FUNCTION public.verify_student_teacher_school_consistency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.students_mirror_teacher_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.student_teachers_mirror_legacy() FROM PUBLIC, anon, authenticated;

-- The rewritten functions keep the grants they already had; CREATE OR REPLACE
-- preserves them and no signature changed, so the 20260529 / 20260531 revoke
-- lists stay accurate as written.
--
-- Table grants: Supabase's default privileges hand every new public table to
-- anon as well. Nothing here is reachable without a session (all four policies
-- are TO authenticated), but the grant is removed anyway — same posture as
-- 20260531_scope_public_select_policies_to_authenticated.sql.
REVOKE ALL ON public.student_teachers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_teachers TO authenticated;
GRANT ALL ON public.student_teachers TO service_role;

-- ===========================================================================
-- 7. Post-wiring assertions
-- ===========================================================================
-- A partially applied migration must not be able to look successful.

DO $spe334_check$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_teachers'::regclass) THEN
    RAISE EXCEPTION 'SPE-334: RLS not enabled on student_teachers';
  END IF;

  IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = 'student_teachers') <> 4 THEN
    RAISE EXCEPTION 'SPE-334: expected 4 policies on student_teachers';
  END IF;

  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relname = 'student_teachers') <> 3 THEN
    RAISE EXCEPTION 'SPE-334: expected 3 triggers on student_teachers (updated_at, school consistency, legacy mirror)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                 WHERE NOT t.tgisinternal AND c.relname = 'students'
                   AND t.tgname = 'trg_students_mirror_teacher_link') THEN
    RAISE EXCEPTION 'SPE-334: students -> link dual-write trigger missing';
  END IF;

  -- The seam must still be SECURITY DEFINER, or every rewritten policy recurses.
  IF NOT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'get_teacher_student_ids') THEN
    RAISE EXCEPTION 'SPE-334: get_teacher_student_ids is not SECURITY DEFINER';
  END IF;

  -- No rewritten policy may name the legacy column any more.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('students', 'children', 'student_details')
      AND qual ILIKE '%teacher_id%'
  ) THEN
    RAISE EXCEPTION 'SPE-334: a rewritten policy still references students.teacher_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('verify_student_teacher_school_consistency',
                        'students_mirror_teacher_link',
                        'student_teachers_mirror_legacy')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'SPE-334: a trigger function is still EXECUTE-able by anon/authenticated';
  END IF;
END;
$spe334_check$;
