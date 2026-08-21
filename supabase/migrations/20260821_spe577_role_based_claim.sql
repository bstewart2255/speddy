-- SPE-577: role-based claiming — a child is claimable per SERVICE, not once.
--
-- SPE-447's rule was "a child NOBODY serves": the first provider to claim
-- closed the child to every other discipline, so a student with academic,
-- speech and OT services could only ever be one-click-claimed by whoever got
-- there first (JSUSD has 26 such three-service students). The refusal now
-- asks a narrower question: does the CALLER already serve this child, or does
-- a provider of a BLOCKING ROLE?
--
-- Blocking roles ("role family"):
--   resource                 -> resource, specialist, intervention
--   speech                   -> speech, specialist, intervention
--   ot                       -> ot, specialist, intervention
--   counseling, psychologist -> counseling, psychologist, specialist, intervention
--   specialist, intervention -> every provider role
--
-- Two properties this table preserves on purpose:
--   * Generalists (specialist/intervention) keep the ORIGINAL rule in both
--     directions — they can only claim a child nobody serves, and a child
--     they serve is closed to everyone. Their service scope is "everything",
--     so per-service sharing cannot apply to them.
--   * counseling and psychologist block each other: both deliver the 510/515
--     services, so they are one discipline for claiming purposes.
--
-- Everything else is unchanged and load-bearing: the school scope via
-- user_accessible_school_ids(), the provider-role gate, the FOR UPDATE lock
-- ordering, the SPE-348 transaction-local handshake, the duplicate-initials
-- catch, and the per-child outcomes. The 'already-served' outcome keeps its
-- name — its meaning narrows to "served for your discipline".
--
-- Safe to apply ahead of the UI: the deployed planner only offers children
-- with no caseload rows at all, so the widened path is unreachable until the
-- SPE-577 planner ships.
--
-- Rollback: re-run the CREATE OR REPLACE FUNCTION statement in
-- supabase/migrations/20260819_spe447_claim_roster_children.sql (the prior
-- definition), which restores the any-caseload refusal.

CREATE OR REPLACE FUNCTION public.claim_roster_children(p_child_ids uuid[])
RETURNS TABLE(child_id uuid, student_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text;
  v_family text[];
  v_ids    uuid[];
  v_id     uuid;
  v_child  record;
  v_new_student uuid;
  v_collided boolean;
BEGIN
  -- SECURITY DEFINER runs as the table owner, which bypasses RLS on `children`.
  -- Every guard below is therefore the ONLY thing standing between a caller and
  -- another school's students; none of them may be dropped.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Claiming a roster student requires a signed-in provider (SPE-447)'
      USING ERRCODE = '42501';
  END IF;

  -- Caseloads belong to service providers. A teacher, SEA or admin reaching
  -- this RPC directly gets nothing: `students.provider_id` would be theirs, and
  -- every downstream surface treats that row as a caseload they own.
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_caller;
  IF v_role IS NULL OR v_role NOT IN (
    'resource', 'specialist', 'speech', 'ot', 'counseling', 'psychologist', 'intervention'
  ) THEN
    RAISE EXCEPTION 'Only service providers hold a caseload (SPE-447)'
      USING ERRCODE = '42501';
  END IF;

  -- The caseload roles that CLOSE a child to this caller (SPE-577). Computed
  -- once: the caller's role is fixed for the whole batch.
  v_family := CASE v_role
    WHEN 'resource'     THEN ARRAY['resource', 'specialist', 'intervention']
    WHEN 'speech'       THEN ARRAY['speech', 'specialist', 'intervention']
    WHEN 'ot'           THEN ARRAY['ot', 'specialist', 'intervention']
    WHEN 'counseling'   THEN ARRAY['counseling', 'psychologist', 'specialist', 'intervention']
    WHEN 'psychologist' THEN ARRAY['counseling', 'psychologist', 'specialist', 'intervention']
    ELSE ARRAY['resource', 'specialist', 'speech', 'ot', 'counseling', 'psychologist', 'intervention']
  END;

  IF p_child_ids IS NULL OR array_length(p_child_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Deduplicated and ORDERED, so two providers claiming overlapping sets take
  -- the row locks below in the same sequence and cannot deadlock.
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_child_ids) AS x;

  IF array_length(v_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Too many students in one claim (SPE-447)'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    -- Lock the child FIRST, then decide. Two providers clicking claim on the
    -- same student at the same moment would otherwise both read "open for my
    -- discipline" and both insert; the second now waits, re-reads, and is told
    -- the truth. (A same-discipline takeover remains SPE-348's door to open,
    -- with its confirmation, not this one's.)
    SELECT c.id, c.initials, c.grade_level, c.school_id, c.district_id,
           c.district_student_id, c.state_id, c.first_name, c.last_name,
           c.upcoming_iep_date, c.upcoming_triennial_date
      INTO v_child
      FROM public.children c
     WHERE c.id = v_id
       FOR UPDATE;

    IF NOT FOUND
       OR v_child.school_id IS NULL
       OR NOT EXISTS (
            SELECT 1 FROM public.user_accessible_school_ids() a
            WHERE a.school_id = v_child.school_id
          )
    THEN
      child_id := v_id; student_id := NULL; outcome := 'out-of-scope';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- SPE-577: refused when the caller already has this child on their own
    -- caseload (whatever their role says today), or when a provider of a
    -- blocking role serves them. A provider of a DIFFERENT discipline no
    -- longer closes the child: the speech therapist claiming a student stops
    -- blocking the OT.
    IF EXISTS (
         SELECT 1 FROM public.students st
         WHERE st.child_id = v_id AND st.provider_id = v_caller
       )
       OR EXISTS (
         SELECT 1
           FROM public.students st
           JOIN public.profiles p ON p.id = st.provider_id
          WHERE st.child_id = v_id
            AND p.role = ANY(v_family)
       )
    THEN
      child_id := v_id; student_id := NULL; outcome := 'already-served';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Validated. Hand the trigger the one-shot handshake (SPE-348 §3): it is
    -- transaction-local, must equal the child_id being written, and cannot be
    -- set from a client, so this is the only statement it can wave through.
    PERFORM set_config('app.spe348_confirmed_child_id', v_id::text, true);

    -- `ux_students_provider_school_grade_initials` is unique on
    -- (provider, school, grade, initials) NULLS NOT DISTINCT, so a provider who
    -- already has a "JS" in grade 3 at this school cannot take a second one.
    -- Caught per child rather than allowed to propagate: an unhandled 23505
    -- aborts the whole transaction, so one pair of shared initials in a
    -- twenty-student claim would add NOTHING and say nothing about which
    -- student caused it. Reporting it keeps the per-child contract true.
    v_collided := false;
    BEGIN
      INSERT INTO public.students (
        provider_id, initials, grade_level, school_site, school_id,
        district_id, state_id, district_student_id, child_id
      )
      SELECT
        v_caller, v_child.initials, v_child.grade_level, s.name, v_child.school_id,
        v_child.district_id, v_child.state_id, v_child.district_student_id, v_id
      FROM public.schools s
      WHERE s.id = v_child.school_id
      RETURNING id INTO v_new_student;
    EXCEPTION WHEN unique_violation THEN
      v_collided := true;
    END;

    -- Close the door behind us: nothing later in this transaction, including
    -- the next element of this batch, may reuse it. Runs on both paths — the
    -- exception block above rolls back the INSERT, not this handshake.
    PERFORM set_config('app.spe348_confirmed_child_id', '', true);

    IF v_collided THEN
      child_id := v_id; student_id := NULL; outcome := 'duplicate-initials';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- The roster knows the student's NAME and review dates; `students` does
    -- not carry them. Without this the provider claims a student and gets a
    -- bare pair of initials, which is not the student they just picked off a
    -- named list. Goals are deliberately absent: the roster holds none, and a
    -- provider's own goals are never touched by any part of SPE-447.
    INSERT INTO public.student_details (
      student_id, first_name, last_name, district_id,
      upcoming_iep_date, upcoming_triennial_date
    )
    VALUES (
      v_new_student, v_child.first_name, v_child.last_name, v_child.district_id,
      v_child.upcoming_iep_date, v_child.upcoming_triennial_date
    );

    child_id := v_id; student_id := v_new_student; outcome := 'claimed';
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.claim_roster_children(uuid[]) IS
  'SPE-447/SPE-577: a service provider adds themselves to students on their '
  'district''s roster. Attaches ONLY to a child at a school the caller works at '
  '(user_accessible_school_ids) whom no provider of a BLOCKING role serves — '
  'same discipline, or a generalist; a different discipline''s caseload no '
  'longer closes the child (SPE-577). Reuses SPE-348''s transaction-local '
  'handshake so students_child_link keeps its 42501 refusal for every other '
  'path. Returns per-child outcomes rather than dropping refusals silently. '
  'Never re-points an existing caseload row.';

REVOKE ALL ON FUNCTION public.claim_roster_children(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_roster_children(uuid[]) TO authenticated;

-- Apply-time guards (same posture as the 20260820 SPE-575 migration): fail the
-- migration loudly if the function lost its SECURITY DEFINER or anon gained
-- EXECUTE — either would silently change who can reach other schools' rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_roster_children' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'SPE-577 guard: claim_roster_children must be SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.claim_roster_children(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'SPE-577 guard: anon must not hold EXECUTE on claim_roster_children';
  END IF;
END $$;
