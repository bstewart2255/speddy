-- SPE-478 v2: review fixes on mainstreaming_blocks (PR #856).
--
-- 1. CHILD IDENTITY (Codex P1 + self-review). A child served by two providers
--    has TWO students caseload rows (SPE-347); a block keyed only to the SDC
--    teacher's row can never match the other provider's session for the SAME
--    child — which is precisely the cross-provider case the protection exists
--    for. Denormalize children.id onto the block (trigger-maintained from the
--    student row, so API writers cannot desync it) and let every consumer key
--    on child when present. Nullable: pre-SPE-347 students without a child
--    link fall back to caseload-row matching, which can only under-warn for
--    unlinked legacy rows, never break same-row matching.
--
-- 2. SCHOOL BINDING (self-review). INSERT/UPDATE accepted any school in the
--    caller's school set, so a multi-school provider could (API-only) record a
--    block under school B for a student enrolled at school A. Bind the block's
--    school to the student's.
--
-- 3. updated_at TRIGGER (self-review). The column existed with no maintainer;
--    attach the house update_updated_at_column trigger like sibling tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. child_id, trigger-maintained
-- ---------------------------------------------------------------------------
ALTER TABLE public.mainstreaming_blocks
  ADD COLUMN child_id uuid REFERENCES public.children(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.mainstreaming_blocks_fill_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Always derived from the student row; a caller-supplied value is ignored.
  SELECT s.child_id INTO NEW.child_id
  FROM public.students s
  WHERE s.id = NEW.student_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.mainstreaming_blocks_fill_child() IS
  'SPE-478: keeps mainstreaming_blocks.child_id equal to the student row''s child_id. SECURITY DEFINER so the fill reads students regardless of the writer''s RLS view; the INSERT policy has already proven caseload ownership.';

CREATE TRIGGER trg_mainstreaming_blocks_fill_child
  BEFORE INSERT OR UPDATE OF student_id ON public.mainstreaming_blocks
  FOR EACH ROW EXECUTE FUNCTION public.mainstreaming_blocks_fill_child();

-- Backfill the rows created before this migration.
UPDATE public.mainstreaming_blocks mb
SET child_id = s.child_id
FROM public.students s
WHERE s.id = mb.student_id
  AND mb.child_id IS DISTINCT FROM s.child_id;

-- Child lookups are the conflict-check hot path (per student per day).
CREATE INDEX mainstreaming_blocks_child_idx
  ON public.mainstreaming_blocks (child_id)
  WHERE child_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Bind block.school_id to the student's school on writes
-- ---------------------------------------------------------------------------
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
      -- The block lives at the school the student is enrolled at — a
      -- multi-school provider cannot record it under their other school.
      AND s.school_id = mainstreaming_blocks.school_id
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
);

-- ---------------------------------------------------------------------------
-- 3. Maintain updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER mainstreaming_blocks_updated_at
  BEFORE UPDATE ON public.mainstreaming_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
