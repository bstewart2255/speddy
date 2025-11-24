-- Migration: Add activity type constraints to bell_schedules and special_activities
-- Description: Convert free-text activity fields to constrained dropdown selections

-- Clear existing activity values (starting fresh per user request)
UPDATE bell_schedules SET period_name = NULL;
UPDATE special_activities SET activity_name = NULL;

-- Add CHECK constraint for bell_schedules activity types
-- Valid values: Recess, Lunch, Lunch Recess, Snack, PE
ALTER TABLE bell_schedules
ADD CONSTRAINT bell_schedules_period_name_check
CHECK (period_name IS NULL OR period_name IN ('Recess', 'Lunch', 'Lunch Recess', 'Snack', 'PE'));

-- Add CHECK constraint for special_activities activity types
-- Valid values: Library, STEAM, STEM, Garden, Music, ART, PE
ALTER TABLE special_activities
ADD CONSTRAINT special_activities_activity_name_check
CHECK (activity_name IS NULL OR activity_name IN ('Library', 'STEAM', 'STEM', 'Garden', 'Music', 'ART', 'PE'));
