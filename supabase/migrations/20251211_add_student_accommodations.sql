-- Add accommodations column to student_details
-- Accommodations are stored as a text array, similar to iep_goals

ALTER TABLE student_details
ADD COLUMN IF NOT EXISTS accommodations TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN student_details.accommodations IS 'Student IEP accommodations stored as text array';
