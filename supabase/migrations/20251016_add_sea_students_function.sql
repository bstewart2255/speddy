-- Add function to get students assigned to an SEA
-- This allows SEAs to see only the students they have sessions with
-- SECURITY: Uses auth.uid() internally to prevent data exfiltration

-- Drop old function if it exists (needed when changing parameter names)
DROP FUNCTION IF EXISTS public.get_sea_students();
DROP FUNCTION IF EXISTS public.get_sea_students(UUID);
DROP FUNCTION IF EXISTS public.get_sea_students(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_sea_students(p_school_id VARCHAR DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  initials TEXT,
  grade_level TEXT,
  teacher_name TEXT,
  teacher_id UUID,
  sessions_per_week INTEGER,
  minutes_per_session INTEGER,
  school_id VARCHAR,
  provider_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  iep_goals TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Return unique students that have sessions assigned to the CURRENT authenticated SEA
  -- Uses auth.uid() to prevent passing arbitrary user IDs from client (security)
  -- Joins with student_details to include IEP goals for Exit Tickets and Progress Checks
  -- Optionally filters by school_id when provided
  RETURN QUERY
  SELECT DISTINCT
    s.id,
    s.initials,
    s.grade_level,
    s.teacher_name,
    s.teacher_id,
    s.sessions_per_week,
    s.minutes_per_session,
    s.school_id,
    s.provider_id,
    s.created_at,
    s.updated_at,
    COALESCE(sd.iep_goals, '{}'::TEXT[]) as iep_goals
  FROM students s
  INNER JOIN schedule_sessions ss ON ss.student_id = s.id
  LEFT JOIN student_details sd ON sd.student_id = s.id
  WHERE ss.assigned_to_sea_id = auth.uid()  -- Use auth.uid() instead of parameter
    AND ss.delivered_by = 'sea'
    AND (p_school_id IS NULL OR s.school_id = p_school_id)  -- Optional school filter
  ORDER BY s.initials;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_sea_students(VARCHAR) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_sea_students(VARCHAR) IS
  'Returns all unique students that have sessions assigned to the currently authenticated SEA user. Uses auth.uid() internally for security. Optionally filters by school_id when provided. Used in Lessons page to filter student dropdowns for SEAs.';
