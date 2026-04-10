-- Normalize yard duty period names for Bancroft Elementary to match
-- the new bell-schedule-based format: "{grade_level} {period_name}"
-- e.g., "TK Recess", "K Lunch Recess", "2,3 Recess"

UPDATE yard_duty_assignments
SET period_name = CASE period_name
  WHEN 'TK Recess'           THEN 'TK Recess'
  WHEN 'PM TK Recess'        THEN 'TK Recess'
  WHEN 'Kinder Recess'       THEN 'K Recess'
  WHEN 'PM Kinder Recess'    THEN 'K Recess'
  WHEN '1st Grade Recess'    THEN '1 Recess'
  WHEN 'PM 1st Grade Recess' THEN '1 Recess'
  WHEN '2nd & 3rd Recess'    THEN '2,3 Recess'
  WHEN 'PM 2nd & 3rd Recess' THEN '2,3 Recess'
  WHEN '4th & 5th Recess'    THEN '4,5 Recess'
  WHEN 'Dismissal'           THEN 'After School'
  ELSE period_name
END
WHERE school_id = '062271002457'
  AND period_name IN (
    'TK Recess', 'PM TK Recess',
    'Kinder Recess', 'PM Kinder Recess',
    '1st Grade Recess', 'PM 1st Grade Recess',
    '2nd & 3rd Recess', 'PM 2nd & 3rd Recess',
    '4th & 5th Recess',
    'Dismissal'
  );
