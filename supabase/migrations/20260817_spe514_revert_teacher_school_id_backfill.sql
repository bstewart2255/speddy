-- SPE-514 REVERT of 20260817_spe514_backfill_teacher_school_id.sql.
--
-- Both files are kept because both RAN against production and both are recorded
-- in schema_migrations. Deleting the first would leave the repo unable to
-- reproduce the database. Net schema/data effect of the pair is zero.
--
-- WHY IT WAS REVERTED
--
-- The backfill was correct as normalization and wrong as a shipped change. It
-- promoted 20 previously-invisible legacy rows into the school-scoped teacher
-- lists at two LIVE pilot schools, inside a change framed as internal cleanup.
--
-- Every one of the 20 has first_name IS NULL and no account_id. Twelve duplicate
-- a real, named, account-linked teacher at the same school:
--
--   (blank) Bettencourt  ->  Arianna Bettencourt      (blank) Rozman  ->  Helen Rozman
--   (blank) Garcia       ->  Rosa Garcia              (blank) Sajjad  ->  Maria Sajjad
--   (blank) Kay          ->  Stefanie Kay             (blank) Steele  ->  Megan Steele
--   (blank) Malibran     ->  Dalia Malibran           (blank) Thornby ->  Crystal Thornby
--   (blank) Massey       ->  Caroline Massey          (blank) Wright  ->  Ingrid Wright
--   (blank) Parker       ->  Mary Anne Parker         (blank) Cross   ->  Jane Cross
--
-- and Mt Diablo gains FOUR blank "Mohr" rows beside the real Sarah Mohr, so that
-- picker would list "Mohr" five times. The rest are orphans with no counterpart
-- ("Davis/Winbery", "Frietas", "Larsen", "Thorny" — itself probably a typo of
-- Thornby).
--
-- So the entire user-visible effect was 20 nameless entries cluttering two live
-- schools' pickers, with no real teacher gaining visibility. They are also
-- pickable: a mainstreaming block aimed at a row with no account_id means the
-- real teacher never sees it.
--
-- WHAT THIS DOES NOT DO
--
-- It does not delete the orphans, which is the actual fix. Removing production
-- teacher rows is the owner's decision, not a side effect of a normalization
-- ticket, so it goes to Blair with the data (SPE-514 is re-opened for it).
--
-- Scoped by first_name IS NULL, which is exactly the set that had school_id IS
-- NULL before the backfill — verified 20 of 20. An earlier draft selected by
-- school_site + created_at instead and swept in a 21st row (Aimee Grispo,
-- account-linked, already normalized) that the backfill never touched. The
-- closing assertion caught it before anything was written, which is the whole
-- reason these migrations assert their own outcome.

BEGIN;

UPDATE public.teachers
SET school_id = NULL
WHERE first_name IS NULL
  AND school_site IN ('Bancroft Elementary School', 'Mt Diablo Elementary')
  AND school_id IS NOT NULL;

DO $$
DECLARE
  v_null integer;
  v_grispo text;
BEGIN
  SELECT count(*) INTO v_null FROM public.teachers WHERE school_id IS NULL;
  IF v_null <> 20 THEN
    RAISE EXCEPTION 'SPE-514 revert: expected 20 teachers back at school_id NULL, found %', v_null;
  END IF;

  -- The row the backfill did NOT touch must still be normalized.
  SELECT school_id INTO v_grispo FROM public.teachers
  WHERE id = '46617368-3a79-4b5c-b474-7c099942148d';
  IF v_grispo IS DISTINCT FROM '062271002458' THEN
    RAISE EXCEPTION 'SPE-514 revert: Aimee Grispo should be untouched at 062271002458, found %', coalesce(v_grispo, 'NULL');
  END IF;
END $$;

COMMIT;
