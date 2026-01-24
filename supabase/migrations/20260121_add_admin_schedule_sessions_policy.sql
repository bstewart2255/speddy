-- Add RLS policy to allow site admins and district admins to view schedule sessions
-- Uses SECURITY DEFINER functions to avoid infinite recursion with students table RLS

-- Create a SECURITY DEFINER function to get student's school_id without triggering RLS
CREATE OR REPLACE FUNCTION get_student_school_id(p_student_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT school_id FROM students WHERE id = p_student_id;
$$;

-- Create a SECURITY DEFINER function to get student's district_id without triggering RLS
CREATE OR REPLACE FUNCTION get_student_district_id(p_student_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT sch.district_id
  FROM students s
  JOIN schools sch ON sch.id = s.school_id
  WHERE s.id = p_student_id;
$$;

-- Create policy for site admins using the SECURITY DEFINER function
CREATE POLICY "Site admins can view schedule sessions at their school"
ON schedule_sessions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
      AND ap.role = 'site_admin'
      AND ap.school_id = get_student_school_id(schedule_sessions.student_id)
  )
);

-- Create policy for district admins using the SECURITY DEFINER function
CREATE POLICY "District admins can view schedule sessions in their district"
ON schedule_sessions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = auth.uid()
      AND ap.role = 'district_admin'
      AND ap.district_id = get_student_district_id(schedule_sessions.student_id)
  )
);
