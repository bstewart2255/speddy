-- Add goals_iep_date column to track when imported IEP goals became effective
-- This allows validation warnings for future dates or stale (> 1 year old) goals

ALTER TABLE student_details ADD COLUMN IF NOT EXISTS goals_iep_date DATE;

COMMENT ON COLUMN student_details.goals_iep_date IS 'The IEP date from the imported SEIS report, used to validate goal currency';
