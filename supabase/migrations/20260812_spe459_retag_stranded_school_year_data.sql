-- SPE-459: re-tag stranded 2025-2026 schedule data to 2026-2027.
--
-- getCurrentSchoolYear() (lib/school-year.ts) flips on August 1 with no user
-- action. On 2026-08-01 it rolled to '2026-2027'. Every UI read path pins to
-- that value — the provider Bell Schedules and Special Activities pages, and
-- the admin Master Schedule year toggle, which only offers current/next year.
-- All real-school data was still tagged '2025-2026', so on Aug 1 it silently
-- became unreachable in the app, with no in-app path back to it (the activation
-- dialog's copy is forward-only from the current year).
--
-- Scope verified against prod on 2026-08-12: every '2025-2026' row across these
-- tables belongs to Bancroft Elementary, Mt. Diablo Elementary or Walnut Acres
-- Elementary. The '2026-2027' year held only Sim District fixture rows, under
-- different school_ids, so a blanket re-tag cannot touch sim data. Neither of
-- the two unique indexes that include school_year
-- (activity_type_availability_school_year_unique,
-- rotation_activity_pairs_school_year_unique) can collide: each has exactly one
-- 2025-2026 row and no 2026-2027 counterpart.
--
-- Re-tag in place rather than copy-forward, per product decision (Blair,
-- 2026-08-12): copying would leave these schools with two years of data, which
-- arms SPE-458 — the scheduler reads bell schedules and special activities with
-- no school_year filter, so both years' rows would block slots at once.
--
-- rotation_week_assignments is included here even though copy_schedule_to_year
-- deliberately omits it (its rows are keyed to concrete week dates, which do not
-- carry forward). Included on purpose: getWeekAssignments() filters on pair_id
-- alone and never reads school_year, so the tag has no effect on what the
-- rotation editor shows, and moving the 69 rows with their parent pair keeps
-- parent and children in one year rather than splitting them. What actually
-- drives that editor's week list is school_year_config, which has no
-- school_year column and still holds Bancroft's 2025-08-11 -> 2026-05-29 range
-- — a separate pre-existing gap, noted on SPE-460, untouched here.

BEGIN;

-- Recovery record: the exact rows re-tagged here, so this is precisely
-- reversible even after later data lands in 2026-2027.
CREATE TABLE IF NOT EXISTS public.backup_spe459_school_year_retag (
  table_name           text        NOT NULL,
  row_id               uuid        NOT NULL,
  previous_school_year text        NOT NULL,
  retagged_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);

COMMENT ON TABLE public.backup_spe459_school_year_retag IS
  'SPE-459 recovery record: rows whose school_year was re-tagged 2025-2026 -> 2026-2027 on 2026-08-12. Reverse by setting school_year = previous_school_year for these ids. Safe to drop once the fix has held through a full school year.';

-- No RLS policies: service-role / migration access only. Not exposed to clients.
ALTER TABLE public.backup_spe459_school_year_retag ENABLE ROW LEVEL SECURITY;

INSERT INTO public.backup_spe459_school_year_retag (table_name, row_id, previous_school_year)
            SELECT 'bell_schedules',             id, school_year FROM bell_schedules             WHERE school_year = '2025-2026'
  UNION ALL SELECT 'special_activities',         id, school_year FROM special_activities         WHERE school_year = '2025-2026'
  UNION ALL SELECT 'yard_duty_assignments',      id, school_year FROM yard_duty_assignments      WHERE school_year = '2025-2026'
  UNION ALL SELECT 'instruction_schedules',      id, school_year FROM instruction_schedules      WHERE school_year = '2025-2026'
  UNION ALL SELECT 'activity_type_availability', id, school_year FROM activity_type_availability WHERE school_year = '2025-2026'
  UNION ALL SELECT 'rotation_activity_pairs',    id, school_year FROM rotation_activity_pairs    WHERE school_year = '2025-2026'
  UNION ALL SELECT 'rotation_groups',            id, school_year FROM rotation_groups            WHERE school_year = '2025-2026'
  UNION ALL SELECT 'rotation_group_members',     id, school_year FROM rotation_group_members     WHERE school_year = '2025-2026'
  UNION ALL SELECT 'rotation_week_assignments',  id, school_year FROM rotation_week_assignments  WHERE school_year = '2025-2026'
ON CONFLICT (table_name, row_id) DO NOTHING;

-- Parents before children, so a partially-applied run never leaves a rotation
-- child pointing at a parent in a different year.
UPDATE rotation_activity_pairs    SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE rotation_groups            SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE rotation_group_members     SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE rotation_week_assignments  SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE bell_schedules             SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE special_activities         SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE yard_duty_assignments      SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE instruction_schedules      SET school_year = '2026-2027' WHERE school_year = '2025-2026';
UPDATE activity_type_availability SET school_year = '2026-2027' WHERE school_year = '2025-2026';

-- Guard: fail the whole transaction if anything was left behind.
DO $$
DECLARE
  remaining bigint;
BEGIN
  SELECT (SELECT count(*) FROM bell_schedules             WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM special_activities         WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM yard_duty_assignments      WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM instruction_schedules      WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM activity_type_availability WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM rotation_activity_pairs    WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM rotation_groups            WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM rotation_group_members     WHERE school_year = '2025-2026')
       + (SELECT count(*) FROM rotation_week_assignments  WHERE school_year = '2025-2026')
    INTO remaining;

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'SPE-459: % rows still tagged 2025-2026 after re-tag; rolling back', remaining;
  END IF;
END $$;

COMMIT;
