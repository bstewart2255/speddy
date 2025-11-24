-- Restructure student_assessments table for tool-specific assessments
-- This migration:
-- 1. Backs up existing data (if any)
-- 2. Drops old student_assessments table
-- 3. Creates new student_assessments table with assessment_type and JSONB data
-- 4. Removes working_skills from student_details table

-- Step 1: Backup existing student_assessments data (if needed later)
CREATE TABLE IF NOT EXISTS student_assessments_backup AS
SELECT * FROM student_assessments;

-- Step 2: Drop old student_assessments table
DROP TABLE IF EXISTS student_assessments;

-- Step 3: Create new student_assessments table with tool-specific structure
CREATE TABLE student_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('mclass', 'star_reading', 'star_math', 'wisc_v', 'brief')),
  assessment_date DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_student_assessments_student_id ON student_assessments(student_id);
CREATE INDEX idx_student_assessments_type ON student_assessments(assessment_type);
CREATE INDEX idx_student_assessments_date ON student_assessments(assessment_date DESC);
CREATE INDEX idx_student_assessments_student_type ON student_assessments(student_id, assessment_type);
CREATE INDEX idx_student_assessments_student_date ON student_assessments(student_id, assessment_date DESC);

-- Add updated_at trigger
CREATE TRIGGER set_updated_at_student_assessments
  BEFORE UPDATE ON student_assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Remove working_skills column from student_details table
ALTER TABLE student_details DROP COLUMN IF EXISTS working_skills;

-- Step 5: Set up RLS policies for student_assessments
ALTER TABLE student_assessments ENABLE ROW LEVEL SECURITY;

-- Policy: Teachers can view assessments for students in their school
CREATE POLICY "Teachers can view student assessments in their school"
  ON student_assessments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN teachers t ON s.school_id = t.school_id
      WHERE s.id = student_assessments.student_id
        AND t.account_id = auth.uid()
    )
  );

-- Policy: Teachers can insert assessments for students in their school
CREATE POLICY "Teachers can create student assessments in their school"
  ON student_assessments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      JOIN teachers t ON s.school_id = t.school_id
      WHERE s.id = student_assessments.student_id
        AND t.account_id = auth.uid()
    )
  );

-- Policy: Teachers can update assessments for students in their school
CREATE POLICY "Teachers can update student assessments in their school"
  ON student_assessments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN teachers t ON s.school_id = t.school_id
      WHERE s.id = student_assessments.student_id
        AND t.account_id = auth.uid()
    )
  );

-- Policy: Teachers can delete assessments for students in their school
CREATE POLICY "Teachers can delete student assessments in their school"
  ON student_assessments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM students s
      JOIN teachers t ON s.school_id = t.school_id
      WHERE s.id = student_assessments.student_id
        AND t.account_id = auth.uid()
    )
  );

-- Add comments for documentation
COMMENT ON TABLE student_assessments IS 'Stores tool-specific assessment data for students (mClass, STAR, WISC-V, BRIEF, etc.)';
COMMENT ON COLUMN student_assessments.assessment_type IS 'Type of assessment tool (mclass, star_reading, star_math, wisc_v, brief)';
COMMENT ON COLUMN student_assessments.assessment_date IS 'Date when the assessment was conducted';
COMMENT ON COLUMN student_assessments.data IS 'Tool-specific assessment data stored as JSON';
