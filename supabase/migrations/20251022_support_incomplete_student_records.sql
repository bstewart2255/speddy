-- Migration: Support incomplete student records for bulk import
-- Allows students to be created without teacher assignments or schedule requirements
-- These fields can be filled in later as the user configures their caseload

-- Make teacher_name nullable (was previously required)
ALTER TABLE students
ALTER COLUMN teacher_name DROP NOT NULL;

-- Make sessions_per_week nullable (was previously required with check constraint)
ALTER TABLE students
ALTER COLUMN sessions_per_week DROP NOT NULL;

-- Make minutes_per_session nullable (was previously required with check constraint)
ALTER TABLE students
ALTER COLUMN minutes_per_session DROP NOT NULL;

-- Add comment explaining the nullable fields
COMMENT ON COLUMN students.teacher_name IS 'Teacher name - nullable to support bulk import workflow where teacher assignment happens later';
COMMENT ON COLUMN students.sessions_per_week IS 'Number of service sessions per week - nullable to support bulk import workflow';
COMMENT ON COLUMN students.minutes_per_session IS 'Duration of each session in minutes - nullable to support bulk import workflow';
