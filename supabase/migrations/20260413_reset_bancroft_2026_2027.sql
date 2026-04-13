-- Reset 2026-2027 school year for Bancroft Elementary (062271002457)
-- so the site admin must re-activate it through the activation dialog.

BEGIN;

-- 1. Delete rotation group members (child of rotation_groups)
DELETE FROM rotation_group_members
WHERE school_year = '2026-2027'
  AND group_id IN (
    SELECT rg.id FROM rotation_groups rg
    JOIN rotation_activity_pairs rap ON rg.pair_id = rap.id
    WHERE rap.school_id = '062271002457' AND rap.school_year = '2026-2027'
  );

-- 2. Delete rotation groups (child of rotation_activity_pairs)
DELETE FROM rotation_groups
WHERE school_year = '2026-2027'
  AND pair_id IN (
    SELECT id FROM rotation_activity_pairs
    WHERE school_id = '062271002457' AND school_year = '2026-2027'
  );

-- 3. Delete rotation activity pairs
DELETE FROM rotation_activity_pairs
WHERE school_id = '062271002457' AND school_year = '2026-2027';

-- 4. Delete special activities
DELETE FROM special_activities
WHERE school_id = '062271002457' AND school_year = '2026-2027';

-- 5. Delete bell schedules
DELETE FROM bell_schedules
WHERE school_id = '062271002457' AND school_year = '2026-2027';

-- 6. Delete activity type availability (0 rows expected, but for completeness)
DELETE FROM activity_type_availability
WHERE school_id = '062271002457' AND school_year = '2026-2027';

-- 7. Delete instruction schedules (0 rows expected, but for completeness)
DELETE FROM instruction_schedules
WHERE school_id = '062271002457' AND school_year = '2026-2027';

-- 8. Delete the activation record — this is what triggers the dialog to reappear
DELETE FROM activated_school_years
WHERE school_id = '062271002457' AND school_year = '2026-2027';

COMMIT;
