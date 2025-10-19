-- Fix RLS policy for students table to allow viewing students from assigned sessions
-- This allows specialists and SEAs to see basic student info (initials, grade)
-- for students whose sessions are assigned to them

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own students" ON students;

-- Create new policy that includes students from assigned sessions
CREATE POLICY "Users can view their own students" ON students
  FOR SELECT USING (
    -- User is the provider (owns the student)
    provider_id = (SELECT auth.uid())
    -- OR User has sessions assigned to them for this student
    OR EXISTS (
      SELECT 1 FROM schedule_sessions
      WHERE schedule_sessions.student_id = students.id
        AND (
          schedule_sessions.assigned_to_specialist_id = (SELECT auth.uid())
          OR schedule_sessions.assigned_to_sea_id = (SELECT auth.uid())
        )
    )
  );
