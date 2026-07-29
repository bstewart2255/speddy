-- SPE-347 follow-up, same ticket: close three holes the deep self-review found
-- in 20260729_spe347_children_foundation.sql before either migration merged.
--
-- Split into its own file because the foundation migration had already been
-- applied to production (SPE-339 precedent) when the review ran. The foundation
-- file itself was corrected in place for the parts that only a fresh replay can
-- reach — the backfill's district-student-id merge rule and the uniqueness
-- index predicate — which is safe because NO production row carried a
-- district_student_id at apply time (0 of 285), so both versions of that logic
-- produce byte-identical results on the data that actually ran through it.
-- Everything reachable at RUNTIME is re-defined here instead.
--
-- ---------------------------------------------------------------------------
-- 1. The attach-by-district-student-id branch was a privilege escalation
-- ---------------------------------------------------------------------------
-- The original trigger attached a new caseload row to an EXISTING child when
-- the row's (district_id, district_student_id) already identified one. Both of
-- those columns are supplied by the client and neither is constrained:
-- `students_insert`'s WITH CHECK only pins provider_id, and
-- upsert_students_atomic does not validate districtId either. So any signed-in
-- provider could insert a throwaway caseload row naming someone else's district
-- and a guessed student id, and the trigger would hand them a link to that
-- child — which `children_select` and `children_update` then honour.
--
-- Reproduced against a local replica of this schema before fixing: a provider
-- at a different school in a different district read the target child's
-- first_name, last_name and date_of_birth, then overwrote them. District
-- student ids are short, low-entropy, and often sequential, so guessing one is
-- not a meaningful barrier. This is the same "see it" -> "edit it" escalation
-- the child_id guard was written to stop, reached through the other key.
--
-- The fix removes the attach entirely. The branch only ever existed to stop the
-- SECOND provider importing a known child from hitting
-- ux_children_district_student_id and failing their whole insert; that goal is
-- met instead by creating the child WITHOUT the contested id and logging the
-- conflict. The caseload row still lands, the student keeps its own
-- district_student_id, and the two child rows stay separate until the
-- human-confirmed create-or-attach step (SPE-348) reconciles them — which is
-- exactly where the ticket puts that decision, and matches today's behaviour,
-- where two providers of one child simply have two rows.
--
-- The INSERT is also no longer a SELECT-then-INSERT race: two concurrent
-- imports carrying the same id would both have seen "no child yet" and both
-- tried to insert it, and the loser's entire student INSERT would have died on
-- 23505 — the very regression the branch existed to prevent. Catching
-- unique_violation covers the pre-existing case and the concurrent one in one
-- path.

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
    -- Only the database sets the link. auth.uid() IS NULL means there is no
    -- end-user session: this migration, the service client, and the sim seed.
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'students.child_id is managed by the database (SPE-347)'
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
    -- Another child in this district already owns that id. Never attach (see
    -- the header): create this provider's child without the contested id and
    -- surface the collision for the create-or-attach step. The caseload row
    -- itself is unaffected and keeps its own district_student_id.
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
$$;

COMMENT ON FUNCTION public.students_child_link() IS
  'SPE-347: BEFORE INSERT OR UPDATE on students. On insert, creates the child this caseload row serves (SECURITY DEFINER: there is no INSERT policy on children); if the row''s district student id is already held by another child in that district, the new child is created WITHOUT it and the collision is logged — it never attaches to an existing child, because both key columns are client-supplied. On update, refuses any attempt by an end-user session to set or change child_id.';

-- ---------------------------------------------------------------------------
-- 2. The mirror must not flip a child's district_student_id back and forth
-- ---------------------------------------------------------------------------
-- Merging two caseload rows that carry DIFFERENT district student ids keeps one
-- of them on the surviving child. The original mirror then overwrote that value
-- with whichever row was updated last, so the child's id flapped between the
-- two on every subsequent write. A district student id is an identity claim, not
-- a preference: fill it when the child has none, never silently replace it with
-- a different one — "disagreements surfaced, never auto-merged" (SPE-339).
CREATE OR REPLACE FUNCTION public.students_mirror_child_facts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dsid text;
  v_child_dsid text;
  v_diverged jsonb;
  v_linked bigint;
BEGIN
  v_dsid := NULLIF(btrim(NEW.district_student_id), '');

  SELECT district_student_id INTO v_child_dsid FROM public.children WHERE id = NEW.child_id;

  IF v_dsid IS NOT NULL AND v_child_dsid IS NOT NULL
     AND upper(btrim(v_child_dsid)) IS DISTINCT FROM upper(v_dsid) THEN
    RAISE LOG 'SPE-347 district_student_id disagreement on child %: caseload row % says %, child says % — not overwritten',
      NEW.child_id, NEW.id, v_dsid, v_child_dsid;
    v_dsid := NULL;
  END IF;

  -- Filling an empty id still has to respect the per-district uniqueness index,
  -- or the caller's own UPDATE would abort on a constraint they cannot see.
  IF v_dsid IS NOT NULL AND v_child_dsid IS NULL AND EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id <> NEW.child_id
      AND c.district_id IS NOT NULL
      AND c.district_id = NEW.district_id
      AND upper(btrim(c.district_student_id)) = upper(v_dsid)
  ) THEN
    RAISE LOG 'SPE-347 district_student_id collision: student % carries id % in district %, already held by another child — not mirrored',
      NEW.id, v_dsid, NEW.district_id;
    v_dsid := NULL;
  END IF;

  SELECT count(*) INTO v_linked FROM public.students s WHERE s.child_id = NEW.child_id;
  IF v_linked > 1 THEN
    SELECT NULLIF(jsonb_strip_nulls(jsonb_build_object(
      'initials',    CASE WHEN c.initials IS DISTINCT FROM NEW.initials THEN to_jsonb(c.initials) END,
      'grade_level', CASE WHEN c.grade_level IS DISTINCT FROM NEW.grade_level THEN to_jsonb(c.grade_level) END,
      'school_id',   CASE WHEN NEW.school_id IS NOT NULL AND c.school_id IS DISTINCT FROM NEW.school_id THEN to_jsonb(c.school_id) END,
      'district_id', CASE WHEN NEW.district_id IS NOT NULL AND c.district_id IS DISTINCT FROM NEW.district_id THEN to_jsonb(c.district_id) END,
      'state_id',    CASE WHEN NEW.state_id IS NOT NULL AND c.state_id IS DISTINCT FROM NEW.state_id THEN to_jsonb(c.state_id) END
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
         district_student_id = COALESCE(c.district_student_id, v_dsid)
   WHERE c.id = NEW.child_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.students_mirror_child_facts() IS
  'SPE-347: mirrors the child-level facts on a students row into its linked children row. Last write wins; NULL never overwrites; district_student_id only ever FILLS an empty value (a differing id is logged, never applied); divergence on a shared child is logged.';

-- ---------------------------------------------------------------------------
-- 3. Scope the UPDATE grant to the columns "edit the child" actually means
-- ---------------------------------------------------------------------------
-- children_update deliberately lets ANY linked provider edit the child (the
-- ticket's coarse edit scope). A table-wide UPDATE grant made that include the
-- scoping and identifier columns — district_id, school_id, state_id and
-- district_student_id — which are not "child fields" a provider edits: they are
-- mirrored from the caseload row, and rewriting one lets a provider move a
-- child between districts or re-stamp its district identifier.
--
-- Column-level grants are the outer gate (RLS still applies on top), and the
-- mirror triggers are SECURITY DEFINER, so the database keeps writing every
-- column while a signed-in caller can only write the identity/compliance ones.
REVOKE UPDATE ON public.children FROM authenticated;
GRANT UPDATE (
  first_name,
  last_name,
  date_of_birth,
  initials,
  grade_level,
  upcoming_iep_date,
  upcoming_triennial_date,
  accommodations
) ON public.children TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Re-align the uniqueness index with the corrected foundation file
-- ---------------------------------------------------------------------------
-- Production got the NULLS NOT DISTINCT version; the foundation file now
-- excludes rows with no district instead (see its §5 comment). No production row
-- carries a district_student_id, so this rebuild moves no data.
DROP INDEX IF EXISTS public.ux_children_district_student_id;
CREATE UNIQUE INDEX IF NOT EXISTS ux_children_district_student_id
  ON public.children (district_id, (upper(btrim(district_student_id))))
  WHERE district_id IS NOT NULL
    AND district_student_id IS NOT NULL
    AND btrim(district_student_id) <> '';

-- CREATE OR REPLACE preserves a function's ACL, but re-assert it so this file
-- is correct on a fresh replay too (trigger functions must not be RPC-callable).
REVOKE ALL ON FUNCTION public.students_child_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.students_mirror_child_facts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.student_details_mirror_child_facts() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Known, deliberate: the mirrors are not gated by children_update
-- ---------------------------------------------------------------------------
-- Both mirror triggers are SECURITY DEFINER and authorize nothing themselves —
-- the SOURCE table's policy is the gate. That matters in one place:
-- `student_details`'s UPDATE policy has an SEA branch (an SEA assigned to a
-- session for the student may write that student's details, columns
-- unrestricted), so an SEA can change a child's name / DOB / IEP dates THROUGH
-- student_details even though `children_update` refuses them a direct write.
--
-- This is not a new capability — an SEA can already write exactly those columns
-- today, and nothing reads `children` yet, so no surface changes. But it does
-- mean children_update is the rule for DIRECT edits only, and it becomes
-- user-visible at the cross-provider read switch: at that point an SEA's edit
-- would reach the co-serving provider's view of the child, which it does not
-- today. Called out here, in ARCHITECTURE §6, and pinned by an assertion in
-- scripts/sim-district/verify-children-rls.ts so the behaviour cannot change
-- unnoticed; the read-switch ticket decides whether to narrow it.

DO $spe347_hardening_check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'children'
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'SPE-347: authenticated must not hold INSERT/DELETE on children';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'children'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
      AND column_name IN ('district_id', 'school_id', 'state_id', 'district_student_id', 'id')
  ) THEN
    RAISE EXCEPTION 'SPE-347: authenticated must not hold UPDATE on the children scoping columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'children'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
      AND column_name = 'first_name'
  ) THEN
    RAISE EXCEPTION 'SPE-347: authenticated lost UPDATE on the children identity columns';
  END IF;
END;
$spe347_hardening_check$;
