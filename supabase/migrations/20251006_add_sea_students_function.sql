-- Add function to get students assigned to an SEA
-- This allows SEAs to see only the students they have sessions with

CREATE OR REPLACE FUNCTION public.get_sea_students(sea_user_id UUID)
RETURNS TABLE(
  id UUID,
  initials TEXT,
  grade_level TEXT,
  school_id VARCHAR,
  provider_id UUID,
  iep_goals TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Return unique students that have sessions assigned to this SEA
  -- Joins with student_details to include IEP goals for Exit Tickets and Progress Checks
  RETURN QUERY
  SELECT DISTINCT
    s.id,
    s.initials,
    s.grade_level,
    s.school_id,
    s.provider_id,
    COALESCE(sd.iep_goals, '{}'::TEXT[]) as iep_goals
  FROM students s
  INNER JOIN schedule_sessions ss ON ss.student_id = s.id
  LEFT JOIN student_details sd ON sd.student_id = s.id
  WHERE ss.assigned_to_sea_id = sea_user_id
    AND ss.delivered_by = 'sea'
  ORDER BY s.initials;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_sea_students(uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_sea_students(uuid) IS
  'Returns all unique students that have sessions assigned to the specified SEA user. Used in Lessons page to filter student dropdowns for SEAs.';
