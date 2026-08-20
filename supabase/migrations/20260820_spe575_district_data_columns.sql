-- SPE-575: the district's SEIS exports now carry service schedules, IEP
-- accommodations, and state-testing accommodations — three things providers
-- have had to enter by hand. This migration gives that data a home:
--
--   * `children.testing_accommodations`   — state-testing accommodations from
--     the SEIS Student Download, the same shape as `children.accommodations`.
--   * `children.district_services`        — the student's IEP service lines
--     from the SEIS Services report, as JSONB:
--       [{ code, name, minutes, frequency, weeklyMinutes }, ...]
--     where `minutes` is the file's total for the stated frequency period and
--     `weeklyMinutes` is that total converted through the shared 36-week rules
--     in lib/services/weekly-minutes.ts. Roster-owned; read at claim time to
--     propose sessions_per_week × minutes_per_session for the claiming
--     provider's own service lines.
--   * `children.district_goals`           — the district's goal text WITH its
--     routing metadata, as JSONB:
--       { iepDate, goals: [{ text, areaOfNeed, goalType, personResponsible }] }
--     Roster-owned. The per-provider goal import stays untouched; at claim
--     time the provider is offered the goals whose metadata routes to their
--     role (same keyword rules as the per-provider import), and accepting
--     writes them to their OWN student_details.iep_goals. `children` itself
--     still has no flat goals column — nothing reads goals off a child.
--   * `student_details.testing_accommodations` — the provider's own copy,
--     beside `student_details.accommodations`, editable in the details modal
--     and shown to teachers.
--
-- Also extends `student_details_mirror_child_facts` (SPE-347) so a provider's
-- edit to their testing-accommodations list mirrors onto the linked child the
-- same way their classroom-accommodations edits already do. CREATE OR REPLACE
-- preserves the function's existing REVOKEs (SPE-347 §7b).
--
-- Rollback, one line each:
--   ALTER TABLE public.children DROP COLUMN IF EXISTS testing_accommodations;
--   ALTER TABLE public.children DROP COLUMN IF EXISTS district_services;
--   ALTER TABLE public.children DROP COLUMN IF EXISTS district_goals;
--   ALTER TABLE public.student_details DROP COLUMN IF EXISTS testing_accommodations;
--   (and re-apply the SPE-347 definition of student_details_mirror_child_facts)

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS testing_accommodations text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.children.testing_accommodations IS
  'SPE-575: state-testing (CAASPP) accommodations from the district''s SEIS Student Download, as display-ready text entries.';

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS district_services jsonb;

COMMENT ON COLUMN public.children.district_services IS
  'SPE-575: the student''s IEP service lines from the district''s SEIS Services report: [{code, name, minutes, frequency, weeklyMinutes}]. Roster-owned; read at claim time to propose service minutes.';

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS district_goals jsonb;

COMMENT ON COLUMN public.children.district_goals IS
  'SPE-575: district goal text with routing metadata from the SEIS Student Goals report: {iepDate, goals: [{text, areaOfNeed, goalType, personResponsible}]}. Roster-owned; offered role-filtered at claim time.';

ALTER TABLE public.student_details
  ADD COLUMN IF NOT EXISTS testing_accommodations text[] DEFAULT '{}';

COMMENT ON COLUMN public.student_details.testing_accommodations IS
  'SPE-575: state-testing accommodations for this provider''s student, beside the classroom accommodations column.';

-- ---------------------------------------------------------------------------
-- Mirror the new column the way accommodations already mirrors (SPE-347).
-- Full function body from 20260729_spe347_children_foundation.sql with ONLY
-- the testing_accommodations clauses added; guards and semantics unchanged.
-- ---------------------------------------------------------------------------
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
      'accommodations',          CASE WHEN COALESCE(array_length(NEW.accommodations, 1), 0) > 0 AND c.accommodations IS DISTINCT FROM NEW.accommodations THEN to_jsonb(c.accommodations) END,
      'testing_accommodations',  CASE WHEN COALESCE(array_length(NEW.testing_accommodations, 1), 0) > 0 AND c.testing_accommodations IS DISTINCT FROM NEW.testing_accommodations THEN to_jsonb(c.testing_accommodations) END
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
         END,
         testing_accommodations = CASE
           WHEN COALESCE(array_length(NEW.testing_accommodations, 1), 0) > 0 THEN NEW.testing_accommodations
           ELSE c.testing_accommodations
         END
   WHERE c.id = v_child_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.student_details_mirror_child_facts() IS
  'SPE-347: mirrors the child-level facts on a student_details row (name, DOB, IEP/triennial dates, accommodations, testing accommodations) into the linked children row. Last write wins; NULL/empty never overwrites; divergence on a shared child is logged.';

-- ---------------------------------------------------------------------------
-- Guard rails, asserted at apply time
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- CREATE OR REPLACE must have preserved SPE-347 §7b's shrunken surface: the
  -- function stays SECURITY DEFINER and stays revoked from the exposed API.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'student_details_mirror_child_facts' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'SPE-575: student_details_mirror_child_facts missing or not SECURITY DEFINER';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'student_details_mirror_child_facts'
      AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'SPE-575: student_details_mirror_child_facts regained an API grant it must not have';
  END IF;
END $$;
