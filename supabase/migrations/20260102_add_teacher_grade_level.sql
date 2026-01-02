-- Add grade_level column to teachers table
-- This allows site admins to assign grade levels to teachers,
-- enabling grade-based filtering of special activities in the Master Schedule

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS grade_level text;

COMMENT ON COLUMN teachers.grade_level IS 'Comma-separated grade levels the teacher teaches (e.g., "K,1" for combo classes)';
