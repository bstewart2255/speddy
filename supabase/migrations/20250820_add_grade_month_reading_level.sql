-- Add grade_month_reading_level column to student_assessments table
-- This column stores reading level in grade.month format (e.g., 2.1 = 2nd grade, 1st month)

ALTER TABLE student_assessments 
ADD COLUMN grade_month_reading_level DECIMAL(3,1);

-- Add comment for documentation
COMMENT ON COLUMN student_assessments.grade_month_reading_level IS 'Reading level in grade.month format (e.g., 2.1 = 2nd grade 1st month, K = 0.x)';