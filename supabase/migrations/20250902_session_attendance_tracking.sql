-- Add fields for tracking session attendance and conflicts
ALTER TABLE schedule_sessions
ADD COLUMN IF NOT EXISTS student_absent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS outside_schedule_conflict BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

-- Add comment for the new columns
COMMENT ON COLUMN schedule_sessions.student_absent IS 'Indicates if the student was absent for this session';
COMMENT ON COLUMN schedule_sessions.outside_schedule_conflict IS 'Indicates if there was a scheduling conflict outside of normal schedule';
COMMENT ON COLUMN schedule_sessions.is_completed IS 'Indicates if the session was completed (separate from completed_at which is a timestamp)';