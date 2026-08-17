-- ⚠️ SUPERSEDED — this ran, then was reverted the same day by
-- 20260817_spe514_revert_teacher_school_id_backfill.sql. Kept because it is
-- recorded in schema_migrations and the repo must reproduce the database. Do not
-- re-run as-is; see that file for why, and fix these two defects first (found by
-- the deep self-review, after this had already been applied):
--
--   1. The closing assertion scans the WHOLE table and raises inside the
--      transaction, so one unrelated row with school_id AND school_site both NULL
--      would roll back an otherwise successful backfill instead of reporting it.
--      It should scope the assertion to the rows this migration targeted.
--   2. The "refuse to guess" guard resolves school_site through students with no
--      DISTRICT scoping. A school name shared by two districts, where only one
--      has students, still counts as "exactly one" — silently assigning teachers
--      into another district's school. Prod has no such collision today, which is
--      why it did not bite. Join through districts before trusting the match.
--
-- The substantive reason for the revert was neither of those: it is that this
-- makes 20 nameless duplicate rows visible at two live schools. Original notes
-- follow.
--
-- SPE-514: 20 of 172 teachers rows carry school_id IS NULL — all 2025 legacy
-- rows predating school normalization. The mainstreaming_blocks INSERT policy
-- requires the destination teacher to be at the block's school:
--
--   AND EXISTS (SELECT 1 FROM teachers t
--               WHERE t.id = teacher_id AND t.school_id::text = school_id)
--
-- and no equality can match NULL, so choosing one of those 20 in the picker can
-- never satisfy the check — the insert fails with a bare 42501. Not yet hit by a
-- real user (both mainstreaming_blocks and student_blocked_times are empty, and
-- the input is gated on the SDC teacher link), but reachable.
--
-- WHY NOT MATCH ON NAME
--
-- The obvious backfill — join schools ON schools.name = teachers.school_site —
-- silently does half the job here, and the half it skips is invisible:
--
--   school_site                  exact schools.name match?
--   Bancroft Elementary School   yes -> 062271002457
--   Mt Diablo Elementary         NO  -- the school is named "Mt. Diablo
--                                       Elementary", with a period
--
-- A name join would have normalized Bancroft's 15 rows, left Mt Diablo's 5
-- exactly as broken as before, and reported success. That is the same shape as
-- the analysis error this ticket's parent (SPE-500) was filed on, and the same
-- one that made the first pass at SPE-363 wrong.
--
-- So this derives the mapping from data that is already normalized and already
-- agrees: the students sitting at each school_site. Both sites resolve, and
-- corroborate from two independent directions:
--
--   school_site                  students   normalized teachers   -> school_id
--   Bancroft Elementary School   39         0                        062271002457
--   Mt Diablo Elementary         23         1                        062271002458
--
-- Both schools are in district 0761754, and no other school name is close enough
-- to be confusable (checked: only these two match '%diablo%' or '%bancroft%').

BEGIN;

-- Refuse to guess. Every school_site needing a backfill must resolve to exactly
-- ONE school_id via its students; anything else is a mapping this migration has
-- no basis to make, and it aborts rather than writing a plausible wrong answer.
DO $$
DECLARE
  v_unresolved integer;
BEGIN
  SELECT count(*) INTO v_unresolved
  FROM (
    SELECT t.school_site
    FROM public.teachers t
    WHERE t.school_id IS NULL AND t.school_site IS NOT NULL
    GROUP BY t.school_site
    HAVING (
      SELECT count(DISTINCT s.school_id)
      FROM public.students s
      WHERE s.school_site = t.school_site AND s.school_id IS NOT NULL
    ) <> 1
  ) x;

  IF v_unresolved > 0 THEN
    RAISE EXCEPTION
      'SPE-514: % school_site value(s) do not resolve to exactly one school_id via their students — resolve by hand rather than guessing', v_unresolved;
  END IF;
END $$;

UPDATE public.teachers t
SET school_id = (
  SELECT DISTINCT s.school_id
  FROM public.students s
  WHERE s.school_site = t.school_site AND s.school_id IS NOT NULL
)
WHERE t.school_id IS NULL
  AND t.school_site IS NOT NULL;

-- Nothing should be left behind. A teacher with no school_site at all would
-- survive the UPDATE above, so this reports rather than assumes.
DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining FROM public.teachers WHERE school_id IS NULL;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'SPE-514: % teacher(s) still have no school_id after the backfill (school_site was null?)', v_remaining;
  END IF;
END $$;

COMMIT;
