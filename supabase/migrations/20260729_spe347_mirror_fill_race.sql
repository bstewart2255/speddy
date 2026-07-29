-- SPE-347, third and final piece: close the check-then-write race on the
-- mirror's district_student_id FILL path. Found by CodeRabbit on PR #789.
--
-- 20260729_spe347_children_hardening.sql §1 removed exactly this shape from the
-- INSERT path (SELECT-then-INSERT) but left it on the UPDATE path: the mirror
-- probes with EXISTS for another child holding the same id in the district, then
-- UPDATEs. The two are not atomic. Two concurrent caseload updates that each
-- fill an empty child id with the SAME value in one district both see "no
-- holder"; the loser hits ux_children_district_student_id, and because the
-- mirror is an AFTER trigger on `students`, that 23505 propagates out and
-- **rolls back the caller's own students UPDATE** — a write that has nothing to
-- do with the child row failing because of a constraint the caller cannot see.
--
-- Reproduced on a local replica with two concurrent sessions before fixing:
--
--   session A: BEGIN; UPDATE students SET district_student_id='RACE-1' ... (held)
--   session B: BEGIN; UPDATE students SET district_student_id='RACE-1' ...
--              -> blocks on the index, then on A's commit:
--   ERROR:  duplicate key value violates unique constraint "ux_children_district_student_id"
--   CONTEXT: SQL statement "UPDATE public.children c ...
--   ROLLBACK
--
-- The fix is the same one §1 used: keep the cheap EXISTS probe (it handles the
-- common, already-committed case with a clear log line and no subtransaction),
-- and wrap the UPDATE so a genuine unique_violation falls back to mirroring
-- everything EXCEPT the contested id. The caseload row keeps its own
-- district_student_id either way; only the child-level copy is withheld, and
-- SPE-348's human-confirmed step reconciles it.

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

  -- A district student id is an identity claim, not a preference: fill an empty
  -- one, never silently replace it with a different one (that made a merged
  -- pair's id flap between two values on every write).
  IF v_dsid IS NOT NULL AND v_child_dsid IS NOT NULL
     AND upper(btrim(v_child_dsid)) IS DISTINCT FROM upper(v_dsid) THEN
    RAISE LOG 'SPE-347 district_student_id disagreement on child %: caseload row % says %, child says % — not overwritten',
      NEW.child_id, NEW.id, v_dsid, v_child_dsid;
    v_dsid := NULL;
  END IF;

  -- Committed-collision fast path.
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

  BEGIN
    UPDATE public.children c
       SET initials = NEW.initials,
           grade_level = NEW.grade_level,
           school_id = COALESCE(NEW.school_id, c.school_id),
           district_id = COALESCE(NEW.district_id, c.district_id),
           state_id = COALESCE(NEW.state_id, c.state_id),
           district_student_id = COALESCE(c.district_student_id, v_dsid)
     WHERE c.id = NEW.child_id;
  EXCEPTION WHEN unique_violation THEN
    -- Lost the race to a concurrent filler. Mirror everything else; the caller's
    -- students UPDATE must not die for this.
    RAISE LOG 'SPE-347 district_student_id collision (concurrent): student % claims id % in district % — mirrored without it',
      NEW.id, v_dsid, NEW.district_id;
    UPDATE public.children c
       SET initials = NEW.initials,
           grade_level = NEW.grade_level,
           school_id = COALESCE(NEW.school_id, c.school_id),
           district_id = COALESCE(NEW.district_id, c.district_id),
           state_id = COALESCE(NEW.state_id, c.state_id)
     WHERE c.id = NEW.child_id;
  END;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.students_mirror_child_facts() IS
  'SPE-347: mirrors the child-level facts on a students row into its linked children row. Last write wins; NULL never overwrites; district_student_id only ever FILLS an empty value and never at the cost of the caller''s own write (a differing id, a committed collision, or a lost race all just skip the id and log); divergence on a shared child is logged.';

REVOKE ALL ON FUNCTION public.students_mirror_child_facts() FROM PUBLIC, anon, authenticated;
