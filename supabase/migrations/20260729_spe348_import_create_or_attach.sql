-- SPE-348: import create-or-attach — a human-confirmed "same child?" step.
--
-- SPE-347 gave every caseload row a `children` row, but the linking trigger
-- deliberately NEVER attaches to an existing child: both `district_id` and
-- `district_student_id` are client-supplied and unconstrained, so attach-on-
-- insert let any provider link themselves to any child in any district (verified
-- exploitable before that merge). So today two providers who serve the same
-- pupil still create two children, and new shared children keep arriving as
-- duplicates.
--
-- This migration opens exactly one narrow, human-confirmed door:
--
--   1. `import_child_candidates`  — the matching ladder, in ONE place. Given the
--      school and a batch of incoming rows it returns the children at that
--      school, served by OTHER providers, that each row plausibly is. Both the
--      offer and the write-time re-validation call it, so the screen and the
--      database can never disagree about what "matches".
--   2. `find_shared_child_candidates` — the offer the review screen renders.
--      Collapses ambiguity (never offers a weak or contested match) and adds the
--      co-serving provider's name + role so the importer can judge.
--   3. `upsert_students_atomic` — accepts an optional confirmed `childId` per
--      INSERT element, presence-keyed like the rest of its contract, and
--      RE-VALIDATES it before honoring it. A client cannot attach a caseload row
--      to an arbitrary child: the claim has to survive the same ladder, at a
--      school the caller can actually reach, against a child served by someone
--      else and not already by the caller.
--   4. `students_child_link` — keeps its hard 42501 refusal for every other
--      path; the ONLY exception is a transaction-local handshake that the
--      validating RPC sets immediately before its INSERT (see the note there).
--
-- Nothing auto-attaches and nothing auto-merges. An unanswered offer, an
-- ambiguous match and an id-vs-name disagreement all fall through to today's
-- behavior: a fresh child.

-- ---------------------------------------------------------------------------
-- 1. The ladder (internal — the offer and the validator both call this)
-- ---------------------------------------------------------------------------
--
-- Precedence is SPE-339's, and the rungs are the ones
-- `matching_provider_student_ids` and `lib/utils/student-matcher.ts` already
-- use:
--
--   1. `district_student_id` — the only identifier in an import that is
--      actually stable, so it outranks every heuristic. UNLESS the stored child
--      it lands on has a plainly different name: that is SPE-339's conflict
--      rule, and it makes the whole ROW un-attachable (reason
--      'id-name-disagreement') rather than merging two children.
--   2. Full name + grade.
--   3. Initials + grade + teacher, and only when a name is missing on one side
--      — a name that is present and disagrees means a different child (SPE-266).
--
-- Candidate set (the ticket's): children AT THIS SCHOOL with caseload rows owned
-- by OTHER providers. Excluded: children the caller already serves (attaching a
-- second caseload row of your own to one child is a merge, not a link).
--
-- Known limitation, shared with `matching_provider_student_ids`: grades compare
-- literally, so a legacy SEIS grade ('18' for TK, '0' for K) does not reconcile
-- with the 'TK'/'K' the parsers emit the way the TypeScript matcher's
-- normalizeGradeLevel does. That costs a missed OFFER, never a wrong link.
-- Left alone here on purpose — changing the SQL ladder's grade semantics would
-- move `matching_provider_student_ids` too, which is SPE-349's surface.
--
-- Scope is the SCHOOL, not the district. The ticket says "same school/district",
-- but `students.district_id` is stamped from the importing provider's profile
-- and is demonstrably inconsistent in production — one school (062271002457)
-- carries three distinct district_id values, two of them on rows belonging to
-- ONE provider, plus NULLs. Gating on it would suppress exactly the legitimate
-- cross-provider offers this ticket exists to create, while adding no safety: a
-- school belongs to one district, so school equality already implies it.
CREATE OR REPLACE FUNCTION public.import_child_candidates(
  p_school_id character varying,
  p_rows jsonb
)
RETURNS TABLE(idx integer, child_id uuid, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  WITH rows_in AS (
    SELECT
      (r.value->>'idx')::integer AS idx,
      -- Trim + case-fold only, matching normalizeDistrictStudentId (SPE-339):
      -- "0012345" and "12345" can be two different children.
      NULLIF(upper(btrim(COALESCE(r.value->>'districtStudentId', ''))), '') AS dsid,
      public.norm_student_name(r.value->>'firstName', r.value->>'lastName')  AS norm_name,
      NULLIF(btrim(COALESCE(r.value->>'gradeLevel', '')), '')                AS grade_level,
      NULLIF(upper(regexp_replace(COALESCE(r.value->>'initials', ''), '[^A-Za-z]', '', 'g')), '') AS initials,
      NULLIF(r.value->>'teacherId', '')::uuid                                AS teacher_id,
      NULLIF(lower(btrim(COALESCE(r.value->>'teacherName', ''))), '')        AS teacher_name
    FROM jsonb_array_elements(p_rows) AS r
    WHERE jsonb_typeof(p_rows) = 'array'
  ),
  cand AS (
    SELECT
      s.child_id,
      -- The child's own identity facts, falling back to the caseload row's.
      -- `children.district_student_id` is only ever FILLED, never overwritten
      -- (SPE-347), so it is still empty for every production child today while
      -- `students.district_student_id` is what SPE-339's import populates.
      NULLIF(upper(btrim(COALESCE(c.district_student_id, s.district_student_id, ''))), '') AS dsid,
      COALESCE(
        public.norm_student_name(c.first_name, c.last_name),
        public.norm_student_name(d.first_name, d.last_name)
      ) AS norm_name,
      NULLIF(btrim(COALESCE(c.grade_level, s.grade_level, '')), '') AS grade_level,
      NULLIF(upper(regexp_replace(COALESCE(c.initials, s.initials, ''), '[^A-Za-z]', '', 'g')), '') AS initials,
      -- Teacher is a caseload fact, not a child fact, so it comes off the row.
      s.teacher_id,
      NULLIF(lower(btrim(COALESCE(s.teacher_name, ''))), '') AS teacher_name
    FROM public.students s
    JOIN public.children c ON c.id = s.child_id
    LEFT JOIN public.student_details d ON d.student_id = s.id
    WHERE auth.uid() IS NOT NULL
      AND p_school_id IS NOT NULL
      AND s.school_id = p_school_id
      AND c.school_id = p_school_id
      AND s.provider_id <> auth.uid()
      -- The caller has to actually be at this school. Without this a provider
      -- could name any school id and enumerate its children.
      AND EXISTS (
        SELECT 1 FROM public.user_accessible_school_ids() a WHERE a.school_id = p_school_id
      )
      -- Already on the caller's caseload → not a create-or-attach candidate.
      AND NOT EXISTS (
        SELECT 1 FROM public.students mine
        WHERE mine.child_id = s.child_id AND mine.provider_id = auth.uid()
      )
  ),
  matched AS (
    -- Rung 1: the district's own student id.
    SELECT r.idx, cand.child_id, 1 AS rung, 'district-student-id' AS reason
    FROM rows_in r
    JOIN cand ON cand.dsid = r.dsid
    WHERE r.dsid IS NOT NULL
      -- SPE-339's conflict rule: an id landing on a plainly different name is
      -- not a match. It is reported (below) and nothing is merged.
      AND (r.norm_name IS NULL OR cand.norm_name IS NULL OR cand.norm_name = r.norm_name)

    UNION ALL

    -- Rung 2: full name + grade.
    SELECT r.idx, cand.child_id, 2, 'name-grade'
    FROM rows_in r
    JOIN cand ON cand.norm_name = r.norm_name AND cand.grade_level = r.grade_level
    WHERE r.norm_name IS NOT NULL AND r.grade_level IS NOT NULL

    UNION ALL

    -- Rung 3: initials + grade + teacher, only when a name is missing on a side.
    SELECT r.idx, cand.child_id, 3, 'initials-grade-teacher'
    FROM rows_in r
    JOIN cand ON cand.initials = r.initials AND cand.grade_level = r.grade_level
    WHERE r.initials IS NOT NULL
      AND r.grade_level IS NOT NULL
      AND (r.norm_name IS NULL OR cand.norm_name IS NULL)
      AND (
        (cand.teacher_id IS NOT NULL AND r.teacher_id IS NOT NULL AND cand.teacher_id = r.teacher_id)
        OR (cand.teacher_name IS NOT NULL AND cand.teacher_name = r.teacher_name)
      )

    UNION ALL

    -- Not a match — a REPORT. An incoming id that resolves to a child whose
    -- stored name disagrees poisons the whole row: no attach is offered and none
    -- is honored, because we have no basis to choose between the id and the name.
    SELECT r.idx, cand.child_id, 0, 'id-name-disagreement'
    FROM rows_in r
    JOIN cand ON cand.dsid = r.dsid
    WHERE r.dsid IS NOT NULL
      AND r.norm_name IS NOT NULL
      AND cand.norm_name IS NOT NULL
      AND cand.norm_name <> r.norm_name
  )
  -- One row per (incoming row, child), labelled by the strongest rung that hit.
  SELECT DISTINCT ON (m.idx, m.child_id) m.idx, m.child_id, m.reason
  FROM matched m
  ORDER BY m.idx, m.child_id, m.rung;
$function$;

COMMENT ON FUNCTION public.import_child_candidates(character varying, jsonb) IS
  'SPE-348: the create-or-attach matching ladder. Internal — the offer '
  '(find_shared_child_candidates) and the write-time re-validation '
  '(upsert_students_atomic) both call it so they cannot disagree.';

REVOKE ALL ON FUNCTION public.import_child_candidates(character varying, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_child_candidates(character varying, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The offer the review screen renders
-- ---------------------------------------------------------------------------
--
-- Returns one entry per incoming row that has something to say. Three shapes:
--
--   {idx, childId, reason, gradeLevel, districtStudentId, providerName, providerRole}
--     → offer "same child?" for this row.
--   {idx, conflict: 'ambiguous', count}
--     → more than one child could be this student. Never offered: "no
--       auto-attach on weak signals".
--   {idx, conflict: 'id-name-disagreement'}
--     → the incoming Student ID belongs to a child with a different name.
--
-- Disclosure: the co-serving provider's NAME and role. That is wider than
-- find_matching_provider_sessions (role only, never a name), and deliberate —
-- owner's call on 2026-07-29: the importer is deciding whether two records are
-- one child, and "ask Emily" is the only way to actually settle it. Note what is
-- still NOT disclosed: the other provider's stored name for the child, their
-- goals, and anything about children that did NOT match a row the caller
-- already holds in their own file.
CREATE OR REPLACE FUNCTION public.find_shared_child_candidates(
  p_school_id character varying,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  WITH cands AS (
    SELECT * FROM public.import_child_candidates(p_school_id, p_rows)
  ),
  per_row AS (
    SELECT
      c.idx,
      bool_or(c.reason = 'id-name-disagreement')  AS has_disagreement,
      count(*) FILTER (WHERE c.reason <> 'id-name-disagreement') AS match_count,
      -- Only meaningful when match_count = 1.
      min(c.child_id) FILTER (WHERE c.reason <> 'id-name-disagreement') AS child_id,
      min(c.reason)   FILTER (WHERE c.reason <> 'id-name-disagreement') AS reason
    FROM cands c
    GROUP BY c.idx
  )
  SELECT COALESCE(jsonb_agg(payload ORDER BY idx), '[]'::jsonb)
  FROM (
    SELECT
      pr.idx,
      CASE
        WHEN pr.has_disagreement
          THEN jsonb_build_object('idx', pr.idx, 'conflict', 'id-name-disagreement')
        WHEN pr.match_count > 1
          THEN jsonb_build_object('idx', pr.idx, 'conflict', 'ambiguous', 'count', pr.match_count)
        WHEN pr.match_count = 1
          THEN jsonb_build_object(
                 'idx', pr.idx,
                 'childId', pr.child_id,
                 'reason', pr.reason,
                 'gradeLevel', ch.grade_level,
                 'districtStudentId', NULLIF(btrim(COALESCE(ch.district_student_id, owner.district_student_id, '')), ''),
                 'providerName', NULLIF(btrim(COALESCE(op.full_name, '')), ''),
                 'providerRole', op.role
               )
        ELSE NULL
      END AS payload
    FROM per_row pr
    LEFT JOIN public.children ch ON ch.id = pr.child_id
    -- The co-serving caseload row to attribute the match to. A child can be on
    -- several other caseloads; name the longest-standing one.
    LEFT JOIN LATERAL (
      SELECT s.provider_id, s.district_student_id
      FROM public.students s
      WHERE s.child_id = pr.child_id AND s.provider_id <> auth.uid()
      ORDER BY s.created_at, s.id
      LIMIT 1
    ) owner ON true
    LEFT JOIN public.profiles op ON op.id = owner.provider_id
  ) rows_out
  WHERE payload IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.find_shared_child_candidates(character varying, jsonb) IS
  'SPE-348: the import review screen''s "same child?" offer. Never offers an '
  'ambiguous or id-vs-name-contested match — those come back as conflicts.';

REVOKE ALL ON FUNCTION public.find_shared_child_candidates(character varying, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_shared_child_candidates(character varying, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The trigger keeps its refusal, plus one handshake
-- ---------------------------------------------------------------------------
--
-- Unchanged from SPE-347 except the INSERT branch. `child_id` is still not the
-- caller's to set: `students_insert`'s WITH CHECK only constrains provider_id,
-- so without this guard any signed-in user could insert a throwaway caseload row
-- carrying someone else's child_id and inherit that child's read AND write
-- access through `children_select` / `children_update`.
--
-- The single exception is a transaction-local handshake. `upsert_students_atomic`
-- validates the claimed child (§4) and then sets
-- `app.spe348_confirmed_child_id` to that exact id with is_local => true,
-- immediately before its INSERT. This is not forgeable from a client:
--   * `set_config` lives in pg_catalog, which PostgREST does not expose, and no
--     exposed RPC sets a caller-controlled GUC;
--   * is_local => true scopes it to the transaction, and PostgREST runs every
--     request in its own — so it cannot be planted by an earlier request;
--   * it must equal the child_id being written, so a stale or wrong value
--     refuses rather than waving anything through.
-- A service-role/migration caller (auth.uid() IS NULL) is unaffected, as before.
CREATE OR REPLACE FUNCTION public.students_child_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dsid text;
  v_child_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Re-pointing an existing caseload row at another child is a MERGE, which
    -- nothing in SPE-348 does. Still refused outright.
    IF NEW.child_id IS DISTINCT FROM OLD.child_id AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'students.child_id is managed by the database (SPE-347)'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.child_id IS NOT NULL THEN
    IF auth.uid() IS NOT NULL
       AND NEW.child_id::text IS DISTINCT FROM
           NULLIF(current_setting('app.spe348_confirmed_child_id', true), '')
    THEN
      RAISE EXCEPTION 'students.child_id is managed by the database (SPE-347/348)'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_dsid := NULLIF(btrim(NEW.district_student_id), '');

  BEGIN
    INSERT INTO public.children (
      initials, grade_level, school_id, district_id, state_id, district_student_id
    )
    VALUES (
      NEW.initials, NEW.grade_level, NEW.school_id, NEW.district_id, NEW.state_id, v_dsid
    )
    RETURNING id INTO v_child_id;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.children (
      initials, grade_level, school_id, district_id, state_id, district_student_id
    )
    VALUES (
      NEW.initials, NEW.grade_level, NEW.school_id, NEW.district_id, NEW.state_id, NULL
    )
    RETURNING id INTO v_child_id;

    RAISE LOG 'SPE-347 district_student_id collision: student % claims id % in district %, already held by another child — new child % created without it (SPE-348 reconciles)',
      NEW.id, v_dsid, NEW.district_id, v_child_id;
  END;

  NEW.child_id := v_child_id;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The write path: an optional confirmed child, re-validated server-side
-- ---------------------------------------------------------------------------
--
-- Only the INSERT branch changes. `childId` is presence-keyed like the rest of
-- the contract, and honoured only if ALL of these hold — re-checked here, never
-- taken on the client's word:
--   * the claimed child is among the candidates the ladder returns for THIS
--     row's own facts (§1), which pins school, other-provider ownership, "not
--     already mine", and matcher agreement in one place;
--   * the row carries no id-vs-name disagreement.
-- Anything else raises 42501 INSIDE the per-row subtransaction, so the forged
-- row fails and the rest of the batch still imports.
--
-- Deliberately "among the candidates" rather than "the only candidate": the
-- offer already refuses to surface an ambiguous match, so a second candidate
-- appearing between preview and confirm (another provider importing concurrently)
-- must not turn the human's confirmed, correct choice into a hard error.
CREATE OR REPLACE FUNCTION public.upsert_students_atomic(p_provider_id uuid, p_students jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_student jsonb;
  v_action text;
  v_student_id uuid;
  v_new_student_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
  v_new_sessions_per_week integer;
  v_provider_role text;
  v_child_id uuid;
  v_school_id character varying;
BEGIN
  IF auth.uid() IS NULL OR p_provider_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_provider_role
  FROM public.profiles
  WHERE id = p_provider_id;

  v_provider_role := COALESCE(v_provider_role, 'resource');

  FOR v_student IN SELECT * FROM jsonb_array_elements(p_students)
  LOOP
    v_action := v_student->>'action';
    v_student_id := (v_student->>'studentId')::uuid;

    BEGIN
      CASE v_action
        WHEN 'insert' THEN
          -- SPE-348: an optional confirmed child link. Absent for every import
          -- that isn't answering a "same child?" offer, which is almost all of
          -- them.
          v_child_id := NULL;
          IF NULLIF(v_student->>'childId', '') IS NOT NULL THEN
            v_child_id := (v_student->>'childId')::uuid;
            v_school_id := v_student->>'schoolId';

            -- One pass over the ladder: the claim has to hit, and the row has to
            -- be free of an id-vs-name disagreement. With no candidates at all
            -- both aggregates are NULL and the guard refuses, which is right.
            IF NOT EXISTS (
              SELECT 1
              FROM (
                SELECT
                  bool_or(c.child_id = v_child_id AND c.reason <> 'id-name-disagreement') AS claim_matches,
                  bool_or(c.reason = 'id-name-disagreement')                              AS row_contested
                FROM public.import_child_candidates(
                       v_school_id,
                       jsonb_build_array(v_student || jsonb_build_object('idx', 0))
                     ) c
              ) v
              WHERE v.claim_matches AND NOT v.row_contested
            ) THEN
              RAISE EXCEPTION
                'Confirmed child link refused: child % is not a match for this student at this school (SPE-348)',
                v_child_id
                USING ERRCODE = '42501';
            END IF;

            -- Validated. Hand the trigger the one-shot handshake (see §3).
            PERFORM set_config('app.spe348_confirmed_child_id', v_child_id::text, true);
          END IF;

          INSERT INTO public.students (
            provider_id,
            initials,
            grade_level,
            school_site,
            school_id,
            district_id,
            state_id,
            district_student_id,
            sessions_per_week,
            minutes_per_session,
            teacher_id,
            teacher_name,
            child_id
          )
          VALUES (
            p_provider_id,
            v_student->>'initials',
            v_student->>'gradeLevel',
            v_student->>'schoolSite',
            v_student->>'schoolId',
            v_student->>'districtId',
            v_student->>'stateId',
            NULLIF(btrim(v_student->>'districtStudentId'), ''),
            (v_student->>'sessionsPerWeek')::integer,
            (v_student->>'minutesPerSession')::integer,
            (v_student->>'teacherId')::uuid,
            v_student->>'teacherName',
            v_child_id
          )
          RETURNING id INTO v_new_student_id;

          -- Close the door behind us: nothing later in this transaction (or a
          -- later element of this batch) may reuse the handshake.
          PERFORM set_config('app.spe348_confirmed_child_id', '', true);

          INSERT INTO public.student_details (
            student_id,
            first_name,
            last_name,
            iep_goals,
            upcoming_iep_date,
            upcoming_triennial_date
          )
          VALUES (
            v_new_student_id,
            v_student->>'firstName',
            v_student->>'lastName',
            ARRAY(SELECT jsonb_array_elements_text(v_student->'goals')),
            (v_student->>'upcomingIepDate')::date,
            (v_student->>'upcomingTriennialDate')::date
          );

          v_new_sessions_per_week := (v_student->>'sessionsPerWeek')::integer;

          IF v_new_sessions_per_week IS NOT NULL AND v_new_sessions_per_week > 0 THEN
            INSERT INTO public.schedule_sessions (
              student_id,
              provider_id,
              day_of_week,
              start_time,
              end_time,
              service_type,
              status,
              delivered_by
            )
            SELECT
              v_new_student_id,
              p_provider_id,
              NULL,
              NULL,
              NULL,
              v_provider_role,
              'active',
              'provider'
            FROM generate_series(1, v_new_sessions_per_week);
          END IF;

          v_inserted := v_inserted + 1;
          v_result := jsonb_build_object(
            'action', 'inserted',
            'studentId', v_new_student_id,
            'initials', v_student->>'initials',
            'success', true
          );

        WHEN 'update' THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.students
            WHERE id = v_student_id AND provider_id = p_provider_id
          ) THEN
            RAISE EXCEPTION 'Student % not found or not owned by provider', v_student_id;
          END IF;

          UPDATE public.students
          SET
            grade_level = COALESCE(v_student->>'gradeLevel', grade_level),
            sessions_per_week = COALESCE((v_student->>'sessionsPerWeek')::integer, sessions_per_week),
            minutes_per_session = COALESCE((v_student->>'minutesPerSession')::integer, minutes_per_session),
            teacher_id = CASE
              WHEN v_student ? 'teacherId' THEN (v_student->>'teacherId')::uuid
              ELSE teacher_id
            END,
            teacher_name = CASE
              WHEN v_student ? 'teacherName' THEN v_student->>'teacherName'
              ELSE teacher_name
            END,
            district_student_id = CASE
              WHEN v_student ? 'districtStudentId'
              THEN NULLIF(btrim(v_student->>'districtStudentId'), '')
              ELSE district_student_id
            END,
            updated_at = now()
          WHERE id = v_student_id;

          INSERT INTO public.student_details (
            student_id,
            first_name,
            last_name,
            iep_goals,
            upcoming_iep_date,
            upcoming_triennial_date
          )
          VALUES (
            v_student_id,
            v_student->>'firstName',
            v_student->>'lastName',
            CASE
              WHEN v_student ? 'goals' AND jsonb_array_length(v_student->'goals') > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(v_student->'goals'))
              ELSE '{}'::text[]
            END,
            (v_student->>'upcomingIepDate')::date,
            (v_student->>'upcomingTriennialDate')::date
          )
          ON CONFLICT (student_id) DO UPDATE
          SET
            first_name = COALESCE(EXCLUDED.first_name, student_details.first_name),
            last_name = COALESCE(EXCLUDED.last_name, student_details.last_name),
            iep_goals = CASE
              WHEN v_student ? 'goals' AND jsonb_array_length(v_student->'goals') > 0
              THEN EXCLUDED.iep_goals
              ELSE student_details.iep_goals
            END,
            upcoming_iep_date = CASE
              WHEN v_student ? 'upcomingIepDate' THEN (v_student->>'upcomingIepDate')::date
              ELSE student_details.upcoming_iep_date
            END,
            upcoming_triennial_date = CASE
              WHEN v_student ? 'upcomingTriennialDate' THEN (v_student->>'upcomingTriennialDate')::date
              ELSE student_details.upcoming_triennial_date
            END,
            updated_at = now();

          v_updated := v_updated + 1;
          v_result := jsonb_build_object(
            'action', 'updated',
            'studentId', v_student_id,
            'initials', v_student->>'initials',
            'success', true
          );

        WHEN 'skip' THEN
          v_skipped := v_skipped + 1;
          v_result := jsonb_build_object(
            'action', 'skipped',
            'studentId', v_student_id,
            'initials', v_student->>'initials',
            'success', true
          );

        ELSE
          RAISE EXCEPTION 'Unknown action: %', v_action;
      END CASE;

    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        v_result := jsonb_build_object(
          'action', v_action,
          'studentId', COALESCE(v_student_id, v_new_student_id),
          'initials', v_student->>'initials',
          'success', false,
          'error', SQLERRM
        );
    END;

    v_results := v_results || v_result;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors,
    'results', v_results
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_students_atomic(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_students_atomic(uuid, jsonb) TO authenticated, service_role;
