-- Fix get_sea_students to handle both migrated and legacy school filtering
-- This ensures SEAs see all their students during the school_id migration period

DROP FUNCTION IF EXISTS public.get_sea_students(VARCHAR);

CREATE OR REPLACE FUNCTION public.get_sea_students(
  p_school_id VARCHAR DEFAULT NULL,
  p_school_site TEXT DEFAULT NULL,
  p_school_district TEXT DEFAULT NULL
)
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
  -- Supports both school_id (migrated) and school_site+school_district (legacy) filtering
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
    AND (
      -- No school filter provided - return all students
      (p_school_id IS NULL AND p_school_site IS NULL AND p_school_district IS NULL)
      OR
      -- Match by school_id if both student and filter have it (migrated schools)
      (p_school_id IS NOT NULL AND s.school_id IS NOT NULL AND s.school_id = p_school_id)
      OR
      -- Match by school_site + school_district (legacy schools or fallback during migration)
      (p_school_site IS NOT NULL AND p_school_district IS NOT NULL
       AND s.school_site = p_school_site AND s.school_district = p_school_district)
    )
  ORDER BY s.initials;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_sea_students(VARCHAR, TEXT, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_sea_students(VARCHAR, TEXT, TEXT) IS
  'Returns all unique students that have sessions assigned to the currently authenticated SEA user. Uses auth.uid() internally for security. Supports both school_id (migrated schools) and school_site+school_district (legacy schools) filtering to handle the migration period. Used in Calendar and Lessons pages.';
