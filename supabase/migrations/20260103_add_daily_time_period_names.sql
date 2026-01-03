-- Migration: Add daily time types to bell_schedules period_name constraint
-- These enable the "Show Daily Times" feature in the Master Schedule

-- Drop the existing constraint
ALTER TABLE bell_schedules DROP CONSTRAINT bell_schedules_period_name_check;

-- Add the updated constraint with new daily time types
ALTER TABLE bell_schedules ADD CONSTRAINT bell_schedules_period_name_check
CHECK (
  (period_name IS NULL) OR
  (period_name = ANY (ARRAY[
    'Recess', 'Lunch', 'Lunch Recess', 'Snack', 'PE',
    'School Start', 'Dismissal', 'Early Dismissal'
  ]))
);
