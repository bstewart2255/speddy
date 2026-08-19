-- SPE-447 slice 2: a provider claims a student from their district's roster.
--
-- Slice 1 put the district's whole SEIS roster into `children`. Those children
-- are, deliberately, invisible and unclaimable today:
--
--   * `children_select` is an EXISTS over `students`, so a child nobody serves
--     is visible to nobody. The read side is solved outside the database, by a
--     service-role route behind a provider gate — the same shape the district
--     portal already uses.
--   * `students_child_link` refuses any end-user session that sets `child_id`
--     (42501). That refusal is load-bearing: `students_insert`'s WITH CHECK
--     only pins `provider_id`, so without it any signed-in user could insert a
--     throwaway caseload row carrying someone else's `child_id` and inherit
--     that child's read AND write access. It was exploitable once (SPE-347
--     hardening) and must stay shut.
--
-- SPE-348 opened the one sanctioned door through it: a transaction-local
-- handshake (`app.spe348_confirmed_child_id`) that a validating SECURITY
-- DEFINER function sets immediately before its INSERT. This migration reuses
-- that handshake verbatim and adds a SECOND validator beside it. It changes
-- neither `students_child_link` nor `import_child_candidates`.
--
-- Why not widen `import_child_candidates` instead: its candidate set starts
-- FROM `students` and requires `s.provider_id <> auth.uid()`, so it structurally
-- cannot see an unclaimed child. Widening it would also change what a normal
-- file import offers, which is a different flow with a different risk profile.
-- The two doors stay separate:
--
--   SPE-348  "another provider already serves this child"  -> matching ladder
--   SPE-447  "the district roster lists this child, nobody serves them"  -> here
--
-- WHAT THIS FUNCTION WILL ATTACH TO, and nothing else:
--
--   1. A child at a school the CALLER ACTUALLY WORKS AT
--      (`user_accessible_school_ids()` — their profile school plus their
--      `provider_schools` rows). Scope is the school, not the district: a
--      school belongs to one district, so school membership already implies it,
--      and `district_id` is demonstrably inconsistent in production (SPE-348
--      found one school carrying three distinct values). Gating on it would
--      refuse legitimate claims while adding nothing.
--   2. A child NOBODY SERVES. A child with any caseload row is out of reach
--      here — taking over a served child is SPE-348's ladder, with its own
--      matching and its own confirmation. This path can only ever add the first
--      provider.
--
-- There is no name matching and no heuristic, because there is nothing to
-- match: the provider is picking a named student off their own school's roster,
-- not reconciling two records. The guard IS the school membership plus the
-- unclaimed check, and both are enforced here rather than in a route, so a
-- future screen cannot reach around them.

-- ---------------------------------------------------------------------------
-- claim_roster_children
-- ---------------------------------------------------------------------------
-- Returns one row per requested child with what actually happened, so the
-- caller can tell the provider "3 added, 1 was picked up by someone else while
-- you were reviewing" instead of silently dropping it. Outcomes:
--
--   'claimed'            -- a caseload row now exists, linked to that child
--   'already-served'     -- someone (possibly the caller) already serves them
--   'out-of-scope'       -- not a child at a school this caller works at
--   'duplicate-initials' -- the caller already has someone with those initials
--                           in that grade at that school
--
CREATE OR REPLACE FUNCTION public.claim_roster_children(p_child_ids uuid[])
RETURNS TABLE(child_id uuid, student_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text;
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
    -- same student at the same moment would otherwise both read "nobody serves
    -- them" and both insert; the second now waits, re-reads, and is told the
    -- truth. (Two providers legitimately sharing a child is a normal state —
    -- but it is SPE-348's door to open, with its confirmation, not this one's.)
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

    IF EXISTS (SELECT 1 FROM public.students st WHERE st.child_id = v_id) THEN
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
  'SPE-447: a service provider adds themselves to students on their district''s '
  'roster. Attaches ONLY to a child at a school the caller works at '
  '(user_accessible_school_ids) whom nobody serves yet, and reuses SPE-348''s '
  'transaction-local handshake so students_child_link keeps its 42501 refusal '
  'for every other path. Returns per-child outcomes rather than dropping '
  'refusals silently. Never re-points an existing caseload row and never '
  'attaches to a child another provider already serves.';

REVOKE ALL ON FUNCTION public.claim_roster_children(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_roster_children(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Guard rails, asserted at apply time
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_roster_children' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'SPE-447: claim_roster_children missing or not SECURITY DEFINER';
  END IF;

  -- The handshake this function depends on must still be the one the trigger
  -- honours. If SPE-348's guard is ever renamed, this migration's INSERT would
  -- start failing closed (42501) rather than silently attaching — but say so
  -- loudly here rather than discovering it in production.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'students_child_link'
      AND pg_get_functiondef(p.oid) LIKE '%app.spe348_confirmed_child_id%'
  ) THEN
    RAISE EXCEPTION 'SPE-447: students_child_link no longer honours the SPE-348 handshake';
  END IF;
END $$;
