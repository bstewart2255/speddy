-- Allow teachers to view schedule_sessions for their students
-- This enables the "Today View" feature in the teacher portal
--
-- Note: We use a SECURITY DEFINER function to avoid infinite recursion
-- between schedule_sessions and students RLS policies

-- Drop the initial policy if it exists (caused recursion)
DROP POLICY IF EXISTS "Teachers can view sessions for their students" ON schedule_sessions;

-- Create a helper function that bypasses RLS to get teacher's student IDs
-- SET search_path prevents search_path manipulation attacks
CREATE OR REPLACE FUNCTION get_teacher_student_ids(user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.id
  FROM public.students s
  INNER JOIN public.teachers t ON s.teacher_id = t.id
  WHERE t.account_id = user_id;
$$;

-- Create the policy using the function (avoids recursion)
CREATE POLICY "Teachers can view sessions for their students"
ON schedule_sessions
FOR SELECT
USING (
  student_id IN (SELECT get_teacher_student_ids(auth.uid()))
);
