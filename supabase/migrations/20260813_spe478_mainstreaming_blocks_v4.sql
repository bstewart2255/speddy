-- SPE-478 v4: child_id synchronization hardening (CodeRabbit round 2, PR #856).
--
-- 1. The fill trigger fired only on INSERT OR UPDATE OF student_id, so an
--    owner updating child_id alone could desynchronize the block from its
--    student (the UPDATE policy doesn't validate child_id — by design, since
--    the trigger owns the column). Fire on every write instead; the fill is
--    one indexed single-row lookup.
--
-- 2. A change to students.child_id (rare — SPE-347/348 attach flows) left
--    existing blocks keyed to the old child. Propagate it. SECURITY DEFINER:
--    the propagation must succeed regardless of which role edited the
--    student row, and RLS on mainstreaming_blocks would otherwise block it.

BEGIN;

DROP TRIGGER IF EXISTS trg_mainstreaming_blocks_fill_child ON public.mainstreaming_blocks;
CREATE TRIGGER trg_mainstreaming_blocks_fill_child
  BEFORE INSERT OR UPDATE ON public.mainstreaming_blocks
  FOR EACH ROW EXECUTE FUNCTION public.mainstreaming_blocks_fill_child();

CREATE OR REPLACE FUNCTION public.mainstreaming_blocks_sync_child_from_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.mainstreaming_blocks
  SET child_id = NEW.child_id
  WHERE student_id = NEW.id
    AND child_id IS DISTINCT FROM NEW.child_id;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.mainstreaming_blocks_sync_child_from_student() IS
  'SPE-478: when a student row''s child link changes, re-point that student''s mainstreaming blocks so child-keyed conflict matching stays true.';

CREATE TRIGGER trg_students_sync_mainstreaming_child
  AFTER UPDATE OF child_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.mainstreaming_blocks_sync_child_from_student();

COMMIT;
