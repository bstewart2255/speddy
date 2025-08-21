-- Add grade_month_reading_level column to student_assessments table
-- This column stores reading level in grade.month format with two-decimal precision
-- Examples: 2.05 = 2nd grade 5th month, 2.10 = 2nd grade 10th month, 0.03 = Kindergarten 3rd month

ALTER TABLE student_assessments 
ADD COLUMN grade_month_reading_level NUMERIC(4,2);

-- Add CHECK constraint to validate grade.month encoding
-- Ensures: 
--   1. Overall range: 0.01 to 12.12
--   2. Grade part (integer): 0 to 12
--   3. Month part (fractional * 100): 1 to 12 (not 0, not > 12)
ALTER TABLE student_assessments
ADD CONSTRAINT chk_grade_month_reading_level_valid CHECK (
    grade_month_reading_level IS NULL OR (
        -- Overall range check
        grade_month_reading_level >= 0.01 AND 
        grade_month_reading_level <= 12.12 AND
        -- Grade part must be 0-12
        floor(grade_month_reading_level) >= 0 AND 
        floor(grade_month_reading_level) <= 12 AND
        -- Month part (fractional * 100) must be 1-12
        round((grade_month_reading_level - floor(grade_month_reading_level)) * 100) >= 1 AND
        round((grade_month_reading_level - floor(grade_month_reading_level)) * 100) <= 12
    )
);

-- Add comment for documentation
COMMENT ON COLUMN student_assessments.grade_month_reading_level IS 'Reading level in grade.month format with two-decimal precision (e.g., 2.05 = 2nd grade 5th month, 2.10 = 2nd grade 10th month, K = 0.xx). Valid range: 0.01-12.12 where the fractional part represents months 01-12.';