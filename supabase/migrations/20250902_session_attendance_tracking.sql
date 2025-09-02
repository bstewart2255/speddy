-- Add fields for tracking session attendance and conflicts
BEGIN;

ALTER TABLE schedule_sessions
  ADD COLUMN IF NOT EXISTS student_absent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS outside_schedule_conflict BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

-- Backfill existing NULLs before enforcing NOT NULL
UPDATE schedule_sessions SET
  student_absent = COALESCE(student_absent, FALSE),
  outside_schedule_conflict = COALESCE(outside_schedule_conflict, FALSE),
  is_completed = COALESCE(is_completed, FALSE)
WHERE student_absent IS NULL
   OR outside_schedule_conflict IS NULL
   OR is_completed IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE schedule_sessions
  ALTER COLUMN student_absent SET NOT NULL,
  ALTER COLUMN outside_schedule_conflict SET NOT NULL,
  ALTER COLUMN is_completed SET NOT NULL;

-- Add comment for the new columns
COMMENT ON COLUMN schedule_sessions.student_absent IS 'Indicates if the student was absent for this session';
COMMENT ON COLUMN schedule_sessions.outside_schedule_conflict IS 'Indicates if there was a scheduling conflict outside of normal schedule';
COMMENT ON COLUMN schedule_sessions.is_completed IS 'Indicates if the session was completed (separate from completed_at which is a timestamp)';

COMMIT;