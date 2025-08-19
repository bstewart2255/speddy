-- Add reading_level column to student_details table
-- Migration: 20250819_add_reading_level_to_student_details.sql

-- Add the reading_level column to student_details table
ALTER TABLE student_details 
ADD COLUMN reading_level VARCHAR(20);

-- Add a comment to document the purpose
COMMENT ON COLUMN student_details.reading_level IS 'Reading level for AI lesson content tailoring (Beginner, Intermediate, Advanced)';

-- Create an index for potential queries filtering by reading level
CREATE INDEX IF NOT EXISTS idx_student_details_reading_level ON student_details(reading_level);