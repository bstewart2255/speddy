-- Fix RLS policies for student_assessments to match the pattern used in other student-related tables
-- This replaces the teachers/school_id approach with the simpler provider_id approach

-- Drop existing policies
DROP POLICY IF EXISTS "Teachers can view student assessments in their school" ON student_assessments;
DROP POLICY IF EXISTS "Teachers can create student assessments in their school" ON student_assessments;
DROP POLICY IF EXISTS "Teachers can update student assessments in their school" ON student_assessments;
DROP POLICY IF EXISTS "Teachers can delete student assessments in their school" ON student_assessments;

-- Create new policies matching the pattern from student_details and iep_goal_progress
CREATE POLICY "Users can view assessments for their students"
  ON student_assessments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = student_assessments.student_id
        AND students.provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert assessments for their students"
  ON student_assessments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = student_assessments.student_id
        AND students.provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can update assessments for their students"
  ON student_assessments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = student_assessments.student_id
        AND students.provider_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete assessments for their students"
  ON student_assessments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = student_assessments.student_id
        AND students.provider_id = auth.uid()
    )
  );

-- Add service role policy for admin access (matching other tables)
CREATE POLICY "Service role has full access to student_assessments"
  ON student_assessments
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
