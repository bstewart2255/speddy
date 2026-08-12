-- SPE-460: replace the hardcoded '2025-2026' school_year column defaults with a
-- function that computes the current school year.
--
-- Seven tables defaulted school_year to the literal '2025-2026'. Any insert that
-- omitted the column took that default, and since every read path filters on
-- getCurrentSchoolYear(), such a row was invisible the moment it was written —
-- silently, with no error. Once the calendar rolled past 2025-2026 on
-- 2026-08-01, that turned into "anything a user adds disappears on save".
--
-- The app-side write paths are being fixed to set school_year explicitly, but a
-- hardcoded past year should not be the fallback in any case: several paths
-- legitimately rely on the default (createRotationGroup, createGroupMember and
-- upsertWeekAssignment all insert without it), and a literal year is a landmine
-- that re-arms every August. A computed default is correct for all of them and
-- needs no annual maintenance.
--
-- current_school_year() mirrors getCurrentSchoolYear() in lib/school-year.ts
-- exactly: UTC, label 'YYYY-YYYY', flipping on August 1.

BEGIN;

CREATE OR REPLACE FUNCTION public.current_school_year()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
           WHEN EXTRACT(month FROM ts) >= 8
             THEN (EXTRACT(year FROM ts)::int)::text || '-' || (EXTRACT(year FROM ts)::int + 1)::text
           ELSE (EXTRACT(year FROM ts)::int - 1)::text || '-' || (EXTRACT(year FROM ts)::int)::text
         END
  FROM (SELECT now() AT TIME ZONE 'utc' AS ts) s;
$$;

COMMENT ON FUNCTION public.current_school_year() IS
  'Current school year as ''YYYY-YYYY'', flipping on August 1 (UTC). Mirrors getCurrentSchoolYear() in lib/school-year.ts — keep the two in step.';

ALTER TABLE bell_schedules             ALTER COLUMN school_year SET DEFAULT public.current_school_year();
ALTER TABLE special_activities         ALTER COLUMN school_year SET DEFAULT public.current_school_year();
ALTER TABLE activity_type_availability ALTER COLUMN school_year SET DEFAULT public.current_school_year();
ALTER TABLE rotation_activity_pairs    ALTER COLUMN school_year SET DEFAULT public.current_school_year();
ALTER TABLE rotation_groups            ALTER COLUMN school_year SET DEFAULT public.current_school_year();
ALTER TABLE rotation_group_members     ALTER COLUMN school_year SET DEFAULT public.current_school_year();
ALTER TABLE rotation_week_assignments  ALTER COLUMN school_year SET DEFAULT public.current_school_year();

-- Guard: no school_year column may still carry a literal default.
DO $$
DECLARE
  stale text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name || ' = ' || column_default, ', ')
    INTO stale
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'school_year'
    AND column_default IS NOT NULL
    AND column_default NOT LIKE '%current_school_year%';

  IF stale IS NOT NULL THEN
    RAISE EXCEPTION 'SPE-460: literal school_year default(s) remain: %', stale;
  END IF;
END $$;

COMMIT;
