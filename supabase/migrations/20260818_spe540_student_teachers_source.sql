-- SPE-540: provenance on student↔teacher links, ahead of the first SIS write.
--
-- SPE-414 Part 2 teaches the OneRoster link sync to write `student_teachers`.
-- Re-running a sync means REMOVING links the SIS no longer asserts — and that
-- is only safe if sync-written rows are distinguishable from human-written
-- ones, because a provider's hand-added co-teacher must never be deleted by a
-- machine reconciling a class roster. SPE-334 §5a called this exact gap out
-- ("a link has no provenance column") when it declined to withdraw links on
-- caseload-row deletes.
--
-- One column, two values:
--   'human'     — added by a provider/admin in the UI, by the SPE-334 backfill,
--                 or by the legacy dual-write mirror. The default, so every
--                 existing row and every current write path is classified
--                 without touching any of them.
--   'oneroster' — written by the SPE-540 link sync. The ONLY rows that sync
--                 may relabel or delete; its DELETE/UPDATE statements repeat
--                 `source = 'oneroster'` in their WHERE as a second lock.
--
-- The CHECK is added NOT VALID and then validated, so a concurrent write
-- cannot slip between definition and enforcement, and the ADD is guarded for
-- idempotence (same pattern as 20260810_spe437_teachers_sis_key.sql).

ALTER TABLE public.student_teachers
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human';

DO $spe540_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.student_teachers'::regclass
      AND conname = 'student_teachers_source_check'
  ) THEN
    ALTER TABLE public.student_teachers
      ADD CONSTRAINT student_teachers_source_check
      CHECK (source IN ('human', 'oneroster')) NOT VALID;
  END IF;
END;
$spe540_check$;

ALTER TABLE public.student_teachers
  VALIDATE CONSTRAINT student_teachers_source_check;

COMMENT ON COLUMN public.student_teachers.source IS
  'SPE-540: who asserts this link. ''human'' = UI/backfill/legacy-mirror writes (the default); ''oneroster'' = the SIS link sync, which may only relabel or remove rows carrying its own value. Human rows are never machine-deleted.';
