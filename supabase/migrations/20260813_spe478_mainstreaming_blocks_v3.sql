-- SPE-478 v3: least-privilege tightening from PR #856 review (CodeRabbit).
--
-- 1. The teacher SELECT branch granted any linked classroom teacher at the
--    school a read of EVERY block at the school. A gen-ed teacher's need is
--    "which students join MY class" — scope the branch to rows naming them as
--    the destination. (Providers keep the school-wide read via
--    get_my_school_ids: that breadth is what makes cross-provider protection
--    work, and the dual-role SDC account reads through the provider branch.)
--
-- 2. Writes now also require the DESTINATION teacher to belong to the block's
--    school, closing the remaining cross-school inconsistency the v2
--    student-school binding didn't cover.

BEGIN;

DROP POLICY IF EXISTS mainstreaming_blocks_select ON public.mainstreaming_blocks;
CREATE POLICY mainstreaming_blocks_select
ON public.mainstreaming_blocks
FOR SELECT
TO authenticated
USING (
  provider_id = (SELECT auth.uid())
  OR school_id IN (SELECT school_id FROM get_my_school_ids())
  -- Destination teachers see the blocks aimed at THEIR class, not the school's.
  OR teacher_id IN (
    SELECT t.id FROM teachers t WHERE t.account_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS mainstreaming_blocks_insert ON public.mainstreaming_blocks;
CREATE POLICY mainstreaming_blocks_insert
ON public.mainstreaming_blocks
FOR INSERT
TO authenticated
WITH CHECK (
  provider_id = (SELECT auth.uid())
  AND school_id IN (SELECT school_id FROM get_my_school_ids())
  AND EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_id
      AND s.provider_id = (SELECT auth.uid())
      AND s.school_id = mainstreaming_blocks.school_id
  )
  AND EXISTS (
    SELECT 1 FROM teachers t
    WHERE t.id = teacher_id
      AND t.school_id = mainstreaming_blocks.school_id
  )
);

DROP POLICY IF EXISTS mainstreaming_blocks_update ON public.mainstreaming_blocks;
CREATE POLICY mainstreaming_blocks_update
ON public.mainstreaming_blocks
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
      AND s.school_id = mainstreaming_blocks.school_id
  )
  AND EXISTS (
    SELECT 1 FROM teachers t
    WHERE t.id = teacher_id
      AND t.school_id = mainstreaming_blocks.school_id
  )
);

COMMIT;
