-- Add RLS policy to allow SEAs to view students assigned to them via schedule_sessions
-- This provides a direct path for SEAs to access student data without relying solely on RPC functions
-- Addresses authentication issues where auth.uid() may not work properly in RPC context for SEA users

-- Policy for SEAs to view students they're assigned to
CREATE POLICY "SEAs can view students assigned to them"
ON students
FOR SELECT
TO public
USING (
  -- Allow if user is a SEA and has sessions assigned to them for this student
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = auth.uid()
    WHERE ss.student_id = students.id
      AND ss.assigned_to_sea_id = auth.uid()
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
  )
);

-- Policy for student_details so SEAs can see IEP goals
CREATE POLICY "SEAs can view student details for assigned students"
ON student_details
FOR SELECT
TO public
USING (
  -- Allow if user is a SEA and has sessions assigned to them for this student
  EXISTS (
    SELECT 1
    FROM schedule_sessions ss
    INNER JOIN profiles p ON p.id = auth.uid()
    WHERE ss.student_id = student_details.student_id
      AND ss.assigned_to_sea_id = auth.uid()
      AND ss.delivered_by = 'sea'
      AND p.role = 'sea'
  )
);

-- Grant necessary permissions to authenticated users
GRANT SELECT ON students TO authenticated;
GRANT SELECT ON student_details TO authenticated;
GRANT SELECT ON schedule_sessions TO authenticated;
GRANT SELECT ON profiles TO authenticated;
