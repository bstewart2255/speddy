-- Migration: Add WIAT-4 and WJ-IV to student_assessments table
-- Date: 2025-11-24
-- Description: Updates the CHECK constraint on student_assessments.assessment_type to include 'wiat_4' and 'wj_iv'

-- Drop the existing CHECK constraint
ALTER TABLE student_assessments
DROP CONSTRAINT IF EXISTS student_assessments_assessment_type_check;

-- Add the updated CHECK constraint with wiat_4 and wj_iv
ALTER TABLE student_assessments
ADD CONSTRAINT student_assessments_assessment_type_check
CHECK (assessment_type IN ('mclass', 'star_reading', 'star_math', 'wisc_v', 'brief', 'wiat_4', 'wj_iv'));
