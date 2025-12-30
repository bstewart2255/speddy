-- Security fix: Add auth.uid() check to find_matching_provider_roles
-- Ensures callers can only query students they own
--
-- SECURITY DEFINER is required because the function must query students
-- across all providers to find matches. The auth.uid() check ensures
-- callers can only query their own students.

CREATE OR REPLACE FUNCTION find_matching_provider_roles(p_student_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result TEXT[];
  caller_id UUID;
BEGIN
  -- Get the authenticated user's ID
  caller_id := auth.uid();

  -- Security check: Verify the caller owns this student
  IF NOT EXISTS (
    SELECT 1 FROM students
    WHERE id = p_student_id
    AND provider_id = caller_id
  ) THEN
    -- Return empty array if caller doesn't own the student
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- Find matching provider roles
  SELECT ARRAY_AGG(DISTINCT p.role ORDER BY p.role)
  INTO result
  FROM students s
  JOIN students source ON source.id = p_student_id
  JOIN profiles p ON p.id = s.provider_id
  WHERE s.id != p_student_id
    AND s.provider_id != source.provider_id
    AND LOWER(s.initials) = LOWER(source.initials)
    AND s.grade_level = source.grade_level
    AND s.school_id IS NOT NULL
    AND s.school_id = source.school_id
    AND (
      -- Match by teacher_id if both have it
      (s.teacher_id IS NOT NULL AND source.teacher_id IS NOT NULL AND s.teacher_id = source.teacher_id)
      -- Otherwise match by teacher_name (case-insensitive)
      OR (
        (s.teacher_id IS NULL OR source.teacher_id IS NULL)
        AND LOWER(COALESCE(s.teacher_name, '')) = LOWER(COALESCE(source.teacher_name, ''))
        AND COALESCE(s.teacher_name, '') != ''
      )
    );

  RETURN COALESCE(result, ARRAY[]::TEXT[]);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION find_matching_provider_roles(UUID) TO authenticated;
