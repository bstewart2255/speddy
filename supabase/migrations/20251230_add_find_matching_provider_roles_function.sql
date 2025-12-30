-- Function to find provider roles for matching students
-- Used to show "Also seen by: Speech, OT" badge in student details modal
-- Matches on: initials (case-insensitive), school_id, grade_level, teacher

CREATE OR REPLACE FUNCTION find_matching_provider_roles(p_student_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  result TEXT[];
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION find_matching_provider_roles(UUID) TO authenticated;
