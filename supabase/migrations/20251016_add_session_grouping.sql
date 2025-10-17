-- Add session grouping support to schedule_sessions table
-- This allows providers to manually group sessions together for planning purposes

-- Add grouping columns to schedule_sessions
ALTER TABLE schedule_sessions
  ADD COLUMN IF NOT EXISTS group_id UUID NULL,
  ADD COLUMN IF NOT EXISTS group_name TEXT NULL;

-- Create index for efficient group queries
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_group_id
  ON schedule_sessions(group_id)
  WHERE group_id IS NOT NULL;

-- Add optional group_id to lessons table to link lesson plans to groups
-- Note: Your app uses the unified 'lessons' table, not 'manual_lesson_plans'
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS group_id UUID NULL,
  ADD COLUMN IF NOT EXISTS session_ids UUID[] NULL;

-- Create index for lesson plan group queries
CREATE INDEX IF NOT EXISTS idx_lessons_group_id
  ON lessons(group_id)
  WHERE group_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN schedule_sessions.group_id IS 'UUID linking sessions in the same group (nullable for ungrouped sessions)';
COMMENT ON COLUMN schedule_sessions.group_name IS 'User-friendly name for the session group';
COMMENT ON COLUMN lessons.group_id IS 'UUID linking lesson plan to a group of sessions';
COMMENT ON COLUMN lessons.session_ids IS 'Array of session IDs that this lesson plan applies to';
