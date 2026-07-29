-- SPE-347: child-record foundation — a `children` table above `students`.
--
-- Target model: ONE CHILD = ONE `children` ROW. Existing `students` rows stay
-- exactly what they are today — the per-provider caseload/service row
-- (ownership, sessions_per_week, minutes_per_session, per-discipline goals).
-- A child served by an RSP and an SLP is one `children` row and two `students`
-- rows pointing at it.
--
-- This migration is BEHAVIOR-IDENTICAL. No surface changes what it shows or
-- accepts: nothing reads `children` yet, no existing policy is modified, no
-- column is dropped, and no existing write path is altered. It is additive
-- only.
--
-- ---------------------------------------------------------------------------
-- Why extraction, not collapse
-- ---------------------------------------------------------------------------
-- All 18 FK dependents (schedule_sessions with 11k+ rows included) key off
-- `students.id` and STAY PUT; sessions carry their own provider_id. Write RLS
-- on `students` (provider_id = auth.uid()) is untouched. The only new policies
-- live on the new table. No re-keying, no big-bang.
--
-- `children` deliberately has NO cascade path from `profiles`. Today `students`
-- is ON DELETE CASCADE from `profiles`, so deleting a provider destroys their
-- students' full history. `children` is a PARENT of `students` — nothing
-- cascades into it — so the child record survives provider offboarding. That is
-- the first half of the retention fix flagged in the 2026-07-27 audit.
--
-- ---------------------------------------------------------------------------
-- Recursion posture (SPE-332 / SPE-334 doctrine)
-- ---------------------------------------------------------------------------
-- The new policies on `children` reference `students`. NO policy on `students`
-- references `children`, so there is no cycle: children -> students -> (teachers,
-- schedule_sessions, profiles, admin_permissions), and none of those reference
-- children. `schedule_sessions`'s own policies reach students only through the
-- SECURITY DEFINER seam (get_teacher_student_ids), which is why students_select
-- can already reference schedule_sessions today without recursing.
--
-- The one place this migration DOES need the definer seam is writes: the
-- `children` INSERT path. There is no INSERT policy at all, so the only way a
-- row is created is the SECURITY DEFINER trigger below.

-- ===========================================================================
-- 1. The table
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. first/last/DOB live on student_details today; initials and grade
  -- live on students. The child-level copy folds both together.
  first_name text,
  last_name text,
  date_of_birth date,
  initials text NOT NULL,
  grade_level text NOT NULL,

  -- Context. Same shapes and same FK targets as students.school_id /
  -- district_id / state_id (varchar, not uuid — these are NCES/CDE-style ids).
  school_id varchar(36) REFERENCES public.schools(id),
  district_id varchar(36) REFERENCES public.districts(id),
  state_id varchar(2) REFERENCES public.states(id),

  -- SPE-339's column, at the level it actually belongs to. On `students` it had
  -- to be provider-scoped (one row per provider per child); here the child IS
  -- the row, so it can carry the district's real uniqueness rule.
  district_student_id text,

  -- Compliance: the child-level slice of student_details.
  upcoming_iep_date date,
  upcoming_triennial_date date,
  accommodations text[] NOT NULL DEFAULT '{}'::text[],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.children IS
  'SPE-347: one row per child. `students` rows are the per-provider caseload/service rows and point here via students.child_id. Rows are created only by the SECURITY DEFINER trigger on students (there is no INSERT policy) and are never deleted by any policy — children outlive provider offboarding on purpose.';

COMMENT ON COLUMN public.children.district_student_id IS
  'SPE-339/SPE-347: the district''s own student identifier, unique within a district (ux_children_district_student_id). Cross-district recurrence stays legal.';

CREATE INDEX IF NOT EXISTS idx_children_school_id
  ON public.children (school_id) WHERE school_id IS NOT NULL;

CREATE TRIGGER trg_children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- 2. The link column on students
-- ===========================================================================
--
-- NULLable for the moment the column exists and before the backfill below runs;
-- every row is linked by the end of this migration and the trigger keeps every
-- future row linked. Left NULLable rather than NOT NULL because the constraint
-- would have to be validated inside the same transaction that populates it, and
-- because a future create-or-attach flow may want to stage a row. No cascade:
-- deleting a child is not something any policy permits.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS child_id uuid REFERENCES public.children(id);

COMMENT ON COLUMN public.students.child_id IS
  'SPE-347: the child this caseload row serves. Managed by the database (trg_students_child_link) — an end-user session may not set or change it.';

CREATE INDEX IF NOT EXISTS idx_students_child_id
  ON public.students (child_id) WHERE child_id IS NOT NULL;

-- ===========================================================================
-- 3. RLS
-- ===========================================================================
--
-- Grants first, so the table's reachable surface is exactly SELECT + UPDATE for
-- signed-in users. INSERT and DELETE are not granted at all (belt to the
-- policies' braces): inserts arrive through the definer trigger, which runs as
-- the function owner, and nothing deletes.

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.children FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.children TO authenticated;
GRANT ALL ON public.children TO service_role;

-- SELECT: mirrors every branch of `students_select` (20251224_fix_rls_performance.sql)
-- through students.child_id, so nobody who can see a student today is blind to
-- its child. Branches, in the same order as the source policy: owning provider;
-- the student's teacher; a specialist or SEA assigned to one of the student's
-- sessions; an SEA at the student's school; a site admin for that school.
--
-- Note that `students`'s own RLS ALSO applies to the sub-select below (Postgres
-- applies RLS inside policy expressions — that is what made profiles_update
-- recurse in SPE-332). Here that is harmless and fail-closed: it can only
-- narrow this policy to rows the caller could already select from `students`,
-- which is precisely the intent. The explicit mirror is kept anyway so the rule
-- is readable on its face, and so a future change to students_select (SPE-334
-- rewrites its teacher branch onto student_teachers) shows up as a policy that
-- needs updating rather than as silent drift.
CREATE POLICY children_select ON public.children
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.child_id = children.id
        AND (
          s.provider_id = (SELECT auth.uid())
          OR s.teacher_id IN (
            SELECT t.id FROM public.teachers t WHERE t.account_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.schedule_sessions ss
            WHERE ss.student_id = s.id AND ss.assigned_to_specialist_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.schedule_sessions ss
            WHERE ss.student_id = s.id AND ss.assigned_to_sea_id = (SELECT auth.uid())
          )
          OR (
            (s.school_id)::text IN (
              SELECT p.school_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
            )
            AND (SELECT auth.uid()) IN (
              SELECT p.id FROM public.profiles p WHERE p.role = 'sea'
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = (SELECT auth.uid())
              AND ap.role = 'site_admin'
              AND (ap.school_id)::text = (s.school_id)::text
          )
        )
    )
  );

-- UPDATE: deliberately COARSE — any provider with a caseload row for this child
-- may edit the child's facts. That matches today's reality, where each provider
-- edits their own copy freely and nothing arbitrates. Field-level tightening
-- (case-manager-only) is SPE-201's amended scope, not this ticket.
--
-- Narrower than SELECT on purpose: a teacher / SEA / site admin can READ a child
-- (they can read the student today) but cannot write one.
CREATE POLICY children_update ON public.children
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = children.id AND s.provider_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.child_id = children.id AND s.provider_id = (SELECT auth.uid())
    )
  );

-- No INSERT policy: rows come from the definer trigger only.
-- No DELETE policy: nobody deletes a child. The admin student-deletion flow
-- gets its own look at the cross-provider read-switch step.

-- ===========================================================================
-- 4. Backfill + merge
-- ===========================================================================
--
-- Runs BEFORE the triggers are created, so the backfill is not fighting its own
-- dual-write, and before the district_student_id unique index is created, so a
-- pre-existing duplicate id surfaces as a clear index failure after the merge
-- phase rather than as a mid-insert error.
--
-- Phases:
--   1. one children row per students row;
--   2. collapse rows that share a (district_id, district_student_id) — the
--      SPE-339 rule "same district + same district id => same child";
--   3. collapse rows the SPE-255/SPE-290 cross-provider matcher calls the same
--      child (school-scoped, full-name-preferred), MINUS an explicit hold-out;
--   4. assert the invariants.
--
-- Field-level merge rule (ticket): prefer non-null, then newest updated_at.
-- Every conflict — two members carrying different non-null values for a field —
-- is RAISE NOTICE'd, so it lands in the migration output and the Postgres log.

DO $spe347_backfill$
DECLARE
  -- Hold-out: components containing one of these (school_id | grade_level |
  -- initials) natural keys are DETECTED and REPORTED but NOT merged.
  --
  -- '062271002458|2|GB' is the one real-world duplicate pair — Mt. Diablo
  -- Elementary, an OT and an SLP each carrying a copy of the same 2nd-grader.
  -- Verified 2026-07-27: the two copies diverge on nothing (same 2x30 service,
  -- same teacher, no student_details rows on either), so merging them is
  -- trivial — but merging real children is the owner's call, not the
  -- migration's. It merges in a follow-up migration on Blair's explicit
  -- confirmation; until then both copies keep their own child row, which is
  -- exactly today's behavior.
  v_holdout_keys text[] := ARRAY['062271002458|2|GB'];

  v_students_before bigint;
  v_sessions_before bigint;
  v_details_before bigint;
  v_created bigint := 0;
  v_merged bigint := 0;
  v_held bigint := 0;
  v_ambiguous bigint := 0;

  rec record;
  v_ids uuid[];
  v_survivor uuid;
  v_conflicts jsonb;

  v_first_name text;
  v_last_name text;
  v_dob date;
  v_initials text;
  v_grade text;
  v_school varchar(36);
  v_district varchar(36);
  v_state varchar(2);
  v_dsid text;
  v_iep date;
  v_tri date;
  v_accom text[];
BEGIN
  SELECT count(*) INTO v_students_before FROM public.students;
  SELECT count(*) INTO v_sessions_before FROM public.schedule_sessions;
  SELECT count(*) INTO v_details_before FROM public.student_details;

  -- ---- Phase 1: one child per student ------------------------------------
  -- Mapping table first, so the insert and the link are two plainly-ordered
  -- statements rather than one clever data-modifying CTE.
  CREATE TEMP TABLE spe347_new_children ON COMMIT DROP AS
    SELECT s.id AS student_id, gen_random_uuid() AS child_id
    FROM public.students s
    WHERE s.child_id IS NULL;

  INSERT INTO public.children (
    id, first_name, last_name, date_of_birth, initials, grade_level,
    school_id, district_id, state_id, district_student_id,
    upcoming_iep_date, upcoming_triennial_date, accommodations,
    created_at, updated_at
  )
  SELECT
    m.child_id,
    d.first_name,
    d.last_name,
    d.date_of_birth,
    s.initials,
    s.grade_level,
    s.school_id,
    s.district_id,
    s.state_id,
    NULLIF(btrim(s.district_student_id), ''),
    d.upcoming_iep_date,
    d.upcoming_triennial_date,
    COALESCE(d.accommodations, '{}'::text[]),
    COALESCE(s.created_at, now()),
    COALESCE(s.updated_at, now())
  FROM spe347_new_children m
  JOIN public.students s ON s.id = m.student_id
  LEFT JOIN public.student_details d ON d.student_id = s.id;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  UPDATE public.students s
     SET child_id = m.child_id
    FROM spe347_new_children m
   WHERE s.id = m.student_id;

  RAISE NOTICE 'SPE-347 phase 1: created % children (one per students row)', v_created;

  -- ---- Phases 2 + 3: merge -----------------------------------------------
  -- Both phases feed the same merge body through a single component list.
  FOR rec IN
    WITH RECURSIVE
    -- Phase 2 groups: same district + same normalized district student id.
    -- Both sides must name the SAME, KNOWN district. A district student id is
    -- meaningless without a district, so two rows that merely agree on "district
    -- unknown" are not evidence of the same child — treating NULL as a matching
    -- value would merge unrelated children from different real districts (2
    -- production rows have no district_id), and a merge is not reversible.
    dsid_edges AS (
      SELECT a.child_id AS x, b.child_id AS y
      FROM public.students a
      JOIN public.students b
        ON b.child_id > a.child_id
       AND a.district_id IS NOT NULL
       AND a.district_id = b.district_id
       AND upper(btrim(a.district_student_id)) = upper(btrim(b.district_student_id))
      WHERE NULLIF(btrim(a.district_student_id), '') IS NOT NULL
        AND NULLIF(btrim(b.district_student_id), '') IS NOT NULL
    ),
    -- Phase 3 groups: the SPE-255/SPE-290 cross-provider matcher, verbatim —
    -- same school always required; both sides named => normalized names + grade
    -- must agree (a name is authoritative); otherwise fall back to
    -- initials + grade + teacher.
    named AS (
      SELECT
        s.id, s.child_id, s.provider_id, s.school_id, s.grade_level, s.initials,
        s.teacher_id, s.teacher_name,
        public.norm_student_name(d.first_name, d.last_name) AS nname
      FROM public.students s
      LEFT JOIN public.student_details d ON d.student_id = s.id
    ),
    match_edges AS (
      SELECT a.child_id AS x, b.child_id AS y
      FROM named a
      JOIN named b
        ON b.child_id > a.child_id
       AND a.provider_id IS DISTINCT FROM b.provider_id
       AND a.school_id IS NOT NULL
       AND a.school_id = b.school_id
       AND (
         (
           a.nname IS NOT NULL AND b.nname IS NOT NULL
           AND a.nname = b.nname
           AND a.grade_level = b.grade_level
         )
         OR (
           (a.nname IS NULL OR b.nname IS NULL)
           AND lower(a.initials) = lower(b.initials)
           AND a.grade_level = b.grade_level
           AND (
             (a.teacher_id IS NOT NULL AND b.teacher_id IS NOT NULL AND a.teacher_id = b.teacher_id)
             OR (
               (a.teacher_id IS NULL OR b.teacher_id IS NULL)
               AND lower(COALESCE(a.teacher_name, '')) = lower(COALESCE(b.teacher_name, ''))
               AND COALESCE(a.teacher_name, '') <> ''
             )
           )
         )
       )
    ),
    -- Symmetric edge set + reflexive base, so `min(seed) reachable` is a
    -- correct connected-component label even if a group ever exceeds a pair.
    edges AS (
      SELECT x, y FROM dsid_edges
      UNION SELECT y, x FROM dsid_edges
      UNION SELECT x, y FROM match_edges
      UNION SELECT y, x FROM match_edges
    ),
    nodes AS (
      SELECT x AS id FROM edges UNION SELECT y FROM edges
    ),
    reach AS (
      SELECT id AS node, id AS seed FROM nodes
      UNION
      SELECT e.y, r.seed FROM reach r JOIN edges e ON e.x = r.node
    ),
    component AS (
      -- (array_agg ORDER BY)[1] rather than min(): Postgres has no min(uuid).
      SELECT node, (array_agg(seed ORDER BY seed))[1] AS comp FROM reach GROUP BY node
    ),
    -- The matcher is PAIRWISE and says nothing about transitivity, so a
    -- connected component is not automatically one child. Three rows that share
    -- initials + grade + teacher, where A is "Alice Smith", C is "Carol Jones"
    -- and B has no name at all, produce edges A-B and B-C via the fallback path
    -- while A-C is explicitly REFUSED by the name-authoritative rule. Merging
    -- the component would fuse two children the matcher just said are
    -- different — irreversibly, since the losing rows are deleted.
    --
    -- So a component is only merged when it is a CLIQUE: every pair in it
    -- matched. Anything else is ambiguous by construction (B matches two
    -- differently-named children and nothing here can say which it is) and is
    -- left for the human-confirmed create-or-attach step. A pair is trivially a
    -- clique, so this changes nothing for the shape all real duplicates have.
    component_size AS (
      SELECT comp, count(*) AS n FROM component GROUP BY comp
    ),
    component_edges AS (
      -- `edges` holds both directions, so each undirected pair is counted twice.
      SELECT c1.comp, count(*) / 2 AS pairs
      FROM component c1
      JOIN edges e ON e.x = c1.node
      JOIN component c2 ON c2.node = e.y AND c2.comp = c1.comp
      GROUP BY c1.comp
    )
    SELECT
      c.comp,
      array_agg(DISTINCT c.node) AS child_ids,
      bool_and(cs.n * (cs.n - 1) / 2 = ce.pairs) AS is_clique,
      bool_or(
        (s.school_id || '|' || s.grade_level || '|' || s.initials) = ANY (v_holdout_keys)
      ) AS held_out,
      string_agg(DISTINCT coalesce(sc.name, s.school_id) || ' / grade ' || s.grade_level || ' / ' || s.initials, ', ') AS label,
      string_agg(DISTINCT coalesce(p.email, s.provider_id::text), ', ') AS providers
    FROM component c
    JOIN component_size cs ON cs.comp = c.comp
    JOIN component_edges ce ON ce.comp = c.comp
    JOIN public.students s ON s.child_id = c.node
    LEFT JOIN public.schools sc ON sc.id = s.school_id
    LEFT JOIN public.profiles p ON p.id = s.provider_id
    GROUP BY c.comp
    HAVING count(DISTINCT c.node) > 1
    ORDER BY c.comp
  LOOP
    v_ids := rec.child_ids;

    IF NOT rec.is_clique THEN
      v_ambiguous := v_ambiguous + 1;
      RAISE NOTICE 'SPE-347 AMBIGUOUS (not merged, needs human confirmation): % [%] — the matcher links these % children only transitively, and at least one pair in the group does NOT match. children=%',
        rec.label, rec.providers, array_length(v_ids, 1), v_ids;
      CONTINUE;
    END IF;

    IF rec.held_out THEN
      -- A hold-out is a judgement call about a MATCHER guess ("are these the
      -- same kid?"). It cannot override the district's own identifier: leaving
      -- two children that share a (district, district student id) un-merged
      -- would make ux_children_district_student_id below fail and roll the whole
      -- migration back, with an error pointing at the index instead of at the
      -- real contradiction. Fail here, precisely, instead.
      IF EXISTS (
        SELECT 1
        FROM public.students a
        JOIN public.students b
          ON b.id > a.id
         AND a.district_id IS NOT NULL
         AND a.district_id = b.district_id
         AND upper(btrim(a.district_student_id)) = upper(btrim(b.district_student_id))
        WHERE a.child_id = ANY (v_ids)
          AND b.child_id = ANY (v_ids)
          AND NULLIF(btrim(a.district_student_id), '') IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'SPE-347: held-out group % shares a district student id, so it cannot stay un-merged (ux_children_district_student_id would reject it). Either merge it or clear the duplicate id first.',
          rec.label;
      END IF;
      v_held := v_held + 1;
      RAISE NOTICE 'SPE-347 HELD OUT (awaiting owner confirmation, not merged): % [%] children=%',
        rec.label, rec.providers, v_ids;
      CONTINUE;
    END IF;

    -- Ordering is deliberately anchored on the SOURCE students row, never on the
    -- children id: child ids are minted fresh by phase 1, so tie-breaking on them
    -- would make the winner of an exact updated_at tie differ between replays of
    -- the same migration against the same data. Every child in a component has
    -- exactly one caseload row at this point (components are disjoint and phase 1
    -- is 1:1), and even if it did not, "first non-null in this order" stays
    -- well-defined.
    SELECT c.id INTO v_survivor
    FROM public.children c
    JOIN public.students s ON s.child_id = c.id
    WHERE c.id = ANY (v_ids)
    ORDER BY c.created_at ASC NULLS LAST, s.id ASC
    LIMIT 1;

    -- Winning value per field: first non-null in (updated_at DESC, student id
    -- DESC) order == "prefer non-null, then newest updated_at".
    SELECT
      (array_remove(array_agg(c.first_name ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.last_name ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.date_of_birth ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.initials ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.grade_level ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.school_id ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.district_id ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.state_id ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.district_student_id ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.upcoming_iep_date ORDER BY c.updated_at DESC, s.id DESC), NULL))[1],
      (array_remove(array_agg(c.upcoming_triennial_date ORDER BY c.updated_at DESC, s.id DESC), NULL))[1]
    INTO v_first_name, v_last_name, v_dob, v_initials, v_grade, v_school,
         v_district, v_state, v_dsid, v_iep, v_tri
    FROM public.children c
    JOIN public.students s ON s.child_id = c.id
    WHERE c.id = ANY (v_ids);

    -- accommodations is an array column: "non-null" means "non-empty".
    SELECT c.accommodations INTO v_accom
    FROM public.children c
    JOIN public.students s ON s.child_id = c.id
    WHERE c.id = ANY (v_ids)
      AND COALESCE(array_length(c.accommodations, 1), 0) > 0
    ORDER BY c.updated_at DESC, s.id DESC
    LIMIT 1;

    -- Conflicts: any field where two members disagree on a non-null value.
    SELECT NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'first_name',              CASE WHEN count(DISTINCT first_name) > 1 THEN to_jsonb(array_agg(DISTINCT first_name)) END,
      'last_name',               CASE WHEN count(DISTINCT last_name) > 1 THEN to_jsonb(array_agg(DISTINCT last_name)) END,
      'date_of_birth',           CASE WHEN count(DISTINCT date_of_birth) > 1 THEN to_jsonb(array_agg(DISTINCT date_of_birth)) END,
      'initials',                CASE WHEN count(DISTINCT initials) > 1 THEN to_jsonb(array_agg(DISTINCT initials)) END,
      'grade_level',             CASE WHEN count(DISTINCT grade_level) > 1 THEN to_jsonb(array_agg(DISTINCT grade_level)) END,
      'school_id',               CASE WHEN count(DISTINCT school_id) > 1 THEN to_jsonb(array_agg(DISTINCT school_id)) END,
      'district_id',             CASE WHEN count(DISTINCT district_id) > 1 THEN to_jsonb(array_agg(DISTINCT district_id)) END,
      'state_id',                CASE WHEN count(DISTINCT state_id) > 1 THEN to_jsonb(array_agg(DISTINCT state_id)) END,
      'district_student_id',     CASE WHEN count(DISTINCT district_student_id) > 1 THEN to_jsonb(array_agg(DISTINCT district_student_id)) END,
      'upcoming_iep_date',       CASE WHEN count(DISTINCT upcoming_iep_date) > 1 THEN to_jsonb(array_agg(DISTINCT upcoming_iep_date)) END,
      'upcoming_triennial_date', CASE WHEN count(DISTINCT upcoming_triennial_date) > 1 THEN to_jsonb(array_agg(DISTINCT upcoming_triennial_date)) END
    )), '{}'::jsonb)
    INTO v_conflicts
    FROM public.children
    WHERE id = ANY (v_ids);

    UPDATE public.children
       SET first_name = v_first_name,
           last_name = v_last_name,
           date_of_birth = v_dob,
           initials = v_initials,
           grade_level = v_grade,
           school_id = v_school,
           district_id = v_district,
           state_id = v_state,
           district_student_id = v_dsid,
           upcoming_iep_date = v_iep,
           upcoming_triennial_date = v_tri,
           accommodations = COALESCE(v_accom, '{}'::text[])
     WHERE id = v_survivor;

    UPDATE public.students
       SET child_id = v_survivor
     WHERE child_id = ANY (v_ids)
       AND child_id <> v_survivor;

    DELETE FROM public.children
     WHERE id = ANY (v_ids)
       AND id <> v_survivor;

    v_merged := v_merged + (array_length(v_ids, 1) - 1);
    RAISE NOTICE 'SPE-347 MERGED % rows into child %: % [%]%',
      array_length(v_ids, 1), v_survivor, rec.label, rec.providers,
      CASE WHEN v_conflicts IS NULL THEN ' (no field conflicts)'
           ELSE ' CONFLICTS RESOLVED (prefer non-null, then newest updated_at): ' || v_conflicts::text END;
  END LOOP;

  RAISE NOTICE 'SPE-347 merge summary: % duplicate row(s) merged away, % group(s) held out for owner confirmation, % group(s) left un-merged as ambiguous',
    v_merged, v_held, v_ambiguous;

  -- ---- Phase 4: assertions -----------------------------------------------
  IF (SELECT count(*) FROM public.students) <> v_students_before THEN
    RAISE EXCEPTION 'SPE-347: students count changed (% -> %)',
      v_students_before, (SELECT count(*) FROM public.students);
  END IF;
  IF (SELECT count(*) FROM public.schedule_sessions) <> v_sessions_before THEN
    RAISE EXCEPTION 'SPE-347: schedule_sessions count changed (% -> %)',
      v_sessions_before, (SELECT count(*) FROM public.schedule_sessions);
  END IF;
  IF (SELECT count(*) FROM public.student_details) <> v_details_before THEN
    RAISE EXCEPTION 'SPE-347: student_details count changed (% -> %)',
      v_details_before, (SELECT count(*) FROM public.student_details);
  END IF;
  IF EXISTS (SELECT 1 FROM public.students WHERE child_id IS NULL) THEN
    RAISE EXCEPTION 'SPE-347: % students row(s) left unlinked',
      (SELECT count(*) FROM public.students WHERE child_id IS NULL);
  END IF;
  -- The ticket's headline invariant. Holds because this migration applies
  -- exactly once (its CREATE POLICY / CREATE TRIGGER statements are not
  -- IF NOT EXISTS), so `children` starts empty and every row here came from
  -- phase 1.
  IF (SELECT count(*) FROM public.children) <> v_students_before - v_merged THEN
    RAISE EXCEPTION 'SPE-347: children count % <> students count % minus merged %',
      (SELECT count(*) FROM public.children), v_students_before, v_merged;
  END IF;
  IF v_created <> v_students_before THEN
    RAISE EXCEPTION 'SPE-347: phase 1 created % children for % students — children was not empty',
      v_created, v_students_before;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.children c
    WHERE NOT EXISTS (SELECT 1 FROM public.students s WHERE s.child_id = c.id)
  ) THEN
    RAISE EXCEPTION 'SPE-347: orphan children row(s) created';
  END IF;

  RAISE NOTICE 'SPE-347 backfill complete: % students -> % children (% merged, % held out, % ambiguous)',
    v_students_before, (SELECT count(*) FROM public.children), v_merged, v_held, v_ambiguous;
END;
$spe347_backfill$;

-- ===========================================================================
-- 5. district_student_id uniqueness, per district
-- ===========================================================================
--
-- The same shape as students' ux_students_provider_district_student_id, minus
-- the provider scope — which is the whole point of the child row: `students`
-- needed the provider in the key because it holds one row per provider per
-- child, `children` does not.
--
-- Normalization matches the matcher's (trim + upper) so the backstop agrees
-- with the comparison it backs. Blank/NULL ids are excluded so the many
-- children with no id yet do not collide.
--
-- Rows with NO district are excluded too — a deliberate difference from the
-- students index, which uses NULLS NOT DISTINCT. "Unique within a district" has
-- no meaning for a row whose district is unknown, and NULLS NOT DISTINCT would
-- make two such children (2 production rows have no district_id) collide on a
-- shared id even though nothing says they are the same child. Excluding them
-- keeps the constraint saying only what it can actually know.
--
-- Created AFTER the backfill on purpose: the merge phase above is what collapses
-- duplicate ids, so a failure here is a loud, correct signal that it did not.
CREATE UNIQUE INDEX IF NOT EXISTS ux_children_district_student_id
  ON public.children (district_id, (upper(btrim(district_student_id))))
  WHERE district_id IS NOT NULL
    AND district_student_id IS NOT NULL
    AND btrim(district_student_id) <> '';

-- ===========================================================================
-- 6. Auto-create / attach on INSERT, and the child_id write guard
-- ===========================================================================
--
-- Every existing write path — the manual add form, the roster import, and
-- upsert_students_atomic — keeps working completely unmodified: they insert a
-- students row without a child_id, and this trigger fills one in.
--
-- Two behaviors, one function so their ordering can never drift:
--
-- (a) child_id is not the caller's to set. `students_insert`'s WITH CHECK only
--     constrains provider_id, so without this guard a signed-in user could
--     insert a throwaway caseload row carrying someone else's child_id and
--     inherit that child's SELECT + UPDATE grants — turning "can see this
--     child" into "can edit this child". No app code writes child_id (the
--     column did not exist until this migration), so nothing legitimate is
--     refused. auth.uid() IS NULL means there is no end-user session: the
--     service client, this migration, and the sim seed, all of which are
--     trusted to set the link explicitly.
--
-- (b) otherwise: attach to an existing child when the district's own student id
--     already identifies one, else create a fresh child from the row's child
--     facts. The ID-first attach is the same rule the backfill above applies
--     and the rule SPE-339 defined for the import path ("same district + same
--     district student id => same child"). Without it, the SECOND provider to
--     import a child the district already knows would hit
--     ux_children_district_student_id and their whole insert would fail — a
--     visible regression in a path this ticket promises not to touch. This is
--     NOT the create-or-attach step (SPE-348): there is no name/initials
--     matching and no human confirmation here, only exact id equality.
--
-- Names and DOB are not available at this point — student_details is written
-- after the students row — so they arrive via the student_details mirror below.

CREATE OR REPLACE FUNCTION public.students_child_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dsid text;
  v_child_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.child_id IS DISTINCT FROM OLD.child_id AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'students.child_id is managed by the database (SPE-347)'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.child_id IS NOT NULL THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'students.child_id is managed by the database (SPE-347)'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_dsid := NULLIF(btrim(NEW.district_student_id), '');

  IF v_dsid IS NOT NULL THEN
    SELECT c.id INTO v_child_id
    FROM public.children c
    WHERE c.district_id IS NOT DISTINCT FROM NEW.district_id
      AND upper(btrim(c.district_student_id)) = upper(v_dsid)
    LIMIT 1;
  END IF;

  IF v_child_id IS NULL THEN
    INSERT INTO public.children (
      initials, grade_level, school_id, district_id, state_id, district_student_id
    )
    VALUES (
      NEW.initials, NEW.grade_level, NEW.school_id, NEW.district_id, NEW.state_id, v_dsid
    )
    RETURNING id INTO v_child_id;
  END IF;

  NEW.child_id := v_child_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.students_child_link() IS
  'SPE-347: BEFORE INSERT OR UPDATE on students. On insert, links the row to a child — attaching to the existing child when the district student id already identifies one, otherwise creating it (SECURITY DEFINER: there is no INSERT policy on children). On update, refuses any attempt by an end-user session to set or change child_id.';

CREATE TRIGGER trg_students_child_link
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_child_link();

-- ===========================================================================
-- 7. Dual-write: students / student_details child facts -> children
-- ===========================================================================
--
-- Nothing stops being written to students or student_details here — the child
-- row is a mirror, and retiring the duplicated columns is its own later
-- contract ticket (SPE-350).
--
-- Rule: last write wins, and a NULL never overwrites a stored value. Writes on
-- both source tables are routinely partial today (upsert_students_atomic
-- COALESCEs almost every column, and PostgREST PATCHes carry only the fields
-- the caller sent), so an absent value means "not provided", not "cleared".
-- Applying it literally would let one provider's blank details row wipe the
-- name another provider supplied for the same child. Same reason
-- `accommodations` mirrors only when non-empty.
--
-- Divergence — the mirror overwriting a DIFFERENT non-null value on a child that
-- more than one caseload row points at — is logged. After the backfill above
-- there are no shared children left un-merged except the held-out real pair, so
-- in practice this should stay silent; it is the rule for when create-or-attach
-- starts producing shared children in volume.

CREATE OR REPLACE FUNCTION public.students_mirror_child_facts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dsid text;
  v_diverged jsonb;
  v_linked bigint;
BEGIN
  v_dsid := NULLIF(btrim(NEW.district_student_id), '');

  -- Never mirror a district student id that another child in the same district
  -- already owns: ux_children_district_student_id would abort the caller's
  -- UPDATE, and "same id, different child" is a conflict to surface, never to
  -- resolve silently (SPE-339's import rule).
  IF v_dsid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id <> NEW.child_id
      AND c.district_id IS NOT DISTINCT FROM NEW.district_id
      AND upper(btrim(c.district_student_id)) = upper(v_dsid)
  ) THEN
    RAISE LOG 'SPE-347 district_student_id conflict: student % carries id % in district %, already held by another child — not mirrored',
      NEW.id, v_dsid, NEW.district_id;
    v_dsid := NULL;
  END IF;

  SELECT count(*) INTO v_linked FROM public.students s WHERE s.child_id = NEW.child_id;
  IF v_linked > 1 THEN
    SELECT NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'initials',            CASE WHEN c.initials IS DISTINCT FROM NEW.initials THEN to_jsonb(c.initials) END,
      'grade_level',         CASE WHEN c.grade_level IS DISTINCT FROM NEW.grade_level THEN to_jsonb(c.grade_level) END,
      'school_id',           CASE WHEN NEW.school_id IS NOT NULL AND c.school_id IS DISTINCT FROM NEW.school_id THEN to_jsonb(c.school_id) END,
      'district_id',         CASE WHEN NEW.district_id IS NOT NULL AND c.district_id IS DISTINCT FROM NEW.district_id THEN to_jsonb(c.district_id) END,
      'state_id',            CASE WHEN NEW.state_id IS NOT NULL AND c.state_id IS DISTINCT FROM NEW.state_id THEN to_jsonb(c.state_id) END,
      'district_student_id', CASE WHEN v_dsid IS NOT NULL AND c.district_student_id IS DISTINCT FROM v_dsid THEN to_jsonb(c.district_student_id) END
    )), '{}'::jsonb)
    INTO v_diverged
    FROM public.children c WHERE c.id = NEW.child_id;

    IF v_diverged IS NOT NULL THEN
      RAISE LOG 'SPE-347 child-fact divergence on child % (% caseload rows): students row % overwrote %',
        NEW.child_id, v_linked, NEW.id, v_diverged;
    END IF;
  END IF;

  UPDATE public.children c
     SET initials = NEW.initials,
         grade_level = NEW.grade_level,
         school_id = COALESCE(NEW.school_id, c.school_id),
         district_id = COALESCE(NEW.district_id, c.district_id),
         state_id = COALESCE(NEW.state_id, c.state_id),
         district_student_id = COALESCE(v_dsid, c.district_student_id)
   WHERE c.id = NEW.child_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.students_mirror_child_facts() IS
  'SPE-347: mirrors the child-level facts on a students row into its linked children row. Last write wins; NULL never overwrites; divergence on a shared child is logged.';

CREATE TRIGGER trg_students_mirror_child_facts
  AFTER UPDATE ON public.students
  FOR EACH ROW
  WHEN (
    NEW.child_id IS NOT NULL
    AND (
      OLD.initials IS DISTINCT FROM NEW.initials
      OR OLD.grade_level IS DISTINCT FROM NEW.grade_level
      OR OLD.school_id IS DISTINCT FROM NEW.school_id
      OR OLD.district_id IS DISTINCT FROM NEW.district_id
      OR OLD.state_id IS DISTINCT FROM NEW.state_id
      OR OLD.district_student_id IS DISTINCT FROM NEW.district_student_id
      -- A re-link (service/migration only — an end-user session is refused by
      -- trg_students_child_link) must carry this row's facts onto the new child.
      OR OLD.child_id IS DISTINCT FROM NEW.child_id
    )
  )
  EXECUTE FUNCTION public.students_mirror_child_facts();

CREATE OR REPLACE FUNCTION public.student_details_mirror_child_facts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_child_id uuid;
  v_diverged jsonb;
  v_linked bigint;
BEGIN
  SELECT s.child_id INTO v_child_id FROM public.students s WHERE s.id = NEW.student_id;
  IF v_child_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_linked FROM public.students s WHERE s.child_id = v_child_id;
  IF v_linked > 1 THEN
    SELECT NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'first_name',              CASE WHEN NEW.first_name IS NOT NULL AND c.first_name IS DISTINCT FROM NEW.first_name THEN to_jsonb(c.first_name) END,
      'last_name',               CASE WHEN NEW.last_name IS NOT NULL AND c.last_name IS DISTINCT FROM NEW.last_name THEN to_jsonb(c.last_name) END,
      'date_of_birth',           CASE WHEN NEW.date_of_birth IS NOT NULL AND c.date_of_birth IS DISTINCT FROM NEW.date_of_birth THEN to_jsonb(c.date_of_birth) END,
      'upcoming_iep_date',       CASE WHEN NEW.upcoming_iep_date IS NOT NULL AND c.upcoming_iep_date IS DISTINCT FROM NEW.upcoming_iep_date THEN to_jsonb(c.upcoming_iep_date) END,
      'upcoming_triennial_date', CASE WHEN NEW.upcoming_triennial_date IS NOT NULL AND c.upcoming_triennial_date IS DISTINCT FROM NEW.upcoming_triennial_date THEN to_jsonb(c.upcoming_triennial_date) END,
      'accommodations',          CASE WHEN COALESCE(array_length(NEW.accommodations, 1), 0) > 0 AND c.accommodations IS DISTINCT FROM NEW.accommodations THEN to_jsonb(c.accommodations) END
    )), '{}'::jsonb)
    INTO v_diverged
    FROM public.children c WHERE c.id = v_child_id;

    IF v_diverged IS NOT NULL THEN
      RAISE LOG 'SPE-347 child-fact divergence on child % (% caseload rows): student_details for student % overwrote %',
        v_child_id, v_linked, NEW.student_id, v_diverged;
    END IF;
  END IF;

  UPDATE public.children c
     SET first_name = COALESCE(NEW.first_name, c.first_name),
         last_name = COALESCE(NEW.last_name, c.last_name),
         date_of_birth = COALESCE(NEW.date_of_birth, c.date_of_birth),
         upcoming_iep_date = COALESCE(NEW.upcoming_iep_date, c.upcoming_iep_date),
         upcoming_triennial_date = COALESCE(NEW.upcoming_triennial_date, c.upcoming_triennial_date),
         accommodations = CASE
           WHEN COALESCE(array_length(NEW.accommodations, 1), 0) > 0 THEN NEW.accommodations
           ELSE c.accommodations
         END
   WHERE c.id = v_child_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.student_details_mirror_child_facts() IS
  'SPE-347: mirrors the child-level facts on a student_details row (name, DOB, IEP/triennial dates, accommodations) into the linked children row. Last write wins; NULL/empty never overwrites; divergence on a shared child is logged.';

CREATE TRIGGER trg_student_details_mirror_child_facts
  AFTER INSERT OR UPDATE ON public.student_details
  FOR EACH ROW
  EXECUTE FUNCTION public.student_details_mirror_child_facts();

-- ===========================================================================
-- 7b. Shrink the definer surface these three functions add
-- ===========================================================================
--
-- All three are trigger functions: nothing should ever call them over
-- /rest/v1/rpc. Postgres checks EXECUTE on a trigger function at CREATE TRIGGER
-- time, not when the trigger fires, so revoking here leaves every trigger above
-- working while removing them from the exposed API — the same treatment
-- SPE-10 Tier 1+2 gave the existing trigger functions, and what Supabase's
-- {anon,authenticated}_security_definer_function_executable advisors ask for.
REVOKE ALL ON FUNCTION public.students_child_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.students_mirror_child_facts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.student_details_mirror_child_facts() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 8. Post-wiring assertion
-- ===========================================================================
-- Proves the objects this migration promises actually exist, so a partially
-- applied migration cannot look successful.

DO $spe347_check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'children' AND p.polname = 'children_select') THEN
    RAISE EXCEPTION 'SPE-347: children_select policy missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'children' AND p.polname = 'children_update') THEN
    RAISE EXCEPTION 'SPE-347: children_update policy missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
             WHERE c.relname = 'children' AND p.polcmd IN ('a', 'd')) THEN
    RAISE EXCEPTION 'SPE-347: unexpected INSERT/DELETE policy on children';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.children'::regclass) THEN
    RAISE EXCEPTION 'SPE-347: RLS not enabled on children';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relname IN ('students', 'student_details')
        AND t.tgname LIKE 'trg_stud%child%') <> 3 THEN
    RAISE EXCEPTION 'SPE-347: expected 3 child-link/mirror triggers on students + student_details';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('students_child_link', 'students_mirror_child_facts',
                        'student_details_mirror_child_facts')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'SPE-347: a trigger function is still EXECUTE-able by anon/authenticated';
  END IF;
END;
$spe347_check$;
