-- Add grade_month_reading_level column to student_assessments table
-- This column stores reading level in grade.month format with two-decimal precision
-- Examples: 2.05 = 2nd grade 5th month, 2.10 = 2nd grade 10th month, 0.03 = Kindergarten 3rd month

ALTER TABLE student_assessments 
ADD COLUMN grade_month_reading_level NUMERIC(4,2);

-- Add comment for documentation
COMMENT ON COLUMN student_assessments.grade_month_reading_level IS 'Reading level in grade.month format with two-decimal precision (e.g., 2.05 = 2nd grade 5th month, 2.10 = 2nd grade 10th month, K = 0.xx)';